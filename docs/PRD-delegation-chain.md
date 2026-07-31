# Delegation Chain

> **Product:** IdentityGovern / IdentityTracer (Unosecur)
> **Module:** Traceability → Delegation Chain / Privilege Access Chain / Permission Chain
> **Doc owner:** Harsha
> **Status:** Draft v1
>
> Source: `Delegation Chain (1).pdf` (transcribed for reference alongside the hackathon ITAG scaffold — this module is a related but **structurally distinct** product from the hackathon "Identity Blast Radius"; see [`ITAG.md`](./ITAG.md)).

## 1. Problem Statement

Access Discovery answers "how does an identity reach a permission." Delegation Chain answers a different but related question: **"who created this identity, and who did this identity go on to create?"**

This matters because account **creation is itself a privilege** — and it's one that's rarely governed as tightly as permission grants are. A common real-world abuse pattern: an admin creates a second, less-scrutinized account for themselves (or for someone else) with elevated access, bypassing normal approval flow. Or a service account, once created, is used to programmatically spin up dozens of other service accounts with inherited or escalated privileges — a shadow provisioning tree nobody signed off on. Native IAM/IdP tooling stores "created by" metadata, but almost nothing surfaces it as a **chain you can trace, filter, and audit across generations**.

Delegation Chain exists to reconstruct that provisioning lineage — **per app/system** — and surface any pattern of unaccounted-for or excessive account creation.

## 2. Goals / Non-Goals

### Goals

- For every identity, record who created it (`created_by`) and, recursively, who that creator was created by — reconstructing the full ancestor lineage back to a root (a human admin, a break-glass account, or "system/pre-existing").
- For every identity, also show who it created (its descendants) — so both directions of the chain are visible from any node.
- Scope everything **per app/system**, since creation lineage is app-specific: a user's AWS IAM creation chain, Okta creation chain, and Salesforce creation chain are three separate stories, not one merged graph.
- Handle the reality that this data is **not one connected graph** — most identities have no creator on record (self-registered, SSO-federated, bulk-imported, or genuinely root/system accounts) and no descendants. The product needs to treat this as a **forest** (many small trees and many standalone nodes), not force it into a single sprawling graph.
- Surface anomalies: unusually deep chains, high fan-out (one identity creating many others), and creators who are themselves inactive/offboarded but whose created identities are still active.

**Key distinction from Access Discovery:** creation lineage is strictly hierarchical — each identity has at most one direct creator (a tree edge), not multiple weighted path types. This means the underlying structure is a **forest of trees**, not a general directed graph with cycles/multiple path types. That distinction should drive the visualization choice (§6).

### Non-Goals

- Classifying access **type** (Direct/Indirect/Hop) — that's Access Discovery's job; this module is strictly about the creation/provisioning relationship, not the permission-path relationship.
- Scoring risk (→ Identity Risk Profile) — this module surfaces the raw lineage and flags structural anomalies; scoring/prioritization happens downstream.
- Approval/attestation workflows (→ Governance / Access Reviews).

## 3. Definitions

| Term                  | Definition                                                                                                                                                              |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Delegation Chain      | The ordered lineage connecting an identity to its creator, and its creator's creator, etc., up to a root.                                                                |
| Root                  | An identity with no recorded creator — either a genuine root/break-glass account, a pre-existing account from before tracking began, or an SSO/federated identity provisioned outside the app itself. |
| Generation / Depth    | How many creation-hops an identity is from its root (root = generation 0).                                                                                              |
| Fan-out               | The number of identities a given identity has directly created (its immediate "children").                                                                              |
| Orphaned creator link | A `created_by` reference pointing to an identity that no longer exists or has been deactivated/offboarded, while the created identity is still active.                  |
| Unlinked identity     | An identity with no creator on record **and** no descendants — a standalone node with no place in any chain.                                                            |

## 4. Detection Logic

### 4.1 Data model

- **Node:** Identity (human, service account, AI agent, app-integration account).
- **Edge:** `CREATED_BY` — identity → creator identity. Single edge per identity (an identity has exactly one creator, or none).
- **Scope attribute on every edge:** app / system (e.g., `aws-iam`, `okta`, `salesforce`, `github`) — the same two identities could theoretically have a creation relationship recorded in one app and not another (e.g., an admin created a user's AWS IAM account, but that user's Okta account was provisioned separately via SSO with a different or no creator on record).

### 4.2 Chain construction

1. **Per-app ingestion.** Pull `created_by` (or equivalent audit-log "actor" field on account-creation events) from each connected app independently. Do **not** merge across apps at ingestion — keep the app scope on every edge.
2. **Build the forest.** For each app, group identities into trees by following `CREATED_BY` edges upward until a root (no further creator) is reached. Most apps will produce many small trees and a large number of single-node "unlinked" identities — this is expected and normal, not a data-quality failure.
3. **Ancestor resolution.** For any identity, walk `CREATED_BY` edges upward to produce its full ancestor list, in order, terminating at the root.
4. **Descendant resolution.** Maintain the reverse index (`created` list) so descendants can be resolved without a full-forest scan.
5. **Anomaly flags**, computed per identity:
   - `deep_chain` — generation depth exceeds a configurable threshold (e.g., >4 generations from root); deep chains are unusual and worth review.
   - `high_fanout` — an identity has created more than N other identities (configurable per app/identity-type, since a legitimate automation/service account may have high fan-out by design while a human admin should not).
   - `orphaned_creator` — the `created_by` identity is inactive/offboarded/deleted while the created identity remains active.
   - `unlinked` — no creator on record and no descendants — flagged only as informational context, not a risk signal by itself (this is the majority case and is expected).

### 4.3 Chain object (core output)

```json
{
  "identity_id": "user:contractor.smith",
  "app": "aws-iam",
  "generation": 3,
  "ancestors": [
    { "identity_id": "svc:provisioning-bot", "generation": 2, "created_at": "2026-05-01" },
    { "identity_id": "user:jane.doe",        "generation": 1, "created_at": "2026-03-14" },
    { "identity_id": "user:root-admin",      "generation": 0, "created_at": "2024-01-10" }
  ],
  "descendants": [],
  "flags": ["orphaned_creator"],
  "flag_detail": {
    "orphaned_creator": "svc:provisioning-bot was decommissioned 2026-06-01; contractor.smith remains active"
  }
}
```

### 4.4 Refresh

Rebuild per-app forests on the same cadence as Access Discovery's graph rebuild, plus event-triggered updates on any new account-creation event (most IdPs/clouds emit this as an audit log event in near-real-time, so incremental updates should be cheap).

## 5. Data Requirements (per provider)

| Provider          | Data needed                                                                                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AWS               | CloudTrail `CreateUser` / `CreateRole` events (actor = creator), IAM user/role creation timestamps                                                            |
| Okta / Azure AD   | Admin audit log "user created by" events, SCIM provisioning actor field                                                                                       |
| GitHub / GitLab   | Org member invite audit log (inviter = creator)                                                                                                               |
| Salesforce        | Setup Audit Trail "User Created" events with the creating admin                                                                                                |
| Kubernetes        | ServiceAccount creation events from the API audit log (actor field)                                                                                            |
| Generic/custom    | Whatever creation-audit event or `created_by` field the app exposes — this module is only as good as each app's audit trail, so gaps should be surfaced explicitly (see §6.6) rather than silently treated as "no creator". |

## 6. UI/UX Spec

### 6.1 Why table-first here too, with a scoped tree as the escape hatch

Same reasoning as Access Discovery: most identities in this dataset are unlinked or belong to small trees, so a single force-directed graph of the whole forest would render as mostly disconnected dots plus a few small clusters — visually noisy and not useful as a default view. But unlike Access Discovery's graph (which has multiple edge types and real cycles/convergence), a delegation chain is a **strict tree** — each node has one parent. Trees render cleanly even when large, using a simple indented/collapsible hierarchy (like a file explorer or org chart), which is a much cheaper and more readable visualization than a force-directed graph.

**Recommendation:** default to a flat, filterable table (all identities, one row each) for browsing/auditing at scale, with a **"View Chain"** action per row that opens a collapsible tree/org-chart view scoped to that one identity's full lineage (its ancestors above, its descendants below). This mirrors the Access Discovery pattern (table-first globally, richer view scoped to one identity) but uses a tree, not a graph, because the underlying relationship is hierarchical, not a general graph.

### 6.2 App/System filter (primary filter)

Since chains are scoped per app, the App/System selector is the **first, most prominent control** on the screen — not a secondary filter buried in a filter bar:

- Rendered as a dropdown or segmented control at the very top: `[AWS IAM ▾] [Okta] [Salesforce] [GitHub] [+ Add more]`.
- Selecting an app scopes the entire table/tree to that app's creation data only — switching apps should feel like switching context entirely, not filtering within one dataset, since a user's lineage genuinely differs per app.
- Support multi-app selection with a clear visual separator (e.g., an "App" column reappears in the table) for teams who want to compare lineage across systems side by side.

### 6.3 Core table — columns

| Column          | Content                                                                | Notes                                                                                                                          |
| --------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Identity        | Name + type icon                                                       | Sortable, clickable → row expand / chain view                                                                                  |
| App             | Icon + name (only shown if multiple apps selected)                     | —                                                                                                                              |
| Created By      | Creator identity name, or "No creator on record" in gray if root/unlinked | Clickable → jumps to that identity's row                                                                                        |
| Generation      | Integer (0 = root)                                                      | Sortable                                                                                                                       |
| Fan-out         | Count of identities this identity created                              | Sortable; high values badge amber/red per configured threshold                                                                  |
| Status flags    | Badges: Deep Chain / High Fan-out / Orphaned Creator / Unlinked        | Color-coded; multiple badges can co-occur                                                                                      |
| Created At      | Timestamp                                                               | Sortable                                                                                                                       |
| Creator Status  | Active / Inactive / Offboarded                                          | Red if Inactive/Offboarded while this identity is Active — this is the orphaned-creator signal made visible without needing to open the flag detail |

**Default sort:** flagged identities first (Orphaned Creator → High Fan-out → Deep Chain), then by Generation descending (deepest/most-removed-from-root first, since that's typically the least-scrutinized layer).

**"Unlinked" identities** (no creator, no descendants) are included in the table by default but can be hidden via a toggle — since they're the majority case and mostly uninteresting, a "Hide unlinked" switch keeps the table focused on identities that are actually part of a chain.

### 6.4 Filter bar

- App/System (primary, see 6.2)
- Status flag (Deep Chain / High Fan-out / Orphaned Creator / Unlinked / None)
- Generation range (min/max)
- Fan-out range (min/max)
- Creator search (find everything created by a specific identity)
- Identity type (human / service / AI agent / integration)
- Creator status (Active / Inactive / Offboarded)

### 6.5 Chain view (row expand or dedicated panel)

Opened via **"View Chain"** on any row — a collapsible tree, not a force-directed graph:

- Selected identity shown in the middle, with ancestors listed above (root at top) and descendants listed below, each level indented — visually similar to an org chart or file-tree, not a spatial graph layout.
- Each node in the tree shows: name, type icon, creation date, and status flags inline.
- Descendant branches collapse/expand individually — useful when an identity has high fan-out (e.g., a provisioning bot that created 40 accounts); the tree doesn't have to render all 40 at once.
- A "jump to root" and "jump to this identity" shortcut at the top of the tree view for long chains.
- Same **"Copy chain as text" / "Export as JSON"** actions as Access Discovery's chain detail, for consistency across the product.

**Handling identities that don't fit a chain narrative:** if the selected identity is Unlinked (no ancestors, no descendants), the chain view simply shows that identity alone with a plain message — *"No creation lineage on record for this identity in [app]"* — rather than an empty tree shell.

### 6.6 Data-gap transparency

Since this module is only as reliable as each app's audit trail, be explicit rather than silent about gaps:

- A small info banner per app tab: *"Creation data available from [date] onward"* if an app's audit retention doesn't go back further — so a large cluster of "unlinked" identities isn't mistaken for a finding when it's actually just missing historical data.
- Distinguish in the UI (different icon/label) between *"No creator on record — genuinely a root/break-glass account"* vs. *"No creator on record — outside available audit history"* wherever the underlying data allows that distinction.

### 6.7 Cross-linking with Access Discovery

From any identity's Delegation Chain row/tree, a link to that identity's Access Discovery per-user page (§6.8 of the Access Discovery PRD), and vice versa — since "who created this over-privileged account" and "what can this account access" are usually asked together during an investigation.

## 7. Success Metrics

- **Chain coverage:** % of identities per app with a resolved creator status (either a valid creator, a confirmed root, or an explicitly flagged audit-gap) — target: no "silent" unlinked identities once audit-gap transparency (§6.6) is in place.
- **Orphaned-creator find rate:** count of active identities whose creator is inactive/offboarded — the core differentiating finding for this module.
- **High-fan-out detection:** count of identities exceeding fan-out threshold, especially non-service identities (a human admin with unusually high fan-out is a stronger signal than a provisioning bot with the same count).
- **Time-to-trace:** time to fully resolve an identity's ancestor chain back to root, at scale.

## 8. Open Questions

**Scope note:** this PRD covers Delegation Chain only. It shares the underlying identity/app data with Access Discovery but tracks a structurally different relationship (creation lineage, a forest of trees) rather than access paths (a general directed graph). Identity Risk Profile and Governance modules consume this module's flags but are specified separately.

- **Threshold tuning:** what fan-out and depth thresholds count as anomalous will likely differ a lot by org size and by identity type (a provisioning bot vs. a human admin) — should thresholds be configurable per app/identity-type from day one, or hardcoded for MVP and tuned later?
- **Cross-app identity matching:** if the same human has separate identities in AWS, Okta, and Salesforce, should the product attempt to correlate them into one "person" view for a unified lineage, or keep app-scoped chains strictly separate (simpler, less error-prone, but loses the "this person's overall provisioning footprint" story)?
- **Self-created accounts:** how should self-service signups (no admin creator, but not a "root" account either — e.g., an OAuth "sign up with Google" flow) be classified — as a distinct category from both "root" and "unlinked," since neither quite describes it?
