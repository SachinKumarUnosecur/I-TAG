# Unified Impact Analysis — Implementation Research

> **Lens:** Principal Backend Engineer + CISO, Unosecur
> **Scope:** `unified-impact-analysis-prd-v2.md` (Draft v2, doc owner Harsha, not yet in the repo) — recursive compromise propagation, cross-identity pivot edges, choke-point identification, the `exploitable_risk_score`, and the compromise simulator — evaluated against provider reality, auditor expectations, the attack-graph literature, and the engine as built.
> **Companions:** [`ITAG.md`](./ITAG.md), [`PRD-access-discovery.md`](./PRD-access-discovery.md), [`PRD-identity-exposure-map.md`](./PRD-identity-exposure-map.md), [`identity-exposure-map-research.md`](./identity-exposure-map-research.md), [`delegation-chain-research.md`](./delegation-chain-research.md), [`orphaned-identity-research.md`](./orphaned-identity-research.md)
> **Status:** research output, Jul 2026
> **Repo state at time of writing:** `667ae68`, clean tree, 222/222 core tests passing, `tsc --noEmit` clean for `core` and `backend`. All measurements at `ITAG_NOW=2026-07-31T00:00:00Z`.
>
> **This document wins over the PRD where the two conflict**, on the same footing as
> `delegation-chain-research.md` §1. Every override below names the PRD line it overrules
> and why it loses.

---

## 1. Executive summary

1. **The module's headline output is 115 zeros and 5 rows, and that is a data-shape problem no amount of frontend work fixes.** §4.2 step 6 and §6.3 specify a systemic leaderboard ranking *every* identity by the blast radius it would produce if compromised. Measured across the estate: **5 of 120 identities have any cross-identity pivot at all** — `user-jane`, `svc-ci-runner`, `agent-support-triage`, `role-runbook-executor`, `svc-invoice-poster` — over **7 hop paths** and **5 distinct pivot bindings**. Every other identity's "blast radius" is identical to its Exposure Map footprint, already shipped and already on a table. The leaderboard would therefore be a 120-row table with 115 rows reading zero, sorted by a column that is zero for 96% of the estate. **This is the most expensive finding to act on late**, for the same reason `identity-exposure-map-research.md` §1.1 was: the fix is seed data — more pivot bindings, and at least one identity whose pivot reaches something its own grants do not — and it has to land before the simulator is built, not after.

2. **The PRD's central differentiating claim is false against this engine, and was made false on purpose one module ago.** §1, §2, §3 and §4.1 all rest on the assertion that Exposure Map "explicitly stops at resources" and that this module alone crosses an identity boundary. `PermissionRecord.grants_identity` (`domain/types.ts` L174) already carries the pivot, `graph/build.ts` L227-229 indexes it into `permissionBindings`, and `access/classify.ts` L119-130 folds it into the traversal's selector alongside `inherited_from`. `agent-support-triage` returns a `hop` path at `hop_count: 6` that crosses **two** identity boundaries — `role-runbook-executor`, then `role-warehouse-admin` — collecting each assumed principal's own grants on the way, which is §4.2 steps 2 and 3 verbatim. Exposure Map scores the result at 94. `docs/PRD-access-discovery.md` Amendment 1 states the intent in writing: "the same field is what Unified Impact Analysis needs for its own pivot edge, so one schema addition serves both modules." **§4.1's `GRANTS_IDENTITY_ACCESS` derived edge should not be built; it exists, it is stored rather than derived, and it is validated at boot** (`data/validate.ts` L43-55).

3. **`percent_of_total_risk_removed` is undefined until the denominator is named, and the seed already contains the counterexample that makes this concrete.** §4.3 emits `"percent_of_total_risk_removed": 66` with no statement of what is being counted. Measured by severing each pivot binding and rebuilding the graph: severing `connect:ledger-writer` eliminates **one pivot edge and zero reachable permissions**. The reason is `svc-invoice-poster`, which reaches `write:invoice-queue` by *both* an `indirect` and a `hop` route — the multi-route case `identity-exposure-map-research.md` §4.5 seeded deliberately. The same remediation is a 17% risk reduction if you count pivot edges and a **0%** risk reduction if you count reachable permissions. A percentage whose value moves between 0 and 17 depending on an unstated denominator is not a metric; it is the "fix this one node" pitch with a number attached to whichever answer is more impressive.

4. **The candidate-shortlist heuristic in §4.2 step 5 is already wrong on a five-candidate space, and the literature has supplied the correct algorithm since 2002.** Ranked by appearance frequency, as §4.2 step 5 specifies, the candidates are `mcp:connect-prod-runbook` (3 paths) then four others tied at 1. Ranked by measured removal impact they are `mcp:connect-prod-runbook` (−3 permissions), `mcp:connect-warehouse-box` (−2), `ssm:session-deploy-box` and `ci:assume-build-agent` (−1 each), and `connect:ledger-writer` (**0**). The heuristic and the truth agree at the top and disagree at the bottom, on a candidate set small enough to compute exhaustively. Jha, Sheyner and Wing proved the Minimum Critical Set of Attacks problem NP-complete and **polynomially equivalent to minimum hitting set**, and published a greedy algorithm with provable approximation bounds. §8's own question — "how confident can the product be that the true global choke-point is always inside K" — has an answer: *not at all, if K is chosen by appearance frequency; within a proven bound, if it is chosen by greedy hitting set.* Use the algorithm that comes with the bound.

5. **This is a shipped commercial category, and the vendor that ships it splits the metric this PRD conflates.** BloodHound Enterprise documents Choke Points as a first-class concept — "the optimal location to block the largest number of Attack Paths" — and its API returns **four** separate fields: `ExposureCount`, `ExposurePercentage`, `ImpactCount`, `ImpactPercentage`. Exposure is measured *upstream* ("the number of principals that can reach a privileged asset"); impact is measured *downstream* ("the number of principals that could be compromised"). The PRD computes only the downstream direction and uses both words for it. That is not a naming quibble: the upstream question — *who can reach my crown jewels* — is the one a CISO opens the tool to ask, and this engine cannot currently answer it, because `permissionBindings` is a forward index with no inverse.

6. **Provider reality is better than the PRD assumes for enumeration and worse than it assumes for recursion, and Google's own product proves the point.** AWS returns every role's `AssumeRolePolicyDocument` from a single paginated `GetAccountAuthorizationDetails` call — the pivot edge is a bulk read, not a per-principal probe. GCP ships this exact analysis as `analyzeIamPolicy` with `analyzeServiceAccountImpersonation: true`, and documents it as "a very expensive operation, because it automatically executes many queries," running **one query per service account in the result set** and recommending the long-running export instead. Critically, Google's implementation is **single-level**: chaining A→B→C requires the caller to re-run the analysis with B as the new subject. **The first-party implementation of this module's core feature, by the vendor with the most complete data, does not recurse.** That is the strongest available evidence that §4.2 step 3's "recurse to a fixed point" needs a bound for reasons of cost, not just taste.

7. **Do not ship a third 0–100 score. Ship counts.** §6.3 places `exploitable_risk_score` in a column directly beside Identity Risk Profile's `risk_score`, and §2 insists the two are "allowed to disagree." The precedent the PRD is reaching for is real — CVSS, EPSS and KEV are deliberately never merged, and FIRST states plainly that "CVSS is designed to measure the severity of a vulnerability and should not be used alone to assess risk" — but it works because the three answer *categorically different* questions in *different units*: a severity rating, a probability, and a boolean catalogue membership. Two 0–100 scores in adjacent columns are not that; they are the `identity-exposure-map-research.md` §7.2 stage risk with the volume turned up. Architecture rule 8 fixes the engine at two ranking authorities and the guards enforce it (`access/classify.test.ts` L414, `exposure/service.test.ts` L287). **The resolution is that this module ranks a different population**: choke points are *remediations*, not identities. A ranked list of edges to cut does not collide with a ranked list of identities to review, and it needs no new 0–100 number.

8. **Verdict: (b) a distinct module, but roughly one fifth of the one specified — and it is ITAG.md's F7, not a new feature.** Strip the propagation (built), the pivot edge (built), the seeding (built), the third score (delete), and the `reachable_set`/`risk_score`/`stale_if_older_than_hours` dependencies (two do not exist, one was deliberately refused), and what remains is small, novel and defensible: a counterfactual graph, a greedy choke-point selection with a published bound, and three honest counts. `ITAG.md` §F7 already specifies the mechanism — "Re-run the forward traversal (F2) immediately on a modified in-memory copy… Fully non-destructive — toggles never touch the base seed dataset" — which is §4.2 step 5 and §6.2 written eighteen months earlier and one page shorter.

---

## 2. As-built vs as-specified

Unlike `identity-exposure-map-research.md` §2, where nothing was built, most of this module already exists under another module's name. That is the table's main result.

| Item | Specified (PRD) | Built | Evidence |
| --- | --- | --- | --- |
| Pivot edge, resource/role → second identity (§4.1) | Yes — as a *derived* edge computed at simulation time | **Yes, and stored rather than derived** | `domain/types.ts` L174 `grants_identity`; `graph/build.ts` L227-229; `data/validate.ts` L43-55 |
| Seed frontier from a reachable set (§4.2 step 1) | Yes — from Exposure Map's `reachable_set` | **Yes, but the field is named `exposure_set`** | `domain/exposure.ts` L106-111 `ExposureSet`; profile-only, see §4.5 |
| Identity-boundary check (§4.2 step 2) | Yes | **Yes** | `access/classify.ts` L119-130 — `select` is `inherited_from ∪ permissionBindings` |
| Recurse to a fixed point (§4.2 step 3) | Yes | **Yes** | one `traverse` call, `onRevisit: 'skip'` (`access/classify.ts` L174-181) |
| Bounded propagation depth (§4.2 step 3, §8) | Yes — "configurable maximum" | **Yes, and not currently load-bearing** | `domain/policy.ts` L29 `maxChainDepth: 16`; deepest observed chain is 6 edges |
| Aggregate: total resources reachable (§4.2 step 4) | Yes | **Yes** | `domain/exposure.ts` L298 `reachable_permissions` |
| Aggregate: total *identities* reachable (§4.2 step 4) | Yes | **No — and this is genuinely missing** | `AccessPath` hop arm carries `assumed_identity` (`domain/access.ts` L82); nothing counts distinct principals |
| Highest-sensitivity asset reached (§4.2 step 4) | Yes | Derivable, not emitted | `ExposureEntry.sensitivity` (`domain/exposure.ts` L76) |
| Choke-point removal impact (§4.2 step 5) | Yes | **No — the one substantial net-new computation** | no counterfactual anywhere in the engine |
| Candidate shortlist by appearance frequency (§4.2 step 5) | Yes | No — **and see §4.4, it is the wrong selector** | — |
| Rank all identities by exploitable risk (§4.2 step 6) | Yes | **No, and should not be built** | architecture rule 8; guards at `access/classify.test.ts` L414, `exposure/service.test.ts` L287 |
| `exploitable_risk_score` 0–100 (§4.3) | Yes | No — **recommend deletion** | §4.2 below |
| `risk_profile_reference.risk_score` (§4.3, §6.2, §6.3) | Yes | **No — module does not exist** | `origin/feat/identity-risk-profile` is at `2cf7ebf`, no module work |
| `staleness.based_on_access_discovery_snapshot` (§4.4) | Yes | **Yes, verbatim** | `domain/exposure.ts` L284 |
| `staleness.stale_if_older_than_hours` (§4.3, §4.4) | Yes | **No, and deliberately refused** | `domain/exposure.ts` L280-282 — "deployment policy, not a fact about this snapshot" |
| Node types Identity / Group / Role / Resource (§4.1, §4.3) | Yes | **No — one node shape, no resource nodes** | `domain/types.ts` L12-14; architecture rule 10; see Amendment 1 in §4.6 |
| Effective-permission resolution (inherited via §4.2) | Assumed | **No, and deliberately never** | `domain/access.ts` L118-128 — `reachable_permissions`; architecture rule 13 |
| Animated staged-reveal simulator (§6.2) | Yes | No | `frontend/src/graph/` contains only `.gitkeep` |
| Counterfactual / what-if mechanism | Yes (§4.2 step 5, §6.2) | **No, but specified since day one** | `ITAG.md` §F7 L97-101 |

**Consequence for planning.** Steps 1, 2, 3 and the staleness block are *already done* and need deleting from the spec rather than building. Step 4 is one aggregation over data that exists. Step 5 is the module. Step 6 should not be built. The honest scope is a counterfactual graph, a choke-point selector, and three counts — measured in hours, not days — plus the seed work in §1.1, which is the long pole.

**One correction to a claim in the source PRD.** §4.4 states that this module carries staleness "using the same key names Identity Exposure Map's own §4.4 established (`based_on_access_discovery_snapshot`, `stale_if_older_than_hours`)." Exposure Map established the first key and explicitly declined the second. Copying a convention that was never adopted would make this the only module in the engine publishing a freshness threshold it has no rebuild cadence to measure against.

---

## 3. What the outside world calls this

### 3.1 Terminology — "Unified Impact Analysis" is not a term of art, and the term of art is already in our own founding document

The industry names for this are **Attack Path Management** (SpecterOps) and **attack path analysis** (Microsoft Defender for Cloud). Neither vendor says "unified impact analysis," and no standard body uses "exploitable risk." Meanwhile `ITAG.md` §F2 already calls the forward computation **Blast Radius**, and `identity-exposure-map-research.md` §3.1 explicitly left the term unclaimed on the reasoning that this module would take it.

There is a second, sharper problem. The PRD uses "exposure" and "impact" as loose synonyms for the same downstream quantity. BloodHound Enterprise's documentation makes them opposite directions of the same graph, and its API keeps four separate fields for the pair. Adopting "exposure" for a downstream measure would collide head-on with `exposure/score.ts`, which is already the engine's downstream footprint authority.

**Recommendation:** name the module **Blast Radius**, per `ITAG.md` §F2. Use **impact** for the downstream count (what falls if this identity falls) and reserve **exposure** for what `exposure/` already means. Do not introduce "exploitable risk" as a third vocabulary for the same axis.

### 3.2 Provider reality — the empirical core of this document

The question is not "is the pivot edge visible" — it is, everywhere — but "at what cost, at what depth, and does the provider recurse for you." The answer to the last is uniformly **no**.

| Provider | Mechanism the PRD §5 names | Is it enumerable? | Cost and fidelity |
|---|---|---|---|
| AWS | `sts:AssumeRole` trust policies, `iam:PassRole`, instance profiles | **Yes, in bulk** | `GetAccountAuthorizationDetails` returns `RoleDetailList` with `AssumeRolePolicyDocument` (max 131,072 chars) for every role, paginated, plus inline and attached policies. The pivot edge is one API sweep per account. |
| AWS | runtime `AssumeRole` | n/a | STS has a **600 requests/sec** account/region quota shared across `AssumeRole`, `GetCallerIdentity`, `GetSessionToken` and others; for cross-account calls only the *calling* account's quota is consumed. This bounds exploitation, not enumeration — worth stating so the two are not confused. |
| GCP | `roles/iam.serviceAccountTokenCreator`, cross-project trust | **Yes, and Google ships the analysis** | `analyzeIamPolicy` with `analyzeServiceAccountImpersonation: true` covers `actAs`, `getAccessToken`, `getOpenIdToken`, `implicitDelegation`, `signBlob`, `signJwt`. Google documents it as "a very expensive operation, because it automatically executes many queries" — **one query per service account in the result set** — and recommends `analyzeIamPolicyLongrunning` exporting to BigQuery or Cloud Storage instead. **Single-level: chaining is the caller's job.** |
| Azure | Managed Identity federation / trust | **Yes, but split across two control planes** | Federated identity credentials on user-assigned managed identities are listed through the **ARM** API (`.../userAssignedIdentities/{name}/federatedIdentityCredentials`), not Microsoft Graph, and are **not available for system-assigned managed identities**. A maximum of **20** federated credentials per application or user-assigned identity. Full visibility of one identity's pivot surface requires correlating ARM with Graph. |
| Kubernetes | ServiceAccount token mounting, cross-namespace RBAC | **Partially, and the edge is ephemeral** | Since v1.24 tokens are not auto-created as Secrets; the kubelet projects a **time-bound** token via the TokenRequest API, default **1 hour**, minimum 10 minutes, bound to the Pod and invalidated when the Pod or ServiceAccount is deleted. RBAC bindings are enumerable; *which Pod currently holds which token* is not a static graph fact. |
| SaaS / OAuth | Apps with delegated admin scopes that can mint tokens for other integrations | **No public general API found** | Per-vendor at best. This row is the PRD's weakest §5 claim and should be marked aspirational. |

**Three findings follow.**

First, **the PRD's §5 premise is right**: this data is "a superset of what Access Discovery already ingests," and the same connectors do reach it. That sentence survives contact with the documentation, which is more than most §5 tables manage.

Second, **nobody recurses for you.** AWS gives you the edges and leaves the closure to you. Google computes one level and prices it as expensive. That converts §8's depth-cap question from a design preference into a cost control, and it means the recursion is genuinely this module's work — the one place where §4.2's algorithm adds something a provider API does not already return.

Third, **Kubernetes breaks the snapshot model.** Every other edge in this engine is a configuration fact with a stable lifetime. A projected ServiceAccount token is valid for an hour. A blast radius computed over Kubernetes pivots is true for the length of a token, and `based_on_access_discovery_snapshot` cannot express that. Either scope Kubernetes to RBAC bindings only and say so, or do not claim the platform.

### 3.3 Compliance mapping — control ID to emitted artifact

Controls that cannot be tied to a field this module emits are dropped, per `delegation-chain-research.md` §3.3. The interesting result is that this module reaches a control family the per-identity modules cannot: **testing whether a boundary actually holds.**

| Control | Text (abridged, from the control itself) | Emitted artifact that is the evidence |
|---|---|---|
| **PCI DSS v4.0 Req 11.4.5** | "If segmentation is used to isolate the CDE from other networks, penetration tests are performed on segmentation controls… at least once every 12 months and after any changes… confirming that the segmentation controls/methods are operational and effective, and isolate the CDE from all out-of-scope systems." | The **counterfactual result**: the list of identities outside a zone that reach into it, plus the removal-impact of each pivot binding. This is the closest fit in any framework, because 11.4.5 is definitionally a question about whether a path exists across a boundary — which is what the propagation computes and what severing a choke point is asserted to close. |
| **NIST SP 800-53 Rev 5 CA-8** | "Conduct penetration testing [frequency] on [systems or system components]." | The per-starting-identity propagation object. CA-8's supplemental text describes "a pretest analysis based on full knowledge of the system, pretest identification of potential vulnerabilities based on the pretest analysis" — a compromise simulation from full configuration knowledge is precisely that pretest artifact, and it is reusable evidence between engagements. |
| **NIST SP 800-53 Rev 5 AC-6** | "Employ the principle of least privilege…" | `identities_reachable` — the count of *other principals* one identity's credentials transitively confer. A least-privilege violation that spans identities is invisible to any per-identity review, which is the gap this module closes. |
| **NIST SP 800-53 Rev 5 RA-3** | Risk Assessment. | The choke-point list **with its denominator stated** (§4.3). Without the denominator this is an assertion, not an assessment — see §1.3. |

**Dropped, and why.** SC-7 (Boundary Protection) is about system boundaries and information flow at the network layer; mapping an identity-graph cut to it would require asserting that an identity boundary is a system boundary, which is exactly the conflation `orphaned-identity-research.md` §3.2 refuses elsewhere. CA-3 (System Interconnections) is already claimed by demo beat 23. NIST SP 800-207 remains an architecture document, not a control catalogue.

**MITRE ATT&CK.** The pivot edge maps cleanly to **T1548.005 — Abuse Elevation Control Mechanism: Temporary Elevated Cloud Access**, whose description names `iam.serviceAccountTokenCreator`, AWS `PassRole`, and Exchange `ApplicationImpersonation` as the mechanisms, and whose note distinguishes it from T1098.003 (assigning *permanent* roles) — the same distinction `access/classify.ts` L114-117 draws when it excludes `delegates_to` from the access selector. Lateral movement across the resulting edges is **T1550 — Use Alternate Authentication Material**.

### 3.4 The canonical incident — Uber, September 2022

Three candidates were evaluated. Capital One (2019) is taken by `identity-exposure-map-research.md` §3.4 and is in any case the wrong shape: one identity, one path, an enormous reachable set, **no pivot into a second principal**. Midnight Blizzard (January 2024) is taken by `delegation-chain-research.md` §3.4. The remaining serious contender is the SolarWinds-associated activity in CISA **AA21-008A**, where the actor enumerated ADFS certificate-signing capability, forged SAML tokens to "impersonate existing users" and bypass MFA, and added "authentication credentials, in the form of assigning tokens and certificates, to existing Azure/M365 application service principals" (AA20-352A). It is impeccably sourced and genuinely cross-identity — but the mechanism is **token forgery and credential addition**, not reachability. No amount of graph analysis over correct configuration would have predicted it, because the actor manufactured the edge rather than traversing one. A module that claims to have found it would be overclaiming.

**Uber, September 2022, is the incident whose mechanism is this module's shape.** Per Uber's own newsroom statement: an EXT contractor's account was compromised (credentials likely purchased after malware on a personal device, then an MFA-fatigue prompt was accepted), and "**from there, the attacker accessed several other employee accounts which ultimately gave the attacker elevated permissions to a number of tools, including G-Suite and Slack.**" That sentence is the definition of a pivot: one principal's compromise conferring a second principal's access, recursively, until the reachable set was the estate.

**The honesty caveat, stated because the house style requires it.** The widely repeated detail — a PowerShell script on a network share containing hardcoded admin credentials for Thycotic, the PAM system, from which secrets for Duo, OneLogin, AWS and G-Suite were extracted — **is not in Uber's first-party statement.** It originates with the attacker's own claims, relayed by security researchers and secondary reporting. It should be presented as attributed, not established. Uber's confirmed account is sufficient for this module's argument on its own, and the unconfirmed detail is only the choke point's name.

**Why it constrains the module as well as motivating it.** If the PAM account is the choke point, then the highest-value node in the graph was a *credential store*, not an over-privileged identity. Its own reachable set — under this engine's model, its `direct_grants` — would have looked unremarkable. It scores badly on Exposure Map and badly on ownership severity. It is only visible as a choke point, which is the single strongest argument in the PRD and is worth stating on stage in exactly those terms.

### 3.5 Competitive reality — the category is shipped, mature, and quantified

This is the section the PRD most needs and least anticipates. **SpecterOps BloodHound Enterprise sells choke-point identification as its headline feature**, and has for years:

- Product documentation defines a Choke Point as "a privilege or user behavior… the adversary must abuse to compromise a Tier Zero object," and states that they "represent the optimal location to block the largest number of Attack Paths. BloodHound Enterprise calculates exposure for all choke points."
- The API returns `ExposureCount`, `ExposurePercentage`, `ImpactCount` and `ImpactPercentage` per finding, gated behind a "butterfly analysis" feature flag — i.e. the removal-impact computation is expensive enough to be optional even for the vendor who invented the pitch.
- There is a Choke Point view described as "an aggregate view of the graph… simplifies large volumes of nodes and edges into a compact visualization optimized for readability" — which is §6.2's animated graph, with the scale problem already solved and the animation dropped.
- *Vendor marketing, labeled as such:* the product page claims "an average 35% reduction of risk in the first 30 days" and that "cutting a single choke point severs access to more than 17,000 attack paths."

**The differentiation hypothesis, tested.** The claim would be non-human identities, AI agents, and cross-app rather than single-directory. It **partially survives**. BloodHound Enterprise's documented coverage is Active Directory, Entra ID and hybrid — a directory, and Microsoft's at that. Defender for Cloud's attack paths are anchored to an external entry point and filtered to "externally driven and exploitable" threats. Neither claims MCP gateways, AI agent identities, or an estate spanning seven unrelated systems. Demo beat 23 — an agent in `mcp-gateway` reaching Snowflake warehouse admin through two role assumptions, where "no single system's console can render this, because no single system holds both ends" — is a genuinely differentiated artifact.

**What does not survive is the framing.** "We identify the choke point that eliminates the most risk with one fix" is, word for word, a competitor's existing datasheet. The defensible claim is narrower and truer: *we compute choke points across identity systems that do not share a directory, including agent and service identities, and we publish the denominator.* The last clause is worth more than it sounds, given §1.3.

---

## 4. Implementation insights

### 4.1 Insight #1 — The propagation is built; the counterfactual is the module

Measured on the estate at `667ae68`:

```
identities with any cross-identity pivot ....... 5 of 120
total hop paths ................................ 7
distinct pivot bindings ........................ 5
pivot edges exercised .......................... 6
baseline reachable (identity, permission) pairs  184
deepest chain .................................. 6 edges (maxChainDepth is 16)
```

Every one of those numbers comes out of `access/service.ts` as it stands. The propagation reaches its fixed point naturally at depth 6 against a cap of 16, so **§8's depth-cap question is not currently load-bearing in this engine** — though §3.2 shows it will be against a real estate, for cost reasons rather than correctness ones.

What is not built is the counterfactual, and it is architecturally cheap. `buildIdentityGraph` is a pure function of an `IdentityDataset`, so a counterfactual is a *second graph over a copied dataset*, never a mutation:

```ts
// The frozen seed is never touched; architecture rule 4 is satisfied because this
// constructs a GraphSource, not an adapter, and `ITAG.md` §F7 L101 already requires
// non-destructive toggles.
function severing(dataset: IdentityDataset, permission: string): GraphSource {
  const permissions = dataset.permissions.map((p) =>
    p.id === permission ? { id: p.id, sensitive: p.sensitive } : p,
  );
  const graph = buildIdentityGraph({ ...dataset, permissions });
  return { graph: () => graph };
}
```

This was run for all five candidates to produce §4.3's table. No new BFS, no mutation, no rule broken.

### 4.2 Insight #2 — Rank remediations, not identities, and the third score disappears

The conflict is real: architecture rule 8 fixes the engine at two ranking authorities, both guarded by recursive tests that fail on any key named `severity`, `rank`, `score` or `priority` (`access/classify.test.ts` L414; `exposure/service.test.ts` L287, which additionally forbids `exposure_score` and `weighted_sum` leaking into an access-shaped object). §4.2 step 6 and §6.3 want a third.

The precedent the PRD gestures at does exist. CVSS, EPSS and KEV are used together and never merged, and FIRST is explicit that CVSS "should not be used alone to assess risk." But they are *different units answering different questions*: severity, probability, and catalogue membership. Two 0–100 identity scores in adjacent columns share a unit and a population, and a reviewer will read the difference as an error rather than as information.

**The resolution is that this module's natural output is not an identity ranking at all.** A choke point is an *edge* — a grant to revoke. Ranking edges by how much reach they carry is a different population, a different unit, and a different verb (revoke, not review). It cannot collide with `ownership/severity.ts` (which identities need an owner, how urgently) or `exposure/score.ts` (which identities have the largest footprint), because it never sorts identities at all.

**Therefore: delete `exploitable_risk_score` (§4.3), delete the leaderboard's primary sort column (§6.3), and delete §4.2 step 6.** Publish per starting identity: `resources_reachable`, `identities_reachable`, `highest_sensitivity_reached`, and a `choke_points` list ranked by measured removal impact. Counts, not scores. The guard test for `impact/` should assert the mirror of the existing two — that no field in its output is a 0–100 number and that ownership and exposure context travel with every row, exactly as `exposure/service.test.ts` L341 requires today.

### 4.3 Insight #3 — Publish the denominator or delete the percentage

Severing each pivot binding and rebuilding the graph, against a baseline of 184 reachable `(identity, permission)` pairs and 6 exercised pivot edges:

| Severed binding | Δ reachable permissions | Δ pivot edges | "% of risk removed" |
|---|---|---|---|
| `mcp:connect-prod-runbook` | −3 | −2 | 1.6% or 33% |
| `mcp:connect-warehouse-box` | −2 | −2 | 1.1% or 33% |
| `ssm:session-deploy-box` | −1 | −1 | 0.5% or 17% |
| `ci:assume-build-agent` | −1 | −1 | 0.5% or 17% |
| `connect:ledger-writer` | **0** | −1 | **0% or 17%** |

The last row is the one to put on a slide. `svc-invoice-poster` reaches `write:invoice-queue` by both an `indirect` and a `hop` route, so severing the hop closes a mechanism and removes **no reach whatsoever**. A reviewer who acted on a "17% risk reduction" badge would have changed how the permission is obtained and not what is obtainable.

This is the same defect `identity-exposure-map-research.md` §4.5 identified in de-duplication, arriving from the other side, and the field that fixes it already exists: `ExposureEntry.route_count` and `route_types` (`domain/exposure.ts` L100-102). **A choke point whose severing leaves `route_count > 0` on every affected permission must be labelled as closing a mechanism rather than removing access.** Emit both deltas, always, in the same object — the CVSS discipline `identity-exposure-map-research.md` §4.3 imported, applied to a percentage instead of a score.

### 4.4 Insight #4 — Use greedy hitting set, not appearance frequency

§4.2 step 5 selects candidates "by naive appearance-frequency in paths first (not exhaustively for every node in a large graph), to keep the computation tractable," and §8 then worries whether the true global choke point is inside K.

The problem has a name and a proof. Jha, Sheyner and Wing define the **Minimum Critical Set of Attacks** — the smallest set of edges whose removal prevents the intruder reaching the goal — prove its decision version **NP-complete** by reduction from minimum cover, prove it **polynomially equivalent to the minimum hitting set problem**, and give `GREEDY-HITTING-SET`, a polynomial-time approximation with provable bounds.

Two consequences. First, §8's question has a definitive answer: **appearance frequency carries no bound at all**, and §4.3's table shows it failing on a five-element candidate set — `connect:ledger-writer` ties three other candidates on frequency while contributing zero actual reduction. Second, the correct algorithm is not more expensive in any way that matters here: the candidate space is the set of pivot bindings, which is 5 in this seed and is bounded in production by the number of roles carrying impersonation rights, not by the number of nodes.

**Recommendation:** compute removal impact exhaustively over pivot bindings while that set is small, publish the fact that it is exhaustive, and adopt greedy hitting set with its stated approximation bound only when the candidate set outgrows exhaustive evaluation. Publish which of the two produced the answer, in the object. An unbounded heuristic presented as an optimum is the choke-point equivalent of an unpublished score.

### 4.5 Insight #5 — The PRD computes one direction; the question CISOs ask is the other one

BloodHound splits exposure (upstream: who can reach this asset) from impact (downstream: what falls if this principal falls) and returns both. The PRD computes only downstream, for a chosen starting identity.

Downstream is the demo. Upstream is the purchase. "Which identities can reach `admin:prod-database`, through any mechanism, at any depth" is the question a CISO opens the tool with, and this engine cannot answer it today: `graph.permissionBindings` (`graph/build.ts` L58) is a forward map from permission to principal with no inverse, exactly as `provisioned_by` had no inverse until `provisionedChildren` (`graph/build.ts` L31) was precomputed for the off-boarding sweep.

The precedent is therefore already in the codebase, and so is the shape of the fix: **precompute the inverse index at build time and configure `traverse` with it**, which is one more `ReferenceSelector` and no new walker. This is not in the PRD at all. It is the most valuable thing the module could add that nothing else in the product does, and it is a gap in the specification rather than in the engine.

### 4.6 Insight #6 — Amendment 1, written now rather than discovered later

Both prior PRDs absorbed the engine's node model through an Amendment 1. This one needs the same, and can be shorter because the ground was cleared twice:

> **Amendment 1 — there are no Role or Resource nodes, and the pivot edge is stored, not derived.** §4.1 posits Identities, Groups, Roles and Resources as distinct node types and §4.3 emits `"node_type": "role"`. The engine has exactly one node shape, `Identity` (`domain/types.ts` L14), with `type` as a field that nothing branches on (architecture rule 10). A "role" in this document is an `Identity` whose `type` is `service_account`; a "resource" is a `PermissionRecord`.
>
> `GRANTS_IDENTITY_ACCESS` is not computed at simulation time. It is `PermissionRecord.grants_identity`, present since `PRD-access-discovery.md` Amendment 1, validated at boot, and indexed into `graph.permissionBindings`. §4.1's "derived edge, computed at simulation time, not stored" is overruled: deriving at simulation time what is already validated at load would reintroduce the dangling-binding failure `data/validate.ts` L43-55 exists to prevent.
>
> `choke_point.node_type` therefore has two legal values — `permission` and `identity` — and in practice the actionable one is always `permission`, because that is the grant a reviewer revokes. This mirrors `AccessPath`'s hop arm, whose `via_permission` is documented at `domain/access.ts` L74-79 as "the grant a reviewer revokes to close the path… deliberately not the terminal permission."

---

## 5. Recommended algorithm

Inputs: `AccessService.profile()` for each identity, `ExposureService.profile()` for the ownership and sensitivity context, the dataset for counterfactual rebuilds. **No new traversal** — architecture rule 1 is satisfied because Access Discovery has already walked the graph, and the counterfactual walks a *different graph* with the *same* primitive.

**Step 1 — impact set per starting identity.** From `profile(id).paths`, collect distinct `permission` (that is `resources_reachable`) and distinct `assumed_identity` over the hop arms (that is `identities_reachable`). Both are one pass; no recursion is needed, because the recursion already happened inside `discoverAccess`.

**Step 2 — candidate set.** The pivot bindings actually exercised: `{ path.via_permission | path.path_type === 'hop' }` across the estate. Bounded by the number of impersonation-carrying permissions, not by node count.

**Step 3 — counterfactual, per candidate.** Rebuild via `severing(dataset, candidate)` (§4.1) and recompute step 1 over the whole population. Report two deltas, never one:

```
Δreach  = baseline_pairs  − counterfactual_pairs   // access actually removed
Δpivot  = baseline_pivots − counterfactual_pivots  // mechanisms actually closed
```

**Step 4 — rank remediations.** Sort candidates by `Δreach` descending, then `Δpivot`, then id for stability. Emit `selection: 'exhaustive'` while the candidate set permits it, `selection: 'greedy_hitting_set'` with its bound when it does not (§4.4). **Rank no identities** (§4.2).

**Step 5 — label the honest ones.** For every candidate where `Δreach === 0 && Δpivot > 0`, set `closes: 'mechanism_only'` and carry the permissions that survive with their `route_types`. This is `connect:ledger-writer`, and it must be impossible to render its percentage without its label.

**Step 6 — context travels.** Every row carries `ExposureOwnershipContext` and the exposure score of the starting identity, for the reason `exposure/service.test.ts` L341 already enforces on its own rows: a reviewer who sees one ranking without the others learns the wrong thing.

**Worked example, whole-estate choke point, against the live seed:**

| | |
|---|---|
| Candidate | `mcp:connect-prod-runbook` |
| Held by | `group-oncall-agents` (so revoking it is a group-membership change, not a user change) |
| Δreach | −3 of 184 reachable pairs (1.6%) |
| Δpivot | −2 of 6 exercised pivot edges (33%) |
| Identities affected | `agent-support-triage` (loses `admin:warehouse`, `mcp:prod-db-query`, `mcp:connect-warehouse-box`) |
| `closes` | `access` — no surviving route to any of the three |
| Ownership of every rung | `owned`, severity `none` |

That last row is the demo. The single most valuable revocation in the estate sits on a chain where every link is correctly owned and nothing is a finding in any other view of the product.

---

## 6. API surface

Mounted at `/api/impact`, after `/api/exposure` in `backend/src/server.ts`. Adapters constructed only there (architecture rule 4).

| Route | Returns | Notes |
|---|---|---|
| `GET /api/impact/choke-points` | `{ selection, candidates: ChokePoint[], baseline, snapshot }` | The module's primary artifact. `selection` is `'exhaustive'` \| `'greedy_hitting_set'` with its bound. Ranked by `Δreach`. |
| `GET /api/impact/:id` | `ImpactProfile` \| 404 | Per starting identity: `resources_reachable`, `identities_reachable`, `highest_sensitivity_reached`, `pivots[]`, plus `ownership` and the exposure reference. No score. |
| `GET /api/impact/simulate?sever=<permission>` | `{ before, after, delta, affected_identities }` | `ITAG.md` §F7's before/after diff, computed live per §4.4 of the PRD, which is correct and should be kept. |
| `GET /api/impact/:id/export` | flattened CSV | One row per pivot, chain flattened, both deltas present. |

`ImpactOutcome` is a discriminated union on `ok`, matching `AccessOutcome` (`domain/access.ts` L142-144) and `ExposureOutcome`, so an unknown id is a terminal state rather than a throw (architecture rules 6, 7). An identity with no pivots returns `{ kind: 'no_pivot_paths' }` rather than zeros, for the reason `ExposureAssessment` has three arms: "this identity cannot pivot" and "this identity was not analysed" are different claims, and PRD §6.4's green "No cross-identity pivot paths found from this starting point" message is the correct rendering of the first — that part of the spec is right and should be kept verbatim.

Every response carries `based_on_access_discovery_snapshot`, copied from `AccessSnapshot.graph_snapshot_at`, and **no `stale_if_older_than_hours`** (§2).

---

## 7. Unosecur alignment

### 7.1 Side by side

| Dimension | PRD as written | This engine | Verdict |
|---|---|---|---|
| Pivot edge | Derived at simulation time (§4.1) | Stored, validated at boot, indexed | **Correction.** Already built, one module upstream, deliberately. |
| Recursive propagation | The module's core claim (§1, §4.2) | One `traverse` call, `hop_count` up to 6 | **Correction.** Already built. §1–§4.1's differentiation argument does not survive. |
| Seeding from Exposure Map | `reachable_set` (§4.2 step 1) | `exposure_set`, profile-only | **Refinement.** Rename, and expect N profile calls. |
| Identities-reachable count | Yes (§4.2 step 4) | Not emitted; data present | **Net-new, and cheap.** |
| Choke point / removal impact | Yes (§4.2 step 5) | Nothing counterfactual exists | **Net-new, and the module.** |
| Candidate shortlist | Appearance frequency (§4.2 step 5) | — | **Correction.** No bound; NP-complete problem with a published greedy bound. |
| `exploitable_risk_score` | 0–100, third authority (§4.3, §6.3) | Two authorities, guarded by tests | **Conflict. Delete.** Rank remediations, not identities. |
| `risk_score` reference | Required (§4.2 step 6, §6.2, §6.3) | Module does not exist | **Blocked.** Remove the dependency or the module cannot ship. |
| `stale_if_older_than_hours` | Required (§4.3, §4.4) | Deliberately refused upstream | **Correction.** The convention it cites was never adopted. |
| Node vocabulary | Roles and Resources as nodes (§4.1) | One node shape | **Correction.** Amendment 1 (§4.6). |
| Effective permissions | Assumed via Access Discovery §4.1 step 4 | Never; `reachable_permissions` | **Conflict.** The percentage inherits an undefined false-positive rate (§8). |
| Upstream direction | Absent | Absent, and cheap to add | **Gap in the PRD**, and the most valuable one. |
| Graph-first UI | §6.1's justification | — | **Correct, and the best-argued section in the document.** Keep it. |
| What-if simulator | §6.2 | `ITAG.md` §F7, specified, unbuilt | **Duplicate.** This is F7. Reconcile the two documents before building either. |

### 7.2 Verdict: (b) — a distinct module, and the first one allowed to rank something that is not an identity

Not a fold-in: the counterfactual needs its own graph construction, its own guard test, and its own route, and nothing in `access/` or `exposure/` can host a computation that rebuilds the graph without violating those modules' own contracts. Not a data producer either: unlike Provisioning Lineage in `delegation-chain-research.md` §7.2, this module's output is directly actionable by a human — *revoke this grant* — with a measured consequence attached.

But the module that ships is about a fifth of the module specified, and the reduction is what makes it survivable. Its entire novel surface is: a counterfactual `GraphSource`, an exhaustive-then-greedy choke-point selector with a published selection method, two deltas per candidate, and three counts per identity.

**The ranking argument, stated once so it is not relitigated.** `ownership/severity.ts` ranks *findings* by urgency. `exposure/score.ts` ranks *identities* by footprint. `impact/` ranks *remediations* by measured reduction. Three modules, three populations, three units, one number each — and only the first two ever sort an identity, so architecture rule 8 holds unchanged. The moment this module emits a per-identity 0–100 score, that argument collapses and rule 8 is genuinely violated. The guard test should make that structurally impossible rather than leaving it to review.

---

## 8. Gaps, ranked

| # | Gap | Severity | Recommendation | Effort | Blocks if deferred |
| --- | --- | --- | --- | --- | --- |
| 1 | Only 5 of 120 identities pivot; the leaderboard is 115 zeros (§1.1) | **Critical** | Seed 3–4 more pivot bindings, including one where the pivot reaches something the subject's own grants do not, and one two-stage chain in a second app | 2h *(seed)* | The simulator, the leaderboard, and §8's own K question. Data-shape, so cost rises once the UI exists |
| 2 | `percent_of_total_risk_removed` has no denominator (§4.3) | **Critical** | Emit `Δreach` and `Δpivot` separately; label `mechanism_only` candidates | 1h | Every number the module puts on a slide |
| 3 | `exploitable_risk_score` is a third ranking authority (§4.2) | **High** *(spec defect)* | Delete it and §4.2 step 6; rank remediations | 0.5h *(doc)* | Architecture rule 8, and a visible two-column contradiction in front of a CISO |
| 4 | Candidate shortlist has no approximation bound (§4.4) | **High** | Exhaustive over pivot bindings now; greedy hitting set with its published bound later; emit which was used | 1.5h | The central "fix this one node" claim being defensible under questioning |
| 5 | `risk_score` dependency is unsatisfiable | **High** | Remove from §4.2 step 6, §6.2 and §6.3, or block the module on Identity Risk Profile | 0.5h *(doc)* | Shipping at all |
| 6 | Upstream direction absent from the spec (§4.5) | **Medium** | Precompute the inverse of `permissionBindings` at build; one more `ReferenceSelector` | 2h | The question a CISO actually opens the tool to ask |
| 7 | `identities_reachable` not emitted | **Medium** | One aggregation over the hop arms | 0.5h | AC-6 mapping and §6.3's "Identities Put At Risk" column |
| 8 | §4.1 assumes Role and Resource nodes | **Medium** *(spec defect)* | Amendment 1 (§4.6) | 0.5h *(doc)* | A future implementer adding a second node type |
| 9 | `stale_if_older_than_hours` cites a convention that was refused | **Low** *(spec defect)* | Drop the field; keep `based_on_access_discovery_snapshot` | 0.25h *(doc)* | Consistency with the only other downstream module |
| 10 | Kubernetes pivots are hour-scale, not configuration-scale (§3.2) | **Low** | Scope to RBAC bindings and say so | 0.25h *(doc)* | Overclaiming a platform |
| 11 | Duplicate of `ITAG.md` §F7 | **Low** | Reconcile the two documents; F7's non-destructive requirement is already the right constraint | 0.25h *(doc)* | Two teams building one simulator |
| 12 | No effective-permission model; false-positive rate undefined | **Low** *(inherited)* | Say it on stage, per `identity-exposure-map-research.md` §3.4 | — | Nothing new; it is now attached to a percentage rather than a score |

Items 1 and 2 are the ones that hurt to retrofit — the first because it is seed data the UI will be built against, the second because a published percentage cannot be quietly redefined once a customer has quoted it.

---

## 9. Demo implications

Beats 30–33, following Exposure Map's 24–29. The spine: *Access Discovery showed you the route. Exposure Map showed you whose footprint is biggest. This shows you the one grant to revoke — and it is on a chain where nobody did anything wrong.*

**The material is already on stage.** Beat 23 ("It does not stop at one resource") ends with a table row reading `Grant that closes it | mcp:connect-prod-runbook, held by the group`. That is the choke point, asserted by hand in a markdown table. **This module's entire job, demo-wise, is to compute that sentence instead of authoring it** — and to attach the two deltas to it. Say that out loud; a judge who has just seen beat 23 will recognise the number.

| Beat | What the CISO sees | Why it is needed |
|---|---|---|
| 30 | Whole-estate choke point: `mcp:connect-prod-runbook`. Severing it removes 3 of 184 reachable pairs and 2 of 6 pivot edges. Every rung on the chain is `owned` at severity `none`. | The headline, and the first computed remediation in the product. The ownership row is the argument: this is invisible to every other view. |
| 31 | `connect:ledger-writer` — severs a pivot edge, removes **zero** access, badged `closes: mechanism_only`. | The true negative, and the honesty beat. "A tool that showed you 17% here would have been lying, and we can show you why: `svc-invoice-poster` still reaches that permission through its group." Answers §1.3 on screen. |
| 32 | The selection method, stated: 5 candidates, evaluated exhaustively, `selection: 'exhaustive'`. Beside it, the frequency ranking that would have tied `connect:ledger-writer` with two candidates that do remove access. | The moment to name the NP-completeness result and say that we publish which algorithm produced the answer. Nobody else on the slate will do this. |
| 33 | Uber, September 2022 (§3.4) | The real-world anchor, with the caveat stated: Uber's own words confirm the cascade; the PAM detail is attributed, not established. The choke point in that incident scored low on every per-identity view — which is beat 30 with the names changed. |

**Seed work required before any of the above (gap 1).** Three or four more pivot bindings, at least one where the assumed principal holds a sensitive permission the subject cannot reach any other way, and at least one second two-stage chain in a different app pair. Per the safe pattern that survived two prior seed expansions: make every new identity `owned` / severity `none` / counted false, and never attach children to `svc-scim-provisioner` or the beat-18 terraform ladder.

**Doc debt this module inherits rather than creates.** `docs/demo-script.md` has no written script for beats 16–18, and Appendix A omits the identities added by those beats. No test guards that file. Adding beats 30–33 to a document that is already 3 beats behind will make the gap harder to close, so close it first.

---

## 10. Open questions

### Closed during research

- **Is this module's differentiating claim true?** → **No.** Cross-identity propagation is shipped (`access/classify.ts` L119-130), reaches `hop_count: 6` across two boundaries in the seed, and was enabled by a schema addition that names this module as its second consumer (`PRD-access-discovery.md` Amendment 1). §1, §2, §3 and §4.1 need rewriting around what is actually new.
- **How confident can we be that the true choke point is inside the top-K shortlist?** → **Not at all, as specified.** The problem is NP-complete and polynomially equivalent to minimum hitting set; appearance frequency carries no bound and is measurably wrong on a 5-element candidate set here. Exhaustive while the candidate set is small; greedy hitting set with its published bound thereafter; emit which was used.
- **Can the engine do counterfactuals without breaking its own rules?** → **Yes.** `buildIdentityGraph` is a pure function of the dataset, so a counterfactual is a second `GraphSource` over a copied dataset. No mutation, no second BFS, and `ITAG.md` §F7 L101 already required non-destructiveness.
- **Is a third ranking authority defensible?** → **Not as a per-identity score.** But choke points rank *remediations* — a different population and unit — so the module can ship without touching architecture rule 8, provided it never emits a 0–100 number per identity.
- **Does the depth cap matter?** → **Not in this engine today** (deepest chain 6, cap 16), **but yes in production**, on cost grounds: Google documents its equivalent analysis as "very expensive," running one query per service account, and its API does not recurse.

### Still open

- **What is the right upstream index?** (§4.5) Inverting `permissionBindings` is mechanically obvious, but whether "who can reach `admin:prod-database`" should be a route on this module or on Access Discovery is a boundary question neither PRD answers. It is the highest-value unspecified feature found in this pass.
- **Does Identity Risk Profile ever ship?** Three fields in this PRD and one column in its leaderboard depend on a module with no code on its branch. Both branches consume the `reach.ts`-versus-Access-Discovery seam; neither owner has been consulted. This is a coordination question, not a technical one, and it blocks §4.2 step 6 regardless of whether that step survives §4.2 above.
- **Should `impact/` consume `exposure/` or `access/` directly?** Seeding from `ExposureProfile.exposure_set` costs N profile calls and inherits exposure's de-duplication (worst-mechanism collapse), which is *wrong* for counterfactuals — collapsing away a surviving route is exactly how `connect:ledger-writer` would be mis-scored. Reading `AccessService.profile().paths` directly avoids that. The PRD mandates the former (§4.2 step 1); this research leans to the latter but has not measured the cost difference.
- **No public documentation found:** any general SaaS/OAuth API for enumerating apps that can mint tokens for other integrations (PRD §5's last row); any published false-positive rate for attack-path choke-point recommendations from any vendor; any peer-reviewed evaluation of appearance-frequency candidate selection against optimal. All three absences are findings, not gaps in the search.
- **The Uber PAM detail** (§3.4). Uber's first-party statement confirms the cross-identity cascade but not the Thycotic specifics. Verifiable only if Uber or a court record publishes more; until then it ships attributed.
- **Backend route tests remain absent.** `backend/package.json` has no test script and no test dependency; this would be the sixth router shipped without one. The change should cover all eight routers at once rather than arriving attached to this module.

---

## 11. Sources

**Provider documentation (official)**

- AWS — [`GetAccountAuthorizationDetails` (returns `RoleDetailList` with trust policies)](https://docs.aws.amazon.com/IAM/latest/APIReference/API_GetAccountAuthorizationDetails.html) · [`RoleDetail` data type (`AssumeRolePolicyDocument`, max 131,072 chars)](https://docs.aws.amazon.com/IAM/latest/APIReference/API_RoleDetail.html) · [IAM and STS quotas (600 rps shared STS request quota; cross-account attribution)](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_iam-quotas.html) · [Granting a user permissions to pass a role (`iam:PassRole`)](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_use_passrole.html)
- Google Cloud — [Policy Intelligence: Analyze allow policies (`--analyze-service-account-impersonation`, the six impersonation permissions, "very expensive operation")](https://cloud.google.com/policy-intelligence/docs/analyze-iam-policies) · [`analyzeIamPolicyLongrunning` (asynchronous export to BigQuery/GCS)](https://cloud.google.com/asset-inventory/docs/reference/rest/v1/TopLevel/analyzeIamPolicyLongrunning) · [`gcloud asset analyze-iam-policy-longrunning`](https://docs.cloud.google.com/sdk/gcloud/reference/asset/analyze-iam-policy-longrunning) · [Roles for service account authentication](https://cloud.google.com/iam/docs/service-account-permissions)
- Microsoft — [Federated Identity Credentials – List (ARM REST API)](https://learn.microsoft.com/en-us/rest/api/managedidentity/federated-identity-credentials/list?view=rest-managedidentity-2024-11-30) · [Workload identity federation: configure an app to trust a managed identity (20-credential maximum; required directory roles)](https://learn.microsoft.com/en-us/entra/workload-id/workload-identity-federation-config-app-trust-managed-identity) · [Defender for Cloud: what is an attack path](https://learn.microsoft.com/en-us/azure/defender-for-cloud/concept-attack-path)
- Kubernetes — [Managing Service Accounts (TokenRequest, bound tokens, 1-hour default, superseded Secret mechanism)](https://kubernetes.io/docs/reference/access-authn-authz/service-accounts-admin/) · [Projected Volumes (`serviceAccountToken`, `expirationSeconds`, 600s minimum, `--service-account-max-token-expiration`)](https://kubernetes.io/docs/concepts/storage/projected-volumes/) · [Configure Service Accounts for Pods](https://kubernetes.io/docs/tasks/configure-pod-container/configure-service-account/)
- SaaS/OAuth — no general cross-vendor API for delegated-admin token minting located; see §3.2.

**Peer-reviewed literature**

- [Sheyner, Haines, Jha, Lippmann, Wing — *Automated Generation and Analysis of Attack Graphs*, IEEE S&P 2002 (Lemma 2: the decision version of Minimum Critical Set of Attacks is NP-complete, by reduction from minimum cover)](https://pages.cs.wisc.edu/~jha/jha-papers/security/oakland_2001.pdf)
- [Jha, Sheyner, Wing — *Two Formal Analyses of Attack Graphs*, IEEE CSFW 2002 (MCSA polynomially equivalent to minimum hitting set; `GREEDY-HITTING-SET` with provable bounds; attack graphs as MDPs)](https://www.cs.cmu.edu/~scenariograph/jha-wing.pdf) · [CMU technical report abstract, TR02-109](https://www.cs.cmu.edu/afs/cs/project/calder/www/tr02-109.html)

**Standards and control frameworks**

- [NIST SP 800-53 Rev 5 CA-8, Penetration Testing (control text and supplemental guidance)](https://csf.tools/reference/nist-sp-800-53/r5/ca/ca-8/) · [CA-8 assessment objectives](https://grcacademy.io/nist-800-53/controls/ca-8/) · [SP 800-53 Rev 5.1 OSCAL-derived control text (AC-6, RA-3)](https://csrc.nist.gov/CSRC/media/Projects/risk-management/800-53%20Downloads/800-53r5/SP_800-53_v5_1-derived-OSCAL.pdf)
- PCI DSS v4.0 Requirement 11.4.5 — segmentation penetration testing, at least every 12 months and after any change to segmentation controls, confirming the controls are "operational and effective."
- [FIRST — CVSS v4.0 Specification Document](https://www.first.org/cvss/v4.0/specification-document) (CVSS measures severity, not risk; publication requires score *and* vector) · [FIRST EPSS](https://www.first.org/epss/) (probability of exploitation in the next 30 days — a different unit from CVSS, never merged with it)
- [MITRE ATT&CK T1548.005 — Abuse Elevation Control Mechanism: Temporary Elevated Cloud Access](https://attack.mitre.org/techniques/T1548/005/) (`iam.serviceAccountTokenCreator`, AWS `PassRole`, Exchange `ApplicationImpersonation`; distinguished from T1098.003) · [T1550 — Use Alternate Authentication Material](https://attack.mitre.org/techniques/T1550/) · [T1134 — Access Token Manipulation](https://attack.mitre.org/techniques/T1134/)

**Threat intelligence and incident record**

- [Uber — *Security update*, official newsroom statement, September 2022](https://www.uber.com/hn/en/newsroom/security-update/) — the first-party record of the contractor compromise and the cross-account cascade. **The Thycotic/PAM detail widely attributed to this incident is not in this statement**; see §3.4.
- [CISA AA21-008A — Detecting Post-Compromise Threat Activity in Microsoft Cloud Environments](https://www.cisa.gov/news-events/cybersecurity-advisories/aa21-008a) (forged SAML tokens, ADFS certificate-signing enumeration, lateral movement to cloud) · [CISA AA20-352A](https://www.cisa.gov/news-events/cybersecurity-advisories/aa20-352a) (credentials added to existing Azure/M365 application service principals) — evaluated and not selected; see §3.4.

**Competitive — product documentation (not marketing)**

- [SpecterOps BloodHound — Attack Paths: exposure and impact metrics, Choke Point view](https://bloodhound.specterops.io/analyze-data/findings/attack-paths) · [BloodHound glossary — Choke Point, Exposure, Impact definitions](https://bloodhound.specterops.io/resources/glossary/overview) · [BloodHound API — `List domain attack paths details` (`ExposureCount`, `ExposurePercentage`, `ImpactCount`, `ImpactPercentage`, butterfly analysis feature flag)](https://bloodhound.specterops.io/reference/attack-paths/list-domain-attack-paths-details)

**Vendor marketing (labeled as such, not documented behavior)** — [SpecterOps BloodHound Enterprise product page](https://specterops.io/bloodhound-enterprise/) ("average 35% reduction of risk in the first 30 days"; "cutting a single choke point severs access to more than 17,000 attack paths"). Cited in §3.5 only, and only as claims.

**Repository evidence** — `core/src/domain/{types,access,exposure,policy}.ts`, `core/src/graph/{build,traverse}.ts`, `core/src/access/{classify,service}.ts`, `core/src/exposure/{score,service}.ts`, `core/src/data/{validate}.ts`, `core/src/data/seed/catalog.ts`, `core/src/access/classify.test.ts`, `core/src/exposure/service.test.ts`, `backend/src/server.ts`, `backend/package.json`, `docs/{ITAG,demo-script,PRD-access-discovery,PRD-identity-exposure-map}.md`. All measurements taken at `667ae68` with `ITAG_NOW=2026-07-31T00:00:00Z`, 222/222 core tests passing. Counterfactual figures produced by rebuilding `buildIdentityGraph` over a dataset copy with one `grants_identity` binding removed; no repository file was modified to obtain them.
