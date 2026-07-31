# PRD: Identity Risk Profile

**Product:** IdentityGovern / IdentityTracer (Unosecur)
**Module:** Traceability → Identity Risk Profile (F)
**Doc owner:** Harsha
**Status:** Draft v2

> **Repo copy, amended.** The prose below is Harsha's Draft v2, unchanged. Five amendments
> are inserted inline as blockquotes where they apply, in the same style as
> `docs/PRD-identity-exposure-map.md` and `docs/PRD-access-discovery.md`. Where an amendment
> and the surrounding prose conflict, **the amendment governs**, and
> `docs/identity-risk-profile-research.md` carries the full argument for each — §4.6 states
> all five in full and the sections it cites carry the measurements.
>
> This is the most heavily amended PRD in the repo, and the reason is stated once here
> rather than repeated five times: **roughly half of this document specifies a composite
> score, and the engine measured that composite before building it.** Under these exact
> default weights, over all 127 non-group identities at `ITAG_NOW`, the maximum is 75 — so
> §6.1's Critical band (80+) is empty and its red chip matches nothing — the median is 25,
> **42 identities share the single value 8**, and an identity whose only signal is a live
> administrative hop path scores 29 against 28 for an identity that is unremarkable on all
> six factors. `user-jane`, §3's worked example, lands at 57 rather than 84.
>
> What is built instead is research §5: each factor emits its own categorical finding with
> its evidence, and an identity is described by **which** factors fired and **how many**.
> Everything else in this document — the six factors, the explainability requirement, §4.4's
> `stalest_input`, §6.7's auditor export — is implemented close to as written.

---

## 1. Problem Statement

Access Discovery tells you *how* an identity can reach a resource. Delegation Chain tells you *who created* that identity. Identity Exposure Map tells you *what this identity's own footprint looks like*, weighted and mapped. None of these three modules tell you, on their own, **which identities to worry about first.** A security team staring at thousands of classified access paths, a delegation forest full of anomaly flags, and a wall of resource maps still has to answer a prioritization question every other TAG module leaves open: *given everything we now know about this identity, how much risk does it actually represent, relative to every other identity in the environment?*

Identity Risk Profile exists to answer exactly that, in one number a reviewer can sort by — plus a transparent breakdown of what produced it, so the score is a starting point for investigation, not a black box a reviewer has to trust blindly.

This is the module that turns "we found 4,000 access paths, 200 delegation anomalies, and a resource map for every identity" into "here are the 30 identities that matter this week."

---

## 2. Goals / Non-Goals

**Goals**
- Produce a single normalized composite risk score (`risk_score`, 0–100) for every identity in the environment.
- Make the score fully explainable: every point of the score traces back to a named, weighted contributing factor.
- Pull inputs from every upstream TAG module that already computes a relevant signal — this module does not re-derive access paths, exposure aggregation, lineage, or ownership; it **consumes and weights** their outputs.
- Support per-factor drill-down so a reviewer can see *why* an identity scored high without leaving the row.
- Recompute continuously (or near-continuously) as upstream signals change, not just on a fixed schedule — a risk score that's stale by days defeats the purpose in an active-investigation context.

**Non-Goals (handled by other TAG modules, not this PRD)**
- Classifying access paths as Direct/Indirect/Hop (→ Access Discovery) — this module *consumes* Access Discovery's hop-access flag/count and `effective_permissions` fields (that PRD's §4.3) as scoring inputs, it doesn't detect hop access itself.
- Aggregating an identity's own reachable set into a weighted footprint, or rendering that footprint as a resource map (→ Identity Exposure Map) — this module *consumes* Exposure Map's `exposure_score` field (that PRD's §4.3) directly as one of its six factors; it does not re-aggregate the reachable set or re-derive the weighting Exposure Map already performs.
- Resolving creation lineage or flagging orphaned creators (→ Delegation Chain) — consumed as an input signal, not computed here.
- Determining who owns an identity or grant, or whether that owner is still active (→ Accountability / Ownership) — consumed as an input signal, not computed here. **Note:** at the time of this draft, Identity Ownership does not yet have its own standalone PRD, so the exact field name this module should read for ownership status is not yet fixed — see §8's open question on this gap.
- Systemic/downstream blast-radius simulation across multiple identities (→ Unified Impact Analysis) — that module asks "if this node falls, what falls with it," which is a different question from "how risky is this node on its own." Risk Profile is a **per-identity** score; Unified Impact Analysis is a **systemic/graph-propagation** score. Unified Impact Analysis's own PRD (v2, §2 and §6.3) explicitly reads this module's `risk_score` field as a prioritization signal — deciding which identities are worth simulating first — but deliberately never folds it into its own `exploitable_risk_score`. The two numbers are computed independently and are allowed to disagree; see §8 for the reciprocal side of that relationship.
- Review/attestation workflow or approval logging (→ Governance / Access Reviews) — this module surfaces the score reviewers act on; it doesn't run the review process itself. **Note:** as with Ownership above, Access Reviews does not yet have its own standalone PRD, so the exact field this module should read for "last review completion date" (feeding trust decay, §4.1) is provisional — see §8.

Identity Risk Profile's job is strictly to **aggregate, weight, and explain** — not to detect anything new.

### 2.1 Who consumes this module's output, and how

Because `risk_score` is read by more than one downstream surface, it's worth being as explicit about outbound consumers as Access Discovery's own PRD (v2, §2.1) is about its own:

| Consumer | What it reads from Identity Risk Profile | What it must NOT do |
|---|---|---|
| **Unified Impact Analysis** | The `risk_score` field, used purely as a prioritization signal to help decide which identities are worth running a full compromise simulation against first when compute budget is limited (that PRD's §4.2 step 6); also displayed side by side with its own `exploitable_risk_score` in its leaderboard table (that PRD's §6.3) | Must not fold `risk_score` into its own `exploitable_risk_score` calculation — the two scores are computed independently by design, and a divergence between them is treated as a finding worth surfacing, not an inconsistency to reconcile |
| **Home Dashboard (executive view)** | `risk_score` and its derived risk band (Critical/High/Medium/Low), for the "Unified Impact leaderboard" and general KPI surfacing (tag-framework-prd.md §5.2) | Does not recompute or re-weight the score for dashboard display; the dashboard is a read-only surface over this module's output |
| **Access Reviews (Governance queue)** | `risk_score`, risk band, and top contributing factor, shown inline on each reviewer's attestation card so a reviewer doesn't have to leave the queue to see why an identity needs attention (tag-framework-prd.md §5.10) | Does not alter the score based on review outcomes directly — a review action (approve/revoke/escalate) feeds back into upstream factors (e.g., completing a review resets trust decay), which then flows into the *next* recomputed score, rather than the review queue patching the score in place |

This table is the contract other surfaces are written against. If this module's output schema changes, every row above is a place that could break.

> **The schema did change, so every row above needs rewriting — see Amendment 2.** There is no `risk_score` field and no derived Critical/High/Medium/Low band to read. Unified Impact Analysis shipped without either and was right to: `impact/service.test.ts` L117 forbids the key. The replacement contract each consumer should be written against is `assessment.factors_firing`, `assessment.worst_level` and `assessment.findings`, all three of which are present only on the `findings` arm (Amendment 5). Research §8 gap 5 records that this needs Blast Radius's owner to agree rather than being decided here.

---

## 3. Definitions

| Term | Definition |
|---|---|
| **Risk Score** | A single normalized value, 0–100, representing an identity's overall risk relative to the rest of the environment. Higher = more urgent. |
| **Contributing Factor** | One of the named inputs that feeds the score (exposure, hop presence, credential hygiene, trust decay, dormant privilege, ownership status). Each has its own sub-score and weight. |
| **Factor Weight** | The proportion of the total score a given factor can contribute. Configurable per org (see §8), with sane defaults out of the box. |
| **Score Breakdown** | The full, itemized accounting of how a given identity's total score was produced — every factor's raw signal, its normalized sub-score, and its weighted contribution. |
| **Score Drift** | The change in an identity's score between two points in time — used to flag identities getting riskier quickly, not just identities that are risky in absolute terms. |
| **Peer Percentile** | An identity's score expressed relative to identities of the same type (human/service/AI agent) — a service account and a human admin shouldn't be judged against the same baseline expectations. |

**Worked example (AWS), continuing the case study established across the product:**

`user:jane.doe` has, by this point, appeared in every prior PRD in this project telling the same story from a different angle. Access Discovery found that her only direct policy is `AnalystReadOnly`, but she can also `ssm:StartSession` into EC2 instance `i-0abc123`, which carries `ec2-admin-role` — a Hop path to `aws:account-root` with `AdministratorAccess` as the effective permission (that PRD's §3). Identity Exposure Map took that same finding, weighted it alongside her handful of low-sensitivity Direct paths, and produced an `exposure_score` of 78 — driven almost entirely by that one Hop path (that PRD's §3). Unified Impact Analysis then extended the story further, showing that `ec2-admin-role` can also pivot into `svc:ci-deploy-bot`'s own broad access, making `ec2-admin-role` the environment's choke-point node (that PRD's §3).

Identity Risk Profile is where all of this converges into one number. It pulls Exposure Map's `exposure_score` (78) as its Exposure factor; Access Discovery's hop-access flag (present, one path, terminal permission `AdministratorAccess`) as its Hop-Access-Presence factor; a credential check showing Jane has no MFA enrolled; a review-history check showing 340 days since her last access review; and a provisional ownership-status check (Jane's own account is actively owned, but flagged here as provisional pending an Identity Ownership PRD — see §8). Weighted and summed, these six factors produce `risk_score: 84` — a number that, on its own, would already flag Jane for review, well before a reviewer needs to open either the Exposure Map or the Unified Impact Analysis simulator to understand why.

---

## 4. Detection Logic

### 4.1 Scoring model

Identity Risk Profile is **not** a graph-traversal module — it has no nodes/edges of its own. Its "data model" is an aggregation pipeline: pull one current value per factor per identity from the modules that own that signal, normalize each to a common 0–100 sub-scale, weight, and sum.

| Signal | Source module | Field consumed | Contribution logic |
|---|---|---|---|
| **Exposure score** | Identity Exposure Map | `exposure_score` (that PRD's §4.3) | Higher weighted blast radius (resource count × sensitivity) → higher sub-score, consumed directly rather than recomputed |
| **Hop-access presence** | Access Discovery | Hop-access flag/count derived from `path_type` across an identity's path objects (that PRD's §4.3) | Any live hop-access path is a strong positive risk factor — binary presence weighted heavily, with additional weight per additional distinct hop path found |
| **Credential hygiene** | Identity/IdP source data (MFA status, key/password age, rotation history) | No standardized field yet — sourced directly from provider IdP data, not from another TAG module | No MFA, stale credentials, or no rotation policy each add to the sub-score |
| **Trust decay** | Time since last access review + config drift from established baseline | Provisional: expected to read a "last review completion date" field from an eventual Access Reviews PRD (Governance pillar); not yet a fixed field name — see §8 | Sub-score increases monotonically with time since last review; a step increase if current access has drifted from the identity's last-approved baseline |
| **Dormant privilege** | Access Discovery's `effective_permissions` field, plus usage/last-used telemetry | `effective_permissions` (that PRD's §4.3), joined against provider usage logs | Permissions granted but unused for N days contribute to the sub-score — a live permission nobody is using is unaccounted-for risk with no offsetting benefit |
| **Ownership status** | Accountability / Ownership Registry | Provisional: expected to read an owner-active/owner-left flag from an eventual Identity Ownership PRD; not yet a fixed field name — see §8 | Unowned identity, or an owner who has left/gone stale, contributes a large fixed penalty — orphaned accountability is treated as close to worst-case by design, matching the framework's stated differentiator |

> **Amendment 1 — three of the six factors are `ITAG.md` §F9 and §F10, their data is already seeded, and the "provisional field name" framing in §4.1, §5 and §8 is withdrawn.** Credential hygiene and trust decay are one thing, §F9's control drift over `control_history` (`core/src/domain/types.ts` L186-189), which §F9 specifies in more detail than this table does — a baseline of 100, "MFA disabled = high impact", and extra decay for an exception "still active 90+ days later". Dormant privilege is §F10's grant staleness over `grant_records` × `grant_half_lives` (L191-206). Ownership status is not provisional either: `core/src/ownership/` ships ten modules and `ownership/classify.ts` is the authority for the field. All three tables are wired into `IdentityDataset` (L233-235) and `ITAG.md` L244 even names the route.
>
> Two consequences for the row above. **`effective_permissions` does not exist and will not**, so dormancy is not observable: `GrantRecord` carries `granted_at` and no `last_used`, and the field is `reachable_permissions` (architecture rule 13, and Access Discovery Amendment 1). And **credential hygiene for a machine identity is key age and last-authentication time, and nothing else** — across AWS, Entra, GCP and Kubernetes no vendor documents an MFA, passwordless or authenticator-strength signal for any service account, service principal, managed identity or agent, and AWS's credential report "lists all users in your account" with no role coverage at all. This row's list of six provider sources is aspirational for 125 of 139 identities and is marked so. See research §3.2, §4.1.
>
> As built: `core/src/risk/factors.ts` — `control_drift` (source `control_history`), `grant_staleness` (source `grant_records`), `ownership` (source `ownership/classify.ts`, quoted verbatim). Named for what they measure rather than what they were hoped to measure.

### 4.2 Computation steps

1. **Pull current factor values.** For each identity, request the latest value for each of the six signals above from its owning module. If a module hasn't run since the identity's last change, use its most recent value and flag the score as `partially_stale` (see §4.4) rather than blocking on a fresh recompute.
2. **Normalize.** Convert each raw signal to a 0–100 sub-score using a documented normalization function per factor (e.g., Exposure Map's `exposure_score` is already 0–100 and passes through unchanged; credential hygiene is a rules-based point count capped at 100; dormant-privilege sub-score is `min(100, days_unused / threshold * 100)`).
3. **Apply weights.** Multiply each sub-score by its configured weight (weights sum to 1.0 across the six factors; see §8 for whether these should be configurable at MVP).
4. **Sum to composite.** Total = Σ(sub-score × weight), capped at 100, stored as `risk_score`.
5. **Compute peer percentile.** Rank the identity's composite score against other identities of the same type (human/service/AI agent) to produce a percentile alongside the absolute score — an absolute 60 might be unremarkable for a human but alarming for a supposedly narrow-purpose service account.
6. **Compute score drift.** Compare against the identity's own score from the last computed snapshot; flag `rising_fast` if the delta exceeds a configurable threshold within a configurable window (e.g., +15 points in 7 days).
7. **Persist snapshot.** Store the full breakdown (not just the total) so historical drift and "why did this change" queries don't require recomputation.

> **Amendment 2 — steps 2, 3 and 4 are not implemented, and the weights are deleted with them. There is no composite `risk_score`.** This is not a tuning objection; it is that the operator is wrong for these inputs, and the estate proves it before the literature does. Measured over all 127 non-group identities at `ITAG_NOW`: maximum 75, so §6.1's Critical band is unreachable; median 25; 33 distinct values, with **42 identities on the value 8** drawn from three different factor profiles; an identity whose only signal is a live hop path to `aws:account-root` at **29** against **28** for an identity unremarkable on every factor. `svc-vpn-legacy`, ownership queue rank 1 and the demo's opening beat, falls to composite rank 9; `user-maya`, exposure #1 at 97, to rank 62.
>
> The OECD/JRC *Handbook on Constructing Composite Indicators* states the cause as a property of the arithmetic rather than of the weights — additive aggregation implies "full compensability", and "two countries, one with values 21, 1, 1, 1, and the other with 6,6,6,6, would have equal composites" — and adds the sentence that dissolves step 3: weights in an additive aggregation "necessarily take the meaning of substitution rates (trade-offs) and **do not indicate the importance** of the associated indicator". So 0.30 for hop access against 0.05 for credential hygiene is not a claim that one matters six times more; it is a claim that one point of hop access is exchangeable for exactly six points of credential hygiene, for every identity, at every point in the range.
>
> The engine had already rejected this operator once, in writing, in its first ranking authority. `ownership/severity.ts` L20-22: "Age alone cannot rank a queue: an ancient orphan that reaches nothing is not the one to work on first. Sensitivity is what turns 4,000 rows into the seven that matter, so it dominates, and time only breaks ties within a band." And FIRST's rule for a boolean signal that conflicts with a scalar is override rather than weighting — treat a KEV-listed vulnerability as exploited "regardless of EPSS score" — with a name for the alternative: **"Score Laundering."**
>
> §7's own success metric fails on these defaults. Moving hop access 0.30 → 0.20 and ownership 0.20 → 0.30 retains **12 of the top 20** and moves `svc-ci-runner` 45 places; equal weights retain 17 and move `user-dan` 41 places.
>
> **As built (research §5):** each factor emits at most one finding at its own level in its own vocabulary, nothing is normalized, `worst_level` is a maximum and `factors_firing` is a count of distinct factors. `core/src/risk/summarize.ts`; the dilution counterexample is a named test in `summarize.test.ts`. NIST SP 800-30 Rev 1 lists `max` first among acceptable combinations, combines its own exemplary likelihood and impact by lookup table, and states the obligation as "Organizations make explicit the rules used" — which research §5's table is. `impact/service.test.ts` L117 forbids the literal key `risk_score` and `risk/service.test.ts` now enforces the same.

> **Amendment 3 — step 5 is not implemented. `peer_percentile` is a maximum with a decimal point at two of the three cohort sizes.** The estate is 14 humans, 107 service accounts and 6 AI agents. NIST/SEMATECH states the rule — "any p ≥ N/(N+1) will simply be set to the maximum value" — and at N=14 that boundary is 0.9333, so "95th percentile (human)" in §3 and §6.2 *is* the highest-scoring human. For the 6 AI agents one rank step is 16.7 percentile points and only 3 distinct values exist among them. NIST/SEMATECH also notes "there is not a standard universally accepted way to perform this interpolation", with the common methods diverging "particularly for small samples", so publishing the field is publishing a software choice. Only the 107-member service-account cohort supports one at all.
>
> If a cohort comparison is wanted, emit the raw ordered rank with n disclosed — "2nd of 14 human identities" — which is what the computation returns anyway and which makes the sample size visible rather than hiding it. Separately, §3's worked example is not reproducible from the seed for a second reason: the estate's oldest access review is 240 days, not 340. See research §4.4.

> **Amendment 4 — step 6 is not implemented, and neither are §4.3's `score_drift`, `delta_7d`, `flag: "rising_fast"`, §6.3's Rising Fast chip or §6.4's 90-day trend line. Nothing pretends they were.** The graph is built once at boot from a frozen dataset, so there is no prior score to difference against, and a trend computed from one snapshot is a fabricated alarm — worse than a missing field, because it is actionable. This is Identity Exposure Map Amendment 5 for the second time, enforced by the same class of test: `exposure/service.test.ts` L590 already bans the key names **`rising_fast`**, **`flag`** and **`trend`**, which §4.3's score object uses verbatim, and `backend/src/routes/exposure.ts` L45-49 records the reasoning in the router that refused them.
>
> Checked rather than assumed: `control_history` and `privilege_grant_events` are event logs **per identity**, not snapshots of computed output, so persisting step 7's breakdown would still leave nothing to difference. Of the four, the chip is the most dangerous, because it is one click and implies a measurement. `risk/service.test.ts` now walks every payload for all four key names plus `peer_percentile`.

### 4.3 Score object (core output)

```json
{
  "identity_id": "user:jane.doe",
  "identity_type": "human",
  "risk_score": 84,
  "peer_percentile": 95,
  "score_drift": {
    "delta_7d": 18,
    "flag": "rising_fast"
  },
  "breakdown": [
    { "factor": "hop_access_presence", "source_field": "access_discovery.path_type=hop", "raw_signal": "1 hop path to account-root via ec2-admin-role", "sub_score": 95, "weight": 0.30, "contribution": 28.5 },
    { "factor": "exposure_score", "source_field": "identity_exposure_map.exposure_score", "raw_signal": 78, "sub_score": 78, "weight": 0.20, "contribution": 15.6 },
    { "factor": "ownership_status", "source_field": "provisional — pending Identity Ownership PRD", "raw_signal": "actively owned (provisional check)", "sub_score": 20, "weight": 0.20, "contribution": 4.0 },
    { "factor": "trust_decay", "source_field": "provisional — pending Access Reviews PRD", "raw_signal": "340 days since last review", "sub_score": 85, "weight": 0.15, "contribution": 12.75 },
    { "factor": "dormant_privilege", "source_field": "access_discovery.effective_permissions", "raw_signal": "2 unused permissions, 120+ days", "sub_score": 60, "weight": 0.10, "contribution": 6.0 },
    { "factor": "credential_hygiene", "source_field": "idp_source.mfa_enrolled", "raw_signal": "no MFA", "sub_score": 80, "weight": 0.05, "contribution": 4.0 }
  ],
  "computed_at": "2026-07-31T00:00:00Z",
  "staleness": {
    "based_on_access_discovery_snapshot": "2026-07-30T18:00:00Z",
    "stale_if_older_than_hours": 24,
    "partially_stale": false,
    "stalest_input": {
      "factor": "exposure_score",
      "snapshot_age_hours": 6
    }
  }
}
```

### 4.4 Refresh / staleness

Because this module uniquely aggregates from *multiple* upstream sources — not just Access Discovery, the way Identity Exposure Map and Unified Impact Analysis do — its staleness object extends the shared product-wide convention (same base key names: `based_on_access_discovery_snapshot`, `stale_if_older_than_hours`) with a per-factor staleness breakdown, rather than inventing separate key names for the same underlying idea:

- Recompute triggered on any upstream signal change (a new hop path detected, an exposure score recompute, an ownership status change, a credential rotation, a review completion) — this module should feel closer to real-time than the underlying graph rebuilds it depends on, since scoring is cheap arithmetic once inputs are available.
- A full recompute pass across all identities also runs on the same cadence as the slowest input module's refresh cycle (typically Access Discovery's graph rebuild, which Identity Exposure Map itself depends on).
- Every score object carries the shared `based_on_access_discovery_snapshot` / `stale_if_older_than_hours` pair at the top level (consistent with Access Discovery v2, Identity Exposure Map, and Unified Impact Analysis v2), **plus** a `stalest_input` object identifying which specific *factor* — not just which upstream module in general — is the oldest, and how old. A score should never present as fully current if it's silently built on a 3-day-old exposure number from one factor while every other factor is fresh.
- `partially_stale` is set `true` whenever any single factor's source data predates its own module's expected freshness window (e.g., Exposure Map's own 24-hour staleness threshold), even if the overall `risk_score` timestamp looks current — a composite score is only as fresh as its stalest ingredient.

> **Amendment 5 — `stalest_input` ships, `stale_if_older_than_hours` does not, and `partially_stale` becomes an arm of a union rather than a flag beside a value.** This section's argument is correct, is the best original idea in the document, and `domain/exposure.ts` L274 already wrote this module's half of the contract in writing: "Identity Risk Profile points its own `stalest_input` at this value." Implemented as `RiskStaleness.stalest_input` (`core/src/domain/risk.ts`). In this build every factor reads one dataset validated at boot, so all six input snapshots are equal and the tie is broken by registry order — which the payload says out loud by having `snapshot_at` equal `based_on_access_discovery_snapshot`, rather than implying a per-factor ingestion cadence that does not exist.
>
> Two corrections. First, there is no shared product-wide convention for **`stale_if_older_than_hours`**, and this is the third PRD to assert one. `domain/exposure.ts` L280-282 declined it in writing — "it is a deployment policy, not a fact about this snapshot, and there is no rebuild cadence to state one against" — and `unified-impact-analysis-research.md` §2 issued the identical correction to the previous PRD that copied it.
>
> Second, and more important: **`partially_stale: boolean` and §6.6's "Partial" badge are the wrong construction**, and the engine has made this decision twice already. A boolean beside a number lets the number sort; a discriminated union does not let the number exist. `ExposureAssessment` puts its scored fields only on the `scored` arm precisely "so a consumer cannot read a score off a row that has not got one" (L199-200), and `OwnershipState` carries `unknown` marked "structurally separate from `unowned` and never counted as a finding". Architecture rule 9 is the general form.
>
> As built, `RiskAssessment` is three arms — `findings`, `no_findings`, `partially_evaluated` — and the last names the factors it could not evaluate and carries no value at all. Research §3.5 checked six competing products and found none that ships this on the identity itself: Defender for Cloud's `Not evaluated` scores a recommendation against a resource, Identity Secure Score's `[Not Scored]` is per-tenant, Entra's `hidden` means licence-gated, Okta's enum has no null tier, Veza's `None (<10)` means no query matched, and SailPoint only creates a record for a detected outlier. Doing what §6.6 asks is the one change that would make this module the same as the category. Measured consequence: on this estate **77 of 127 identities have no finding and not one of them is reported as clean**, because `control_drift` covers 4 identities and `grant_staleness` 7.

---

## 5. Data Requirements (per provider)

Identity Risk Profile has no provider-specific ingestion of its own — it is entirely downstream of other modules' normalized outputs, plus two categories of data those modules don't already carry:

| Source | Data needed |
|---|---|
| Access Discovery | Per-identity hop-access flag/count, `effective_permissions`, `last_confirmed_at` timestamps (that PRD's §4.3–§4.4) |
| Identity Exposure Map | Per-identity `exposure_score` (that PRD's §4.3) |
| Delegation Chain | Per-identity anomaly flags (`orphaned_creator`, `deep_chain`, `high_fanout`) |
| Ownership Registry (Accountability) | Owner-of-record status, owner active/left state — field name provisional, no standalone PRD yet (see §8) |
| Identity/IdP source data (AWS IAM, Azure AD, Okta, GCP IAM, Kubernetes, SaaS admin consoles) | MFA enrollment, credential/key age, last rotation date |
| Usage/telemetry (CloudTrail, Azure Activity Log, GCP Audit Logs, Kubernetes audit log, SaaS access logs) | Last-used timestamp per permission, for dormant-privilege calculation |
| Access Reviews (Governance) | Last review completion date and outcome, for trust-decay calculation — field name provisional, no standalone PRD yet (see §8) |

Because this module aggregates rather than ingests raw provider data directly, the main engineering dependency is **freshness and availability of upstream module outputs**, not new provider connectors.

---

## 6. UI/UX Spec — Identity Risk Profile Screen (Table-First)

Per the product-wide rule in §7 of the project context doc, a scored, sortable list of individual entities is squarely a table job — there's no spatial/relational structure here worth a graph. The one visual exception is the per-identity score breakdown, which uses a radar/bar chart to make the weighted factors legible at a glance — that's a data-viz choice, not a graph-of-relationships choice, and stays scoped to a single identity's detail view, the same "earn a chart, don't default to one" logic Identity Exposure Map and Unified Impact Analysis both apply to their own single-identity detail views.

### 6.1 Layout

- **Header:** identity search + selector, with a Risk Band filter row (Critical / High / Medium / Low chips) always visible, computed from score thresholds (e.g., 80+ Critical, 60–79 High, 30–59 Medium, <30 Low).
- **Primary view — Table.** Every identity in the environment, one row each, sorted by risk score descending by default.
- **Filter bar** (above the table): Risk Band, Identity Type, Peer Percentile range, Score Drift (Rising Fast / Stable / Improving), Ownership Status, Owner. Filters combine (AND).
- **Search-within-table:** free-text box matching identity name or owner.

> **Four of these six filters do not exist — see Amendments 2, 3 and 4.** Risk Band is gone with the score, and the thresholds quoted here are the ones the measurement empties: at a maximum of 75 the Critical chip matches nothing. Peer Percentile range and Score Drift are gone with Amendments 3 and 4. Identity Type, Ownership Status and Owner survive. What replaces the three is `worst_level`, `min_factors` and `factor` — where `min_factors=3` is the filter that turns 127 identities into the six that carry three or more independent findings. Exposure Map Amendment 8 already refused these same four band names once, for the additional reason that they collide with `Severity`, which is the vocabulary this module quotes. `backend/src/routes/risk-profile.ts`.

### 6.2 Core table — columns

| Column | Content | Notes |
|---|---|---|
| Identity | Identity name + type icon (human/service/AI agent) | Sortable, clickable → identity detail drawer with full breakdown |
| Risk Score | Numeric 0–100 + colored bar (green→amber→red) | Primary sort column by default, descending |
| Risk Band | Badge: Critical (red) / High (amber) / Medium (yellow) / Low (gray) | Derived from score, not independently set |
| Peer Percentile | e.g. "95th percentile (human)" | Sortable |
| Score Drift | Arrow + delta, e.g. "▲ +18 (7d)" in red if rising fast | Sortable by delta magnitude |
| Top Contributing Factor | Name of the single largest weighted contributor, e.g. "Hop Access" | Click to jump straight to that factor in the breakdown |
| Ownership | Owner name, or "Unowned"/"Owner Left" in red | Ties to Accountability module — see §5 for the field-naming caveat |
| Last Reviewed | Timestamp, or "Never" in red | Feeds trust-decay directly; sortable, flags staleness |

- Default sort: Risk Score descending — the highest-priority identities are on page 1 without any filter configuration required.
- Row density toggle (comfortable/compact) for large environments.
- Column chooser to hide factors a team doesn't currently track (e.g., hide Credential Hygiene if MFA data isn't yet connected).

### 6.3 "Explainability" emphasis (table-native)

Since the entire value proposition of this module is that the score is trustworthy, not a black box:

- Every Risk Score cell shows a small breakdown icon; hovering reveals a compact tooltip with the top 2–3 contributing factors and their weighted contributions, without needing to open the full drawer.
- A summary strip directly above the table: `X Critical · Y High · Z Medium · W Low`, with Critical always rendered in red.
- A dedicated **"Rising Fast"** filter chip, one click, pinned near the top of the filter bar — identities getting riskier quickly are often a more urgent signal than a static high score, and shouldn't require combining Score Drift + sort manually.

### 6.4 Score breakdown (row expand or detail drawer)

- Clicking a row opens a detail drawer (not a separate screen) with:
  - Header strip: identity name/type, current score, peer percentile, drift.
  - **Breakdown chart:** a radar or horizontal bar chart, one axis/bar per factor, showing each factor's sub-score and weighted contribution side by side — this is the one chart in this module, chosen because comparing six weighted components at once is genuinely easier to parse visually than as six table rows, matching the "earn a chart, don't default to one" rule from the project context.
  - Beneath the chart, the same six factors as a plain itemized list (factor, source field, raw signal in plain English, sub-score, weight, contribution) — the chart and the list show the same data two ways so both a quick-scan reviewer and an auditor who needs the exact numbers are served.
  - **Historical trend line:** score over time (last 90 days), so a reviewer can see whether this is a slow decay or a sudden spike, with markers for any review events (from Access Reviews) or ownership changes overlaid on the timeline.
  - Links out to the source module for each factor (e.g., clicking "Hop Access" jumps to that identity's Access Discovery per-user page, clicking "Exposure Score" jumps to that identity's resource map in Identity Exposure Map) — score breakdown should never be a dead end, since every factor is provable elsewhere in the product.
- "Copy breakdown as text" and "Export breakdown as JSON" actions in the drawer, for ticketing/remediation workoff.

### 6.5 Per-identity summary (used elsewhere in product)

Wherever an identity is referenced outside this screen (Access Discovery table, Delegation Chain table, Identity Exposure Map table, Access Reviews queue), show a compact rollup:

```
jane.doe
  Risk Score: 84 (Critical) · 95th percentile (human)
  Top factor: Hop Access (1 path to account-root)
```

### 6.6 Empty/loading/scale states

- **No identities scored yet (upstream modules not yet connected):** explicit banner — "Risk scoring requires Access Discovery, Identity Exposure Map, Delegation Chain, and Ownership data. Connect remaining sources to begin scoring." — rather than a silently empty table, since a blank score table could otherwise be mistaken for "everything's fine."
- **Partial scoring (some factors unavailable):** identities missing one or more input signals still get a score computed from available factors, but the row shows a small "Partial" badge and the drawer's breakdown clearly marks which factor(s) are missing rather than silently defaulting them to zero — a missing signal is not the same as a clean signal, and should never quietly lower a score.

> **The second half of this bullet is right and the first half undoes it — see Amendment 5.** "A missing signal is not the same as a clean signal" is architecture rule 9, and a badge beside a value still lets the value sort against fully-evaluated rows. As built, an identity with unevaluated factors returns the `partially_evaluated` arm, which names the missing factors and has no value to sort. This is the module's one genuinely differentiated property (research §3.5), and it is the bullet that would have removed it.
- **Large result sets:** server-side pagination + the default Risk Score descending sort so the highest-priority rows are on page 1 without paging.
- **Bulk actions row:** checkbox column + "Send to review queue," "Export selected," "Flag for immediate escalation" — mirrors the pattern established in Access Discovery.

### 6.7 Export

- CSV/XLSX export of the current filtered/sorted view, including the full factor breakdown flattened into per-factor columns (not just the composite score) — an auditor should be able to see the "why" offline, not just the number.

---

## 7. Success Metrics

- **Coverage:** % of identities in the environment with a fully computed (non-partial) risk score.
- **Explainability adoption:** % of reviewer sessions that open a score breakdown before taking an action on that identity — a low rate would suggest the score is being trusted blindly rather than investigated, which undermines the module's design intent.
- **Predictive validity:** correlation between high risk scores and identities later confirmed (via Access Reviews or incident follow-up) to have had inappropriate/unnecessary access — the metric that proves the score is actually finding the right identities, not just noisy ones.
- **Time-to-recompute:** latency between an upstream signal change (e.g., a new hop path detected, or Exposure Map recomputing a new `exposure_score`) and the affected identity's score reflecting it.
- **Score stability under configuration:** how much composite scores shift when factor weights are retuned — large swings from small weight changes would indicate the model is too sensitive to be trusted as a stable prioritization tool.

> **The last metric was run, and it is the one that closed §4.2.** Retuning two weights by 0.10 each retains 12 of the top 20 and moves one identity 45 places; equal weights retain 17 and move one identity 41. By this metric's own stated criterion the model is "too sensitive to be trusted as a stable prioritization tool", so the arithmetic was removed rather than tuned (Amendment 2). The first metric survives and shipped as `RiskSummary.factor_coverage`, per factor, published before any distribution — though on this estate it reads 4/127 for `control_drift` and 7/127 for `grant_staleness`, which is the number the demo has to say out loud. Predictive validity has no ground-truth source in a seeded estate and time-to-recompute has no recompute: the graph is built once at boot.

---

## 8. Open Questions

- **Weight configurability at MVP:** should factor weights be configurable per org from day one, or hardcoded with sane defaults for the hackathon build and exposed later? Different orgs will reasonably disagree on whether hop-access presence or ownership status should dominate the score, but configurability adds real UI and validation surface area.
- **Peer group definition:** is human/service/AI-agent the right peer grouping for percentile comparison, or should it be finer-grained (e.g., by team, by privilege tier, by app) once there's enough identity volume to support smaller peer groups meaningfully?
- **Partial-score trust:** when an identity's score is computed from incomplete input data (§6.6), should it still be sortable alongside fully-scored identities in the same list, or should partially-scored identities be visually/positionally separated so a low partial score is never mistaken for a clean bill of health?
- **Score volatility dampening:** should the module apply any smoothing (e.g., exponential moving average) to avoid a single transient signal (a one-day spike in dormant-permission usage, for instance) causing a large score swing that then reverts the next recompute cycle, or is raw current-state scoring preferable for transparency even at the cost of some noise?
- **Provisional field names (new in v2):** §4.1 and §5 both flag that the ownership-status and trust-decay factors currently read from fields that don't yet have a fixed name, because Identity Ownership and Access Reviews don't yet have their own standalone PRDs. Once those PRDs exist, this section needs a follow-up pass to replace the provisional descriptions with the actual field names those modules expose — this should not be forgotten once those two PRDs are written.
> **Three of these six are answered by the amendments above, and one is answered against its own framing.** Weight configurability is moot — there are no weights (Amendment 2). Peer group definition is moot — there is no percentile, and the reason is that two of the three cohorts are too small for one at any granularity, so finer-grained grouping makes it worse (Amendment 3). Volatility dampening is moot — there is no series to smooth, and smoothing a single snapshot is Amendment 4 in a different coat.
>
> **Partial-score trust is the important one, and this build answers it more strongly than either option offered.** The question assumes a partial score exists and asks where to put it; as built there is no partial value to sort, because `partially_evaluated` is an arm of the union rather than a badge on a row (Amendment 5). "Visually separated" would have been the answer if the field had shipped, and it would have been enforced in CSS. This is enforced in the type.
>
> Provisional field names resolve as: ownership status is `OwnershipContext.severity` and `.state` quoted verbatim from `ownership/classify.ts` (Amendment 1); trust decay reads `control_history` and `grant_records` directly, per `ITAG.md` §F9 and §F10, which specified both eighteen months before this PRD.

- **Reciprocal downstream review (new in v2):** Unified Impact Analysis's own v2 (§8) asks whether changes to *its* propagation logic require review of what this module or Exposure Map assume downstream. The reverse question applies here too: if this module's factor weights or normalization logic change — for example, retuning how heavily hop-access presence is weighted — does that require a review of Unified Impact Analysis's leaderboard prioritization behavior (that PRD's §4.2 step 6, which uses `risk_score` to decide which identities are worth simulating first)? Neither PRD currently owns a process for propagating that kind of change-review obligation across module boundaries — this is the same structural gap Unified Impact Analysis's v2 already flagged from its side.

---

*Scope note: this PRD covers Identity Risk Profile only — the per-identity composite scoring layer. It consumes Access Discovery's hop-access and effective-permission fields, Identity Exposure Map's `exposure_score` field, and (provisionally, pending their own PRDs) Delegation Chain's anomaly flags, Ownership's owner-status field, and Access Reviews' last-review field — but computes none of those signals itself. Unified Impact Analysis reads this module's `risk_score` field as a prioritization signal only, never folding it into its own systemic score, and the Home Dashboard and Access Reviews queue both read `risk_score` and risk band as read-only display surfaces. Unified Impact Analysis (systemic/multi-identity compromise simulation) and Identity Threat Profile (STRIDE/MITRE mapping) both read from this module's scores but are specified separately.*
