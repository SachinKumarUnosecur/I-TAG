# Identity Exposure Map — Implementation Research

> **Lens:** Principal Backend Engineer + CISO, Unosecur
> **Scope:** `docs/PRD-identity-exposure-map.md` — reachable-set aggregation, sensitivity weighting, the 0–100 exposure score, exposure delta, and the hop-distance ring map — evaluated against provider reality, auditor expectations, and the engine as built.
> **Companions:** [`ITAG.md`](./ITAG.md), [`PRD-identity-exposure-map.md`](./PRD-identity-exposure-map.md), [`PRD-access-discovery.md`](./PRD-access-discovery.md), [`delegation-chain-research.md`](./delegation-chain-research.md), [`orphaned-identity-research.md`](./orphaned-identity-research.md)
> **Status:** research output, Jul 2026
> **Repo state at time of writing:** `d31f0fd`, clean tree, 185/185 core tests passing.
>
> **This document wins over the PRD where the two conflict**, on the same footing as
> `delegation-chain-research.md` §1. Every override below names the PRD line it overrules
> and why it loses. Amendments 1–6 are reproduced inline in the PRD itself.

---

## 1. Executive summary

1. **The ring map — the module's headline visual — encodes information the summary strip already carries, and it will keep doing so until the seed grows a nested group or a second hop rung.** In this engine `hop_count` is `chain.length` (`access/classify.ts` L214), and the classification rules make the two collinear by construction. Measured across all 138 paths in the seed: the only `(path_type, hop_count)` pairs that exist are `direct:1`, `indirect:2`, `hop:3`, `hop:4`, `hop:6`. Ring 1 *is* the 66 direct paths, ring 2 *is* the 66 indirect paths, ring 3+ *is* the 6 hop paths. A reviewer reading the rings learns exactly what the `66 · 66 · 6` counter already told them. **This is the most expensive finding to act on late**, because it is a data-shape problem, not a rendering problem: no amount of frontend work makes the map informative, and the fix (multi-rung chains and nested groups in the seed) has to land before anyone builds the visualization. *Resolved in `core/src/data/seed/exposure.ts`:* `svc-platform-watchdog` sits in a group inside a group, producing the dataset's first `indirect:3` pair. `indirect` now spans distances 2 and 3, the rings are no longer a relabelling of the type column, and `seed-exposure.test.ts` asserts the counterexample survives.

2. **The exposure score must not live in `access/`, and it should not live in `ownership/severity.ts` either. It needs its own module with its own guard.** `access/classify.test.ts` L413-433 walks every field of `list()`, `summary()` and `profile()` and fails on any key named `severity`, `rank`, `score` or `priority`; `domain/access.ts` L1-9 states the rule the test enforces. That settles where the score cannot go. But folding it into `ownership/severity.ts` is also wrong: that module ranks *a finding's urgency for a reviewer queue* from ownership state and SLA breach (L25-38), whereas exposure ranks *an identity's footprint* and is defined for perfectly-owned identities with no finding at all. Two different questions with two different populations. Build `exposure/`, and give it the same recursive guard test pointed the other way — asserting the score is present and that no `access`-shaped object leaked in carrying one.

3. **The PRD's central argument was undemonstrable on the original dataset by a factor of eight — and building the data to demonstrate it refuted it.** §1 rests on "forty low-sensitivity Direct paths and one Hop path into a production database are not the same story, and a table of forty-one rows doesn't make that difference legible." The largest footprint in the pre-existing seed was **5 paths** (`agent-support-triage`) and the median was **1**, so there was no identity for which a table was illegible and nothing for the map to be better *than*. `seed/exposure.ts` closes that gap with `user-maya` — forty non-sensitive permissions across two systems — and under §5's own weighting she scores **97 against `user-jane`'s 78**. The PRD's implied ordering is the reverse of what its own algorithm produces. **The result is kept rather than calibrated away.** Forty systems is a real blast radius; §3.4's canonical incident is a read scope nobody re-examined; and a weighting tuned until it always agrees with the sensitivity flag has added nothing to the sensitivity flag. What survives is a sharper claim than the one the PRD made — sensitivity is one axis of exposure and breadth is the other, the two disagree, and a table sorted by either one alone hides the identity the other would have caught. §9 beat 25 is where that lands on stage.

4. **Every provider classifies sensitivity at a granularity ITAG does not have, and none of them classify the thing this module scores.** AWS Macie profiles *buckets* by sampling, not objects exhaustively; GCP Sensitive Data Protection generates profiles at *bucket* level for S3 and *container* level for Azure Blob; Microsoft Purview applies labels to *Data Map assets as metadata*, is source-dependent and preview for that extension, and for databases can label only *columns*. ITAG's terminal object is a permission (`admin:platform`), which is not a bucket, a container or a column. **The resource sensitivity registry the PRD introduces in §5 has no provider-side key to join on.** This is not a build-it-later gap; it means the four-tier weight table in §4.2 step 3 would be populated by hand for the demo and by nothing at all in production.

5. **Two independent vendors model "not classified" as a first-class value distinct from any severity tier, which resolves §5-versus-rule-9 in favour of rule 9.** Macie's documented sensitivity scale reserves **50 for "not yet analyzed"**, sitting between 1–49 "not sensitive" and 51–99 "sensitive", with −1 for a classification error. Microsoft Defender for Cloud's risk levels are Critical, High, Medium, Low and **Not evaluated**. Neither collapses absence of data into a tier, and neither inflates it to Medium the way PRD §5 L129 demands. Model sensitivity as a discriminated union with an explicit `unclassified` member, exclude it from the weighted sum (`counted: false`, architecture rule 9), render it distinctly (which §6.5 already gets right), and report it as the coverage metric §7 already asks for.

6. **The canonical incident is Capital One (2019), it fits this module better than any other breach in the literature, and the court record simultaneously validates the module and refutes the PRD's field naming.** The mechanism is this module's shape exactly: SSRF → IMDSv1 → one over-privileged role (`ISRM-WAF-Role`) → **700+ buckets enumerable**, 229 exfiltrated, ~106M customers, 77 days undetected. One path, an enormous reachable set — a raw path count of one, an exposure score near maximum. But the Ninth Circuit filing also records that **"the majority of the commands Ms. Thompson entered with the role failed,"** returning "You are not authorized to perform this operation." Nominal reachability overstated effective reachability *in the canonical incident itself*. That is court-record evidence for architecture rule 12 and for keeping the field named `reachable_permissions`.

7. **CVSS makes publishing the derivation a condition of use, and that is the bar this score has to clear.** FIRST "requires as a condition of use that any individual or entity which publishes CVSS data conforms to the guidelines described in this document and **provides both the score and the vector string so others can understand how the score was derived**." CVSS v4.0 further abandoned v3.x's algebraic weighting precisely because those formulas "were not intuitive due to their rather abstract predefined formulas," replacing them with an expert-ranked lookup over 270 equivalence classes plus interpolation. A bare `exposure_score: 78` with unpublished 1.0/0.6/0.3/0.1 weights is the exact artifact CVSS spent a major version escaping. **Emit the contribution breakdown beside the score, always, in the same object.**

8. **Verdict: this is a scoring module with a data dependency it cannot satisfy, and it should ship scoring the binary sensitivity the engine actually has.** Strip the four-tier weights, the resource registry and the exposure delta, and what remains is genuinely valuable and fully supportable today: a per-identity aggregate over Access Discovery's paths, weighted by the one sensitivity bit the catalog carries, saturating to 0–100, with its contributions published. That is buildable in a day and defensible to an auditor. Everything else in §4.2 is blocked on data that neither the seed nor any provider currently supplies.

---

## 2. As-built vs as-specified

Nothing in this module is built. The value of this table is therefore the opposite of the one in `delegation-chain-research.md` §2: it records what the module can *consume* today, and where its inputs stop.

| Item | Specified | Built | Evidence |
| --- | --- | --- | --- |
| Per-identity full path inventory (§4.2 step 1) | Yes — `PRD` L64 | **Yes, and directly consumable** | `access/service.ts` L131-149 `profileFor`; `paths` field at L146 |
| `hop_count` per path (§4.2 step 1) | Yes — `PRD` L64 | Yes | `access/classify.ts` L214 (`chain.length`) |
| `effective_permissions` per path (§4.2 step 1, §4.3) | Yes — `PRD` L64, L96 | **No, and deliberately never** | `domain/access.ts` L118-128 — named `reachable_permissions`; see Amendment 1 |
| De-duplicate by terminal resource (§4.2 step 2) | Yes — `PRD` L65 | No — trivial over `profile().paths` | 5 multi-route pairs exist in seed, all `direct`+`indirect` |
| Resource sensitivity registry (§4.2 step 3, §5) | Yes — `PRD` L66, L117-127 | **No, and no provider key to join on** | `domain/types.ts` L148-150 — `sensitive?: boolean`, 9 of 36 true |
| Four-tier sensitivity weights (§4.2 step 3) | Yes — `PRD` L66 | No — engine is binary | `seed/catalog.ts` L42-105; `graph.sensitivePermissions` is a `Set` |
| Hop-distance contribution multiplier (§4.2 step 4) | Yes — `PRD` L67 | No | — |
| Normalize to 0–100 (§4.2 step 5) | Yes — `PRD` L70 | No — formula unspecified in PRD | see §5 below |
| Bucket into rings 1 / 2 / 3+ (§4.2 step 6) | Yes — `PRD` L71 | No — **and collinear with `path_type` if built** | measured: `direct:1 indirect:2 hop:3,4,6` |
| Exposure delta vs last snapshot (§4.2 step 7, §4.3) | Yes — `PRD` L72, L80-83 | **No, and unsupportable** | one frozen dataset at boot; see Amendment 5 |
| Staleness / `based_on_access_discovery_snapshot` (§4.4) | Yes — `PRD` L113 | **Input exists** | `domain/access.ts` L157-159 `AccessSnapshot.graph_snapshot_at` |
| Global list, one row per identity (§6.2) | Yes — `PRD` L145 | No UI; population resolvable | `access/service.ts` L104-107 — 115 non-group identities |
| Ring map detail view (§6.4) | Yes — `PRD` L169-177 | No | `frontend/src/graph/` contains only `.gitkeep` |
| Unclassified rendered distinctly (§6.5) | Yes — `PRD` L182 | No — **no `unclassified` state exists to render** | `sensitive?: boolean` is two-valued by absence |
| Owner per identity | Not specified | Available | `access/service.ts` L29-31 `AccessOwnerSource` |

**Consequence for planning.** Steps 1, 2, 6 and the staleness block are near-free — they are re-shapes of `IdentityAccessProfile`. Steps 3, 4 and 7 are each blocked on data that does not exist, and step 7 cannot be unblocked by adding data to one snapshot.

**One correction to a claim in the source PRD.** §4.1 asserts the module needs "one additional data source... a resource sensitivity registry *that Access Discovery's path objects reference but don't themselves maintain*." Access Discovery's path objects do not reference such a registry. `AccessPath.sensitive` (`domain/access.ts` L48) is a denormalised copy of the catalog's boolean, resolved at classification time from `graph.sensitivePermissions`. There is nothing to point at.

---

## 3. What the outside world calls this

### 3.1 Terminology — "Exposure Map" is the right name; "reachable set" is the wrong one

The industry term of art for the aggregate is **blast radius**, and ITAG's own founding document uses it (`ITAG.md` §F2, "Blast Radius Computation"). The PRD avoids it, presumably to leave it for Unified Impact Analysis. That is a defensible split, but it leaves this module using "reachable set" for something the codebase already computes under a different definition: `ownership/reach.ts` L24-47 exports `reachableAccess`, walking `inherited_from ∪ delegates_to` and explicitly **not** following permission bindings. Two functions named for reachability that disagree about what is reachable is a live footgun — `reach.ts` reports `user-jane` at zero sensitive permissions while Access Discovery reports her holding `admin:platform`.

**Recommendation:** name this module's aggregate `exposure_set`, never `reachable_set`, and state in the type's doc comment that it is the union over `AccessPath.permission`, not the output of `ownership/reach.ts`.

### 3.2 Provider reality — the empirical core of this document

The question is not "does classification data exist" but "at what granularity, at what coverage, and can it be joined to a permission." All three answers are bad.

| Provider | Mechanism | Granularity | Coverage reality |
|---|---|---|---|
| AWS | Macie automated sensitive data discovery | **Bucket** (via object sampling) | Sampling by design — groups objects by bucket/prefix/extension/storage class and analyzes "small, but representative, samples." Coverage issues are a first-class dashboard section. Results begin appearing "within 48 hours," i.e. never complete at any instant. |
| AWS | Resource tags | Resource | Tag presence is an organizational discipline, not a platform guarantee. No public documentation establishes a baseline tag-coverage rate. |
| Azure | Purview sensitivity labels on Data Map assets | **Asset metadata**, and for databases **column** only | Extension of MIP labels to Data Map assets is documented as preview and **source dependent**. Labels applied via SQL Information Protection policy are **not** imported — only MIP ones. Labels are metadata in the map; they do not modify the data. |
| GCP | Sensitive Data Protection discovery (data profiles) | **Bucket** for S3, **container** for Azure Blob, table for BigQuery | Continuous profiling producing "predicted infoTypes and calculated data risk and sensitivity levels" — predicted, not asserted. |
| Kubernetes | Namespace labels, NetworkPolicy, annotations | Namespace / object | **No public documentation found** for any native Kubernetes data-classification API. Namespace labels are a naming convention. Treating them as classification is inference, and `domain/types.ts` L65-68 already refuses exactly that inference for `environment`. |
| SaaS | Admin-configured tiers | Per app | **No public documentation found** for a general SaaS data-classification API. The PRD concedes this at §5 L127. |

**The finding that matters is the join, not the coverage.** Every mechanism above classifies a *storage container*. ITAG's terminal object is a *permission id* — `admin:platform`, `export:finance-report`. A bucket-level Macie score cannot be joined to `admin:platform` because `admin:platform` is not a bucket; it is a capability that may confer access to many buckets, or none. **The registry §5 specifies cannot be populated from the sources §5 names**, even with perfect coverage. This is a direct consequence of Access Discovery Amendment 1 (no resource nodes) and is the price that amendment named: "a deployment that needs per-resource inventory... will need resource nodes, and that is a schema migration, not a patch."

**Answering research question A directly:** in a realistic estate, a minority of resources carry a confirmed classification, and in *this* engine the joinable fraction is zero. PRD §7's "classification completeness" metric is therefore not a quality indicator — it is the gate on whether the score means anything at all, and it belongs in the executive summary of any deck that shows the score.

### 3.3 Compliance mapping — control ID to emitted artifact

Controls that cannot be tied to a field this module emits have been dropped, per the discipline in `delegation-chain-research.md` §3.3.

| Control | Text (abridged, from the control itself) | Emitted artifact that is the evidence |
|---|---|---|
| **NIST SP 800-53 Rev 5 AC-6** | "Employ the principle of least privilege, allowing only authorized accesses for users (or processes acting on behalf of users) that are necessary to accomplish assigned organizational tasks." | `exposure_set` — the enumerated union of what one principal can reach. This is the *measurement* least privilege is asserted against. |
| **AC-6(7) Review of User Privileges** | "(a) Review [frequency] the privileges assigned to [roles and classes] to validate the need for such privileges; and (b) Reassign or remove privileges, if necessary." | The per-identity exposure table sorted descending, plus `computed_at`. This is the closest fit in the entire catalogue: AC-6(7) is literally a periodic privilege review, and this module produces the review's worklist. |
| **AC-6(1) Authorize Access to Security Functions** | "Authorize access for [individuals or roles] to [security functions] and [security-relevant information]." | `highest_sensitivity_reached` where the terminal permission is administrative (`admin:platform`, `admin:warehouse`, `admin:prod-database`). |
| **NIST SP 800-53 Rev 5 RA-3** | Risk Assessment — assess risk to operations, assets and individuals from system operation. | `exposure_score` **only if** the contribution breakdown ships with it. A score whose derivation is not published is not an assessment; it is an assertion. |

**Dropped, and why.** CA-7 (continuous monitoring) requires a monitoring *frequency and process*, which a point-in-time demo does not have. NIST SP 800-207 is an architecture document, not a control catalogue, and mapping to it yields a paragraph rather than an audit artifact. ISO/IEC 27001:2022 A.5.15/A.5.18, CIS v8 §5/§6, PCI DSS v4.0 Req 7 and SOC 2 CC6.1 all map plausibly to "least privilege" in the abstract, but each requires reviewing *authorization decisions*, and this module emits reachability, not authorization. Claiming them would be the compliance-theatre this repo's other research docs consistently refuse.

### 3.4 The canonical incident — Capital One, March–July 2019

The mechanism, from the DOJ case record and the Ninth Circuit filing: a misconfigured WAF (ModSecurity behind nginx) was exploitable via server-side request forgery. Thompson relayed requests through it to the EC2 Instance Metadata Service at `169.254.169.254`, which under IMDSv1 returned temporary credentials for `ISRM-WAF-Role` with no token or header required. That role carried sweeping S3 list and read permissions far beyond a firewall's need. She enumerated **700+ buckets** and exfiltrated data from **229**, affecting approximately **106 million** customers, including ~140,000 SSNs and ~80,000 linked bank account numbers, plus ~1 million Canadian SINs. The intrusion ran **77 days** before an unrelated member of the public reported a GitHub post. No internal control caught it. AWS's response was IMDSv2.

**Why it is this module's incident and not Access Discovery's.** Access Discovery would have classified exactly one path — a hop from the WAF instance to `ISRM-WAF-Role`. One row. Utterly unremarkable in a table sorted by path count. The entire finding is in the *aggregate on the other side of that one hop*: 700 buckets. A per-path view is structurally incapable of expressing "this one path is worth 700 resources," and that gap is the argument for the exposure score in one sentence.

**Why the same record constrains the module.** Per the appellate filing, "the majority of the commands Ms. Thompson entered with the role failed," returning "You are not authorized to perform this operation." The role's *nominal* permission set materially overstated its *effective* one. Any exposure score computed from a nominal union — which is the only kind this engine can compute — would have been high for Capital One, and would also be high for a role whose permissions are entirely blocked by an SCP. **The score is directionally right and quantitatively unfounded**, and that sentence should be said out loud on stage rather than discovered by a judge.

### 3.5 Competitive reality — what is genuinely differentiated

Microsoft Defender for Cloud builds a cloud security graph over inventory, permissions, network connections and exposure, and runs attack-path analysis over it. Its API returns `entryPointEntityInternalID`, `targetEntityInternalID`, `potentialImpact`, `riskCategories` and the `graphComponent` list. Its risk-prioritization engine sorts by exploitability and business impact, with levels Critical / High / Medium / Low / Not evaluated.

Two honest observations follow. First, **attack-path analysis is not this module.** Defender's paths are anchored to an *external entry point* and are filtered to "externally driven and exploitable" threats — it answers "how does an outsider get in and how far," not "what is the total footprint of this one internal identity as things stand." The PRD's §2 boundary is real and the field does draw it in the same place. Second, and less comfortably: **no major vendor publishes a per-identity aggregate exposure score with published weights.** That is either the differentiation or the warning. Given §3.2's finding that the weighting data does not exist, it is more likely the warning. The differentiated, defensible claim is not "we score exposure better" — it is "we show you the footprint behind the score, at the mechanism level, including the hop paths your native tooling cannot see."

---

## 4. Implementation insights

### 4.1 Insight #1 — Rings are collinear with path type, so the map must be earned with data before it is built

Measured across all 138 seed paths, the complete set of observed `(path_type, hop_count)` pairs is:

```
direct:1    indirect:2    hop:3    hop:4    hop:6
```

`hop_count` is `chain.length` (`access/classify.ts` L214). A direct path is one `HAS_POLICY` edge, so length 1. An indirect path is `MEMBER_OF → HAS_POLICY`, so length 2 — and stays 2 because **no group in the seed inherits from another group**. A hop crosses `CAN_ACCESS → ASSUMES_ROLE → HAS_POLICY`, so ≥3. The mapping is a bijection in this dataset.

The consequence for PRD §4.2 step 6 and §6.4: bucketing into rings 1 / 2 / 3+ produces a picture isomorphic to the `66 · 66 · 6` summary strip, and additionally collapses the 3-, 4- and 6-edge hops — including the six-edge two-system agent chain, the best asset in the dataset — into one undifferentiated outer ring.

**Two changes, both cheap.** Ring per distinct hop distance rather than a 3+ bucket, so the agent chain sits visibly further out than Jane. And seed a **nested group** (a group inheriting from a group), which produces an indirect path at distance 3 and breaks the collinearity — at that point ring position genuinely carries information the badge does not.

### 4.2 Insight #2 — Model sensitivity as a three-state union, not a tier, and let the provider evidence decide the third state

PRD §4.2 step 3 wants four tiers; the engine has one bit; §5 L129 wants unclassified treated as Medium; architecture rule 9 forbids absence of data from creating a finding. All four positions cannot hold.

The resolution comes from the providers themselves. Macie's scale reserves 50 for **not yet analyzed**, distinct from 1–49 not-sensitive and 51–99 sensitive. Defender for Cloud's risk levels include **Not evaluated** alongside the four tiers. Neither vendor treats absence as a tier, in either direction.

```ts
export type PermissionSensitivity =
  | { readonly kind: 'sensitive' }
  | { readonly kind: 'not_sensitive' }
  | { readonly kind: 'unclassified'; readonly reason: 'no_registry_entry' };
```

`unclassified` contributes nothing to the weighted sum and is `counted: false`, exactly as `unknown` is in `ownership/classify.ts` L109-111. It is rendered distinctly (§6.5 already specifies this correctly) and reported as §7's classification-completeness metric. **PRD §5 L129 is overruled**: inflating unclassified to Medium makes the score rise when the *registry* degrades, which is the same defect `orphaned-identity-research.md` §4.6 identifies in raw orphan counts and the same one `domain/access.ts` L146-156 refuses for staleness. A CISO cannot defend a number that goes up when nothing about the estate changed.

The existing `sensitive?: boolean` stays untouched — `ownership/severity.ts` L30 ranks on it and beat 15's pinned counts depend on it. The union is derived at graph-build time from catalog presence, additively.

### 4.3 Insight #3 — Publish the contributions or do not publish the score

FIRST requires, as a condition of using CVSS, that publishers provide "both the score and the vector string so others can understand how the score was derived." CVSS v4.0 exists in part because v3.x's "abstract predefined formulas" were judged unintuitive.

An `exposure_score: 78` derived from unpublished 1.0/0.6/0.3/0.1 weights fails that bar twice: the weights are invented, and the derivation is invisible. The fix is structural, not documentary — the breakdown ships **inside the same object**, so no consumer can render the number without having the derivation in hand:

```ts
readonly exposure_score: number;                        // 0-100, saturating
readonly weighted_sum: number;                          // the pre-normalization S
readonly contributions: readonly ExposureContribution[]; // one per counted permission
readonly unclassified_permissions: readonly string[];   // excluded, and named
```

This is also what makes the score auditable under RA-3 (§3.3) rather than merely assertable.

### 4.4 Insight #4 — Kill `exposure_delta`; it is Amendment 4 of the Access Discovery PRD wearing a different hat

PRD §4.2 step 7 and §4.3 L80-83 specify `delta_30d: 41` and `flag: "rising_fast"`. Both require a prior snapshot. The graph is built once at boot from a frozen dataset.

This exact question was already settled one module upstream. `domain/access.ts` L146-156 omits `discovered_at` and `last_confirmed_at` because "both require comparing two rebuilds, and the graph is built once at boot from a frozen dataset, so there is no prior snapshot to confirm a path against. Emitting them from the current clock would make every path look freshly re-verified, which is precisely the false assurance L127 warns about."

Substituting "delta" for "confirmed" changes nothing about the argument. A `delta_30d` computed from one snapshot is a fabricated trend, and a `rising_fast` badge is a fabricated alarm — strictly worse than a missing field, because it is actionable. **Omit both.** If the demo needs the beat, seed an explicit prior snapshot as its own dataset artifact with its own timestamp, and label the delta as computed between two named snapshots. Never derive it from one.

### 4.5 Insight #5 — De-duplication is correct for the score and lossy for remediation, and the seed cannot currently show why

PRD §4.2 step 2 collapses multi-route resources to the worst path type. §8's second open question worries this hides that closing the hop would not fully remediate.

The worry is correct and the seed cannot demonstrate it. There are exactly **5** multi-route `(identity, permission)` pairs — `user-alice`, `user-erin` and `user-grace` on `read:finance-db`, `svc-legacy-export` on `export:finance-report`, `svc-warehouse-loader` on `write:warehouse` — and **all five are `direct` + `indirect`**. Not one is `hop` + anything, which is the only case §8 actually asks about.

The fix is one field, not a UI change: carry `route_count` and `route_types` on each entry in the exposure set. The score uses the worst type; the map badges anything with `route_count > 1`; remediation reads the list. Beat 4 in §9 seeds the `hop` + `indirect` case so the question is answerable on screen.

### 4.6 Insight #6 — Score the mechanism, not the distance, because distance is not independent

PRD §4.2 step 4 combines sensitivity weight with hop distance, reasoning that a Critical resource reached via a hop is worse than the same resource reached directly. The reasoning is sound; the implementation variable is wrong. Per §4.1, distance and mechanism are collinear, so multiplying by both double-counts the same fact.

Multiply by **mechanism** (`path_type`), which is what the argument is actually about — hop access is less visible and less governed — and leave distance to the map's geometry. If a future nested group breaks the collinearity, distance becomes independently meaningful and can be revisited; it is not today.

---

## 5. Recommended algorithm

Inputs: `IdentityAccessProfile.paths` for one identity (`access/service.ts` L146), the catalog's sensitivity union (§4.2), nothing else. No traversal — architecture rule 1 is satisfied trivially because Access Discovery has already walked the graph.

**Step 1 — collapse to the exposure set.** Group `paths` by `permission`. For each, retain the worst `path_type` (`hop` > `indirect` > `direct`), the minimum `hop_count`, `route_count`, and the sorted distinct `route_types`.

**Step 2 — weight.** For each entry, `w = 1.0` if sensitive, `0.1` if not sensitive, and **excluded entirely** if unclassified. Two values, not four, because two is what the engine knows (§4.2). The ratio 10:1 is a calibration choice and is published as such.

**Step 3 — mechanism multiplier.** `m = 1.5` for `hop`, `1.0` for `indirect` and `direct`. Hop is uplifted because it is the mechanism native tooling misses (`PRD-access-discovery.md` §1), not because it is farther away (§4.6).

**Step 4 — sum.** `S = Σ wᵢ · mᵢ` over counted entries. `S` is unbounded and monotone in both the number and the sensitivity of reachable permissions.

**Step 5 — saturate.**

```
exposure_score = round( 100 · (1 − e^(−S / k)) ),  k = 1.189
```

`k` is fixed by a single published anchor: **one sensitive permission reached by a hop, plus three non-sensitive direct permissions, scores 78** — Jane's footprint, and the PRD's own worked-example number. Solving `78 = 100(1 − e^(−1.8/k))` with `S = (1.0 × 1.5) + (3 × 0.1 × 1.0) = 1.8` gives `k = 1.189`.

**Why saturation rather than population normalization.** Dividing by the population maximum — the obvious alternative — makes a score of 78 mean something different every time the estate changes, so no identity's score is comparable to its own value last month, and the exposure delta of §4.4 becomes meaningless even if snapshots existed. A saturating exponential is stable, monotone, bounded, and depends on nothing outside the identity itself.

**What it costs, stated plainly.** Saturation compresses the top: at `S = 6` the score is 99.4, and every larger footprint is indistinguishable at integer resolution. An identity reaching 40 sensitive permissions and one reaching 10 both read as 99. **This is the price of comparability, and it is why `weighted_sum` ships alongside the score** (§4.3) — `S` is uncompressed and totally ordered, so the table can sort by it when the scores tie. A CISO reads the 0–100; an engineer triaging a tie reads `S`.

**Step 6 — rings.** Group by exact `hop_count`, not the 1 / 2 / 3+ buckets of PRD §4.2 step 6 (§4.1).

**Worked example, `user-jane`, against the live seed:**

| Permission | Route | Sensitive | w | m | Contribution |
|---|---|---|---|---|---|
| `admin:platform` | hop, distance 3 | yes | 1.0 | 1.5 | 1.50 |
| `read:dashboards` | direct, distance 1 | no | 0.1 | 1.0 | 0.10 |
| `ssm:session-deploy-box` | direct, distance 1 | no | 0.1 | 1.0 | 0.10 |
| `mcp:notion-write` | indirect via `group-eng`, distance 2 | no | 0.1 | 1.0 | 0.10 |

`S = 1.80` → **exposure_score 78**, of which **83% comes from a single hop path**. That last figure is the demo line, and it is computed, not asserted.

---

## 6. API surface

Mounted at `/api/exposure`, after `/api/access` in `backend/src/server.ts`. Adapters constructed only there (architecture rule 4).

| Route | Returns | Notes |
|---|---|---|
| `GET /api/exposure` | `{ count, identities: ExposureRow[] }` | §6.2's landing table. Filters: `app`, `identity_type`, `min_score`, `band`. Sorted by `weighted_sum` desc so ties above the saturation knee still order. |
| `GET /api/exposure/summary` | `{ scored, unscored, classification_completeness, band_counts, snapshot }` | §7's metrics. `classification_completeness` is the gate metric of §3.2. |
| `GET /api/exposure/:id` | `ExposureProfile` \| 404 | §6.4's detail view: exposure set, contributions, rings, `unclassified_permissions`. |
| `GET /api/exposure/:id/export` | flattened CSV | §6.6, one row per permission. |

`ExposureOutcome` is a discriminated union on `ok` matching `AccessOutcome` (`domain/access.ts` L142-144), so an unknown id is a terminal state rather than a throw (architecture rules 6, 7). Every response carries `based_on_access_discovery_snapshot`, copied verbatim from `AccessSnapshot.graph_snapshot_at` rather than re-read from the clock — §4.4's contract is that the consumer dates the facts it read, not the moment it read them.

---

## 7. Unosecur alignment

### 7.1 Side by side

| Dimension | PRD as written | This engine | Verdict |
|---|---|---|---|
| Input | Access Discovery path inventory | `profile().paths` | Aligned, consumable today |
| Traversal | None of its own (§4.1) | Not needed | Aligned with architecture rule 1 |
| Sensitivity | 4-tier registry from provider tags | 1 bit, 9 of 36 permissions | **Not aligned; no join key exists** |
| Score | 0–100, weights unstated | Nothing ranks outside `ownership/severity.ts` | Needs a new module + guard |
| Delta | 30-day trend | One frozen snapshot | **Not supportable; omit** |
| Map | Rings 1 / 2 / 3+ | Collinear with `path_type` | Rings per exact distance, plus nested-group seed |
| Consumers | Identity Risk Profile, Unified Impact Analysis | Both branches exist, both behind main | **Contract needs their owners' sign-off** |

### 7.2 Verdict: (b) — a distinct module, and the first one in the product allowed to rank

Exposure Map is not a data producer in the sense `delegation-chain-research.md` §7.2 concluded for lineage; it emits a genuinely new fact (the aggregate) that no other module computes. But it is also not a peer of Access Discovery, because it introduces the product's second ranking authority, and that is a governance decision as much as a technical one. `ownership/severity.ts` ranks findings for a work queue. `exposure/` would rank identities by footprint. Two numbers, both defensible, both on screen, and **a reviewer will absolutely ask why an identity is critical in one and 12/100 in the other** — which is exactly the "two modules disagreeing about danger in front of a customer" that `access/classify.test.ts` L409-411 was written to prevent.

The answer has to be designed, not improvised: ownership severity answers *"is anyone accountable for this, and how urgently"*; exposure answers *"if this one were misused, how much is reachable."* `user-jane` is the proof that both are needed — she is green in ownership (owned, attested 16 days ago) and 78/100 in exposure. **Put that sentence in the UI, next to both numbers.**

---

## 8. Gaps, ranked

1. **The sensitivity registry has no join key** (§3.2). Blocks four-tier weighting permanently, not temporarily. Mitigated by shipping binary weights and reporting completeness honestly.
2. **Ring layout is information-free until the seed changes** (§4.1). Blocks the module's headline visual from being worth building.
3. **The PRD's core argument is undemonstrable at 5 paths max** (§1.3). Blocks the demo, fixable with seed data.
4. **Exposure delta is unsupportable** (§4.4). Blocks two PRD fields; the honest fix is deletion.
5. **Two ranking authorities will visibly disagree** (§7.2). Not a bug, but it is a stage risk if unrehearsed.
6. **`hop` + `indirect` multi-route case is absent from the seed** (§4.5). Blocks answering §8's own open question.
7. **No effective-permission model** — inherited from Access Discovery Amendment 3, and now with court-record evidence that it matters (§3.4). The false-positive rate remains undefined, not zero.
8. **Backend has no route tests and no test script** in `backend/package.json`. Pre-existing, and this module would be the fifth router shipped without one.

---

## 9. Demo implications

Beats 24–29, following Access Discovery's beats 19–23. The narrative spine: *Access Discovery told you every route. Exposure Map tells you which identity to worry about — and it is not the one any existing view in the product points at.*

The data is in `core/src/data/seed/exposure.ts`; the properties every number below rests on are pinned in `core/src/data/seed-exposure.test.ts`. Scores are §5 applied to that data, recomputed against the pinned clock.

| Beat | Identity | What the CISO sees | Why it is needed |
|---|---|---|---|
| 24 | `user-maya` (new) | 40 permissions across AWS IAM and Snowflake, 28 direct + 12 indirect, `S = 4.0` → **97/100**. Green in every other view in the product. | The counterexample the module rests on (§1.3), and the largest footprint in the estate by a factor of eight. Without it the score is indistinguishable from a row count. |
| 25 | `user-jane` (existing, **unmodified**) | Four rows, `S = 1.8` → **78/100**, 83 % of it from one hop | The comparison, and it lands the opposite way round from the PRD's pitch: forty read grants outscore production platform admin. Say it out loud — sensitivity and breadth are different axes, they disagree here, and sorting by either alone loses the other. Uses §5's worked example verbatim; Jane is the anchor that fixes `k`. |
| 26 | `svc-partner-sync` (new) | Six hatched nodes, **no score at all** — 0 of 6 classified | Makes §3.2's honest answer visible instead of hidden. The moment to say that defaulting these to Medium would have produced a number that moves when the registry degrades, and that we refused to. |
| 27 | `svc-invoice-poster` (new) | Three paths, **two** permissions. `write:invoice-queue` badged `2 routes: hop, indirect` — revoking the group membership does not clear it | Answers PRD §8 question 2 on screen (§4.5), and shows why the landing table counts permissions rather than paths. The first pair in the dataset whose two routes carry different multipliers. |
| 28 | `svc-platform-watchdog` (new) + `agent-support-triage` (existing, **unmodified**) | An `indirect` path in ring 3 beside a `hop` in ring 6, across two systems | The rings have to measure something the type column does not, or §4.1 says do not draw them. The nested group is the counterexample; the agent chain is the depth. |
| 29 | Capital One slide | 1 path, 700 buckets, 77 days | The real-world anchor (§3.4), and the moment to say the false-positive rate is undefined. Beat 24 is this shape with the names changed. |

**Verified estate after the seed change** (`ITAG_NOW=2026-07-31T00:00:00Z`, 193/193 tests, `tsc -b` clean):

| | Before (`d31f0fd`) | After |
|---|---|---|
| identities / groups / apps | 123 / 8 / 7 | **132 / 12 / 7** |
| permissions — sensitive / not sensitive / unclassified | 36 — 9 / 27 / 0 | **83 — 9 / 68 / 6** |
| access paths — direct / indirect / hop | 66 / 66 / 6 | **103 / 80 / 7** |
| `identities_scanned` / `identities_with_hop` | 115 / 4 | **120 / 5** |
| ownership queue / rank 1 / reaching sensitive | 24 / `svc-vpn-legacy` / 12 | **24 / `svc-vpn-legacy` / 12** — unchanged |
| lineage explanation coverage | 0.85217 (115) | **0.85833 (120)** |

The queue row is the one that matters: nine identities were added, the largest blast radius in the estate is among them, and not one of them is an ownership finding. That is the argument for a separate module stated as a number.

---

## 10. Open questions

- **Does ownership severity consume hop paths?** `ownership/reach.ts` walks `inherited_from ∪ delegates_to` and not `permissionBindings`, so it reports `user-jane` at zero sensitive permissions while this module scores her 78. Both are correct under their own definitions, and `seed.test.ts` pins the current behaviour. Changing it is a deliberate act with a pinned blast radius; not changing it means the disagreement is permanent and must be explained in the UI (§7.2).
- **Which module owns the sensitivity union?** It is catalog-level data consumed by ownership (as a boolean) and exposure (as a union). Putting the union in `domain/types.ts` risks ownership drifting onto it; putting it in `exposure/` duplicates catalog knowledge.
- **What is the exposure score of an identity with zero paths?** 21 of 120 non-group identities have none. `0` and "not applicable" are different claims, and rule 7 says they must not collapse. Leaning toward a discriminated `{ kind: 'no_paths' }` rather than a zero that sorts alongside real zeros.
- **Do the two downstream branch owners accept `exposure_set` over `reachable_set`?** (§3.1). Unified Impact Analysis seeds its frontier from this set by name.
- **No public documentation found:** any Kubernetes-native data-classification API; any general SaaS classification API; any published per-identity aggregate exposure weighting from a major CIEM vendor. All three absences are findings, not gaps in the search.

---

## 11. Sources

**Provider documentation (official)**

- AWS — [Macie: How automated sensitive data discovery works (sampling)](https://docs.aws.amazon.com/macie/latest/user/discovery-asdd-how-it-works.html) · [Macie: Reviewing data sensitivity statistics and coverage issues](https://docs.aws.amazon.com/macie/latest/user/discovery-asdd-results-s3-dashboard.html) · [Macie: Assessing automated sensitive data discovery coverage](https://docs.aws.amazon.com/macie/latest/user/discovery-coverage.html) · [AWS Security Blog — automatic, continual, cost-effective discovery of sensitive data in S3](https://aws.amazon.com/blogs/security/use-amazon-macie-for-automatic-continual-and-cost-effective-discovery-of-sensitive-data-in-s3/) · [IAM temporary security credentials](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_temp.html)
- Microsoft — [Defender for Cloud: what is an attack path / cloud security graph](https://learn.microsoft.com/en-us/azure/defender-for-cloud/concept-attack-path) · [Defender for Cloud: manage attack paths](https://learn.microsoft.com/en-us/azure/defender-for-cloud/how-to-manage-attack-path) · [Defender for Cloud: attack path API schema](https://learn.microsoft.com/en-us/azure/defender-for-cloud/attack-path-api) · [Defender for Cloud: risk prioritization (levels incl. "Not evaluated")](https://learn.microsoft.com/en-us/azure/defender-for-cloud/risk-prioritization) · [Purview: sensitivity labels in the Data Map](https://learn.microsoft.com/en-us/purview/data-map-sensitivity-labels) · [Purview: supported data sources and label support matrix](https://learn.microsoft.com/en-us/purview/data-map-data-sources)
- Google Cloud — [Sensitive Data Protection: overview of sensitive data discovery / data profiles](https://docs.cloud.google.com/sensitive-data-protection/docs/data-profiles) · [Sensitive Data Protection product overview](https://cloud.google.com/security/products/sensitive-data-protection)
- Kubernetes — no native data-classification API located; see §3.2.

**Standards and control frameworks**

- [FIRST — CVSS v4.0 Specification Document](https://www.first.org/cvss/v4.0/specification-document) (condition of use: publish score *and* vector string; §8.2 MacroVectors and interpolation) · [CVSS v4.0 FAQ](https://www.first.org/cvss/v4.0/faq) (departure from v3.x algebraic formulas; 15M vectors → equivalency sets) · [CVSS v4.0 specification PDF, 2024-06-18](https://www.first.org/cvss/v4-0/cvss-v40-specification.pdf) · [Announcing CVSS v4.0 (SIG presentation)](https://www.first.org/cvss/v4-0/cvss-v40-presentation.pdf)
- [NIST SP 800-53 Rev 5.1 — OSCAL-derived control text (AC-6 base, AC-6(1), AC-6(7), RA-3)](https://csrc.nist.gov/CSRC/media/Projects/risk-management/800-53%20Downloads/800-53r5/SP_800-53_v5_1-derived-OSCAL.pdf) · [AC-6 Least Privilege](https://csf.tools/reference/nist-sp-800-53/r5/ac/ac-6/) · [AC-6(1) Authorize Access to Security Functions](https://www.stigviewer.com/controls/nist-800-53/AC-6(1))

**Threat intelligence and incident record**

- [U.S. Department of Justice, W.D. Wash. — *United States v. Paige Thompson* case page (complaint, superseding indictment)](https://www.justice.gov/usao-wdwa/united-states-v-paige-thompson)
- [Ninth Circuit appellate brief, *United States v. Thompson* (CourtListener/RECAP) — IMDS relay, `ISRM-WAF-Role`, and the record that most commands returned "You are not authorized to perform this operation"](https://storage.courtlistener.com/recap/gov.uscourts.ca9.340459/gov.uscourts.ca9.340459.12.0.pdf)
- [Cloud Security Alliance — Cloud penetration testing: the Capital One breach (IMDS mechanism)](https://cloudsecurityalliance.org/blog/2019/10/10/cloud-penetration-testing-the-capital-one-breach)
- [Krebs on Security — What we can learn from the Capital One hack](https://krebsonsecurity.com/2019/08/what-we-can-learn-from-the-capital-one-hack/) (secondary reporting, used only for context corroborated by the court record)

**Repository evidence** — `core/src/domain/{access,types,ownership}.ts`, `core/src/access/{classify,service}.ts`, `core/src/ownership/{severity,reach,classify,suppression}.ts`, `core/src/graph/{build,traverse}.ts`, `core/src/data/seed/{catalog,access,fragment}.ts`, `core/src/access/classify.test.ts`, `backend/src/routes/{access,ownership}.ts`, `backend/src/server.ts`. All seed measurements taken at `d31f0fd` with `ITAG_NOW=2026-07-31T00:00:00Z`, 185/185 core tests passing.

**Vendor marketing (labeled as such, not documented behavior)** — none cited. Where a competitive claim appears in §3.5 it is sourced to product documentation, not to marketing pages.
