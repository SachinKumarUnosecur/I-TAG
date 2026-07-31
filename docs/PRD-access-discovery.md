# PRD: Access Discovery

**Product:** IdentityGovern / IdentityTracer (Unosecur)
**Module:** Traceability → Access Discovery
**Doc owner:** Harsha
**Status:** Draft v2

---

## 1. Problem Statement

Standard IAM tools (AWS IAM Access Analyzer, Azure AD access reviews, native cloud consoles) can tell you what policy is attached to what identity. They cannot reliably tell you what an identity can *actually reach*, because a large share of real-world privilege escalation happens through resources, not through identity-to-identity grants. A user with no admin policy anywhere in sight can still end up with admin — by hopping through a resource that holds admin credentials.

Access Discovery exists to answer one question completely and correctly: **for any identity, what can it access, how, and through how many steps?**

This module sits at the base of the whole ITAG stack. Every other Traceability, Accountability, and Governance capability in the product — Identity Risk Profile's scoring, Unified Impact Analysis's compromise simulation, Delegation Chain's cross-linking, Ownership's grant-level attribution — reads its access-path facts from here. Access Discovery does not consume anything from the rest of the product; it is the one module every other module is built on top of. Getting its classification and staleness handling right is not just this module's own success criterion — it is a correctness precondition for everything downstream.

---

## 2. Goals / Non-Goals

**Goals**
- Classify every access path in the environment into exactly one of three types: Direct, Indirect, Hop.
- Surface Hop Access specifically, since it is invisible to native cloud tooling and is the primary source of unaccounted-for privilege escalation.
- Produce a complete, per-identity inventory of reachable resources with the path(s) that lead to each.
- Work across multiple providers (AWS, Azure, GCP, Kubernetes, SaaS/OAuth) using one shared graph model, not provider-specific one-off logic.
- Produce output that is directly consumable by downstream modules without requiring them to re-derive or reinterpret classification logic (see §2.1).

**Non-Goals (handled by other TAG modules, not this PRD)**
- Scoring/prioritizing risk (→ Identity Risk Profile)
- Attribution of *who owns* a grant (→ Accountability)
- Simulating downstream compromise across multiple identities (→ Unified Impact Analysis)
- Review/attestation workflows (→ Governance)

Access Discovery's job is strictly to **find and classify paths**. Everything downstream reads from its output.

### 2.1 Who consumes this module's output, and how

Because this is the foundation layer, it's worth being explicit about exactly which downstream modules depend on which parts of this module's output, and in what form — the same discipline the newer TAG PRDs apply when describing their own upstream dependencies:

| Consumer | What it reads from Access Discovery | What it must NOT do |
|---|---|---|
| **Identity Risk Profile** | The per-identity hop-access flag and count (a binary presence plus a count of distinct hop paths) as one of six weighted scoring factors; also reads effective-permission data for dormant-privilege calculation | Must not re-derive path classification itself, and must not treat a hop-access flag from a stale snapshot as equivalent to one from a current snapshot — see §4.4's staleness object, which Risk Profile is required to check |
| **Unified Impact Analysis** | The *entire classified graph* as its traversal substrate — every `HAS_POLICY`, `MEMBER_OF`, `CAN_ACCESS`, and `ASSUMES_ROLE` edge this module has already resolved, reused wholesale rather than re-walked from raw provider data | Must not re-run Access Discovery's own classification algorithm (§4.2); it extends the graph with a new derived edge type for identity-to-identity pivots, but the base graph and path types are consumed as-is |
| **Delegation Chain** | Cross-links per identity (§6.7 pattern): given an identity's Delegation Chain row, a reviewer can jump to that identity's Access Discovery per-user page and vice versa | Delegation Chain does not read Access Discovery's graph programmatically — this is a UI cross-link only, since the two modules track structurally different relationships (creation lineage vs. permission paths) |
| **Ownership / Accountability** | The Owner column surfaced per access path (§6.2), so an unowned Hop-Access path can be flagged as both a security finding and an accountability gap simultaneously | Does not alter or gate Access Discovery's own classification — an unowned path is still reported and classified the same way as an owned one; ownership status is additive metadata, not a filter on what gets shown |

This table is the contract other modules are written against. If Access Discovery's output schema changes, every row above is a place that could break.

---

## 3. Definitions

| Type | Definition |
|---|---|
| **Direct Access** | An identity holds a permission because a policy is attached directly to that identity. Single edge: `Identity —HAS_POLICY→ Permission`. |
| **Indirect Access** | An identity holds a permission because it belongs to an intermediate construct (group, team, org unit) that holds the policy. Two-edge path: `Identity —MEMBER_OF→ Group —HAS_POLICY→ Permission`. |
| **Hop Access** | An identity gains a permission by connecting *through* a resource that itself carries a privileged identity, rather than through any identity-to-identity relationship. Path crosses a `CAN_ACCESS` edge into a resource followed by an `ASSUMES_ROLE`/`HAS_IDENTITY` edge out of it: `Identity —CAN_ACCESS→ Resource —ASSUMES_ROLE→ Permission`. |

**Cross-provider equivalents of Hop Access:**

| Provider | Hop pattern |
|---|---|
| AWS | EC2/ECS/Lambda with an attached IAM Role → user with SSH/SSM/exec access to the compute resource |
| Azure | VM/Function App with a System- or User-Assigned Managed Identity → user with SSH/RDP/Run Command access |
| GCP | Compute Instance with an attached Service Account → user with SSH/OS Login access |
| Kubernetes | Pod bound to a ServiceAccount with RBAC bindings → user with `exec`/`kubectl exec` access to the pod |
| SaaS/OAuth | An OAuth app or integration holding a broad-scope token → user with admin access to configure/impersonate that app |

**Worked example (AWS), told as a story:**

`user:jane.doe` is a mid-level analyst. Her IAM user has exactly one directly attached policy, `AnalystReadOnly`, and she's a member of one group, `group:engineers`, which carries `EngineerStandardAccess` — neither of which grants anything close to admin. Six months ago, as part of an onboarding task, an admin gave her `ssm:StartSession` permission on a single EC2 instance, `i-0abc123`, so she could pull deployment logs directly from the box. Nobody revisited that grant since.

`i-0abc123` happens to run a legacy deployment service and, for that reason, carries an IAM Instance Profile with the role `ec2-admin-role` attached — a role someone provisioned years ago with `AdministratorAccess` because "it was easier at the time." Jane never touched that role, was never added to a group with that role, and no policy anywhere lists her by name next to `AdministratorAccess`. And yet: she can start an SSM session on `i-0abc123`, query the Instance Metadata Service from inside that session, and pull `ec2-admin-role`'s temporary credentials — at which point she is, functionally, an account administrator, for as long as those temporary credentials remain valid.

Access Discovery's classification algorithm (§4.2) catches this precisely because it doesn't stop at Jane's own policies or group memberships — it follows the `CAN_ACCESS → ASSUMES_ROLE` edge pair through `i-0abc123` and tags the resulting path `hop`, `hop_count: 3`, terminal permission `AdministratorAccess`, regardless of the fact that neither Jane's user object nor her group has ever been within sight of that permission in any native IAM policy viewer.

---

## 4. Detection Logic

### 4.1 Graph model

Model the environment as a directed graph:

- **Nodes:** Identities (human, service account, AI agent), Groups, Roles, Resources (compute, storage, database).
- **Edges:**
  - `HAS_POLICY` — identity or group → permission set
  - `MEMBER_OF` — identity → group
  - `CAN_ACCESS` — identity → resource (SSH, SSM, RDP, `kubectl exec`, OAuth delegated access, etc.)
  - `ASSUMES_ROLE` / `HAS_IDENTITY` — resource → role/permission set (instance profile, managed identity, attached service account)

### 4.2 Classification algorithm

For each identity, run a forward traversal (BFS, since path length/hop-count matters):

1. **Depth 1 — Direct check.** Any `HAS_POLICY` edge straight off the identity → tag path `direct`, hop count 1.
2. **Depth 2 — Indirect check.** Any path of the shape `MEMBER_OF → HAS_POLICY` → tag path `indirect`, hop count 2.
3. **Depth ≥2 — Hop check.** Any path that includes a `CAN_ACCESS → ASSUMES_ROLE` edge pair anywhere in the chain → tag path `hop`, regardless of how many additional indirect/direct edges precede or follow it. Hop classification **overrides** direct/indirect if a path contains both kinds of edges, since it represents the higher-risk mechanism.
4. **Effective permission resolution.** At the end of each path, evaluate any explicit denies, permission boundaries, or SCPs along the way to compute the *actual* effective permission set — not just the union of everything nominally granted. A path that looks like admin on paper but is blocked by a boundary policy should not be reported as live admin access.
5. **De-duplication.** If an identity reaches the same terminal permission via multiple path types (e.g., both indirect and hop), report all paths — don't collapse to "worst type only." Governance/remediation needs to know about every route, since closing one doesn't close the others.

> **Amendment 1 — there are no resource nodes, so the hop edge lives on the permission.** Implemented in `core/src/domain/types.ts` (`PermissionRecord.grants_identity`).
>
> §4.1's model assumes a resource is a node. The engine has exactly one node shape — `Identity` — and adding a second would mean every traversal in the codebase had to start branching on node type to avoid treating a resource as a principal, which is the one thing the graph layer is built not to do.
>
> A permission may therefore name the principal whose access it confers. Holding the permission *is* the `CAN_ACCESS` edge; the binding is the `ASSUMES_ROLE` edge. Classification, hop counts and the chain shape all come out identical to §4.3's worked example, and the same field is what Unified Impact Analysis needs for its own pivot edge, so one schema addition serves both modules.
>
> **The cost, stated plainly:** the resource is not separately nameable. §6.5's chain renders `ssm:session-deploy-box → role-deploy-box` where this spec renders `ec2:i-0abc123 → role:ec2-admin-role` — the instance and the permission that reaches it collapse into one step. The mechanism string carries the distinction; the topology does not. A deployment that needs per-resource inventory (rather than per-path classification) will need resource nodes, and that is a schema migration, not a patch.

> **Amendment 2 — step 5 is delivered per source, not per route.** Implemented in `core/src/access/classify.ts` (`discoverAccess`).
>
> Step 5's argument is a remediation argument: closing one route does not close the others, so all of them have to be visible. What is emitted is every distinct **source** of a terminal permission — each principal holding it produces its own path, so a permission reachable both through a group and through an assumed role appears twice, with different `path_type`s and different revocation targets.
>
> What is *not* emitted is every distinct **route to the same principal**. Two group memberships that converge on one role collapse to the single canonical route the traversal recorded. The reason is structural: the engine has one traversal primitive by design, and its `predecessors` map is one parent per node — a BFS tree. Enumerating all routes needs a multi-predecessor walker, i.e. a second BFS, which is the duplication the architecture exists to prevent.
>
> The remediation case step 5 argues for survives, because the collapsed routes share a revocation target: removing the role removes all of them at once. The case that does not survive is inventory completeness — "how many ways is Jane in this group" is not answerable from this output. If that becomes a requirement, the correct fix is an opt-in multi-predecessor mode on the shared `traverse`, not a second walker.

> **Amendment 3 — step 4 is not implemented, and nothing pretends it was.** See `core/src/access/service.ts`.
>
> The engine's permission model is additive and opaque: a `PermissionRecord` is an id and a sensitivity flag. There is no deny, no permission boundary and no SCP anywhere in it, so there is nothing to evaluate and a boundary evaluation cannot be faked by taking a union and renaming it.
>
> Accordingly the output carries **`reachable_permissions`, not `effective_permissions`** (§4.3, L116). It is the nominal union, and it is named for what it is. Two consequences follow and are accepted:
>
> 1. §7's **false-positive rate on effective-permission resolution** is unmeasurable in this build. It is not zero and it is not small — it is undefined, because the denominator does not exist.
> 2. §8's third open question — whether a hop blocked by a boundary should surface as "potential, currently mitigated" — cannot be answered or demonstrated, since no path can be blocked.
>
> Implementing this properly means a deny/boundary model with its own precedence rules and its own seed coverage, and it should be scoped as its own piece of work rather than smuggled in as a field name.

### 4.3 Path object (core output)

```json
{
  "identity_id": "user:jane.doe",
  "resource_id": "aws:account-root",
  "path_type": "hop",
  "hop_count": 3,
  "chain": [
    { "from": "user:jane.doe", "to": "ec2:i-0abc123", "edge": "CAN_ACCESS", "mechanism": "ssm:StartSession" },
    { "from": "ec2:i-0abc123", "to": "role:ec2-admin-role", "edge": "ASSUMES_ROLE", "mechanism": "instance_profile" },
    { "from": "role:ec2-admin-role", "to": "aws:account-root", "edge": "HAS_POLICY", "mechanism": "AdministratorAccess" }
  ],
  "effective_permissions": ["*:*"],
  "discovered_at": "2026-05-14T00:00:00Z",
  "last_confirmed_at": "2026-07-30T18:00:00Z"
}
```

### 4.4 Refresh / staleness

Because Identity Risk Profile and Unified Impact Analysis both now build directly on this module's output, staleness handling here needs the same rigor as those two modules apply to their own downstream data — a downstream module silently reasoning about a hop-access path that no longer exists (or missing one that newly appeared) is a correctness bug, not just a freshness nicety.

- **Full graph rebuild** on a schedule (e.g., every 6–24h) plus **event-triggered incremental updates** on: new policy attachment, new group membership, new resource-role attachment, new compute-connect permission grant.
- Each path carries both a `discovered_at` (when this exact path was first computed) and a `last_confirmed_at` (the most recent rebuild/incremental update that re-verified the path still exists) — a path whose `last_confirmed_at` predates the current rebuild cycle without being explicitly removed should be treated as unconfirmed, not silently assumed still valid.
- **Staleness object, surfaced explicitly per identity and per path** (mirroring the pattern in Identity Risk Profile §4.4 and Unified Impact Analysis §4.4):
  ```json
  {
    "staleness": {
      "graph_snapshot_at": "2026-07-30T18:00:00Z",
      "path_confirmed_current": true,
      "stale_if_older_than_hours": 24
    }
  }
  ```
> **Amendment 4 — `graph_snapshot_at` is emitted; `discovered_at` and `last_confirmed_at` are not.** See `core/src/domain/access.ts` (`AccessSnapshot`).
>
> `graph_snapshot_at` comes from the injected `Clock` port, which is what makes the pinned demo instant reproducible and gives the downstream contract below something real to point at.
>
> The two per-path timestamps are omitted rather than filled in. Both are defined by comparison against a previous rebuild, and this build loads one frozen dataset at boot — there is no prior snapshot to confirm a path against. Deriving them from the current clock would stamp every path as freshly re-verified, which is exactly the false assurance the `last_confirmed_at` bullet warns about. They arrive with incremental rebuilds or not at all.

- **Downstream contract:** any module reading a path or hop-access flag from this output must check the staleness object before treating it as current. Identity Risk Profile's own staleness block (its `stalest_input` field) should, when the stalest input is Access Discovery, point back to this object's `graph_snapshot_at` rather than re-deriving its own notion of "how old is this fact."
- **Mid-refresh reads:** if a downstream module queries this module's output while a rebuild is actively in progress, it receives the last fully-completed snapshot with its true `graph_snapshot_at` timestamp — never a partially-rebuilt, internally inconsistent graph. This guarantees every consumer either sees a complete prior state or a complete new state, never a mix.

---

## 5. Data Requirements (per provider)

| Provider | Data needed |
|---|---|
| AWS | IAM users/roles/groups/policies, EC2 instance profiles, Lambda execution roles, ECS task roles, SSM/EC2-Connect permissions, resource-based policies |
| Azure | Azure AD users/groups/role assignments, Managed Identities (system + user-assigned), VM/Function App identity bindings, RBAC role assignments |
| GCP | IAM bindings, Service Accounts, Compute Instance service account attachments, OS Login permissions |
| Kubernetes | RBAC Roles/ClusterRoles/Bindings, ServiceAccount-to-Pod bindings, exec/port-forward permissions |
| SaaS | OAuth app registrations + granted scopes, admin role assignments per SaaS tool |

Each provider needs a connector that normalizes its native model into the shared node/edge schema in §4.1 — this normalization layer is the main engineering lift, since the graph traversal logic itself is provider-agnostic once the data is in the shared schema. This is also the layer Unified Impact Analysis's identity-to-identity pivot edges (its own §4.1) are built on top of, so schema stability here directly affects that module's correctness as well.

---

## 6. UI/UX Spec — Access Discovery Screen (Table-First)

### 6.1 Why table-first, justified against the product-wide rule

Per §7 of the project context doc, the product-wide default is table, earning a graph only where "the underlying concept is genuinely spatial/relational... never because 'security tools have graphs.'" Access Discovery's global view fails that test deliberately: a full-environment graph of every identity, group, role, and resource in even a mid-sized org renders as an unreadable tangle, isn't exportable or sortable, and doesn't support the bulk triage actions (multi-select, bulk export, bulk flag) an auditor actually needs. Every fact the graph model computes (§4) is a fully described row — identity, resource, path type, chain — with nothing lost in flattening it. This is the mirror image of Unified Impact Analysis's justification for going graph-first (its own §6.1): that module's subject matter is propagation *through* the graph, which a row can't represent; this module's subject matter is a finished, classified inventory, which a row represents completely. Both conclusions follow the same rule; they just land in opposite places because the underlying questions are different in kind.

### 6.2 Layout

- **Header:** identity/resource search + selector, with an Access Type filter row (Direct / Indirect / Hop toggle chips) always visible.
- **Primary view — Table.** No graph rendering anywhere in this screen; every relationship the graph model computes (§4) is flattened into rows.
- **Filter bar** (above the table): Access Type, Cloud Provider, Identity Type (human/service/AI agent), Resource Sensitivity, Hop Count range, Owner. Filters combine (AND).
- **Search-within-table:** free-text box that matches identity, resource, or mechanism string.

### 6.3 Core table — columns

| Column | Content | Notes |
|---|---|---|
| Identity | Identity name + type icon (human/service/AI agent) | Sortable, clickable → identity detail drawer |
| Resource | Terminal resource name + provider icon | Sortable |
| Access Type | Badge: **Direct** (gray) / **Indirect** (amber) / **Hop** (red) | Primary sort column by default, Hop rows pinned/sorted to top |
| Hop Count | Integer | Sortable |
| Via | Short mechanism summary, e.g. `group:engineers` or `ec2:i-0abc123 → ec2-admin-role` | Truncated with tooltip; click to expand full chain (§6.5) |
| Effective Permissions | Summarized (e.g. `AdministratorAccess`, or count + "view all") | — |
| Resource Sensitivity | Icon/badge (Critical/High/Medium/Low) | Sortable |
| Owner | Owner of record, or "Unowned" in red if missing | Ties to Accountability module (§2.1) |
| Last Confirmed | Timestamp from `last_confirmed_at` (§4.4) | Sortable, flags staleness |

- Default sort: Access Type (Hop first) → Resource Sensitivity (Critical first). This surfaces the highest-value findings without the user needing to configure anything.
- Row density toggle (comfortable/compact) for auditors scanning large environments.
- Column chooser so teams can hide columns they don't need (e.g., hide "Owner" if Accountability module isn't in scope yet).

### 6.4 "Hop Access" emphasis (table-native)

Since Hop Access is the finding regular tools miss, it needs to stand out in a plain table without relying on a graph visual:

- Hop rows get a **red left-border accent** on the row (not just the badge) so they're scannable at a glance while scrolling.
- A dedicated **"Hop Access Only"** filter chip, one click, pinned at the top-left of the filter bar — this is the highest-value slice to show in a demo or audit and shouldn't require combining multiple filters to reach.
- A summary strip directly above the table: `X Direct · Y Indirect · Z Hop` as three plain counters, Z always rendered in red.
- Each Hop row's "Via" column auto-generates a one-line plain-English string on hover/tooltip, e.g.: *"jane.doe can reach account-root admin by connecting to EC2 instance i-0abc123, which has an admin role attached."*

### 6.5 Chain detail (row expand, not a separate panel)

- Clicking a row expands it inline (accordion-style) rather than opening a graph — keeps everything in the table paradigm.
- Expanded content: a numbered list of each hop in the chain, in order, each line showing `from → to` with the edge type and mechanism, plus the timestamp that edge was first observed:
  ```
  1. jane.doe → ec2:i-0abc123        (CAN_ACCESS via ssm:StartSession)      observed 2026-06-02
  2. ec2:i-0abc123 → ec2-admin-role  (ASSUMES_ROLE via instance_profile)    observed 2026-06-02
  3. ec2-admin-role → account-root   (HAS_POLICY: AdministratorAccess)     observed 2026-05-14
  ```
- "Copy chain as text" and "Export chain as JSON" actions inline in the expanded row for ticketing/remediation workoff.

### 6.6 Per-identity summary (used elsewhere in product)

Wherever an identity is referenced outside this screen (risk profile, review queue, delegation chain cross-link), show a compact rollup rather than a mini-graph:

```
jane.doe
  Direct:   3 resources
  Indirect: 12 resources
  Hop:      1 resource   ⚠ account-root via EC2 i-0abc123
```

This is the exact rollup format Identity Risk Profile's own per-identity summary (its §6.5) references as the "raw_signal" behind its hop-access-presence scoring factor — the two are meant to look and read the same wherever they appear, so a reviewer's pattern recognition carries across screens.

### 6.7 Empty/loading/scale states

- **No hop access found for this identity/environment:** explicit green "No resource-mediated escalation paths detected" row/banner above the table — absence of a red flag should be visible and reassuring, not just an empty filtered table.
- **Large result sets:** server-side pagination + the default Hop-first/Sensitivity-first sort so the highest-priority rows are on page 1 without the user needing to page through everything.
- **Bulk actions row:** checkbox column + "Export selected," "Send to review queue," "Flag for remediation" — since a flat table naturally supports multi-select in a way a graph view doesn't.
- **Mid-refresh state (new in v2):** if the table is queried while a graph rebuild is actively running (§4.4), the UI shows the last fully-confirmed snapshot with its `graph_snapshot_at` timestamp visible near the summary strip, plus a subtle "Refreshing..." indicator — never a partial or flickering result set mid-rebuild.

### 6.8 Export

- CSV/XLSX export of the current filtered/sorted view, with the chain (§6.5) flattened into a single "Path" text column for offline/audit use — no data should be graph-only or unexportable.

### 6.9 Per-User Detail Page

The global table (§6.1–6.8) is optimized for scanning *across* identities. The per-user page answers a different question — "what's this one identity's whole access story" — and is reached by clicking any Identity name/row throughout the product.

**Layout, top to bottom:**

1. **Header strip:** identity name + type icon (human/service/AI agent), Owner, Risk Score, JML status (Active/Mover/Leaver/Orphaned). Everything a reviewer needs before scrolling. The Risk Score shown here is read directly from Identity Risk Profile's output (§2.1) — this page does not compute its own score.
2. **Summary counters** (full-width, prominent): `3 Direct · 12 Indirect · 1 Hop`, with the Hop count always rendered in red and, if non-zero, accompanied by the one-line plain-English finding inline — e.g. *"Can reach account-root admin via EC2 i-0abc123 — no admin policy attached directly or through any group."* This is the punchline of the page and should be visible without any interaction.
3. **Access table:** same columns/behavior as the global table (§6.3–6.5), pre-filtered to this identity, default sorted Hop-first. Row expand still shows the numbered chain.
4. **"Visualize" toggle** (optional, off by default): switches the table to a small radial graph scoped to just this identity's paths — identity centered, edges color-coded gray/amber/red exactly as elsewhere. Feasible here specifically because scope is bounded to one identity's paths (typically single/low-double digits), unlike the global view where a graph doesn't scale. This stays an opt-in secondary view, not the default, so the mental model (table = primary) stays consistent across the product. This is a smaller-scale instance of the same principle Unified Impact Analysis's simulator applies at full scale (its own §6.1) — a graph earns its place once the concept genuinely is spatial and the node count is bounded; the difference is Unified Impact Analysis's core subject is propagation itself, so it earns graph-first by default, while this page earns it only as an optional, scoped exception.
5. **Timeline strip** (if JML/lifecycle data is available): Joiner/Mover/Leaver events plotted against access changes over time, below the table.

**Demo sequencing note:** this page is the natural landing spot for "show me one interesting user" — summary counters surface the finding immediately (the number + the sentence), the table backs it with proof, and the optional graph toggle is offered only as visual reinforcement afterward, not as the first thing the viewer has to interpret.

---

## 7. Success Metrics

- **Coverage:** % of identities in the environment with a completed access-path inventory (target: 100% within one full graph-rebuild cycle).
- **Hop-access find rate:** count of hop-access paths discovered that had zero corresponding native-tool finding (this is the metric that proves the product's differentiation).
- **Time-to-classify:** end-to-end time from data ingestion to fully classified graph for a given environment size.
- **False positive rate on effective-permission resolution:** paths reported as live access that are actually blocked by a boundary/deny policy — should trend to zero, since this directly affects trust in every downstream module.
- **Downstream consistency (new in v2):** rate of discrepancy between the hop-access flag Identity Risk Profile or Unified Impact Analysis reads and the current live state of this module's graph — should trend to zero as the staleness contract in §4.4 matures; any nonzero rate here is, by construction, a bug in this module's output or in a consumer's staleness handling, not an acceptable steady state.

---

## 8. Open Questions

- How do we handle **transitive hop chains** — e.g., Resource A's role can assume Resource B's role, which is attached to Resource C, which the user can connect to? (Multi-hop-through-multiple-resources, not just one.) Current logic in §4.2 step 3 already tags any chain containing a hop edge as `hop`, so this should already generalize — worth validating against a real multi-hop test case. Note this is also exactly the boundary case Unified Impact Analysis's own propagation logic extends past this module's scope (its §4.1's derived pivot edge) — worth confirming the two modules agree on where classification ends and propagation begins.
- Do OAuth/SaaS hop patterns need their own sub-classification, since "connect to a resource" doesn't map as cleanly as it does for compute (e.g., an OAuth app isn't something a user "connects to" the way they SSH into a VM)?
- What's the policy for **hop paths that are blocked by a permission boundary at the terminal step** — do we still surface them as "potential hop access, currently mitigated" for audit completeness, or only show live/exploitable paths?
- **Mid-refresh consumption (new in v2):** now that Identity Risk Profile and Unified Impact Analysis both poll this module's output on their own recompute cadences, should there be a push notification/webhook when a full rebuild completes, so downstream modules can recompute promptly, or is polling against the `graph_snapshot_at` timestamp (§4.4) sufficient for MVP?

---

*Scope note: this PRD covers Access Discovery only — path discovery and classification (Direct/Indirect/Hop). Delegation Chains, Exposure Mapping, and Identity Ownership are specified separately and interact with this module only through the cross-link and Owner-column patterns described in §2.1 and §6.3. Identity Risk Profile consumes this module's hop-access flag and effective-permission data as a scoring input, and Unified Impact Analysis consumes this module's entire classified graph as its traversal substrate — both are specified in their own PRDs (identity-risk-profile-prd.md, unified-impact-analysis-prd.md) and neither recomputes or duplicates the classification logic defined here.*
