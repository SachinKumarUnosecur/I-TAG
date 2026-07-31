# Identity Risk Profile — Implementation Research

> **Lens:** Principal Backend Engineer + CISO, Unosecur
> **Scope:** `identity-risk-profile-prd-v2.md` (Draft v2, doc owner Harsha, not yet in the repo) — the six weighted factors, the 0–100 `risk_score`, peer percentile, score drift, the per-factor staleness object, and the explainability drawer — evaluated against provider reality, the composite-indicator literature, auditor expectations, and the engine as built.
> **Companions:** [`ITAG.md`](./ITAG.md), [`PRD-access-discovery.md`](./PRD-access-discovery.md), [`PRD-identity-exposure-map.md`](./PRD-identity-exposure-map.md), [`PRD-delegation-chain.md`](./PRD-delegation-chain.md), [`identity-exposure-map-research.md`](./identity-exposure-map-research.md), [`unified-impact-analysis-research.md`](./unified-impact-analysis-research.md), [`delegation-chain-research.md`](./delegation-chain-research.md), [`orphaned-identity-research.md`](./orphaned-identity-research.md)
> **Status:** research output, Aug 2026
> **Repo state at time of writing:** `8f0e170`, clean tree, 259/259 core tests passing, `tsc -b core backend` clean. All measurements at `ITAG_NOW=2026-07-31T00:00:00Z`. `origin/feat/identity-risk-profile` is at `2cf7ebf` — the PR #2 merge, behind `main`, **no module work on it**.
>
> **This document wins over the PRD where the two conflict**, on the same footing as
> `delegation-chain-research.md` §1. Every override below names the PRD line it overrules
> and why it loses. Amendments 1–5 are written out in full in §4.6.

---

## 1. Executive summary

1. **Three of the six factors are `ITAG.md` F9 and F10 — designed eighteen months ago, with their data tables already in the seed — and the PRD sources them from provider APIs and two PRDs that do not exist.** §F9 (L109-134) specifies a trust score with a baseline of 100, per-control deductions where "MFA disabled = high impact", and a time multiplier for an exception "still active 90+ days later"; it publishes the `control_history` schema verbatim. §F10 (L136-161) specifies comparing a grant's age against a historical `median_days_to_actual_need`. Both tables exist: `control_history` (`domain/types.ts` L186-189), `grant_half_lives` and `grant_records` (L191-206), all three wired into `IdentityDataset` (L233-235). `ITAG.md` L244 even names the route — `GET /trust-score/:id`. **This is the most expensive finding to act on late**, for the same reason it was in `identity-exposure-map-research.md` §1.1: the PRD's §4.1 tells an engineer to build an IdP connector for MFA status and to wait on an Access Reviews PRD for a review date, when the answer is three seeded tables and two written specs. Read `ITAG.md` before writing a line of this module.

2. **Under the PRD's own default weights, this estate contains zero Critical identities, and `user-jane` scores 57 rather than 84.** Computed over all 127 non-group identities: maximum 75, median 25, minimum 3. The Critical band (§6.1's "80+") is **empty**; the Risk Band filter's red chip matches nothing. Only 33 distinct values exist across 127 rows and **42 identities share the single value 8**, drawn from three distinct factor profiles. The PRD's own worked example — Jane at 84, "a number that, on its own, would already flag Jane for review" — lands two bands lower and tenth in the table. A score whose top band is unreachable and whose bottom third is a 42-way tie is not a prioritization tool; it is a sort key with 33 states.

3. **Compensatory dilution is measurable on our own data, and it is fatal.** An identity whose only signal is a live hop path to `aws:account-root` — the finding Access Discovery exists to produce, weighted most heavily at 0.30 — scores **29, band Low**. An identity that is unremarkable on all five other factors and has **no hop path at all** scores **28**. One point apart. The named cases are worse: `user-maya`, exposure #1 at 97 and the identity `identity-exposure-map-research.md` §1.3 fought to seed, falls to composite rank **62 of 127**; `user-heidi` (exposure 83) to rank **64**. This is not a tuning problem. The OECD/JRC *Handbook on Constructing Composite Indicators* states it as a property of the arithmetic — "an undesirable feature of additive aggregations is the implied full compensability… two countries, one with values 21, 1, 1, 1, and the other with 6,6,6,6, would have equal composites" — and states the test for when linear aggregation is *unsuitable*: when the analyst judges that a gain on one dimension cannot compensate a loss on another. Live administrative hop access is exactly that kind of property.

4. **The engine already rejected weighted-sum ranking once, in writing, in its first ranking authority — and the PRD's key names are already in two banned-key lists.** `ownership/severity.ts` L20-22: "Age alone cannot rank a queue: an ancient orphan that reaches nothing is not the one to work on first. Sensitivity is what turns 4,000 rows into the seven that matter, so it dominates, and time only breaks ties within a band." That is a non-compensatory lexicographic rule, and it is the shipped precedent. Meanwhile `impact/service.test.ts` L117 forbids the literal key **`risk_score`**, and `exposure/service.test.ts` L590 forbids **`rising_fast`**, **`flag`** and **`trend`** — the PRD's §4.3 score object uses `"flag": "rising_fast"` verbatim. That test's own comment says why it exists: "the pressure to add it back comes from a PRD section that is still in the repo." Three modules have now been asked to publish a fabricated trend, and three have refused.

5. **Sixteen of the composite's top twenty rows are already surfaced by the two shipped rankers, and the four that are not include the only two rows worth the module.** The union of Exposure Map's top 20 and the full 24-row ownership queue is 38 identities; the composite's top 20 is contained in it 16 times over. The genuinely net-new rows are `svc-ci-runner` (exposure 25) and `svc-invoice-poster` (exposure 19) — both hold live hop paths that Exposure Map's weighting scores low because the *terminal* permission is unremarkable. That is a real gap and it is exactly two identities wide. Meanwhile the composite demotes what the shipped rankers promote: `svc-vpn-legacy`, ownership queue rank 1 and the demo's opening beat, falls to composite rank 9; `user-bob` (queue rank 2, critical) to 45; `user-carol` (queue rank 5, critical) to 60.

6. **Three factors cannot be populated, and the reason is provider architecture rather than an unseeded field.** Credential hygiene: no vendor documents an MFA, passwordless or authenticator-strength signal for any machine identity, and AWS's credential report "lists **all users in your account**" with no role coverage at all — for 107 service accounts the signal is not weak, it is structurally absent. Trust decay: Entra is the only provider that records a durable attestation object naming a service principal, and its own reviewer recommendation is computed "based off last interactive sign-in to tenant", which a service principal never performs; AWS, GCP and Kubernetes record nothing. NIST SP 800-63-4 closes the door explicitly — "'person' refers only to natural persons" — so the AAL argument for "no MFA" covers 14 of our 139 identities and none of the other 125. Dormant privilege: `GrantRecord` (L200-206) carries `granted_at` and no `last_used`, and the estate's actual idle telemetry (`last_activity_at`, 104 of 127 identities) has a **median of 2 days**, with five identities idle beyond 90.

7. **"95th percentile (human)" is arithmetically the maximum, and the PRD's own example cannot be produced.** The estate is 14 humans, 107 service accounts, 6 AI agents. NIST/SEMATECH: "any p ≥ N/(N+1) will simply be set to the maximum value." At N = 14 that boundary is 0.9333, so the 95th percentile of the human cohort *is* the highest-scoring human. For the 6 AI agents one rank step is 16.7 percentile points and there are 3 distinct scores among them. Only the service-account cohort supports the field at all. Separately, the seed's oldest review is 240 days, so the PRD's "340 days since her last access review" is not reproducible either.

8. **Verdict: (c) — a data producer and a join, not a third identity ranker.** Strip the composite (delete), the peer percentile (delete), the score drift (already banned), the `stale_if_older_than_hours` key (already refused), and the three unpopulatable factors (two are F9/F10 under other names, one is provider-impossible), and what survives is small, novel, and already the demo's opening argument: **a per-identity factor-finding set with a non-compensatory worst-level and a count of how many independent factors fired.** Built that way over the existing tables, six identities in the estate have three or more factors firing, `svc-vpn-legacy` returns to rank 1 with four, and 77 identities honestly report nothing. That is `ITAG.md` §F9 plus a join, it authors no new 0–100 number, and it survives architecture rule 8 without an exception.

---

## 2. As-built vs as-specified

The interesting result here is unlike either sibling: about a third of this module is built under other names, another third is *specified* in the founding document and unbuilt, and the last third cannot be built at all.

| Item | Specified (PRD) | Built | Evidence |
| --- | --- | --- | --- |
| Exposure factor — consume `exposure_score` (§4.1) | Yes | **Yes, consumable today** | `exposure/score.ts`; 105 of 127 scored |
| Hop-access factor — consume `path_type=hop` (§4.1) | Yes | **Yes, consumable today** | `access/classify.ts`; 21 hop paths over 11 identities |
| Ownership factor — "provisional, pending Identity Ownership PRD" (§4.1, §5, §8) | Yes | **Yes, and the PRD is wrong that it isn't** | `core/src/ownership/` — 10 modules; `docs/orphaned-identity-research.md` |
| Trust-decay factor — "provisional, pending Access Reviews PRD" (§4.1, §5, §8) | Yes | **Partly, and specified as `ITAG.md` §F9** | `EmployeeRecord.last_reviewed` (`domain/types.ts` L109-110); `control_history` L186-189 |
| Credential-hygiene factor — MFA, key age, rotation (§4.1) | Yes | **`control_history` covers 4 identities; no MFA/key-age field exists** | `ControlEvent` L177-184; measured 4 entries, 6 events, all service accounts |
| Dormant-privilege factor — `effective_permissions` + usage telemetry (§4.1) | Yes | **No usage data. `granted_at` only, and it is `ITAG.md` §F10** | `GrantRecord` L200-206; `GrantHalfLife` L192-197 |
| `effective_permissions` as the dormancy input (§4.1, §5) | Yes | **No, and deliberately never** | `domain/access.ts` — `reachable_permissions`; architecture rule 13; Exposure Map Amendment 2 |
| Normalize each factor to 0–100 (§4.2 step 2) | Yes | No — three of six have nothing to normalize | §4.3 below |
| Weighted linear sum, capped at 100 (§4.2 steps 3-4) | Yes | **No, and should not be built** | §4.2; architecture rule 8 |
| `risk_score` 0–100 (§4.3) | Yes | **No — the key is already forbidden in `impact/`** | `impact/service.test.ts` L117 |
| Peer percentile (§4.2 step 5, §4.3) | Yes | **No, and unsupportable at n=14 and n=6** | §4.4 |
| Score drift / `delta_7d` / `rising_fast` (§4.2 step 6, §4.3, §6.3) | Yes | **No, and banned by a shipped test** | `exposure/service.test.ts` L590; Exposure Map Amendment 5 |
| 90-day historical trend line (§6.4) | Yes | **No — one frozen dataset at boot** | same; `control_history` is per-identity, not per-snapshot |
| `staleness.based_on_access_discovery_snapshot` (§4.4) | Yes | **Yes, verbatim, and it anticipated this module** | `domain/exposure.ts` L274 |
| `staleness.stale_if_older_than_hours` (§4.3, §4.4) | Yes | **No, and deliberately refused** | `domain/exposure.ts` L280-282 |
| `stalest_input` / `partially_stale` (§4.4) | Yes | No — **and this is the PRD's best original idea** | §4.5 |
| Bands named Critical / High / Medium / Low at 80/60/30 (§6.1, §6.2) | Yes | **No, and refused once already** | Exposure Map Amendment 8; `EXPOSURE_BAND_FLOORS` |
| "Partial" badge on a diluted row (§6.6) | Yes | **No — the engine uses a discriminated union instead** | `ExposureAssessment` L202-234; `OwnershipState` L13-29; architecture rule 9 |
| Per-factor breakdown shipped with the score (§4.3, §6.4) | Yes | **Yes, as a shipped pattern to copy** | `exposure/service.test.ts` L245, L318 |
| Ownership verdict travelling with the score (not specified) | No | **Yes, and mandatory** | `EXPOSURE_VERSUS_SEVERITY` (`domain/exposure.ts` L245-249); test at L341 |

**Consequence for planning.** Two factors are free reads. Two more are `ITAG.md` F9/F10 over tables that already exist — a day's work each, and the founding document already wrote their scoring logic. Two of the PRD's headline outputs (`risk_score`, `score_drift`) are forbidden by shipped tests, and one (`peer_percentile`) is arithmetically empty at this scale. The only net-new engineering worth doing is the join and the non-compensatory rule in §5.

**One correction to a claim in the source PRD.** §4.4 states that this module "extends the shared product-wide convention (same base key names: `based_on_access_discovery_snapshot`, `stale_if_older_than_hours`)". There is no such shared convention for the second key. `domain/exposure.ts` L280-282 declined it in writing — "it is a deployment policy, not a fact about this snapshot, and there is no rebuild cadence to state one against" — and `unified-impact-analysis-research.md` §2 already issued this same correction to the previous PRD that copied it. This is the third PRD to assert a convention that was never adopted.

---

## 3. What the outside world calls this

### 3.1 Terminology — the name is available, but `risk_score` is not

"Identity Risk Profile" is not a term of art, but unusually it does not collide with one either. The category's own vocabulary splits three ways: Microsoft ships **user risk level** and **sign-in risk level** (categorical, never numeric) plus a separate per-tenant **Identity Secure Score**; Okta ships **entity risk**, **session risk** and **login risk**; SailPoint ships **identity outlier score**; Veza ships a per-entity **risk score**; CrowdStrike ships a **Falcon Zero Trust Risk Score**. Nobody calls this an "identity risk profile", so the name is free.

The *field* name is not. `impact/service.test.ts` L117 lists `risk_score` in a forbidden-key array, and the guard's premise — "nothing this module authors is a score, a rank or a band" — was written with this module's output in mind. There is also a live collision inside the founding document: `ITAG.md` uses **trust score** for the F9 quantity, and F9 is three of this PRD's six factors.

**Recommendation:** name the module **Identity Risk Profile** and name its output `factor_findings` plus `worst_level` and `factors_firing`. Do not introduce a `risk_score` field. If a single quantity is unavoidable, call it `trust_score` per `ITAG.md` §F9 and scope it to the control-drift factor alone, where the founding document already defined it and a baseline of 100 gives it a meaning that a fused composite does not have.

### 3.2 Provider reality — the empirical core of this document

The question is not "can these six signals be collected" but "for *which identities*, at what granularity, and with what silently-excluded population". The answer separates the three access-derived factors, which are fine, from the three lifecycle factors, which are not.

| Factor | Provider mechanism | Granularity | Window / retention | Documented caveat (quoted) |
|---|---|---|---|---|
| Dormant privilege | AWS IAM Access Advisor (`GenerateServiceLastAccessedDetails`) | Service-level for all services; action-level for a published subset only | "at least 400 days"; action tracking began S3 2020-04-12, EC2/IAM/Lambda 2021-04-07, all others 2023-05-23 | "Action last accessed information is **not available for any data plane event**." · "The `iam:PassRole` action is not tracked." · Excludes resource-based policies, ACLs, SCPs, permissions boundaries and session policies |
| Dormant privilege | AWS IAM Access Analyzer unused access | Unused roles, permissions, user access keys, user passwords | `unusedAccessAge` "between **1 and 365** days" | "**Service-linked roles are not analyzed by unused access analyzers.**" · Only evaluates entities that "**have existed for the entire tracking period**" — at 90 days, every identity younger than 90 days is silently absent |
| Dormant privilege | GCP IAM recommender | Permission use rolled into role recommendations | "maximum observation period… is **90 days**"; minimum settable to 30/60/90 | Ignores "access control lists (ACLs) and Kubernetes role-based access control (RBAC)" · No insights "for conditional role bindings" · "For service agents… **only** provides recommendations for basic roles" |
| Dormant privilege | Azure PIM / sign-in logs | Role *activation*, not permission use | Sign-in logs **7 days** (Free), **30 days** (P1/P2) | "Azure stores up to seven days of activity data for a free version" and "Log retention changes aren't retroactive" — a 90-day dormancy claim is not computable on P1 |
| Dormant privilege | Kubernetes | — | — | **No public documentation found.** No last-used field on any RBAC object; the audit log is opt-in and is a request stream |
| Credential hygiene | AWS `GetCredentialReport` | Per-**IAM-user** CSV row | Regenerable "once every four hours" | "lists **all users in your account**" — **there is no role coverage.** Also only "the first two access keys per user" |
| Credential hygiene | Entra Graph `userRegistrationDetails` | Per-**user** booleans | `lastUpdatedDateTime` per record | `authenticationMethod` is "registered to a **user**" · "doesn't work for disabled users" · **no service principal or managed identity equivalent on this surface** |
| Credential hygiene | GCP `serviceAccounts.keys.list` | Per-key `validAfterTime` | "By default, service account keys **never expire**" | Expiry-cap org policy "is **not retroactive** and will not change pre-existing keys" · **no MFA concept for service accounts is documented** |
| Trust decay | Entra access reviews (`accessReviewInstanceDecisionItem`) | Per principal-to-resource decision, with `reviewedBy` / `reviewedDateTime` | Not published | "Principals can be of two types - `userIdentity` and `servicePrincipalIdentity`" — **but** the system recommendation is "based off **last interactive sign-in** to tenant", which a service principal never has, and `accessReviewInactiveUsersQueryScope` is **users only** |
| Trust decay | AWS / GCP / Kubernetes | — | — | **No public documentation found** for any native attestation record. AWS assigns it to the customer as process: "Implement regular access reviews…" |

**Three findings follow, and the first two are fatal to a factor each.**

First, **credential hygiene for a machine identity is key age and last-authentication time, and nothing else.** Across all four providers, no MFA, passwordless, or authenticator-strength signal exists for a service account, service principal, managed identity or agent. This is the exact inverse of the seed, where all four `control_history` entries are service accounts with `mfa_enabled: disabled` — a defensible demo fiction, but the PRD's §5 claim to source this from "AWS IAM, Azure AD, Okta, GCP IAM, Kubernetes, SaaS admin consoles" is aspirational for 125 of our 139 identities and should be marked so.

Second, **the "not yet standardized field" framing in §4.1 is backwards for trust decay.** Entra *does* record a durable, queryable attestation object that can name a service principal — so the PRD's premise that no field exists is too pessimistic — but it records it only for privileged directory and Azure-resource role assignments, only under an ID Governance licence, and with the automated recommendation degraded to `NoInfoAvailable` for exactly the population we care about. The accurate statement is narrower and more useful than either the PRD's or the obvious guess.

Third, **the dormancy exclusions are silent, which is worse than absent.** Access Analyzer omits service-linked roles and anything younger than the tracking period; Access Advisor omits data-plane events and `iam:PassRole`; the GCP recommender omits conditional bindings and non-basic roles on service agents. Each produces *absence of findings*, not a flag. A "0 unused permissions" sub-score of 0 would therefore be indistinguishable from "this identity was never analyzed" — which is architecture rule 9 territory before a single line is written.

### 3.3 Compliance mapping — control ID to emitted artifact

Controls that cannot be tied to a field this module emits are dropped, per `delegation-chain-research.md` §3.3. The result is that a *scoring* module maps to fewer controls than the per-identity detectors it consumes, and the controls it does reach demand a **record**, not a number.

| Control | Text (abridged, from the control itself) | Emitted artifact that is the evidence |
|---|---|---|
| **NIST SP 800-53r5 AC-2(3)** | "Disable accounts within [time period] when the accounts: (a) Have expired; (b) Are no longer associated with a user or individual; … (d) Have been inactive for [time period]." | The best fit in the catalogue, and it maps to **two separate factors on two separate clauses**: ownership state answers (b), `last_activity_at` answers (d). Emit them as distinct fields — a blended score evidences neither clause. |
| **NIST SP 800-53r5 AC-6(7)** | "(a) Review [frequency] the privileges assigned to [roles and classes] to validate the need for such privileges; and (b) Reassign or remove privileges, if necessary…" | The grant-staleness factor with its underlying grant list, ages, and half-life class. **Only clause (a) comes free**; (b) requires a per-privilege disposition, which `ownership/dispositions.ts` already models and this module should reuse rather than reinvent. |
| **NIST SP 800-53r5 IA-5** | "Manage system authenticators by: a. Verifying… the identity of the individual, group, role, **service, or device** receiving the authenticator; … f. Changing or refreshing authenticators [time period **by authenticator type**]…; i. Changing authenticators for group or role accounts when membership changes." | The control-drift factor's event list with per-event age. This is the correct anchor for the 125 non-human identities *instead of* SP 800-63B, because IA-5 names service and device recipients explicitly. Note (f)'s "by authenticator type": a single global 0–100 hygiene number cannot evidence it. |
| **NIST SP 800-53r5 CA-7** | "a. Establishing the following system-level metrics to be monitored: [metrics]; b. Establishing [frequencies] for monitoring…; g. Reporting the security and privacy status… [frequency]." | The frozen factor registry itself, as named metrics with defined measurement rules. CA-7(a) is the one control whose text is literally "we publish a defined metric on a defined cadence" — and it requires the definitions be frozen, not silently retuned, which is the reciprocal of §8's weight-configurability question. |
| **NIST SP 800-53r5 RA-3** | "Conduct a risk assessment, including… Determining the likelihood and magnitude of harm from unauthorized access…"; document, review, disseminate, update on significant change. | The **persisted, versioned per-identity finding record** — factor values, the rule version, a timestamp, a run identifier. Maps only if retained: a live-only dashboard value evidences none of clauses (c) through (f). |
| **NIST SP 800-63B-4** | AAL1 "requires only single-factor authentication"; AAL2 requires "possession and control of two distinct authentication factors". | Per-identity attained AAL — **for the 14 human identities only.** SP 800-63-4 states "'person' refers only to natural persons" and excludes machine-to-machine authentication, so this cannot be claimed for the 107 service accounts or 6 AI agents. |
| **ISO 31000:2018 §6.4.3** | "Risk analysis should consider factors such as… complexity and connectivity; time-related factors and volatility…"; influences "should be considered, documented and communicated to decision makers." | Direct support for hop access (connectivity) and control drift (time-related) as *legitimate factors*, independent of how they combine — plus a disclosure duty that a bare number does not discharge. |

**Dropped, and why.** **RA-5** (Vulnerability Monitoring and Scanning) requires enumerating "platforms, software flaws, and improper configurations" against CPE/CVE-style standards; an identity risk score is not a vulnerability scan and claiming it is would be the compliance theatre this repo's other research docs refuse. **AC-6** requires *employing* least privilege — an enforcement act — where this module measures deviation; cite it as detective support at most, and never as evidence of the control. **PM-9** is an organisation-tier programme control: a scoring module can be *referenced by* a risk management strategy but cannot constitute one. **PCI DSS is deliberately unmapped in this document**: the SSC gates the standard behind a licence acceptance and the requirement text could not be retrieved from the primary source, so the numbers commonly attributed to periodic access review (7.2.4) and system-account credentials (8.6.x) are unverified here. `orphaned-identity-research.md` already maps PCI 8.2.6 from a licensed reading; this module should inherit that mapping rather than assert new requirement numbers.

**The methodological obligation, which is not a control but is the actual gap.** NIST SP 800-30 Rev 1 declines to specify a combination algorithm — "this guideline does not specify algorithms for combining semi-quantitative values" — and puts the burden on us: "If an organization-specific risk model is not provided… then part of this task is to specify the algorithms for combining values." It lists a weighted average as acceptable, which is the strongest cover the PRD's design has from any NIST text. But `max` is listed **first**, its own exemplary likelihood-and-impact combination (Table I-2) is a lookup matrix rather than arithmetic, and it states that "repeatability and reproducibility… are increased by the annotation of assessed values… and by the use of tables or other well-defined functions." The imperative sentence is "**Organizations make explicit the rules used.**" That document is what §5 is.

### 3.4 The canonical incident — Storm-0558, summer 2023

Four candidates were evaluated, and the field is narrower than it looks because **Colonial Pipeline is already claimed**: `orphaned-identity-research.md` §3.2 takes it ("a legacy VPN account belonging to a former employee — still enabled, no MFA") and §9 makes it that module's headline demo case. Capital One belongs to Exposure Map, Uber to Unified Impact Analysis, Midnight Blizzard to Delegation Chain. Colonial is also the weaker fit on its merits: of our six factors it fires dormancy and credential hygiene strongly, ownership weakly, and multi-hop **not at all** — which makes it an argument for MFA coverage reporting, not for a composite. The 2024 Snowflake-customer campaign (UNC5537) is dominated by one factor and spans ~165 organisations rather than one identity, so the per-identity framing breaks; keep it only for Mandiant's one-sentence articulation of the thesis, that the campaign was "not the result of any particularly novel or sophisticated tool, technique, or procedure."

**Storm-0558 is the incident whose shape is this module's shape, and the Cyber Safety Review Board states our counterfactual in its own voice.** The identity was a 2016 MSA token-signing key. Per the CSRB: it "was originally intended to be retired in March 2021, but its removal was delayed due to unforeseen challenges"; it was "supposed to have been inactive" and "no longer supposed to be signing new tokens", yet signed valid tokens in 2023. On the lifecycle: "Microsoft continued to rotate consumer MSA keys infrequently and manually until it stopped the rotation entirely in 2021 following a major cloud outage linked to the manual rotation process. While Microsoft had paused manual key rotation, it neither had, nor created, an automated alerting system to notify the appropriate Microsoft teams about the age of active signing keys in the consumer MSA service." The blast radius: forged tokens reached Exchange Online accounts "for 22 enterprise organizations, as well as 503 related personal accounts", and "the stolen 2016 MSA key in combination with the flaw in the token validation system permitted the threat actor to gain full access to essentially any Exchange Online account."

Then the sentence that makes this the right choice:

> "If Microsoft had not paused manual rotation of keys; if it had completed the migration of its MSA environment to rotate keys automatically; if it had put in place a technical or other control to generate alerts for aging keys, the 2016 MSA key would not have been valid in 2023."

A federal review board asserting that a control keyed to an ordinary configuration fact — credential age — would have removed the exposure before the breach. Five of our six factors have direct support, four of them strong: dormancy, credential hygiene, control drift, and blast radius, with ownership indirect.

**The honesty caveats, stated because the house style requires it.** The multi-hop factor would **not** have fired: the consumer-to-enterprise crossing was "a previously unknown flaw", a code defect no configuration scan could see. So the honest claim is that a composite of ordinary facts surfaces this identity for review; it does **not** correctly size the worst case. Second, the subject is a token-signing key at a hyperscale CSP, not a principal in an IdP, and that abstraction step should be owned out loud rather than glossed. Third — and this is why the counterfactual is unusually safe — Microsoft never determined how the key was stolen, so the CSRB's claim is about *standing exposure* rather than detection, which is precisely what a per-identity review queue addresses and which is far less vulnerable to a hindsight objection than "we would have caught the attacker."

**Attributed, not established.** The following are repeated everywhere and are **not** in the CSRB report: that ~60,000 State Department emails were taken (a State briefing to Senate staff, via Reuters); that "hundreds of thousands" of government emails were taken (Senator Wyden's letter, which itself sources it to "press reports"); that the key "had expired in 2021" (Wyden's phrasing — the CSRB says *intended to be retired*, which is materially different because "expired" implies an enforced lifecycle that did not exist); that the key was not in an HSM (Wyden's inference, framed as a question); that the key could sign far beyond email (**Wiz's** research, relayed by the CSRB as Wiz's conclusion). The crash-dump explanation must never be stated as fact: Microsoft published it, then "determined it did not have any evidence showing that the crash dump contained the 2016 MSA key." And **"nobody owned the key" is not a CSRB finding** — the support is indirect (removal "delayed", no alerting to "the appropriate Microsoft teams"), so it belongs in our voice as an inference, not in quotation marks.

### 3.5 Competitive reality — three of the usual pitches are shipped features, and one gap is real

| Claim | Verdict | Evidence |
|---|---|---|
| "A per-identity 0–100 composite with published bands" | **Not differentiated** | Veza publishes 0–100 per entity with exact thresholds — Critical ≥75, High 50–74, Medium 25–49, Low 10–24, None <10 — plus base scores per severity and four worked examples, in official docs |
| "We publish which factors contributed" | **Not differentiated — table stakes** | SailPoint names six factors with per-factor drill-down; Okta emits a `reasons` list in the System Log; CrowdStrike returns `riskFactors { type severity }`; Veza's Risks tab gives "full explainability" |
| "Decay / dismissal / remediation semantics" | **Not differentiated** | Entra ages out low-risk detections after six months and persists medium/high "until remediated or dismissed"; SailPoint publishes ignore/unignore with automatic re-detection |
| "Customer-configurable weights" | **Weakly differentiated** | Veza lets customers define the contributing factors as saved queries and set each one's severity. The narrow true claim is that nobody offers a *bounded, fixed* weighted factor set |
| "A published weight table you can reproduce the score from" | **Weakly differentiated** | SailPoint publishes a **signed** per-factor `importance` (−1.0 to 1.0) per identity via API, which is stronger than a fixed table. Veza's own worked examples say "approximately" |
| **"An explicit not-evaluated state, distinct from low risk, on the identity itself"** | **Genuinely differentiated** | Nobody ships it. Defender for Cloud's `Not evaluated` scores *recommendations against resources*; Identity Secure Score's `[Not Scored]` is *per-tenant*; Entra's `hidden` means licence-gated and `none` means no risk; Okta's enum is LOW/MEDIUM/HIGH with no null tier; Veza's `None (<10)` means no query matched; SailPoint only creates a record for detected outliers |

**The one defensible claim, and the awkward part: we already built it, twice.** The category treats absent signal as absent risk. This engine refuses that in both shipped rankers — `ExposureAssessment` is a three-armed union where `no_paths` and `no_classified_permissions` are structurally separate from a score (`domain/exposure.ts` L202-234), and `OwnershipState` carries `unknown` marked "Structurally separate from `unowned` and never counted as a finding". Architecture rule 9 is the general form. So the differentiator is not something this module invents; it is a house pattern this module must not break — and the PRD's §6.6 "Partial badge" **does** break it, because a badge on a row still lets a diluted number sort against fully-evaluated rows.

**Two things worth copying.** SailPoint's signed contributions are the single most transferable idea here: a factor that *argues against* a finding can be shown doing so, which a positive-only weight vector cannot. And SailPoint's own limitation is our second claim: it scores only detected outliers, so there is no answer for the other 99%. Universal coverage across all 127 non-group identities, with an honest not-evaluated state, is more durable than any number.

**Not verified, and therefore not claimed anywhere above:** CrowdStrike's product documentation is entirely login-gated, so its score scale is genuinely unknown (marketing says 0–10, two independent integration docs say 0–1 and 1–10), and `docs.wiz.io` was unreachable. Wiz is absent from this section rather than described from marketing.

---

## 4. Implementation insights

### 4.1 Insight #1 — Three factors are F9 and F10, so this module's first task is deletion, not construction

The PRD's credential-hygiene and trust-decay factors are `ITAG.md` §F9, which specifies more than the PRD does: a baseline of 100, severity-graded deductions ("MFA disabled = high impact, session timeout extended = low impact"), and a compounding time multiplier because "a 'temporary' exception that's still active 90+ days later loses additional points, since it signals the exception was never actually revisited." The dormant-privilege factor is §F10, which specifies comparing grant age against `median_days_to_actual_need` for the grant's class.

Both have seeded data, and the data is a demo, not a population:

| Table | Rows | Population | Measured |
|---|---|---|---|
| `control_history` | 4 identities, 6 events | **All four are service accounts** | `mfa_enabled: disabled` ×3, `conditional_access: exception_granted` ×2, `session_timeout: extended` ×1 |
| `grant_records` × `grant_half_lives` | 7 grants, 5 classes | **All seven are service accounts** | **All 7 are past `median_days_to_actual_need`**; 2 are past `median_days_to_revocation` |
| `employee_status.last_reviewed` | 14 records | Keyed by human identity id; `person_id` resolves for **0** identities | ages 12 / 29 / 240 days (min/median/max); **3** exceed 90 days |

Two consequences. First, **a detector that fires on 100% of its population is not a detector** — all seven grant records are past their need window, so an F10 factor as specified would flag every identity it can see. The discriminating threshold is `median_days_to_revocation`, which separates 2 from 7 and is the honest line. Second, `svc-backup` was seeded for this eighteen months ago: `ITAG.md` L342 describes it as having "clean, correctly-scoped direct grants but a decayed trust score (F9) — MFA disabled 4+ months ago and a 'temporary' exception that's still active". Measured at `ITAG_NOW`: MFA disabled 112 days ago, exception granted 90 days ago. The fixture is intact and nobody has consumed it.

### 4.2 Insight #2 — The weighted sum is not a tuning choice, it is the wrong operator, and the data proves it before the literature does

The measured compensatory result is in §1.3. The literature explains it, and the operative sentence is not about compensability but about what the weights *mean*: "weights in additive aggregations necessarily take the meaning of substitution rates (trade-offs) and do not indicate the importance of the associated indicator." So the PRD's 0.30 / 0.05 is not a statement that hop access matters six times more than credential hygiene. It is a declaration that **one point of hop access is exchangeable for exactly six points of credential hygiene, at every point in the range, for every identity** — which is a claim nobody in the room would defend if it were written that way.

There is a second, quieter defect. Linear aggregation requires preferential independence as a *necessary and sufficient* condition, and the Handbook notes that when it fails, "the dimension and the direction of the error are not easily determined, and the composite cannot be adjusted properly." Our factors visibly fail it: an unowned account is *why* privilege goes dormant and controls drift. `svc-vpn-legacy` is the proof — `owner_invalid`, MFA disabled 271 days, a "temporary" exception live for 167 days, and a VPN grant 1,914 days old. Those are not four independent observations; they are one organisational fact observed four ways. A weighted sum counts it four times and calls the result a composite.

**The measured sensitivity, which is what PRD §7 asks for and does not survive.** Retuning hop access from 0.30 to 0.20 and ownership from 0.20 to 0.30 — a ten-point move either way — retains only **12 of the top 20** and moves `svc-ci-runner` **45 places**. Equal weights retain 17 and move `user-dan` 41 places. The PRD's own success metric ("large swings from small weight changes would indicate the model is too sensitive to be trusted") fails on its own defaults.

**The precedent for the fix is not obscure.** The UNDP moved the Human Development Index off linear aggregation in 2010 and said in print why: geometric aggregation "addresses one of the most serious criticisms of the linear aggregation formula, which allowed for perfect substitution across dimensions." And FIRST's rule for a boolean signal that conflicts with a scalar is *override*, not weighting — "when a vulnerability appears on CISA KEV, treat it as actively exploited and prioritize accordingly, **regardless of EPSS score**." A 0.30-weighted hop-access factor that the other 0.70 can outvote is structurally the arrangement FIRST tells people not to build, and FIRST has a name for building it: **"Score Laundering."**

### 4.3 Insight #3 — The CVSS/EPSS/KEV defence the PRD family keeps reaching for does not cover this module

§2 of the PRD, and §1.7 of `unified-impact-analysis-research.md` before it, lean on the observation that FIRST publishes three unmerged numbers. The primary texts confirm the reading and then withdraw the comfort: those three survive as separate numbers precisely because they are in **three different units** — CVSS an ordinal severity rating, EPSS "a calibrated probability… the estimated likelihood that exploitation activity… will be observed… in the next 30 days", KEV a binary catalogue membership from which exploitability is "explicitly not considered as criteria for inclusion".

`exposure_score` and a `risk_score` are not that. They are two 0–100 ordinals over the same population — identities — in adjacent columns, one of which contains the other as 20% of its own value. FIRST's stated condition for legitimate aggregation is that "the inputs share a unit and the combining function is derived from the semantics of that unit"; its one sanctioned aggregation is `1 − ∏(1 − p)`, which is derived from what a probability means. Nothing derives a weighted mean of six heterogeneous 0–100 scales from what any of them mean.

One correction worth recording because it circulates in this repo: CVSS v4.0 did **not** abandon v3.x's formulas because they were "unintuitive" or "abstract". That phrasing appears nowhere in the specification or user guide. The stated reasons are cardinality (15 million vectors against 101 available scores), conserving volunteer expert effort, and backwards compatibility with v3.x band boundaries — and v4.0 still publishes a single number, now traceable to a documented Elo-based expert elicitation over 270 equivalence classes. Do not cite it as a precedent for abandoning scoring.

### 4.4 Insight #4 — `peer_percentile` is a maximum with a decimal point, and `score_drift` is Exposure Map Amendment 5 for the third time

Measured cohort sizes and what a percentile costs in each:

| Cohort | n | Distinct scores | One rank step | 95th percentile is… |
|---|---|---|---|---|
| `human` | 14 | 13 | **7.1 percentile points** | the maximum — NIST's boundary is N/(N+1) = 0.9333 |
| `ai_agent` | 6 | **3** | **16.7 percentile points** | unreachable; the grid is {14.3, 28.6, …, 85.7} |
| `service_account` | 107 | 23 | 0.9 points | genuinely interpolable |

NIST/SEMATECH states the rule — "any p ≥ N/(N+1) will simply be set to the maximum value" — and also that "there is not a standard universally accepted way to perform this interpolation", with the three common methods diverging "particularly for small samples". So "95th percentile (human)" is the top-scoring human under one method, an interpolation weighted 0.95 toward the top under another, and 0.35 toward it under the one Excel and R use. Publishing it is publishing a software choice.

**Recommendation:** delete `peer_percentile`. If a cohort comparison is wanted, emit the raw ordered rank with n disclosed — "2nd of 14 human identities" — which is what the computation returns anyway and which makes the sample size visible instead of hiding it.

`score_drift` needs no new argument. `identity-exposure-map-research.md` Amendment 5 killed `exposure_delta`, the exposure router's own comment (`backend/src/routes/exposure.ts` L45-49) records why — "the graph is built once from a frozen dataset, so a trend would be fabricated and a badge derived from it would be a fabricated alarm — worse than a missing field, because it is actionable" — and `exposure/service.test.ts` L590 enforces it against the key names `rising_fast`, `flag` and `trend`, which PRD §4.3 uses verbatim. I checked whether anything changed: `control_history` and `privilege_grant_events` are event logs *per identity*, not snapshots of computed output, so there is still no prior score to difference against. **`score_drift`, `delta_7d`, the `rising_fast` chip and the 90-day trend line are all unbuildable, and the chip is the most dangerous of the four because it is one click and implies a measurement.**

### 4.5 Insight #5 — `stalest_input` is the PRD's best original idea and should ship, in the shape the engine already uses

Nearly everything above is a deletion, so it is worth being clear about what the PRD gets right. §4.4's argument — "a composite score is only as fresh as its stalest ingredient", and a score "should never present as fully current if it's silently built on a 3-day-old exposure number from one factor while every other factor is fresh" — is correct, novel in this product, and cheap. `domain/exposure.ts` L274 already anticipated it in writing: "Identity Risk Profile points its own `stalest_input` at this value."

Two corrections to the shape. First, drop `stale_if_older_than_hours` (see §2). Second, and more important: **`partially_stale: boolean` and the §6.6 "Partial" badge are the wrong construction**, and the engine has already made this decision twice. A boolean beside a number lets the number sort; a discriminated union does not let the number exist. `ExposureAssessment` has three arms and the scored fields live only on the `scored` arm precisely "so a consumer cannot read a score off a row that has not got one" (L199-200). This module's assessment should be a union in the same way, with an arm for "evaluated on n of m factors" that carries the named missing factors and **no fused value at all**. That is architecture rule 9, it is the differentiator §3.5 identified, and it is the one place where doing what the PRD asks would make us the same as the category.

### 4.6 Insight #6 — The amendments, written now rather than discovered later

> **Amendment 1 — three of the six factors are `ITAG.md` F9 and F10, and their data is already seeded; the "provisional field name" framing in §4.1, §5 and §8 is withdrawn.** Credential hygiene and trust decay are §F9 (`control_history`, `domain/types.ts` L186-189); dormant privilege is §F10 (`grant_records` × `grant_half_lives`, L191-206). Ownership status is not provisional either — `core/src/ownership/` ships ten modules and `ownership/classify.ts` is the authority for the field. The only genuinely absent input is a review date for a non-human identity, which no major provider records (§3.2).

> **Amendment 2 — there is no composite `risk_score`, and the weights are deleted with it.** Measured on this estate, the specified weighted sum puts a live administrative hop path (29) one point above an identity that is unremarkable on everything (28), empties the Critical band, and gives 42 identities the same value. The operator is replaced by the non-compensatory rule in the research §5: each factor emits its own categorical finding, ranking is by count of distinct factors firing and then by worst level, and no factor can dilute another. `impact/service.test.ts` L117 already forbids the key.

> **Amendment 3 — `peer_percentile` is deleted; ranking is by raw ordered rank with n disclosed.** At n = 14 humans and n = 6 AI agents, NIST's own definition returns the maximum for any p ≥ N/(N+1) = 0.9333, so §3's "95th percentile" and §4.3's `"peer_percentile": 95` are a maximum relabelled. Only the 107-member service-account cohort supports a percentile.

> **Amendment 4 — `score_drift`, `delta_7d`, the `rising_fast` chip and the 90-day trend line are not implemented, and nothing pretends they were.** Identical to Exposure Map Amendment 5 and enforced by the same class of test (`exposure/service.test.ts` L590). One frozen dataset at boot means there is no prior score to difference against; `control_history` is a per-identity event log, not a snapshot series.

> **Amendment 5 — the bands are not Critical / High / Medium / Low at 80 / 60 / 30, and a missing factor is an arm of a union rather than a badge on a row.** Exposure Map Amendment 8 already refused these four names and anchored `EXPOSURE_BAND_FLOORS` to the scale rather than to a percentile of the estate; measured here, the Critical floor is unreachable (max 75) so the chip would match nothing. Levels are inherited verbatim from the factor that fired — `ownership/severity.ts`'s `Severity` for ownership, `EXPOSURE_BAND_FLOORS`'s band for exposure — and an identity with unevaluated factors returns a distinct arm that carries the named gaps and no fused value, per architecture rule 9.

---

## 5. Recommended algorithm

Not a score. A **factor-finding set** with a non-compensatory summary, over the tables that exist.

**Step 1 — each factor independently emits zero or one finding, at its own level, in its own vocabulary.** No normalization to a common scale, because there is no common scale. Two factors are quotations, verbatim, from their owning module; three are computed here from seeded tables; one is a read of a field.

| Factor | Level rule | Source | Authored or quoted |
|---|---|---|---|
| `hop_access` | `critical` if any live hop path's terminal permission is in `graph.sensitivePermissions`, else `high` | `access/classify.ts` `path_type === 'hop'` | Authored (a level over a quoted fact) |
| `exposure` | `high` if band `extensive`, `medium` if `substantial`, else no finding | `exposure/score.ts` band, **verbatim** | **Quoted** |
| `ownership` | the `Severity` verbatim, no finding when `none` | `ownership/classify.ts`, **verbatim** | **Quoted** |
| `control_drift` | `critical` if MFA disabled **and** a conditional-access exception older than 90 days; `high` if MFA disabled; `medium` if any other weakening | `control_history` — `ITAG.md` §F9 | Authored |
| `grant_staleness` | `high` past `median_days_to_revocation`; `medium` past `median_days_to_actual_need` | `grant_records` × `grant_half_lives` — `ITAG.md` §F10 | Authored |
| `review_staleness` | `medium` past the 90-day threshold, **only where a review record exists** | `EmployeeRecord.last_reviewed` | Authored |

Every finding carries its evidence in plain English, not a sub-score: `"vpn:corp-network is 1914d old, past the 180d median revocation for vpn_remote_access (n=9)"`. The 90-day thresholds come from `DEFAULT_OWNERSHIP_POLICY`, not from new constants, and the registry is a frozen array whose order is precedence, per architecture rule 3.

**Step 2 — summarize non-compensatorily.** `worst_level` is the maximum over the findings' own levels. `factors_firing` is the count of **distinct** factors. Rank by `factors_firing` descending, then `worst_level`. Nothing multiplies, nothing averages, and one critical finding can never be outvoted — which is `ownership/severity.ts`'s own logic generalized, and which satisfies SP 800-30's "make explicit the rules used" with a table rather than a formula.

**Step 3 — return a discriminated union, never a partial number.** Arms: `findings` (one or more), `no_findings` (all evaluable factors evaluated, none fired), and `partially_evaluated` (naming the factors that had no data). No arm carries a fused value.

**Measured over the estate at `8f0e170`:**

| Result | Count |
|---|---|
| 4 distinct factors firing | **1** — `svc-vpn-legacy` |
| 3 distinct factors firing | **5** — `svc-legacy-export`, `svc-batch-recon`, `svc-backup`, `svc-quarter-close`, `svc-etl` |
| 2 distinct factors firing | 17 |
| 1 factor | 27 |
| No findings | **77** |
| By worst level | critical 18 · high 9 · medium 19 · low 4 · none 77 |

Three properties the composite does not have. **`svc-vpn-legacy` returns to rank 1**, agreeing with the ownership queue and demo beat 1 instead of contradicting them at rank 9. **The population that justifies the module is six identities**, not a 127-row table sorted by a column that is 8 for a third of it. And **77 identities honestly report nothing**, which is a statement a reviewer can act on, rather than a 42-way tie at the bottom of a ranking.

`svc-vpn-legacy`'s row, which is the demo:

```
svc-vpn-legacy — 4 factors, worst critical
  exposure          high      band extensive (83)
  ownership         critical  owner_invalid
  control_drift     critical  MFA disabled 271d ago and a temporary exception still live after 167d
  grant_staleness   high      vpn:corp-network is 1914d old, past the 180d median revocation
                              for vpn_remote_access (n=9)
```

**What is deliberately not here.** No 0–100 number, so architecture rule 8 stands at three ranking authorities. No percentile. No delta. No smoothing — and the reasoning is sourced rather than aesthetic: an exponential moving average cannot be recomputed from published inputs, so it breaks FIRST's condition of use ("both the score and the vector string so others can understand how the score was derived"), SP 800-30's "make explicit the rules used", and the OECD Handbook's transparency condition, all three at once. EPSS, the only continuously published security score with a peer-reviewed methodology, publishes raw daily state and calls overnight churn "a very intentional design feature."

---

## 6. API surface

`GET /api/risk-profile` — the table. Filters, combining with AND, mirroring `routes/exposure.ts`: `identity_type`, `app`, `worst_level`, `min_factors`, `factor` (rows where a named factor fired), `owner`. Default sort is `factors_firing` descending, then `worst_level`. Rows with no findings are hidden by default and disclosed in the summary, as `exposure` does for `no_paths`.

```json
{
  "rows": [
    {
      "identity_id": "svc-vpn-legacy",
      "name": "legacy-vpn-concentrator",
      "identity_type": "service_account",
      "app": "legacy-ldap",
      "assessment": {
        "kind": "findings",
        "worst_level": "critical",
        "factors_firing": 4,
        "findings": [
          { "factor": "control_drift", "level": "critical",
            "evidence": "MFA disabled 271d ago and a temporary exception still live after 167d",
            "source": "control_history" },
          { "factor": "ownership", "level": "critical", "evidence": "owner_invalid",
            "source": "ownership/classify.ts", "quoted": true }
        ]
      },
      "why_factors_differ": "…frozen string, see below",
      "staleness": {
        "based_on_access_discovery_snapshot": "2026-07-31T00:00:00Z",
        "computed_at": "2026-07-31T00:00:00Z",
        "stalest_input": { "factor": "exposure", "snapshot_at": "2026-07-31T00:00:00Z" }
      }
    }
  ],
  "summary": {
    "scanned": 127,
    "with_findings": 50,
    "no_findings": 77,
    "by_worst_level": { "critical": 18, "high": 9, "medium": 19, "low": 4 },
    "factor_coverage": {
      "hop_access": 127, "exposure": 105, "ownership": 122,
      "review_staleness": 14, "grant_staleness": 7, "control_drift": 4
    }
  }
}
```

`GET /api/risk-profile/:id` — the drawer: the finding list with full evidence, plus the quoted `exposure` and `ownership` payloads byte-identical to what the ports returned. `GET /api/risk-profile/:id/export` — CSV, one row per finding, per §6.7's requirement that an auditor see the "why" offline.

Three conditions on the router, all inherited. `factor_coverage` in the summary **before** the ranking, because `exposure/service.test.ts` L402 established that the gate publishes before the ranking. A frozen reconciliation string in the engine, alongside `EXPOSURE_VERSUS_SEVERITY`, saying that ownership severity ranks accountability, exposure ranks footprint, choke points rank remediations, and this module reports which of those independently fired — because a fourth surface disagreeing with three others in front of a CISO is the failure `access/classify.test.ts` L432 was written to prevent. And a guard test walking every payload asserting no key is named `score`, `rank`, `priority`, `band` or `*_score`, exempting only the `exposure` and `ownership` quotation subtrees and asserting them byte-identical, exactly as `impact/service.test.ts` L107-137 does.

---

## 7. Unosecur alignment

### 7.1 Side by side

| Dimension | PRD as written | This engine | Verdict |
|---|---|---|---|
| Inputs — exposure, hop | Consume upstream fields | `exposure/score.ts`, `access/classify.ts` | Aligned, free today |
| Input — ownership | "Provisional, pending a PRD" | 10 shipped modules | **PRD is wrong; amend** |
| Inputs — hygiene, decay, dormancy | Provider IdP data + a future PRD | `ITAG.md` §F9/§F10 + three seeded tables | **PRD reinvents two designed features** |
| Traversal | None of its own (§4.1) | Not needed | Aligned with architecture rule 1 |
| Aggregation | Weighted linear sum of six 0–100 scales | `ownership/severity.ts` is non-compensatory by design | **Not aligned; replace the operator** |
| Output | `risk_score` 0–100 | `risk_score` is a forbidden key in `impact/` | **Not aligned; delete the field** |
| Bands | Critical / High / Medium / Low at 80/60/30 | Refused once (Amendment 8); Critical floor unreachable | **Not aligned; inherit factor levels** |
| Percentile | 95th percentile by identity type | n = 14 / 107 / 6 | **Not supportable for two of three cohorts** |
| Drift | `delta_7d`, `rising_fast` | Banned keys, one frozen dataset | **Not supportable; omit** |
| Missing factors | "Partial" badge, score still sorts | Discriminated unions in both rankers | **Not aligned; use an arm, not a badge** |
| Staleness | Shared keys + `stalest_input` | First key yes, second refused, third anticipated | Mostly aligned; drop one key |
| Consumers | UIA, Home Dashboard, Access Reviews | UIA ships and reads no `risk_score` | **Contract in §2.1 needs rewriting against the new output** |

### 7.2 Verdict: (c) — a data producer and a join, and the first module whose main contribution is refusing to rank

`delegation-chain-research.md` §7.2 reached (c) for lineage because the module produced facts another module ranked. This is the same shape with a sharper edge: the facts are already produced, by four modules, and what is missing is the **join** plus the discipline not to fuse it.

The argument against (b) is measured, not aesthetic. A distinct module earns its place by emitting a fact no other module computes. Sixteen of the composite's top twenty rows are already in the union of Exposure Map's top 20 and the ownership queue; the two interesting exceptions (`svc-ci-runner`, `svc-invoice-poster`) are identities with live hop paths and low exposure scores, which is a finding about *Exposure Map's weighting*, not a new module. Meanwhile the fusion actively destroys information the shipped rankers had: `user-maya` from exposure #1 to rank 62, `svc-vpn-legacy` from queue #1 to rank 9.

And the reason this is genuinely worth building anyway is that the demo already argues for it. Beat 1's closing line is: "neither signal alone puts this at the top. An orphan list sorted by age puts a 711-day-old agent that can reach nothing above it. A control-decay report flags the MFA change but cannot tell you nobody would answer for it. **The fusion is the ranking.**" That is this module's thesis, written before this module was proposed, and it is delivered today by `ownership/severity.ts` reading two signals. What this module adds is the other four signals, a count of how many fired, and the honest statement that 77 identities had nothing fire. What it must not add is a number that averages them, because averaging is what turns beat 1's rank 1 into rank 9.

---

## 8. Gaps, ranked

Ordered by the cost of acting on them late.

1. **Nobody has read `ITAG.md` §F9 and §F10 before writing this PRD, and the branch owner is about to build an IdP connector that is three seeded tables away.** `origin/feat/identity-risk-profile` is at `2cf7ebf` with no module work — the cheapest moment to fix this is now, and the fix is a conversation, not code.
2. **The composite is specified in a document that will be handed to an implementer.** Amendments 2 through 5 need to land in the PRD before anyone normalizes a sub-score, because a weighted sum is the kind of thing that is easier to build than to remove once a UI sorts by it.
3. **`control_history` covers 4 identities and `grant_records` 7, both entirely service accounts, and all 7 grants fire.** The seed is a fixture, not a population. Adding rows is the long pole and it collides with the pins: `seed.test.ts`'s `EXPECTED` is exhaustive over non-group non-fixture identities, and four ownership beats are pinned. The safe pattern is the one three modules have already used — owned, severity none, counted false.
4. **Open issue A/A\* (groups) lands on this module too.** `exposure.profile()` scores all 12 groups while `list()` returns none, and `group-oncall-agents` scores 94 at band `extensive`. Any factor quoting the exposure band inherits that split. Settle it before this module quotes it, not after.
5. **The §2.1 consumer contract is written against a field that should not exist.** Unified Impact Analysis's PRD reads `risk_score` for leaderboard prioritization, and UIA shipped without it — correctly, since `impact/service.test.ts` forbids the key. The rewritten contract should offer `factors_firing` and `worst_level`, and that needs UIA's owner to agree.
6. **`review_staleness` is defined for 14 of 139 identities and fires for 3.** Either scope the factor to humans in writing, or drop it. Leaving it as one of six equal-looking factors implies a coverage it does not have.
7. **No provider offers machine-identity credential hygiene beyond key age.** This is not a connector backlog item; it is a permanent constraint that belongs in the PRD's §5 as an explicit "aspirational" mark, in the same way `unified-impact-analysis-research.md` §3.2 marked the SaaS row.

---

## 9. Demo implications

The demo script stops at beat 23 plus three appendices; beats 24-29 exist only as tests, and 30-33 (Blast Radius) are unwritten. This module is therefore **beats 34-37**, and it should not be written until 30-33 are, because beat 34's argument depends on the choke-point view existing.

- **Beat 34 — the four-factor row.** `svc-vpn-legacy`, already beat 1's identity, shown with all four findings and their evidence strings. The line to land is that beat 1 promised "the fusion is the ranking" from two signals, and this is the same identity with four, still at rank 1. Verified: 4 distinct factors, worst `critical`, and every evidence string in §5 is generated from seeded data.
- **Beat 35 — the six.** The `factors_firing >= 3` filter returns exactly six identities out of 127. "This is the week's list" is a defensible sentence about a six-row table and an indefensible one about a 127-row score.
- **Beat 36 — the honest 77.** Sixty percent of the estate returns no findings. Say it out loud, next to the `factor_coverage` block showing that `control_drift` covers 4 identities. This is the beat that earns the not-evaluated state, and it is the one a CISO judge will remember, because no product in §3.5 does it.
- **Beat 37 — the disagreement, if there is time.** `user-maya` at exposure 97 has exactly one factor firing; `svc-vpn-legacy` at exposure 83 has four. Both are true, they rank differently under the two views, and the reconciliation string says why. This is the same argument as `EXPOSURE_VERSUS_SEVERITY`, extended.

**Do not demo:** any Critical chip (the band is empty), any percentile (n = 14 and n = 6), any trend line or Rising Fast chip (fabricated), and Jane at 84 (she is 57 under the PRD's own arithmetic and has no finding beyond hop access and exposure).

**Appendix C addition.** Alongside "Scale" and "Ingestion", add: *Lifecycle factors.* Control drift covers 4 identities, grant staleness 7, review staleness 14 — all fixtures. The factor model is real; the population is not, and no provider supplies the machine-identity half of it (§3.2).

---

## 10. Open questions

### Closed during research

- **Weight configurability at MVP (§8).** Closed by deletion: there are no weights. The registry array is the extension point, per architecture rule 3, and CA-7(a) argues for freezing definitions rather than exposing them.
- **Peer group definition (§8).** Closed: the field goes. At n = 14 and n = 6 a percentile is NIST's maximum relabelled; only the service-account cohort supports one.
- **Partial-score trust (§8).** Closed by the house pattern, not by an opinion: a partially evaluated identity returns a different arm of a union and has no fused value to sort. `ExposureAssessment` and `OwnershipState` both did this first; §3.5 shows the whole category does the opposite.
- **Score volatility dampening (§8).** Closed: no smoothing. An EMA cannot be recomputed from published inputs, which breaks three independent transparency requirements at once, and there is no drift series to dampen anyway.
- **Provisional field names (§8).** Closed: ownership is `ownership/classify.ts`, control drift is `control_history`, grant staleness is `grant_records` × `grant_half_lives`. Only a review date for a non-human identity remains genuinely absent, and §3.2 shows why it will stay that way.
- **Whether the module is redundant with Exposure Map.** Closed by measurement: 16 of 20, and the two interesting exceptions are a finding about Exposure Map's weighting.

### Still open

- **Does `hop_access` at `critical` belong to this module or to Access Discovery?** The level is authored here over a fact quoted from there. Access Discovery deliberately emits no severity (`access/classify.test.ts` L432), so this is the only place the level can live — but it means one of six factors is not a pure quotation, and the guard exemption list will have to say so.
- **Should `control_drift` and `grant_staleness` ship as this module's factors or as F9/F10 services this module quotes?** The quotation pattern is cleaner and matches `exposure`/`ownership`, but it means two more modules for two tables with 4 and 7 rows. I lean toward authoring them here and moving them out if either grows; the decision should be recorded either way.
- **What happens to the 6 identities when the seed grows?** The `factors_firing >= 3` population is currently six because the lifecycle tables are fixtures. If the seed reaches a realistic distribution the list could be 60, and "here is the week's list" stops being one screen. The threshold may need to be a policy value rather than a constant.
- **A cross-document correction, for whoever owns `orphaned-identity-research.md`:** its Colonial Pipeline citations are CRN, DataBreachToday and an INL case study, but the underlying facts are on the congressional record — Blount's HSGAC written testimony and his exchange with Ranking Member Portman on single-factor authentication, and Mandiant's Carmakal in the House record reclassifying the cause as "a misconfiguration" and stating that MFA "was not required… because the account and the VPN profile wasn't believed to actually be enabled." That is a primary-source upgrade to a beat this repo leans on, and it is that document's to make, not this one's. Note also that CISA AA21-131A, widely cited for Colonial, names no initial access vector at all.

---

## 11. Sources

**Provider documentation (official)**

- AWS — [IAM Access Advisor: service last-accessed tracking is "at least 400 days"; action data is unavailable for any data plane event; `iam:PassRole` is not tracked; resource-based policies, ACLs, SCPs, permissions boundaries and session policies are excluded](https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_access-advisor.html) · [Access Analyzer unused-access age is configurable "between 1 and 365" days](https://docs.aws.amazon.com/IAM/latest/UserGuide/access-analyzer-create-unused.html) · [Service-linked roles are not analyzed, and only entities existing for the entire tracking period are evaluated](https://docs.aws.amazon.com/IAM/latest/UserGuide/access-analyzer-concepts.html) · [The credential report "lists all users in your account" — no role coverage, and only the first two access keys per user](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_getting-report.html) · [Access reviews are assigned to the customer as process, with no native attestation record](https://docs.aws.amazon.com/wellarchitected/latest/framework/sec_permissions_lifecycle.html)
- Google Cloud — [Role recommendations use a 90-day maximum observation period, ignore ACLs and Kubernetes RBAC, skip conditional bindings, and cover only basic roles for service agents](https://docs.cloud.google.com/policy-intelligence/docs/role-recommendations-overview) · [Service account keys never expire by default, and the expiry-cap org policy is not retroactive](https://docs.cloud.google.com/organization-policy/restrict-service-accounts) · [Activity Analyzer's `serviceAccountKeyLastAuthentication` "might not include very recent authentication events"](https://cloud.google.com/policy-intelligence/docs/activity-analyzer-service-account-authentication)
- Microsoft — [Sign-in and audit log retention is 7 days on Entra ID Free and 30 days on P1/P2, and retention changes are not retroactive](https://learn.microsoft.com/en-us/entra/identity/monitoring-health/reference-reports-data-retention) · [Access review decision principals "can be of two types - userIdentity and servicePrincipalIdentity", and the recommendation is "based off last interactive sign-in to tenant"](https://learn.microsoft.com/en-us/graph/api/resources/accessreviewinstancedecisionitem?view=graph-rest-1.0) · [`accessReviewInactiveUsersQueryScope` applies to inactive users only](https://learn.microsoft.com/en-us/graph/accessreviews-scope-concept) · [`authenticationMethod` is a method "registered to a user"; no service principal equivalent](https://learn.microsoft.com/en-us/graph/api/resources/authenticationmethod?view=graph-rest-1.0) · [Entra Workload ID risk excludes managed identities and baselines over 2 to 60 days](https://learn.microsoft.com/en-us/entra/id-protection/concept-workload-identity-risk)
- Kubernetes — [The RBAC reference defines no last-used or usage timestamp on any RBAC object](https://kubernetes.io/docs/reference/access-authn-authz/rbac/) · [Audit logging is opt-in: "If the flag is omitted, no events are logged"](https://kubernetes.io/docs/tasks/debug/debug-cluster/audit/)

**Peer-reviewed literature and official methodological texts**

- [OECD/JRC *Handbook on Constructing Composite Indicators*: additive aggregation implies "full compensability", with the (21,1,1,1) vs (6,6,6,6) example; weights "necessarily take the meaning of substitution rates (trade-offs) and do not indicate the importance of the associated indicator"; preferential independence is necessary and sufficient and the resulting bias's size and direction cannot be determined; linear aggregation is unsuitable where a gain on one dimension cannot compensate a loss on another; uncertainty and sensitivity analysis is step 7 of ten](https://www.oecd.org/content/dam/oecd/en/publications/reports/2008/08/handbook-on-constructing-composite-indicators-methodology-and-user-guide_g1gh9301/9789264043466-en.pdf)
- [Munda & Nardo, *Constructing Consistent Composite Indicators: the Issue of Weights*, JRC EUR 21834 EN — importance-coefficient weights require a Condorcet-consistent aggregation rule](https://publications.jrc.ec.europa.eu/repository/bitstream/JRC32434/EUR%2021834%20EN.pdf) · [Munda & Nardo (2009), *Applied Economics* 41(12) — the non-compensatory alternative with a fully explicit axiomatic system](https://doi.org/10.1080/00036840601019364)
- [Greco, Ishizaka, Tasiou & Torrisi (2019), *Social Indicators Research* — "there is no such thing as a 'perfect aggregation' scheme"; constant compensation is always assumed at the rate w_a/w_b](https://doi.org/10.1007/s11205-017-1832-9)
- [UNDP HDR 2010 Technical Notes — the HDI moved to a geometric mean to address "one of the most serious criticisms of the linear aggregation formula, which allowed for perfect substitution across dimensions"](https://data.un.org/_Docs/HDR%20Technical%20Notes.pdf)
- [Spring, Hatleback, Householder, Manion & Shick (2021), *IEEE Security & Privacy* 19(2) — the CVSS scoring algorithm "is not justified, either formally or empirically", and using CVSS directly as a risk score "is a mistake"](https://doi.org/10.1109/msec.2020.3044475) · [CERT/CC SSVC — "Severity should only be a part of vulnerability response prioritization"; the structural answer is a decision table](https://certcc.github.io/SSVC/topics/state_of_practice/)
- [Cox (2008), *Risk Analysis* 28(2) — "range compression": coarse composite ratings assign identical ratings to quantitatively very different risks](https://onlinelibrary.wiley.com/doi/abs/10.1111/j.1539-6924.2008.01030.x)
- [NIST/SEMATECH e-Handbook §7.2.6.2 — "any p ≥ N/(N+1) will simply be set to the maximum value"; "there is not a standard universally accepted way to perform this interpolation"; R6/R7/R8 diverge "particularly for small samples"](https://www.itl.nist.gov/div898/handbook/prc/section2/prc262.htm)

**Standards and control frameworks**

- [NIST SP 800-53 Rev 5 — source of AC-2(3), AC-6, AC-6(7), IA-5, CA-7, RA-3, RA-5 and PM-9 control text](https://csrc.nist.gov/pubs/sp/800/53/r5/upd1/final) · [NIST-published OSCAL edition of the Rev 5 catalog, from which the statements were taken verbatim](https://github.com/usnistgov/oscal-content/blob/main/nist.gov/SP800-53/rev5/json/NIST_SP-800-53_rev5_catalog.json)
- [NIST SP 800-30 Rev 1 — "this guideline does not specify algorithms for combining semi-quantitative values"; lists max, min, either-alone and weighted average, and requires that "Organizations make explicit the rules used"; Table I-2 combines likelihood and impact by lookup matrix; reproducibility is increased "by the use of tables or other well-defined functions"](https://nvlpubs.nist.gov/nistpubs/legacy/sp/nistspecialpublication800-30r1.pdf)
- [NIST SP 800-63B-4 — AAL1 "requires only single-factor authentication"; AAL2 requires two distinct factors](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-63B-4.pdf) · [SP 800-63-4 scope — "'person' refers only to natural persons", and the guidelines do not address "machine-to-machine authentication"](https://pages.nist.gov/800-63-4/sp800-63/introduction/)
- [FIRST CVSS v4.0 Specification — publishers must provide "both the score and the vector string so others can understand how the score was derived"; MacroVector equivalence classes scored by expert lookup plus interpolation](https://www.first.org/cvss/v4.0/specification-document) · [CVSS v4.0 User Guide — Base scores "measure the severity of a vulnerability and should not be used alone to assess risk"; the 270 equivalence sets were ordered with Elo](https://www.first.org/cvss/v4.0/user-guide)
- [FIRST EPSS — a 0–1 calibrated probability of exploitation in the next 30 days, published daily](https://www.first.org/epss/) · [EPSS FAQ — multiplying a calibrated probability by an ordinal ranking "produces a number with no interpretable meaning"; overnight score changes are "a very intentional design feature"](https://www.first.org/epss/faq) · [Using EPSS — names "Score Laundering" as a misuse; KEV membership means treat as actively exploited "regardless of EPSS score"; the one sanctioned aggregation is 1 − ∏(1 − p)](https://www.first.org/epss/using-epss)
- [CISA KEV — a catalogue whose membership requires a CVE ID, reliable evidence of active exploitation, and a clear remediation action, and for which "exploitability is not considered as criteria for inclusion"](https://www.cisa.gov/known-exploited-vulnerabilities)
- [ISO 31000:2018 — clause 6.4.3 names "complexity and connectivity" and "time-related factors and volatility" among the factors risk analysis should consider, and requires that assumptions and limitations "be considered, documented and communicated to decision makers"](https://www.iso.org/standard/65694.html) · [ISO/IEC 27005:2022 — "level of risk… expressed in terms of the combination of consequences and their likelihood"](https://www.iso.org/standard/80585.html)
- **PCI DSS is deliberately not cited in §3.3.** The [PCI SSC document library](https://www.pcisecuritystandards.org/document_library/) gates the standard behind licence acceptance, so requirement numbers and text could not be verified against the primary source. `orphaned-identity-research.md`'s existing PCI mapping stands; this document adds none.

**Threat intelligence and incident record**

- [Cyber Safety Review Board, *Review of the Summer 2023 Microsoft Exchange Online Intrusion* (March 2024)](https://www.cisa.gov/sites/default/files/2024-03/CSRB%20Review%20of%20the%20Summer%202023%20MEO%20Intrusion%20Final_508c.pdf) — the 2016 MSA key "originally intended to be retired in March 2021"; rotation "stopped… entirely in 2021"; no "automated alerting system to notify the appropriate Microsoft teams about the age of active signing keys"; 22 enterprise organizations and 503 personal accounts; and the counterfactual, "the 2016 MSA key would not have been valid in 2023."
- [Mandiant / Google Cloud on UNC5537](https://cloud.google.com/blog/topics/threat-intelligence/unc5537-snowflake-data-theft-extortion) — accounts "not configured with multi-factor authentication", credentials unrotated "for as long as four years", and the campaign "not the result of any particularly novel or sophisticated tool, technique, or procedure." Cited in §3.4 as corroboration only; **no primary source characterizes the affected accounts as service accounts**, and Mandiant describes contractor systems used for personal activity.
- Colonial Pipeline primary record, cited in §10 as a correction to a sibling document rather than as this module's incident — [Blount's written HSGAC testimony: "a legacy virtual private network (VPN) profile that was not intended to be in use"](https://www.hsgac.senate.gov/wp-content/uploads/imo/media/doc/Testimony-Blount-2021-06-08.pdf) · [Senate hearing record: the profile "did only have single-factor authentication", and "we could not see [it] and it did not show up in any pen testing"](https://www.govinfo.gov/content/pkg/CHRG-117shrg46569/html/CHRG-117shrg46569.htm) · [House hearing record: Carmakal reclassifies the cause as "a misconfiguration", and states MFA "was not required… because the account and the VPN profile wasn't believed to actually be enabled"](https://www.govinfo.gov/content/pkg/CHRG-117hhrg45085/html/CHRG-117hhrg45085.htm) · [CISA AA21-131A, which attributes no initial access vector to the pipeline company](https://www.cisa.gov/news-events/cybersecurity-advisories/aa21-131a)
- **Attributed, not established** (see §3.4): the ~60,000 State Department email figure (State briefing via Reuters); "hundreds of thousands" of government emails ([Senator Wyden's letter](https://www.wyden.senate.gov/imo/media/doc/wyden_letter_to_cisa_doj_ftc_re_2023_microsoft_breach.pdf), self-sourced to press reports); that the key "expired" in 2021 (Wyden, versus the CSRB's "intended to be retired"); that the key was not HSM-stored (Wyden's inference); [that the key could sign far beyond email (Wiz's research, relayed by the CSRB as Wiz's conclusion)](https://www.wiz.io/blog/storm-0558-compromised-microsoft-key-enables-authentication-of-countless-micr); and the crash-dump mechanism, which Microsoft published and then withdrew.

**Competitive — product documentation (not marketing)**

- [Veza publishes 0–100 per-entity bands (Critical ≥75 through None <10), base scores per severity, logarithmic diminishing returns and four worked examples, and lets customers assign risk levels to the saved queries that constitute the factors](https://docs.veza.com/4yItIzMvkpAvMVFAamTf/features/insights/risks) · [Veza review-row scores are "snapshot-based… not recalculated when underlying data changes"](https://docs.veza.com/4yItIzMvkpAvMVFAamTf/features/access-reviews/how-to/access-path-risk-score)
- [SailPoint publishes six named outlier factors with per-factor drill-down, and states "the factors displayed depend on the data available for the outlier identity"](https://documentation.sailpoint.com/saas/help/ai/access_insights/outliers.html) · [SailPoint's OpenAPI spec defines a signed per-factor `importance` bounded to −1.0…1.0](https://github.com/sailpoint-oss/api-specs/blob/main/idn/beta/schemas/OutlierContributingFeature.yaml)
- [Entra ID Protection is categorical (low/medium/high), ML-derived, with low-risk detections "automatically aged out" after six months and medium/high persisting "until remediated or dismissed"](https://learn.microsoft.com/en-us/entra/id-protection/concept-risk-detection-types) · [Graph `riskyUser.riskLevel` enumerates low, medium, high, hidden, none — where `hidden` is licence-gated, not insufficient data](https://learn.microsoft.com/en-us/graph/api/resources/riskyuser?view=graph-rest-1.0)
- [Microsoft Secure Score is "a measurement of an organization's security posture", scored per recommended action at "10 points or less" with a published partial-credit formula](https://learn.microsoft.com/en-us/defender-xdr/microsoft-secure-score) · [Identity Secure Score is a per-tenant percentage with a published 10.71% weight for the MFA control, a `[Not Scored]` state, and ignored recommendations excluded from the calculation](https://learn.microsoft.com/en-us/entra/identity/monitoring-health/concept-identity-secure-score)
- [Defender for Cloud's five risk levels include "Not evaluated: Recommendations that aren't evaluated yet" — but the subject is a recommendation against a resource, not an identity](https://learn.microsoft.com/en-us/azure/defender-for-cloud/security-recommendations)
- [Okta ITP publishes a fixed detection-to-level table and emits a `reasons` list with `level` and `previousLevel` in the System Log, with no numeric score and no null tier](https://developer.okta.com/docs/reference/api/itp-et/) · [Okta's user risk profile shows low/medium/high over a seven-day window](https://help.okta.com/OIE/en-us/content/topics/itp/overview.htm)
- [BloodHound Enterprise scores findings rather than identities, and keeps Exposure and Impact as separate count-and-percentage metrics — with list-based findings having no exposure metric at all](https://bloodhound.specterops.io/analyze-data/findings/attack-paths)
- **Not verified, and therefore absent from §3.5:** CrowdStrike's product documentation (`falcon.crowdstrike.com/documentation` is login-gated; the score scale is claimed as 0–10 in marketing and as 0–1 and 1–10 in two independent integration docs) and Wiz (`docs.wiz.io` unreachable).

**Repository evidence** — `docs/ITAG.md` §F9 (L109-134), §F10 (L136-161), L235, L244, L342, L436; `core/src/domain/types.ts` (L12, L46-50, L106-119, L177-206, L225-255); `core/src/domain/exposure.ts` (L196-234, L245-249, L269-286); `core/src/domain/ownership.ts` (L13-29, L146); `core/src/ownership/severity.ts` (L18-38); `core/src/exposure/score.ts` (L274-278); `core/src/exposure/service.test.ts` (L245, L286-298, L318, L341, L402, L590); `core/src/impact/service.test.ts` (L107-137); `core/src/access/classify.test.ts` (L432); `backend/src/routes/exposure.ts` (L35-49); `docs/PRD-identity-exposure-map.md` Amendments 3, 5, 8; `docs/demo-script.md` beat 1, Appendix C. All measurements taken at `8f0e170` with `ITAG_NOW=2026-07-31T00:00:00Z`, clean tree, 259/259 core tests passing, `tsc -b core backend` clean. Composite scores, the non-compensatory alternative, the weight-sensitivity sweep and the novelty comparison were computed in throwaway scripts against `seedGraphSource()` through the shipped service constructors; **no repository file was modified to obtain any figure, and the scripts were deleted rather than committed.**
