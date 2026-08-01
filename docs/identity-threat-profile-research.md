# Identity Threat Profile — Implementation Research

> **Lens:** Principal Backend Engineer + CISO, Unosecur
> **Scope:** `~/Downloads/identity-threat-profile-prd.md` (Draft v1, doc owner Harsha) — the PTRACE
> framework, the PTRACE→MITRE mapping table, the 5×5 impact × likelihood matrix, the three-KPI
> strip, and the findings table — evaluated against the engine as built and the four upstream
> modules it is required to translate rather than re-derive.
> **Companions:** [`identity-risk-profile-research.md`](./identity-risk-profile-research.md) (the
> nearest sibling — also "a join that refuses to rank"), [`unified-impact-analysis-research.md`](./unified-impact-analysis-research.md),
> [`identity-exposure-map-research.md`](./identity-exposure-map-research.md),
> [`delegation-chain-research.md`](./delegation-chain-research.md)
> **Status:** research output, written alongside the implementation, Aug 2026.
> **Repo state at time of writing:** clean tree, 354/354 core tests passing (259 pre-existing +
> 95 new), `tsc -b core backend` clean. Measurements at `ITAG_NOW=2026-07-31T00:00:00Z`, over the
> 128-identity seed (127 non-group + the fixtures module's one extra corrupt-lineage row).
>
> **This document wins over the PRD where the two conflict**, on the same footing as
> `identity-risk-profile-research.md` §1. Every override below names the PRD line it overrules
> and why it loses.

---

## 1. Executive summary

1. **This module computes zero original findings, and that is the PRD's own non-goal #1 stated
   as this engine's fourth application of architecture rule 8.** `risk/` was the first module
   whose entire contribution was refusing to rank; this is the second. Every fact reported here
   was already produced by `access/classify.ts`, `exposure/score.ts`, `impact/choke.ts` +
   `impact/service.ts`, or `risk/summarize.ts`, and quoted — never recomputed, never rescored.

2. **Two of the PRD's proposed detection signals do not exist in this engine and are not
   fabricated to fill the gap.** §4.1's mapping table wants "rising `risk_score` /
   `exposure_score` drift" for Probing — a trend this engine has refused three times already
   (`ExposureQuery` has no delta, `RiskQuery` has no percentile, and there is no rebuild cadence
   to compute either against). It also wants Delegation Chain's `flags: ["orphaned_creator",
   "high_fanout", "deep_chain"]` for Concealment & Persistence — an array `domain/lineage.ts`
   L421-424 already deleted by name. Probing ships as a **named, zero-coverage stage**
   (measured: 0 findings, 0 identities, on the full seed). Concealment & Persistence is
   translated from the real fields that replaced the deleted array —
   `LineageRow.creator_status`, `self_authorized`, `creator_privilege_mismatch`,
   `fan_out_exceeds_baseline` — and is reachable (8 findings, 8 identities, measured).

3. **The PRD's 5×5 matrix is real, and it is NIST's shape, not an invented fifth band.** The
   vocabularies this module would naturally quote are four-valued — `ExposureBand` and
   `RiskFindingLevel` — and the house doctrine ("the vocabulary is borrowed, never forked")
   argues against forking a fifth value onto either just to hit 5×5. But NIST SP 800-30 Rev 1
   Table G-3 and H-2 publish "Very Low / Low / Moderate / High / Very High" as the qualitative
   scale for exactly this pair of axes, and Table I-2 combines them "by lookup matrix rather
   than arithmetic" — the same citation `identity-risk-profile-research.md` §3.3 already used to
   argue against a weighted sum. This document chooses **(b)**: two new five-valued unions,
   `ThreatImpactLevel` and `ThreatLikelihoodLevel`, spelled in NIST's own words, assigned only by
   a frozen 25-row lookup table translating the four-valued inputs — never authored freehand, and
   never fewer than five rows short of the PRD's own screenshot.

4. **PRD §8's "does one finding span multiple stages" question is resolved by construction, not
   by a plural field.** `jane.doe`'s worked example (§3.2) shows one hop-access fact becoming
   three stage assignments. This engine's `ThreatFinding` carries exactly one `ptrace_stage`,
   matching `RiskFinding` and `OwnershipFinding`'s own "one level, never a list" convention; a
   fact that spans stages becomes multiple `ThreatFinding` rows sharing one `source_ref`. "How
   many findings" and "how many stage-assignments" are the same question by construction, which
   also answers §8's second question (whether the header KPI double-counts) — it does not, because
   there is no fused count to double.

5. **One deliberate deviation from every sibling module's `list()` shape, argued rather than
   copied silently.** `RiskService.list()`, `ExposureService.list()` and `AccessService.list()`
   all return one row per *identity*. PRD §6.4's Findings table is one row per *finding* — "32
   findings," not 32 identities — and modelling `list()` identity-first here would force every
   consumer to re-flatten `assessment.findings` client-side, the exact anti-pattern
   `delegation-chain-research.md` §5 identifies as what breaks a table view at scale. `list()`
   returns `ThreatFindingRow[]`; `profile()` and `summary()` keep the per-identity shape every
   sibling module's drawer and coverage gate use.

6. **Verdict: (c), same as `risk/` — a translator, not a fifth ranking authority.** Nothing this
   module returns lets one identity outrank another; the matrix and the stage cards are counts
   over what already fired elsewhere. The one new artifact is the NIST-shaped cell, and it is a
   lookup, not a score.

---

## 2. As-built vs as-specified

| Item | Specified (PRD) | Built | Evidence |
| --- | --- | --- | --- |
| PTRACE stage assignment from Access Discovery hop paths (§4.1 row 1) | Yes | **Yes** | `HOP_ACCESS_RULE`, unconditional on any hop |
| Trust Exploitation from the *same* hop fact, not a second detector (§3.2) | Implied by the worked example | **Yes, by construction** | `HOP_ACCESS_RULE` fires both stages from one `source_ref` |
| Exfiltration & Lateral Movement from a hop that is also a pivot (§3.2) | Yes | **Yes, joined against `ImpactAssessment.pivots`** | `HOP_ACCESS_RULE`'s conditional third seed |
| High exposure / critical resource reached → Exfiltration (§4.1 row 2) | Yes | **Yes** | `EXPOSURE_REALIZED_RULE`, quoting `ExposureAssessment.band` + `highest_sensitivity_reached` |
| Identity-to-identity pivot → Account Spoofing + Exfiltration (§4.1 row 3) | Yes | **Yes** | `PIVOT_RULE`, quoting `ImpactAssessment.pivots` |
| Choke-point node → Rights Escalation (§4.1 row 4) | Yes | **Yes** | `CHOKE_POINT_RULE`, quoting `ChokePointReport.candidates`, deduplicated against the hop rule |
| Orphaned creator / high fan-out / deep chain → Concealment (§4.1 row 5) | Yes, via a `flags[]` array | **Yes, translated from the replacement fields** | `CREATOR_LINEAGE_RULE`; see §4.2 below |
| No MFA / stale credentials → Trust Exploitation (§4.1 row 6) | Yes | **Yes**, from Risk Profile's own `control_drift` factor | `CONTROL_DRIFT_RULE`, quoting `RiskFinding.evidence` verbatim |
| Rising `risk_score`/`exposure_score` drift → Probing (§4.1 row 7) | Yes | **No, and not invented** | See §4.1 below |
| Impact from resource sensitivity, escalated on choke-point membership (§4.2) | Yes | **Yes** | `impactFor()`, `EXPOSURE_BAND_TO_IMPACT` + one-band bump |
| Likelihood from `risk_score` and `peer_percentile` (§4.2) | Yes | **No — neither field exists** | `likelihoodFor()` uses `RiskAssessment.worst_level` + `factors_firing` instead |
| 1-5 integer impact/likelihood scale (§4.2, §6.2) | Yes | **No — five *qualitative* NIST-named levels, never an integer** | `ThreatImpactLevel`, `ThreatLikelihoodLevel` |
| 5×5 matrix (§6.2) | Yes | **Yes, as a frozen 25-row lookup, not arithmetic** | `SEVERITY_BAND_MATRIX` |
| `staleness.stale_if_older_than_hours` (§4.3, §4.4) | Yes | **No, declined a fourth time** | `ThreatStaleness`; see §4.3 |
| Three KPIs — Findings, Critical, Identities (§6.1) | Yes | **Yes** | `ThreatSummary.total_findings` / `critical_findings` / `identities_with_findings` |
| PTRACE stage cards with a finding count (§6.3) | Yes | **Yes, all six, including Probing at zero** | `ThreatSummary.stage_coverage` |
| Findings table, one row per finding (§6.4) | Yes, implied by "32 findings" | **Yes** | `ThreatService.list()` — see §1 point 5 |
| PTRACE filter, severity filter chips (§6.4) | Yes | **Yes** | `ThreatQuery.stage` / `.severity` |
| Export (§6.7, "assumed... flagged as unconfirmed") | Assumed | **Yes, CSV, one row per finding plus one per unavailable source** | `routes/threat-profile.ts`'s `toCsv` |
| Ownership's verdict travelling with the row (not specified) | No | **Yes, and mandatory**, plus exposure/impact/risk all quoted whole | `THREAT_VERSUS_RANKERS`; see §4.4 |

---

## 3. What this module is not

Nothing here is a fifth number a reviewer could put beside `exposure_score`, `worst_level`, or a
choke point's `access_removed`. `THREAT_VERSUS_RANKERS`, frozen in `domain/threat.ts` and carried
on every row via `why_factors_differ`, states the reconciliation plainly:

> Ownership severity ranks whether anyone is accountable for this identity and how urgently.
> Exposure ranks how much this identity could reach if it were misused. Choke points rank which
> single revocation removes the most access. Identity Risk Profile ranks nothing: it reports how
> many independent factors fired. This threat profile ranks nothing either — it translates
> whichever of those signals already fired into an attacker-stage narrative and a NIST-shaped
> impact/likelihood cell, so a reviewer reads one row as a translation of the other three, never
> as a fifth opinion about danger.

This is the fourth such sentence in the engine (`EXPOSURE_VERSUS_SEVERITY`, `IMPACT_VERSUS_EXPOSURE`,
`RISK_VERSUS_RANKERS`), and it is the one place a fourth surface's disagreement with the other
three is defused before a CISO has to ask which number is lying.

---

## 4. Implementation decisions

### 4.1 Probing — a named, measured, zero-coverage stage

PRD §4.1's row for Probing proposes "rising `risk_score` / `exposure_score` drift", citing a
`score_drift.flag: rising_fast` and an `exposure_delta.flag: rising_fast`. Neither field exists.
`identity-risk-profile-research.md` Amendment 4 and `identity-exposure-map-research.md`
Amendment 5 both killed the equivalent fields, for the same underlying fact: the graph is built
once from a frozen dataset at boot, there is no rebuild cadence, and "a trend computed from one
snapshot is a fabricated alarm — worse than a missing field, because it is actionable"
(`backend/src/routes/exposure.ts` L45-49, quoted verbatim in both prior research docs).

Access Discovery was also checked as a possible alternate source, since Probing's diagnostic
question ("is the attacker mapping accounts... before acting") sounds adjacent to path discovery.
It is not: `access/classify.ts` classifies the *shape* of a path an identity already has
(direct/indirect/hop), never enumeration volume or scan frequency, and no provider surface this
engine ingests from records one either.

**Resolution:** Probing ships as a real, named, zero-coverage member of `PtraceStage`, present in
`PTRACE_REFERENCE` (so its stage card renders with its MITRE tactics — Reconnaissance,
Discovery — and its diagnostic question) but backed by no rule in `DEFAULT_THREAT_MAPPING_RULES`.
`PROBING_COVERAGE_GAP`, exported from `threat/mapping.ts`, is the one frozen sentence explaining
why, for a UI to render next to the zero rather than have to guess.

**Measured on the seed dataset:** `stage_coverage` reports Probing at **0 findings, 0
identities**, out of 128 identities scanned. Every other stage is reachable: Trust Exploitation
16 findings, Rights Escalation 12, Account Spoofing 12, Concealment & Persistence 8, Exfiltration
& Lateral Movement 55 (dominant, because it is reachable from three independent rules — the hop
pivot, the identity pivot, and realized exposure). Total: 103 findings across 36 of 128
identities, 73 rated `critical`.

### 4.2 Concealment & Persistence — translated from the fields that replaced the deleted array

PRD §4.1's row for this stage names `flags: ["orphaned_creator", "high_fanout", "deep_chain"]` off
Delegation Chain. `domain/lineage.ts` L421-424 states in writing that this array does not exist:
"there is no `flags` array of `deep_chain` / `high_fanout` / `orphaned_creator` / `unlinked`" —
replaced by `LineageRow.creator_status` (`'departed' | 'active' | 'role_changed' | 'not_a_person'
| 'unknown'`), `self_authorized: boolean` (the AC-2(e) join), `creator_privilege_mismatch:
boolean`, and `fan_out_exceeds_baseline: boolean` (rate against the actor's own trailing median,
never a lifetime count — `deep_chain` specifically was deleted because the seed's own maximum
generation is 3 against a proposed threshold of >4, per `graph/build.ts` L101-105).

`CREATOR_LINEAGE_RULE` fires when any of the four replacement fields is true, and states which
in its evidence sentence rather than folding them into one opaque flag — an identity whose
creator departed reads differently from one that is self-authorized, and a reviewer should be
able to tell which from the row alone. Measured: 8 findings, 8 identities.

### 4.3 Staleness — the second field declined a fourth time

`ThreatStaleness` carries `based_on_access_discovery_snapshot` and `computed_at`, and nothing
else. `stale_if_older_than_hours` is declined for the fourth time in this engine
(`domain/exposure.ts` L280-282, `RiskStaleness`, `ImpactStaleness`, and now this) for the same
reason each time: it is a deployment policy, not a fact about a snapshot, and this module has no
rebuild cadence of its own to state one against — if anything it is *staler* than all three
siblings, since it is a join over their joins rather than a primary computation.

One deliberate simplification against `RiskStaleness`: this module has no `stalest_input`
tracker. Every upstream port this module reads (`exposure`, `impact`, `risk`) is itself already
dated by `based_on_access_discovery_snapshot`, and — unlike Risk Profile's six independently-aged
lifecycle tables — none of Threat Profile's translations reads a table with its own clock. A
`stalest_input` field here would always resolve to the one snapshot date this module has, which
would be a fact restated rather than a fact disclosed.

### 4.4 The matrix — NIST's shape, chosen and cited rather than assumed

See §1 point 3 for the verdict. The specific tables:

- **Impact** ← `EXPOSURE_BAND_TO_IMPACT[ExposureAssessment.band]` (quoted), escalated one level,
  capped at `very_high`, when the identity appears in `ChokePointReport.candidates[].held_by` —
  the real, already-computed "this grant is a choke point" fact from `impact/choke.ts`, never a
  new score. `no_paths` maps to `very_low` (a real, evaluated "reaches nothing" answer);
  `no_classified_permissions` maps to **unavailable** (architecture rule 9 — nobody has assessed
  this identity's footprint at all, and that is a different claim from a footprint of zero).
- **Likelihood** ← `RISK_LEVEL_TO_LIKELIHOOD[RiskAssessment.worst_level]` (quoted), bumped one
  level, capped at `very_high`, once `factors_firing >= 3` — reusing
  `identity-risk-profile-research.md` §9's own "three or more factors firing is the week's list"
  threshold rather than declaring a fresh one. `no_findings` maps to `very_low`; `partially_
  evaluated` maps to **unavailable**.
- **The 25-cell band matrix** is an explicit, ordered table (`SEVERITY_BAND_MATRIX`), never
  `impactIndex + likelihoodIndex` arithmetic — NIST SP 800-30 Rev 1 Table I-2's own justification
  ("this guideline does not specify algorithms for combining semi-quantitative values... [the
  exemplary table] combines... by lookup matrix rather than arithmetic") is the same citation
  `identity-risk-profile-research.md` §4.2 already used against a weighted sum, applied here to
  the two-axis case instead of the six-factor one. Band *names* (Desirable through Catastrophic)
  are kept in the PRD's own words (§6.2), since that is this product's already-established output
  label — distinct from the two NIST-named axis vocabularies feeding it.

**A scope limitation, stated rather than hidden.** PRD §4.2 describes Impact as derived from "the
finding's underlying resource/identity sensitivity" — implying a per-*finding* signal. This engine
has no resource-sensitivity signal finer than `ExposureAssessment`, which is scored per
*identity*. Likelihood is the same: `RiskAssessment` is per-identity. Rather than inventing a
per-finding sensitivity or likelihood this engine does not measure, every finding translated for
one identity in one service call shares that identity's single quoted Impact/Likelihood cell.
This is measured and stated here rather than smoothed over in code — `threat/service.ts`'s header
comment carries the same note for a future implementer who adds a per-finding signal and should
know where the simplification lives.

### 4.5 Groups — refused outright, a stronger position than Exposure's own split

`identity-risk-profile-research.md` §8 leaves open issue "A/A*" — `exposure.profile()` scores all
12 groups while `.list()` returns none, an inconsistency inherited by anything that quotes
Exposure. Identity Threat Profile does not inherit it: `ThreatService.profile()` returns
`unknown_identity` for a group unconditionally, and `list()`/`summary()` filter groups out of the
population before any port is even called (mirroring `AccessService`/`RiskService`'s own
`identity.type !== 'group'` filter, architecture rule 12). A PTRACE narrative about a *permission
container* rather than a principal is not a coverage gap worth reporting — it is a subject this
module was never asked about, and the PRD's own worked example is about a person, never a group.

---

## 5. Detection logic — the registry, in precedence order

| Rule | Source | Stage(s) fired | Condition |
| --- | --- | --- | --- |
| `HOP_ACCESS_RULE` | `access/classify.ts` | Rights Escalation + Trust Exploitation (unconditional); + Exfiltration & Lateral Movement (conditional) | Any hop path; the third stage only if the same `via_permission` is also an `ImpactPivot` |
| `CHOKE_POINT_RULE` | `impact/choke.ts` | Rights Escalation | Identity directly holds a choke-point permission not already the reported hop |
| `PIVOT_RULE` | `impact/service.ts` | Account Spoofing + Exfiltration & Lateral Movement | `ImpactAssessment.kind === 'propagates'` with at least one pivot |
| `EXPOSURE_REALIZED_RULE` | `exposure/score.ts` | Exfiltration & Lateral Movement | Band `extensive` or `substantial`, with a non-null `highest_sensitivity_reached` |
| `CONTROL_DRIFT_RULE` | `risk/summarize.ts` | Trust Exploitation | A `control_drift` finding present on the identity's `RiskAssessment` |
| `CREATOR_LINEAGE_RULE` | `lineage/signals.ts` | Concealment & Persistence | Any of `creator_status === 'departed'`, `self_authorized`, `creator_privilege_mismatch`, `fan_out_exceeds_baseline` |

Registry order is precedence (architecture rule 3): a seventh rule is a new array element in
`DEFAULT_THREAT_MAPPING_RULES` and a test in `threat/mapping.test.ts`, never a rewritten
comparison chain. Each rule is a pure function over a `ThreatMappingContext` assembled once per
identity — no traversal, satisfying architecture rule 1 trivially, the same way `risk/factors.ts`
does one module earlier.

---

## 6. Output shapes

`ThreatFinding` — one row, one `ptrace_stage` (never a list — §1 point 4), one MITRE tactic and
technique, its evidence sentence, which upstream file it was translated from, and a `cell` that
is `null` exactly when this identity's upstream verdicts could not back an axis.

`ThreatAssessment` — the same three-armed shape as `RiskAssessment`: `findings` (one or more),
`no_findings` (every axis source was actually evaluated and nothing translated), and
`partially_evaluated` (naming which of `access/classify.ts`, `exposure/score.ts`,
`risk/summarize.ts` had no verdict to quote — see `unavailableSourcesFor`).

`ThreatProfile` — the per-identity drawer, carrying `ownership` (quoted `ExposureOwnershipContext`)
plus `exposure`, `impact`, `risk` (each the whole quoted union, namespaced, `null` when that port
has no verdict) — extending `RiskProfile`'s own "carry the numbers you are not replacing" pattern
to all three sources a threat row reads, not just one.

`ThreatSummary` — `stage_coverage` (all six stages, Probing included at zero), `matrix` (all 25
cells, always), `unplaced_findings` (a named count, never folded into a cell's zero), and the
three PRD §6.1 KPIs. Coverage and matrix are ordered first in the payload, matching
`RiskSummary`'s and `ExposureSummary`'s own "the gate publishes before the ranking" convention.

`ThreatFindingRow` — `list()`'s actual return shape: a `ThreatFinding` with the identity's name,
type and app inlined, because PRD §6.4's table is finding-first (see §1 point 5).

---

## 7. Tests

- `threat/mapping.test.ts` — every rule against hand-built contexts (the split
  `identity-risk-profile-research.md` established between "the estate's numbers" and "the rule's
  logic," applied here): each rule's `applies`/`evaluate` boundary, the dedup between
  `HOP_ACCESS_RULE` and `CHOKE_POINT_RULE`, the `impactFor`/`likelihoodFor`/`severityFor` lookup
  tables at every boundary value, and a registry-wide sweep proving no rule ever emits a Probing
  finding while every other stage is collectively reachable. 23 tests.
- `threat/service.test.ts` — the full stack wired exactly as `backend/src/server.ts` wires it;
  byte-identity guards asserting the quoted `exposure`, `impact`, `risk` and `ownership` subtrees
  on every row equal what each upstream service's own `.profile()`/`.classify()` returns,
  verbatim; the coverage-before-KPIs ordering; the matrix's 25-cell invariant; and the numeric
  score-leak guard (§8, below). 18 tests, plus the guard.
- No `data/seed-threat.test.ts` — this module adds no dataset table and no fixture; every fact it
  reads is already pinned by `seed.test.ts`, `seed-exposure.test.ts`, `seed-impact.test.ts` and
  `seed-risk.test.ts`, so a seed change already fails in the file that owns the number.

---

## 8. The score-leak guard, and its one named exception

Every sibling module's guard (`access/classify.test.ts`, `exposure/service.test.ts`,
`impact/service.test.ts`, `risk/service.test.ts`) forbids the key `band` among others, because
none of those modules are supposed to author one. This module's guard cannot forbid it: PRD §6.2
*is* a band, published by the frozen `SEVERITY_BAND_MATRIX` lookup, never arithmetic, and it is
this PRD's own explicit deliverable — forbidding it would be forbidding the module, not enforcing
discipline. `threat/service.test.ts`'s guard instead forbids exactly the numeric vocabulary no
lookup table produces — `risk_score`, `exposure_score`, `impact_score`, `likelihood_score`,
`exploitable_risk_score`, `weighted_sum`, `peer_percentile`, `score_drift`, and any key ending in
`_score` — while exempting the four quoted subtrees (`ownership`, `exposure`, `impact`, `risk`)
from the walk entirely, asserted byte-identical against each upstream service in a separate test
immediately above the guard.

---

## 9. Open questions carried forward, and PRD questions this document closes

**Closed:**
- §8's multi-stage question — closed by construction (§1 point 4).
- §8's impact/likelihood formula question — closed as a five-valued NIST-shaped lookup, not a
  1-5 integer arithmetic mapping (§4.4).
- §8's PTRACE naming question — not revisited here; this document documents the built stage
  names in full words (`PtraceStage`), leaving the acronym question to product naming, which is
  outside this module's engineering scope.

**Still open:**
- §8's findings-table column question is answered by `ThreatFindingRow`'s actual shape (§6), but
  the *frontend* contract against `dashboard-demo`'s existing mock (a separate fixture, untouched
  by this work) has not been reconciled — that mock's `mitreFindings` array predates this service
  and uses a different id scheme (`mf-XXX` vs `threat:<id>:<stage>:<ref>`). Reconciling them is a
  frontend task, not logged here as a backend gap.
- Whether a future per-finding resource-sensitivity signal (rather than per-identity) should
  split Impact away from the current identity-level sharing (§4.4's scope limitation) is left for
  whichever module first needs finer granularity than `ExposureAssessment` publishes today.
