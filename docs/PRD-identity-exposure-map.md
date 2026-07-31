# PRD: Identity Exposure Map

**Product:** IdentityGovern / IdentityTracer (Unosecur)
**Module:** Traceability → Identity Exposure Map / Reachability Analysis
**Doc owner:** Harsha
**Status:** Draft v1

> **Repo copy, amended.** The prose below is Harsha's Draft v1, unchanged. Seven amendments
> are inserted inline as blockquotes where they apply, in the same style as
> `docs/PRD-access-discovery.md`. Where an amendment and the surrounding prose conflict,
> the amendment governs, and `docs/identity-exposure-map-research.md` carries the full
> argument for each.
>
> Amendments 1–6 are numbered in document order and were written from the research
> alone. **Amendment 7 is numbered last but appears first**, in §1, because it could
> only be written after the demo data existed: building the estate this PRD asks for
> refuted the argument it opens with.

---

## 1. Problem Statement

Access Discovery answers "how does this identity reach this one resource" — one path, one classification, one row. It's deliberately atomic: every path is reported separately, even when an identity has forty of them, because governance and remediation need to see every route, not a summary.

But an atomic view can't answer a question a reviewer asks constantly during triage: **"forget any single path — overall, if I had to describe this identity's total footprint, how exposed is it, and where does that exposure actually sit?"** Forty low-sensitivity Direct paths and one Hop path into a production database are not the same story, and a table of forty-one rows doesn't make that difference legible at a glance. Identity Exposure Map exists to take Access Discovery's full path inventory for a given identity, aggregate it into a single weighted picture, and — because "where does the exposure sit" is a genuinely spatial question — render that picture as a resource map: what this identity can reach, laid out so a reviewer can see the shape of the exposure, not just count it.

This is the aggregation layer between Access Discovery's per-path facts and Identity Risk Profile's per-identity score: it turns "here are forty-one rows" into "here is one number, and here is the map that number came from."

> **Amendment 7 — the forty-versus-one comparison is the right question and the wrong prediction. Under this PRD's own algorithm the forty win.** See `core/src/data/seed/exposure.ts` and `docs/identity-exposure-map-research.md` §1.3, §9.
>
> The seed had no identity wide enough to test this claim — the largest footprint in the estate was five paths — so `seed/exposure.ts` builds one. `user-maya` holds forty non-sensitive permissions across two systems; `user-jane` holds four, one of which is production platform admin reached by a hop nothing else in the product surfaces. Running §4.2's aggregation over them with the weights fixed in research §5 gives Maya **97** and Jane **78**.
>
> That is the reverse of the ordering this section implies, and **it is kept**. Three reasons. Forty systems is a real blast radius, and a reviewer who is told otherwise has been told something false. The canonical incident for this module (research §3.4, Capital One 2019) is one path into 700 enumerable buckets — read scope nobody re-examined, which is Maya's shape with the names changed. And a weighting adjusted until it always ranks the sensitive row first is a sensitivity flag with arithmetic on top; the engine already has one of those, in `ownership/severity.ts`, and it is free.
>
> So the problem statement stands with its conclusion replaced. Forty low-sensitivity paths and one hop into production are not the same story — **and neither one dominates the other.** Sensitivity and breadth are independent axes, this dataset is the case where they disagree, and a list sorted by either alone loses the identity the other would have caught. That is a stronger argument for a map than the original, because a single ordered column cannot express it and a map can.

---

## 2. Goals / Non-Goals

**Goals**
- For every identity, compute the full reachable set — the union of every resource at the end of every Direct, Indirect, and Hop path Access Discovery has classified for that identity.
- Weight the reachable set by resource sensitivity (data classification, prod vs. non-prod, internet-facing vs. internal) to produce a single **exposure score**, not just a raw resource count.
- Render that reachable set as a **resource map**: a spatial, hop-distance-organized visualization with a sensitivity heat overlay — this is the one place in the Traceability pillar, alongside Unified Impact Analysis, where the underlying concept is genuinely spatial enough to earn a visual-first default (see §6.1 for the justification).
- Support progressive exploration — a reviewer should be able to expand or collapse the view by hop distance ("show me what's reachable within N hops") rather than being shown the full footprint at once.
- Produce output that Identity Risk Profile can consume directly as its `exposure_score` input, and that Unified Impact Analysis can use as its starting-point reachable set before it extends propagation across identity boundaries.

**Non-Goals (handled by other TAG modules, not this PRD)**
- Classifying individual paths as Direct/Indirect/Hop, or producing the per-path chain detail — that's Access Discovery entirely. This module consumes Access Discovery's already-classified path inventory wholesale; it does not re-walk the graph or re-derive path types.
- Computing the final per-identity composite risk score — that's Identity Risk Profile. This module's exposure score is **one input** to that score, weighted alongside hop-access presence, credential hygiene, trust decay, dormant privilege, and ownership status. Identity Risk Profile's own PRD (§4.1) names this module's output by name as its "Exposure score" row; this PRD is the module producing that number, not consuming it.
- Simulating cross-identity pivots or systemic propagation if an identity is compromised — that's Unified Impact Analysis. This is the critical distinction to hold onto: Exposure Map answers "what can *this one identity* reach, today, as things stand" — a single-identity, current-state aggregation. Unified Impact Analysis answers "if this identity *were* compromised, what does that unlock recursively, including other identities' own credentials" — a hypothetical, multi-identity, propagating simulation. Unified Impact Analysis's own PRD (§4.2 step 1) explicitly seeds its propagation frontier from this module's reachable set, then continues past it into identity-boundary pivots this module deliberately does not cross.
- Attribution of ownership, or review/attestation workflows (→ Accountability / Governance).

Identity Exposure Map's job is strictly to **aggregate and spatially render one identity's current reachable footprint** — it sits between Access Discovery (which finds the paths) and Identity Risk Profile / Unified Impact Analysis (which each consume this module's aggregate differently).

---

## 3. Definitions

| Term | Definition |
|---|---|
| **Reachable Set** | The full union of resources an identity can reach across every Direct, Indirect, and Hop path Access Discovery has classified for it, de-duplicated by terminal resource. |
| **Exposure Score** | A single normalized value (0–100) representing the reachable set's total weighted risk — resource count alone is not the score; each resource's sensitivity weight matters more than raw count. |
| **Sensitivity Weight** | A per-resource multiplier (Critical / High / Medium / Low, or a finer-grained data-classification tag) applied to that resource's contribution to the exposure score. |
| **Hop Distance (from the identity)** | How many edges removed a reachable resource is from the identity itself — a Direct path resource is hop-distance 1; a Hop-Access path resource is typically hop-distance 3 (identity → resource → role → terminal permission). |
| **Resource Map** | The spatial rendering of an identity's reachable set: identity at the center, reachable resources arranged in rings by hop distance, colored/shaded by sensitivity. |
| **Exposure Delta** | The change in an identity's exposure score between two computed snapshots — used to flag identities whose footprint is growing quickly, independent of their absolute exposure level. |

> **Amendment 1 — there are no resources, so the exposure set is a union of permissions.** Implemented as `ExposureSet` over `AccessPath.permission`; see `core/src/domain/access.ts` (`AccessPath`) and `docs/PRD-access-discovery.md` Amendment 1.
>
> This PRD inherits, without restating it, a decision already made one module upstream: the engine has exactly one node shape, `Identity`, and a resource is not a node. The hop principal lives on the permission (`PermissionRecord.grants_identity`). There is no `resource_id` anywhere in the engine, and `AccessPath.permission` is annotated as this spec's `resource_id`.
>
> Everywhere this document says "resource," read "permission." The **Reachable Set** is the de-duplicated union of `AccessPath.permission`; the **Resource Map** plots permissions; **Hop Distance** is `AccessPath.hop_count`, which is the chain's edge count.
>
> **The cost, stated plainly:** "how many buckets can Jane reach" is not answerable, only "which capabilities can Jane exercise." For the Capital One comparison in the research doc §3.4 this matters — 700 buckets behind one role collapses to one permission — and the demo must say so rather than imply per-object inventory.
>
> **Naming:** the emitted field is `exposure_set`, not `reachable_set`. `core/src/ownership/reach.ts` already exports `reachableAccess`, which walks a *different* edge set and legitimately disagrees; two things named for reachability that return different answers is a defect waiting to be filed.

**Worked example (AWS), told as a story:**

`user:jane.doe` has, per Access Discovery, three Direct paths (an internal wiki, a low-sensitivity S3 read bucket, and a shared Confluence space), one Indirect path via `group:engineers` (a staging RDS instance), and the one Hop path already established in Access Discovery's own worked example — a path through EC2 instance `i-0abc123` into `ec2-admin-role`, terminating at `aws:account-root`.

A raw count says Jane can reach five resources. Identity Exposure Map instead weighs them: the wiki, S3 bucket, and Confluence space are all Low sensitivity (contribution near-zero each); the staging RDS instance is Medium (a modest contribution, since it's non-prod); and `aws:account-root` — reached via the single Hop path — is Critical, both because of its own classification and because it sits at the far edge of the reachable set with the broadest terminal permission (`*:*`) of anything Jane can touch. The resulting exposure score (say, 78/100) is driven almost entirely by that one Hop path, and the resource map makes this visible immediately: four small, dim, inner-ring nodes clustered close to Jane's center node, and one large, bright-red node sitting out at the third ring — the shape of the map tells the story a five-row count cannot.

> **Note — the seed already contains this example, and the number 78 is preserved.** `user-jane` holds `read:dashboards` and `ssm:session-deploy-box` directly, inherits `mcp:notion-write` via `group-eng`, and reaches `admin:platform` by a 3-edge hop through `role-deploy-box`. The algorithm in `identity-exposure-map-research.md` §5 is calibrated so that this footprint scores exactly **78**, with 83% of the weight from the single hop path. The worked example above is therefore reproducible against the live dataset rather than illustrative.

---

## 4. Detection Logic

### 4.1 Aggregation model

This module has no graph-traversal logic of its own — it does not walk `HAS_POLICY`/`MEMBER_OF`/`CAN_ACCESS`/`ASSUMES_ROLE` edges, since Access Discovery has already done that and produced classified path objects (per that PRD's §4.3). Identity Exposure Map's "detection logic" is an **aggregation and weighting pipeline** over Access Discovery's already-computed output, plus one additional data source it introduces: a resource sensitivity registry (data classification tags, prod/non-prod flags, internet-facing flags) that Access Discovery's path objects reference but don't themselves maintain.

> **Correction of fact — Access Discovery's path objects do not reference a sensitivity registry.** `AccessPath.sensitive` (`core/src/domain/access.ts`) is a denormalised copy of the catalog's boolean, resolved at classification time from `graph.sensitivePermissions`. There is no registry reference to inherit, so this module does not extend an existing pointer — it would be introducing the concept outright. See Amendment 3 for what is introduced instead.
>
> The rest of §4.1 is correct and is the reason this module is cheap: zero traversal, which satisfies the one-traversal-primitive rule in `docs/ITAG.md` §3 for free.

### 4.2 Computation steps

1. **Pull the identity's full path inventory.** Request every Direct, Indirect, and Hop path object Access Discovery has classified for the identity, including `hop_count` and `effective_permissions` per path.
2. **De-duplicate by terminal resource.** If multiple paths reach the same resource (e.g., both an Indirect and a Hop path terminate at the same S3 bucket), the resource appears once in the reachable set, tagged with the *highest-risk* path type that reaches it (Hop overrides Indirect overrides Direct for this purpose) — Access Discovery's own PRD (§4.2 step 5) deliberately reports all paths separately for remediation completeness, but this module's aggregate view only needs the worst-case route per resource to compute exposure correctly.
3. **Assign sensitivity weight.** Look up each terminal resource's sensitivity classification from the resource registry; apply the corresponding weight (e.g., Critical = 1.0, High = 0.6, Medium = 0.3, Low = 0.1).
4. **Compute per-resource contribution.** Combine sensitivity weight with hop distance — a Critical resource reached via a Hop path contributes more than the same Critical resource reached via Direct access, since Hop-mediated reachability represents a less-visible, less-governed route to that same asset.
5. **Sum and normalize.** Total the weighted contributions across the full reachable set, normalize to a 0–100 exposure score.
6. **Bucket by hop distance for the map.** Group the reachable set into rings (hop-distance 1, 2, 3+) so the resource map (§6) can render progressively outward from the identity.
7. **Compute exposure delta.** Compare against the identity's own exposure score from the last computed snapshot; flag `rising_fast` if the delta exceeds a configurable threshold within a configurable window — mirroring the score-drift pattern Identity Risk Profile applies to its own composite score.

> **Amendment 2 — step 1 reads `reachable_permissions`; `effective_permissions` does not exist and will not be introduced here.** See `core/src/domain/access.ts` (`IdentityAccessProfile.reachable_permissions`).
>
> This is the same wording `docs/PRD-access-discovery.md` was already amended to remove (its Amendment 3). The engine's permission model is additive and opaque — a `PermissionRecord` is an id and a sensitivity flag, with no deny, no permission boundary and no SCP — so there is nothing to evaluate, and a boundary evaluation cannot be faked by taking a union and renaming it.
>
> An aggregation layer is the *most* dangerous place to reintroduce the name, because summing nominal permissions into a single confident number is precisely how a nominal figure starts being read as an effective one.
>
> **The canonical incident says so explicitly.** In the Ninth Circuit record for *United States v. Thompson*, "the majority of the commands Ms. Thompson entered with the role failed," returning "You are not authorized to perform this operation." Even in the breach this module's argument rests on, nominal reachability materially overstated effective reachability. The score is directionally right and quantitatively unfounded, and §7's false-positive metric remains **undefined, not zero**.

> **Amendment 3 — sensitivity is a three-state union over permissions, not a four-tier registry over resources, and `unclassified` is excluded from the score rather than defaulted to Medium.** Implemented as `PermissionSensitivity`; see `core/src/data/seed/catalog.ts` and `docs/identity-exposure-map-research.md` §4.2.
>
> Step 3 and §5 assume a registry keyed by resource, populated from provider classification data. Two independent problems block it. First, there are no resources (Amendment 1), so there is no key. Second, and decisive even if resources existed: every provider mechanism §5 names classifies a *storage container* — Macie profiles buckets by sampling, GCP Sensitive Data Protection profiles buckets and containers, Purview labels Data Map assets and, for databases, only columns — while this engine's terminal object is a capability like `admin:platform`. **There is no join.**
>
> What is implemented instead is a union derived from the catalog the engine already has:
>
> ```ts
> export type PermissionSensitivity =
>   | { readonly kind: 'sensitive' }
>   | { readonly kind: 'not_sensitive' }
>   | { readonly kind: 'unclassified'; readonly reason: 'no_registry_entry' };
> ```
>
> Two weights, not four (1.0 and 0.1), because two is what the data supports. The existing `PermissionRecord.sensitive?: boolean` is untouched — `ownership/severity.ts` ranks on it and the demo's pinned counts depend on it.
>
> **§5 L129 is overruled.** It requires an unclassified resource to be "treated as Medium, not Low." An `unclassified` permission is instead excluded from the weighted sum entirely (`counted: false`), matching the treatment of `unknown` in `ownership/classify.ts` and architecture rule 9 — absence of data is never a finding. Defaulting to Medium makes the score rise when the *registry* degrades rather than when the estate does, which is a number no CISO can defend in a review.
>
> The precedent is the providers' own. Amazon Macie's documented sensitivity scale reserves **50 for "not yet analyzed"**, distinct from 1–49 "not sensitive" and 51–99 "sensitive". Microsoft Defender for Cloud's risk levels are Critical, High, Medium, Low and **Not evaluated**. Neither vendor collapses "we haven't looked" into a tier in either direction.
>
> §6.5's distinct "unclassified" rendering and §7's classification-completeness metric are both kept, and become more important rather than less: completeness is the gate on whether the score means anything.

> **Amendment 4 — step 4 multiplies by mechanism, not by hop distance, because in this engine the two are the same fact.** See `core/src/access/classify.ts` (`hop_count` is `chain.length`).
>
> Step 4's reasoning is sound: a hop-mediated route to an asset is less visible and less governed than a direct grant. Its chosen variable is not. Measured across all 138 paths in the seed at `d31f0fd`, the only `(path_type, hop_count)` pairs that occur are `direct:1`, `indirect:2`, `hop:3`, `hop:4`, `hop:6` — path type and hop distance are collinear by construction, because a direct path is one edge, an indirect path is two, and a hop is three or more. Multiplying by both counts the same fact twice.
>
> The multiplier is therefore applied to `path_type` (1.5 for `hop`, 1.0 otherwise) and distance is left to the map's geometry. If a nested group ever lands in the dataset — producing an indirect path at distance 3 — distance becomes independently meaningful and this amendment should be revisited.

> **Amendment 5 — step 5's normalization is specified, saturating, and ships its own derivation. Step 7 is not implemented, and nothing pretends it was.** See `docs/identity-exposure-map-research.md` §5.
>
> **On step 5.** The PRD says "normalize to a 0–100 exposure score" without saying how, and the obvious reading — divide by the population maximum — is wrong: it makes a score of 78 mean something different every time the estate changes, so no identity is comparable to its own past value. The implemented normalization is `100 · (1 − e^(−S/k))` with `k = 1.189`, fixed by the single published anchor that Jane's footprint scores 78. It is bounded, monotone, and depends on nothing outside the identity. It compresses the top, which is why the raw weighted sum `S` is emitted alongside it.
>
> The score never ships alone. FIRST requires, as a condition of using CVSS, that publishers provide "both the score and the vector string so others can understand how the score was derived," and CVSS v4.0 replaced v3.x's algebra specifically because those formulas "were not intuitive due to their rather abstract predefined formulas." Accordingly `exposure_score`, `weighted_sum`, `contributions[]` and `unclassified_permissions[]` are one object, and no consumer can render the number without holding the derivation.
>
> **On step 7.** `exposure_delta` requires a prior snapshot. The graph is built once at boot from a frozen dataset. This is the same question `docs/PRD-access-discovery.md` Amendment 4 already answered for `discovered_at` and `last_confirmed_at`, and the answer does not change because the field is called "delta": a trend computed from one snapshot is fabricated, and a `rising_fast` badge is a fabricated alarm — worse than a missing field, because it is actionable.
>
> `exposure_delta` is therefore **absent from the output object**, not null. If the demo wants the beat, the correct build is a second, explicitly seeded prior snapshot with its own timestamp, and a delta labelled as being between two named snapshots.

> **Amendment 6 — step 6 rings by exact hop distance, not by a 1 / 2 / 3+ bucket.**
>
> Per Amendment 4, ring 1 *is* the direct paths (66 in the seed), ring 2 *is* the indirect paths (66), and ring 3+ *is* the hop paths (6). A three-bucket ring layout therefore re-encodes the `66 · 66 · 6` summary strip and tells a reviewer nothing new.
>
> Worse, the 3+ bucket collapses the estate's deepest chain — `agent-support-triage`, six edges across two systems — into the same ring as Jane's three. That chain is the most compelling object in the dataset and the bucketing hides it.
>
> Rings are therefore one per distinct `hop_count` value present. The hop-distance slider of §6.4 is unaffected and works better.

### 4.3 Exposure object (core output)

```json
{
  "identity_id": "user:jane.doe",
  "exposure_score": 78,
  "exposure_delta": {
    "delta_30d": 41,
    "flag": "rising_fast"
  },
  "reachable_set": {
    "total_resources": 5,
    "by_hop_distance": {
      "1": [
        { "resource_id": "wiki:internal-docs", "sensitivity": "low", "path_type": "direct" },
        { "resource_id": "s3://low-sensitivity-bucket", "sensitivity": "low", "path_type": "direct" },
        { "resource_id": "confluence:shared-space", "sensitivity": "low", "path_type": "direct" }
      ],
      "2": [
        { "resource_id": "rds:staging-db", "sensitivity": "medium", "path_type": "indirect", "via": "group:engineers" }
      ],
      "3": [
        { "resource_id": "aws:account-root", "sensitivity": "critical", "path_type": "hop", "via": ["ec2:i-0abc123", "role:ec2-admin-role"] }
      ]
    }
  },
  "highest_sensitivity_reached": "aws:account-root",
  "computed_at": "2026-07-31T00:00:00Z",
  "staleness": {
    "based_on_access_discovery_snapshot": "2026-07-30T18:00:00Z",
    "stale_if_older_than_hours": 24
  }
}
```

> **The object as built**, reflecting Amendments 1–6. `exposure_delta` is gone; `reachable_set` is `exposure_set` over permissions; sensitivity is a union; `weighted_sum` and `contributions` ship with the score; rings are per exact distance; `route_count` is carried so a multi-route permission is visible even though only its worst route scores (§8, open question 2).
>
> ```json
> {
>   "identity_id": "user-jane",
>   "app": "aws-iam",
>   "exposure_score": 78,
>   "weighted_sum": 1.8,
>   "exposure_set": {
>     "total_permissions": 4,
>     "counted": 4,
>     "unclassified": 0,
>     "by_hop_distance": {
>       "1": [
>         { "permission": "read:dashboards", "sensitivity": "not_sensitive", "path_type": "direct", "route_count": 1 },
>         { "permission": "ssm:session-deploy-box", "sensitivity": "not_sensitive", "path_type": "direct", "route_count": 1 }
>       ],
>       "2": [
>         { "permission": "mcp:notion-write", "sensitivity": "not_sensitive", "path_type": "indirect", "via_group": "group-eng", "route_count": 1 }
>       ],
>       "3": [
>         { "permission": "admin:platform", "sensitivity": "sensitive", "path_type": "hop", "via_permission": "ssm:session-deploy-box", "assumed_identity": "role-deploy-box", "route_count": 1 }
>       ]
>     }
>   },
>   "contributions": [
>     { "permission": "admin:platform", "weight": 1.0, "mechanism_multiplier": 1.5, "contribution": 1.5, "share_of_score": 0.83 },
>     { "permission": "read:dashboards", "weight": 0.1, "mechanism_multiplier": 1.0, "contribution": 0.1, "share_of_score": 0.06 },
>     { "permission": "ssm:session-deploy-box", "weight": 0.1, "mechanism_multiplier": 1.0, "contribution": 0.1, "share_of_score": 0.06 },
>     { "permission": "mcp:notion-write", "weight": 0.1, "mechanism_multiplier": 1.0, "contribution": 0.1, "share_of_score": 0.06 }
>   ],
>   "unclassified_permissions": [],
>   "highest_sensitivity_reached": "admin:platform",
>   "computed_at": "2026-07-31T00:00:00.000Z",
>   "staleness": {
>     "based_on_access_discovery_snapshot": "2026-07-31T00:00:00.000Z"
>   }
> }
> ```
>
> `stale_if_older_than_hours` is omitted: it is a deployment policy, not a fact about this snapshot, and the engine has no rebuild cadence to state one against.

### 4.4 Refresh / staleness

- Recompute triggered on any change to the identity's underlying Access Discovery path inventory — a new path added, a path removed, or a resource's sensitivity classification changed in the registry.
- A full recompute pass across all identities runs on the same cadence as Access Discovery's graph rebuild, since this module's aggregate is only as fresh as the path inventory it aggregates.
- Every exposure object carries the timestamp of the underlying Access Discovery snapshot it was computed against (`based_on_access_discovery_snapshot`), so a reviewer — or Identity Risk Profile, consuming this as an input — knows exactly how current the exposure number is. This mirrors the staleness contract Access Discovery itself now exposes (§4.4 of that PRD) and that Identity Risk Profile checks before treating an input as current (§4.4 of that PRD) — this module is both a consumer of that contract and a producer of the same contract for its own downstream consumers.

> **§4.4 is implemented as written, and is the cleanest part of this spec.** `AccessSnapshot.graph_snapshot_at` already exists (`core/src/domain/access.ts`) and is copied verbatim into `based_on_access_discovery_snapshot` — copied, not re-read from the clock, because the contract is that a consumer dates the facts it *read*, not the moment it read them. The first two bullets describe a rebuild cadence this build does not have; they are retained as the production design.

---

## 5. Data Requirements (per provider)

Identity Exposure Map's baseline requirement is Access Discovery's already-classified path inventory (§5 of that PRD) — no new provider connectors are needed for path data. The one additional data source this module introduces is a **resource sensitivity registry**, which may be sourced differently per provider:

| Provider | Sensitivity data needed |
|---|---|
| AWS | S3 bucket data-classification tags, RDS/Redshift database classification tags, account-level tags (prod/non-prod), VPC internet-gateway attachment (internet-facing flag) |
| Azure | Azure Purview / Microsoft Information Protection classification labels, resource group tags (prod/non-prod), public IP/NSG configuration (internet-facing flag) |
| GCP | Cloud DLP / Data Catalog classification tags, project-level labels (prod/non-prod), firewall rule exposure |
| Kubernetes | Namespace-level labels (prod/non-prod), NetworkPolicy exposure, secret/configmap classification annotations if present |
| SaaS | Admin-configured sensitivity tiers per app/integration (many SaaS tools don't natively expose a data-classification API, so this may require a manually maintained mapping at MVP — see §8) |

Where a provider or app has no native sensitivity classification available, the module falls back to a conservative default weight (treated as Medium, not Low) rather than silently excluding the resource from the weighted score — an unclassified resource should never be treated as equivalent to a confirmed-low-sensitivity one.

> **See Amendment 3.** The table's premise is checked in `docs/identity-exposure-map-research.md` §3.2 against each provider's own documentation. Every mechanism listed classifies a storage container — buckets, blob containers, database columns, Data Map assets — at partial and sampled coverage, while this engine's terminal object is a permission. The registry is not merely unbuilt; it has no key to join on.
>
> The final paragraph's *instinct* is right and its *mechanism* is wrong. An unclassified resource must indeed never read as confirmed-low — but the correct expression of that is a distinct `unclassified` state that is excluded from the score and reported as a coverage metric, not a Medium weight that silently inflates the number. Macie models this as score 50, "not yet analyzed"; Defender for Cloud models it as risk level "Not evaluated". Neither invents a tier for it.

---

## 6. UI/UX Spec — Identity Exposure Map (Table-First List, Scoped Resource Map as the Featured Detail View)

### 6.1 Why this module splits the table-vs-graph rule deliberately

Per §7 of the project context doc, the product default is table, earning a graph only where the underlying concept is genuinely spatial. This module is a deliberate hybrid, and the split is worth justifying explicitly rather than picking one default and forcing the whole module into it:

- **Across identities** (comparing exposure scores, sorting, filtering, triaging which identities to look at first), the job is exactly the same kind of scored-list triage Identity Risk Profile performs — a table is correct here for the same reason it's correct there: nothing about *comparing many identities' scores* is spatial.
- **Within one identity** (understanding *where* that identity's exposure sits — which resources, at what hop distance, at what sensitivity), the job is genuinely spatial in the way Unified Impact Analysis's propagation view is: a hop-distance ring layout with a sensitivity heat overlay conveys "how far out, and how dangerous" in a way a table of five rows technically contains but doesn't make visually legible. This is the "resource map" the whiteboard calls out by name, and it earns its place here specifically — unlike a full-environment graph, which would fail the same test Access Discovery's global view fails (too many nodes, not exportable, no bulk actions).

The resource map is therefore **not the primary landing view** (the global list is), but it is the **featured, prominent view once a single identity is selected** — closer in spirit to Access Discovery's per-user "Visualize" toggle than to Unified Impact Analysis's graph-first simulator, but rendered more prominently than an optional toggle buried at the bottom of a page, since for this specific module the map genuinely is the more legible way to answer the question the screen exists to answer.

> **The justification is accepted, and it has a precondition the spec does not state.** A ring map earns its place only if ring position carries information the badge does not. Per Amendment 6 it currently does not — rings and path types are collinear, and the seed's largest footprint is 5 paths, so there is no identity for which a table is illegible. **The map should not be built until the dataset contains a footprint large enough to be illegible as a table** (research doc §9, beat 24) and at least one nested group breaking the collinearity. Building it first produces a prettier rendering of the summary strip.

### 6.2 Layout — Global list (primary landing view)

- **Header:** identity search + selector, with an Exposure Band filter row (Critical / High / Medium / Low chips, derived from exposure score thresholds) always visible.
- **Primary view — Table.** Every identity, one row each, sorted by exposure score descending by default.
- **Filter bar:** Exposure Band, Identity Type, Exposure Delta (Rising Fast / Stable / Improving), Highest-Sensitivity Resource Reached, Hop Distance to highest-sensitivity resource.
- **Search-within-table:** free-text matching identity name or resource name.

> **Two corrections.** "Every identity, one row each" is 115 rows, not 123: groups are excluded as subjects, because a group's grants already appear as its members' indirect paths and counting both double-counts the aggregate (`core/src/access/service.ts`, and the same exclusion in `ownership/classify.ts`). The **Exposure Delta** filter is removed per Amendment 5.

### 6.3 Core table — columns

| Column | Content | Notes |
|---|---|---|
| Identity | Name + type icon | Sortable, clickable → opens the Resource Map detail view (§6.4) |
| Exposure Score | Numeric 0–100 + colored bar | Primary sort column by default, descending |
| Exposure Band | Badge: Critical/High/Medium/Low, derived from score | — |
| Total Reachable Resources | Count | Sortable |
| Highest Sensitivity Reached | Resource name + sensitivity badge | Click jumps straight to that resource's ring in the map |
| Reached Via | Path type of the highest-sensitivity resource (Direct/Indirect/Hop badge) | Reuses the same gray/amber/red color law as Access Discovery |
| Exposure Delta | Arrow + delta, e.g. "▲ +41 (30d)" in red if rising fast | Sortable by delta magnitude |
| Last Computed | Timestamp | Flags staleness |

- Default sort: Exposure Score descending.
- Dedicated **"Rising Fast"** filter chip, one click — an identity whose footprint is expanding quickly is often a more urgent triage signal than one that's been statically high for months.

> **Amended columns.** *Exposure Delta* and the *Rising Fast* chip are removed (Amendment 5). *Total Reachable Resources* becomes *Reachable Permissions*, with a second *Unclassified* count beside it so a reviewer can see how much of the footprint was excluded from the score (Amendment 3). Default sort is exposure score descending with `weighted_sum` as the tie-break, because saturation makes every large footprint read 99 (research doc §5).

### 6.4 Resource Map — scoped detail view (opened per identity)

Clicking any identity row opens the resource map as the primary content of that identity's detail view:

- **Layout:** identity rendered as a highlighted center node; reachable resources arranged in concentric rings by hop distance (ring 1 = hop-distance 1, ring 2 = hop-distance 2, ring 3+ = hop-distance 3 and beyond, matching Access Discovery's `hop_count`).
- **Heat overlay:** each resource node shaded by sensitivity (Critical = bright red, High = amber, Medium = yellow, Low = gray/dim) — the same color law used for path-type badges elsewhere, applied here to resource sensitivity rather than path type, since both signals matter and are visually distinguished (path type via edge color/style, sensitivity via node fill).
- **Hop-distance slider:** "Show reachability within N hops" — collapses/expands outer rings progressively, so a reviewer can start with just the identity's Direct footprint and expand outward, rather than being shown the full map at once. This directly answers the demo need described in the framework PRD's own Exposure Map spec (§5.5): a slider that lets a reviewer progressively expand the blast-radius view.
- **Node click → chain detail:** clicking any resource node in the map opens the same chain-detail accordion Access Discovery uses (that PRD's §6.5) — the map is for orientation; the proof of *how* that resource is reached still lives in Access Discovery's chain object, reused here rather than duplicated.
- **Summary card**, docked beside the map: exposure score, total reachable resources, highest-sensitivity resource reached, and exposure delta — the same fields as the table row, kept visible while exploring the map so the map never has to be interpreted without its supporting numbers alongside it.
- **Table toggle:** a "View as table" link switches the same identity's reachable set into a flat table (Resource, Sensitivity, Hop Distance, Path Type, Reached Via) for reviewers who prefer rows, or for export — the map is the featured view, not the only view, consistent with the product's rule that nothing should be graph-only or unexportable.

> **Amended.** Rings are one per distinct hop distance (Amendment 6), so the six-edge agent chain sits visibly outside the three-edge hops. The heat overlay carries three states plus a distinct hatched *unclassified* fill, not four tiers (Amendment 3). The summary card shows `weighted_sum` and the top contribution's share in place of exposure delta (Amendments 3, 5) — "83% of this score is one hop path" is the sentence the card exists to deliver. Node-click reuse of Access Discovery's chain accordion is exactly right and needs no change: `AccessPath.chain` is already the rendered object.

### 6.5 Empty/loading/scale states

- **No reachable resources beyond Direct access** (rare, but possible for a narrowly scoped identity): the map still renders with only ring 1 populated, plus an explicit note — "No indirect or hop-mediated exposure detected" — so a low-exposure identity reads as a clean result, not a broken map.
- **Very large reachable sets:** the map caps rendered nodes per ring at a legible threshold (e.g., top 15 by sensitivity per ring), with a "+N more resources not shown, view in table" link — mirrors Unified Impact Analysis's own large-propagation handling (its §6.4), keeping the map a comprehension tool rather than a rendering bottleneck.
- **Sensitivity data unavailable for some resources:** those nodes render in a distinct "unclassified" pattern (not treated as Low, per §5) so a reviewer can immediately see where the underlying classification data is incomplete rather than mistaking silence for safety.

> **§6.5 is the best-reasoned section in this spec and is adopted unchanged**, with one addition: a fourth state for an identity with **no paths at all**, which is 21 of the 115 non-group identities in the seed. "Zero exposure" and "nothing to compute" are different claims and must not collapse into a `0` that sorts alongside genuine zeros — the output carries a discriminated `no_paths` state.
>
> The third bullet is the one the rest of this document was amended to protect: it is already correct that unclassified must not read as Low, and Amendment 3 only extends that same instinct to Medium.

### 6.6 Export

- Global list: CSV/XLSX export of the filtered/sorted view, including per-identity total reachable resources and highest-sensitivity resource reached.
- Per-identity resource map: "Export as table" (flattened reachable set, one row per resource) and "Export map as image" for inclusion in a review packet or ticket — the map itself is a legitimate audit artifact, not just an in-product exploration tool.

> **Adopted, with the contribution breakdown included in both exports.** A score exported without its derivation is the artifact FIRST's CVSS licence terms exist to prevent (Amendment 5); an audit packet is precisely where that matters most.

---

## 7. Success Metrics

- **Coverage:** % of identities with a fully computed exposure score (i.e., Access Discovery data available and sensitivity classification resolved for at least the highest-hop-distance resources in the reachable set).
- **Classification completeness:** % of reachable resources with a confirmed sensitivity tag versus falling back to the conservative default (§5) — this is the metric that indicates whether the exposure score can be trusted as accurately weighted or is running on incomplete registry data.
- **Score-to-map correlation check:** whether identities flagged Critical/High by exposure score visibly show a bright, outer-ring node in their resource map — a mismatch here (a high score with no obviously alarming node visible) would indicate the weighting formula or the map's rendering priority need to be reconciled.
- **Time-to-recompute:** latency between an Access Discovery path change and the affected identity's exposure score and map reflecting it.

> **Classification completeness is promoted from a metric to a gate.** Per research doc §3.2 the joinable fraction of provider classification data is currently zero, so this number is not a quality indicator sitting alongside three others — it is the precondition for the score meaning anything, and it belongs on the same screen as the score and in the executive summary of any deck that shows one.
>
> **Score-to-map correlation is an excellent check and is cheap here:** with `contributions[]` emitted, the check becomes an assertion rather than an eyeball — the top contributor by `share_of_score` must be a node the map actually renders. That is a unit test, and it should be written as one.
>
> *Time-to-recompute* is not measurable in a single-snapshot build. The **false-positive rate on effective-permission resolution remains undefined, not zero** (Amendment 2), inherited from Access Discovery Amendment 3.

---

## 8. Open Questions

- **SaaS sensitivity classification at MVP:** since many SaaS tools have no native data-classification API (§5), should the hackathon build ship with a manually maintained sensitivity mapping for a small demo set of SaaS integrations, or should SaaS resources default conservatively (Medium) until a real classification source is connected?
- **De-duplication rule fairness (§4.2 step 2):** collapsing a resource reached by both an Indirect and a Hop path down to "worst path type only" is correct for the exposure *score*, but does the resource map need to visually indicate that a resource has multiple routes in, even though only one is used for scoring — otherwise a reviewer inspecting the map might assume Hop is the *only* way in, when closing that one path wouldn't fully remediate exposure?
- **Ring layout at high fan-out:** if an identity's reachable set has dozens of resources at the same hop distance, does the ring-based layout (§6.4) remain legible, or does it need sub-grouping by resource type/provider within a ring once counts get large?
- **Relationship to Unified Impact Analysis's starting-point seed:** since Unified Impact Analysis explicitly seeds its propagation frontier from this module's reachable set (its §4.2 step 1), should a change in this module's de-duplication or weighting logic require a corresponding review of that module's seeding assumptions, or are the two intentionally decoupled enough that either can evolve independently?

> **Answered, in order.**
>
> 1. **Neither.** Amendment 3: a manually maintained mapping is a demo prop that will be read as data, and defaulting to Medium inflates the score when the registry degrades. Ship the binary flag the catalog already carries, mark everything else `unclassified`, and put the completeness number on screen.
> 2. **Yes, and it is one field, not a UI feature.** Each exposure-set entry carries `route_count` and `route_types`; the score uses the worst type, the map badges anything above 1, remediation reads the list. Note the seed cannot currently demonstrate this: there are exactly 5 multi-route pairs and **all five are `direct` + `indirect`** — not one is the `hop` + other case this question is actually about. Research doc §9 beat 27 seeds it.
> 3. **Not answerable yet, and the honest answer is that it has never been tested**: the largest footprint in the estate is 5 paths. Beat 24 creates the first identity where ring legibility is a real question rather than a hypothetical.
> 4. **Coupled, and the coupling is now formal.** Amendment 1 renames the emitted field `exposure_set`, which is the field Unified Impact Analysis seeds from by name. Both that branch (`origin/feat/unified-impact-analysis`) and `origin/feat/identity-risk-profile` already exist and are behind main. **This module's output shape needs both owners' sign-off before it is frozen** — it is the contract they are coding against.

---

*Scope note: this PRD covers Identity Exposure Map only — single-identity reachable-set aggregation, sensitivity weighting, and the resource map visualization. It consumes Access Discovery's classified path inventory wholesale and does not re-derive path types or chain detail. Identity Risk Profile consumes this module's exposure score as one of its six weighted scoring factors, and Unified Impact Analysis consumes this module's reachable set as the seed for its own cross-identity propagation simulation — both are specified in their own PRDs (identity-risk-profile-prd.md, unified-impact-analysis-prd.md) and neither recomputes the aggregation or weighting logic defined here.*
