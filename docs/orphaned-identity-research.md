# Orphaned Identity — Implementation Research

> **Lens:** Principal Backend Engineer + CISO, Unosecur
> **Scope:** ITAG `F5` (orphaned accountability) and `F11` (off-boarding sweep), evaluated against industry practice, auditor expectations, and Unosecur's IdentityGovern direction.
> **Companions:** [`ITAG.md`](./ITAG.md), [`PRD-delegation-chain.md`](./PRD-delegation-chain.md)
> **Status:** research output, Jul 2026

---

## 1. Executive summary

1. **We are conflating three different findings under one word.** "No owner on record," "owner exists but is no longer valid," and "everything a departed human left behind" are three distinct signals with different data needs, different false-positive profiles, and different remediation paths. Ship them as one `ownership_state` enum with reason codes, not one boolean flag.
2. **The single highest-value design correction is `creator ≠ owner`.** `provisioned_by` is a historical audit fact; ownership is a current, reassignable, attestable relationship. ITAG currently uses the creation edge as the accountability anchor, which means every ownership reassignment in the real world reads as a false finding. Resolve owner through a precedence chain, fall back to creator only as lowest-confidence evidence, and emit the source and confidence with every finding.
3. **Alignment with Unosecur is strong on direction, weak on model.** Unosecur's Unified Identity Fabric already publicly claims "map ownership, including for orphaned and shared accounts," and the Delegation Chain PRD already defines `orphaned_creator`. ITAG is not proposing a new pillar — it is proposing *depth* (transitive human→NHI→AI-agent lineage plus residual-footprint sweep) inside an existing one. Pitch it that way.
4. **F11 as currently framed is not differentiated.** Entro markets almost verbatim the F11 pitch ("start with each human and map outward to every identity they own"), Oasis ships ownership assignment plus attestation, Veza tags every NHI Owned/Orphaned/Ambiguous. Our defensible edge is combining ownership validity with blast-radius sensitivity and control decay into one ranked finding — not the sweep itself.
5. **Detection without an evidence record and an owner-reassignment path is a report, not a control.** Auditors ask for a dated finding, an approval/ticket, and proof of action. Design the finding object as an immutable, exportable evidence artifact from day one; it costs almost nothing now and is the difference between a demo and something a CISO can put in front of a PCI assessor.

---

## 2. As-built vs as-specified

Reality check before any design work: **nothing in this capability is built.** Two commits exist (`3635a55` scaffold, `c0ca793` docs).

| Item | Specified | Built | Evidence |
| --- | --- | --- | --- |
| Orphaned accountability flag (F5) | Yes — `docs/ITAG.md` L85-89 | No | `frontend/src/graph/` contains only `.gitkeep` |
| Off-boarding sweep (F11) | Yes — `docs/ITAG.md` L163-181 | No | `frontend/src/components/` contains only `.gitkeep` |
| `employee_status` table | Schema sketched — `docs/ITAG.md` L322-328 | No | `frontend/src/data/` contains only `.gitkeep` |
| Accountability trace (F4) | Yes — `docs/ITAG.md` L79-83 | No | no traversal module exists |
| LLM narrative consuming status (F6) | Prompt template — `docs/ITAG.md` L358-377 | Prompt builder only | `backend/src/llm/prompts.ts` L17-33 |
| `/api/explain` | Yes — `docs/ITAG.md` L246 | Stub, returns placeholder | `backend/src/routes/explain.ts` L25-28 |
| Graph UI | Yes — `docs/ITAG.md` L250-260 | Three hardcoded placeholder nodes | `frontend/src/App.tsx` L16-25 |

Consequence: every recommendation below is a greenfield decision, not a refactor. That is the good news — the expensive mistakes are all still avoidable.

---

## 3. What the outside world actually calls this

### 3.1 Terminology — we have a naming problem

The industry term **orphaned account** means an account with **no valid owner**, usually because the human left ([SecurEnds](https://www.securends.com/blog/orphaned-accounts/)). ITAG's phrase "orphaned accountability" means something narrower and more specific: an owner *resolves*, but that owner is no longer a valid accountable party. The Delegation Chain PRD's `orphaned_creator` (L45, L66) is narrower still: the *direct creator* is deactivated while the created identity is active.

Three names, three scopes, one demo. An auditor or a buyer will assume the industry definition and then find our numbers don't match theirs.

**Recommendation:** standardize on one computed field with explicit reason codes, and use industry words in the UI.

```ts
type OwnershipState =
  | 'owned'         // live, attested owner resolved
  | 'unowned'       // no owner on record  → classic "orphaned account"
  | 'owner_invalid' // owner resolved but departed / role-changed / unattested
  | 'ambiguous'     // multiple conflicting owner signals
  | 'unknown';      // insufficient data — NOT a finding (see §5.3)

type OwnershipReason =
  | 'owner_departed' | 'owner_role_changed' | 'owner_never_attested'
  | 'owner_attestation_stale' | 'no_owner_on_record' | 'creator_deactivated'
  | 'conflicting_owner_signals' | 'outside_audit_window';
```

Veza uses precisely this shape — Owned / Orphaned / Ambiguous with a ≥95% tagging target ([Veza](https://veza.com/blog/nhi-ownership-security-checklist/)). Matching the vocabulary costs us nothing and makes the finding legible to anyone who has evaluated an NHI tool.

### 3.2 Compliance mapping (this is what buys budget)

| Framework | Control | What it demands | What we must emit |
| --- | --- | --- | --- |
| PCI DSS v4.0.1 | 8.2.6 | Inactive accounts removed/disabled within **90 days** | Dated report + last-activity timestamp per identity |
| NIST SP 800-53 | AC-2(3) | Disable accounts on **separation, role change, inactivity**, within an org-defined SLA, with evidence | Trigger type, SLA clock, disposition record |
| NIST SP 800-53 | AC-2(4) | Automatically audit account creation/modification/removal | The `CREATED_BY` lineage we already ingest |
| ISO 27001:2022 | A.5.16 / A.5.18 | Identity lifecycle and access-rights management | Owner-of-record + review date per identity |
| SOC 2 | CC6.2 / CC6.3 | Authorized-access registration and deregistration | Same evidence artifact |

Two things fall out of this that change the backend design:

- **AC-2(3) names role change as a first-class trigger, alongside separation and inactivity.** ITAG's `role_changed` status is not an invented nicety — it is a named control trigger. Keep it.
- **PCI's 90 days is about *inactivity*, not about *owner validity*.** These are different clocks measuring different things. Model both (`last_activity_at` and `owner_valid_since`), do not collapse them.

Unosecur's own NHI page states the point bluntly: *"Most audit findings against NHIs cite missing ownership and stale credentials"* ([Unosecur](https://www.unosecur.com/use-cases/granular-control-of-non-human-identities-nhi)). That is the market for this feature, in one sentence.

### 3.3 The canonical incident

**Colonial Pipeline, April 2021.** Initial access was a legacy VPN account belonging to a former employee — still enabled, no MFA, credentials surfaced in a dark-web dump. Nine days of dwell time before the ransom note ([CRN](https://www.crn.com/news/security/colonial-pipeline-hacked-via-inactive-account-without-mfa), [DataBreachToday](https://www.databreachtoday.com/colonial-attackers-used-compromised-vpn-credentials-a-16819), [INL CyOTE case study](https://cyote.inl.gov/content/uploads/24/2025/12/CyOTE-Case-Study_Colonial-Pipeline.pdf)).

MITRE ATT&CK T1078 calls this out explicitly: adversaries abuse inactive accounts of people no longer at the organization precisely because *the original user isn't around to notice* ([MITRE T1078](https://attack.mitre.org/techniques/T1078/)).

This is the demo narrative, and note what it actually is: **an orphaned identity AND a decayed control, together.** Neither signal alone would have ranked it top of the queue. That is the argument for fusing F5 with F9, and it is the strongest thing we have.

### 3.4 Competitive reality — be honest with ourselves

| Vendor | What they already ship | Overlap with F5/F11 |
| --- | --- | --- |
| [Entro](https://entro.security/blog/non-human-identity-lineage-iam-governance/) | "Identity lineage" — start from a human, map outward to every NHI and agent they own | **F11, near-verbatim** |
| [Oasis](https://www.oasis.security/blog/nhi-ownership) (Cyera) | AI/ML ownership discovery from IdP/logs/CMDB + ownership attestation | Owner resolution + attestation |
| [Veza](https://veza.com/blog/nhi-ownership-security-checklist/) | Owned/Orphaned/Ambiguous tagging, owner+backup, enforce owner at creation time | Ownership state model |
| Astrix (Cisco), Token Security | NHI discovery, ownership attribution, lifecycle | Discovery layer |

**Verdict:** the sweep is table stakes in 2026. Two things are *not* commoditized and are where we should spend the engineering hours:

1. **Transitive lineage across identity kinds** — human → service account → AI agent, multi-hop. Most tools resolve one hop (creator) or a flat owner tag. Our graph engine resolves the chain and can name the human three hops back.
2. **Ranking orphans by reachable sensitive blast radius**, not by count. Everyone can produce a list of 4,000 orphans. Almost nobody hands you the seven that can reach production data.

---

## 4. Implementation insights (the actionable part)

### 4.1 Insight #1 — Separate the creation edge from the ownership edge

This is the one that will hurt most if we get it wrong, because it is baked into the seed schema.

`docs/ITAG.md` L283 uses `provisioned_by` as both the traversal edge *and* the accountability anchor. In reality those diverge constantly: a service account is created by a bootstrap admin in 2021, handed to the platform team in 2023, and the platform team's tech lead changes twice. Creator is immutable history. Owner is current, reassignable, and attestable.

```ts
interface Identity {
  id: string;
  type: 'human' | 'service_account' | 'ai_agent' | 'group' | 'integration';
  app: string;                     // see §4.4 — every identity is app-scoped
  created_by: string | null;       // immutable audit fact
  created_at: string | null;
  owner: OwnerRef | null;          // current accountable party — resolved, not raw
  revoked: boolean;
  last_activity_at: string | null; // PCI 8.2.6 clock, distinct from owner validity
}

interface OwnerRef {
  kind: 'team' | 'user';
  id: string;
  source: 'explicit_tag' | 'group_ownership' | 'creator_fallback' | 'inferred';
  confidence: 'high' | 'medium' | 'low';
  attested_at: string | null;
}
```

**Resolution precedence** (first match wins, record which one fired):

1. Explicit owner tag / registry entry → `high`
2. Owning team or group membership → `high`
3. Creator, if still active → `medium`, `source: creator_fallback`
4. Creator, if departed → this *is* the `owner_invalid` finding, `source: creator_fallback`, `low`
5. Nothing → `unowned`

Emitting `source` and `confidence` is what lets an analyst argue with the finding instead of dismissing the tool. Oasis built an entire ML module for step 3-5; we can get most of the value from a deterministic precedence chain over the signals we already have.

### 4.2 Insight #2 — Own at the team level

Every practitioner source converges on this: *"Assign ownership at the team level, not the individual level. Individuals leave. Teams persist."* ([Decryption Digest](https://www.decryptiondigest.com/blog/non-human-identity-governance-service-accounts)). Veza recommends an owner **and a backup**.

This inverts the finding logic in a useful way. An identity is not orphaned because a person left — it is orphaned because **no live team claims it**. Concretely:

- `owner.kind === 'team'` and the team has ≥1 active member → `owned`, regardless of who created it.
- `owner.kind === 'user'` and that user departed → `owner_invalid`. Remediation is *reassign*, not *revoke*.
- No team, no user → `unowned`.

Practical consequence for the demo: seed at least one identity whose creator departed but whose owning team is alive. It should render **green**. That single node is the most credible thing in the whole demo, because it proves we don't just count departures.

### 4.3 Insight #3 — Model time, not booleans

`{ status: "departed" }` cannot answer the only two questions a CISO asks: *how long has this been true* and *are we inside SLA*.

```ts
interface OwnershipFinding {
  identity_id: string;
  app: string;
  state: OwnershipState;
  reasons: OwnershipReason[];
  detected_at: string;
  condition_since: string;      // when the owner actually became invalid
  age_days: number;             // drives severity + MTTR metric
  sla_days: number;             // org-defined, per identity type (AC-2(3))
  sla_breached: boolean;
  // ranking
  reachable_permissions: string[];
  reachable_sensitive_count: number;
  hops_from_owner: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
}
```

`condition_since` is derived from the HR departure date, **not** the scan date. Otherwise every finding looks one day old and MTTR is meaningless. Severity should be driven primarily by `reachable_sensitive_count` and secondarily by `age_days` — count and age alone produce an unrankable list.

### 4.4 Insight #4 — App-scope the edges, correlate above them

Direct conflict between the two PRDs: Delegation Chain insists lineage is per-app and must **not** be merged at ingestion (`PRD-delegation-chain.md` L54, L57); ITAG builds one merged graph (`ITAG.md` L46-57).

Both are right about their own layer. Resolution:

- **Storage/ingestion:** app is a required attribute on every edge. Uniqueness key is `(app, child_id)` for creation edges. This preserves the Unosecur model exactly and is a prerequisite for ever ingesting real CloudTrail/Okta/K8s data (`PRD-delegation-chain.md` L92-100).
- **Analysis:** compute per-app forests, then run an *optional* correlation pass keyed on a `person_id` to answer "this human's total residual footprint across all systems." That cross-app rollup is exactly the open question at `PRD-delegation-chain.md` L180, and F11 is the use case that answers it — worth saying out loud when we present.

Structural note for the traversal code: creation edges form a **forest** (one parent, acyclic) but `delegates_to` in ITAG's model is a general graph and **can cycle** (A provisions B, B later provisions a replacement for A). The traversal must carry a visited set and terminate on revisit rather than assume tree properties.

### 4.5 Insight #5 — The finding is an evidence artifact

PCI assessors want a dated inactive-account report plus tickets/change records plus logs proving disablement. AC-2(3) wants retained evidence that disablement happened within the SLA, with approved and time-bounded exceptions.

So the finding object needs a lifecycle, not just a computation:

```ts
interface FindingDisposition {
  finding_id: string;
  action: 'reassigned' | 'revoked' | 'attested' | 'suppressed' | 'open';
  actor: string;
  at: string;
  justification: string;
  expires_at: string | null;   // exceptions MUST be time-bounded
  evidence_ref: string | null; // ticket / change record
}
```

Append-only. Never mutate a finding in place — supersede it. Point-in-time reconstruction ("what did we know on 30 June") is the whole value to an auditor, and you cannot retrofit it onto mutable rows.

For the hackathon this is ~30 lines and an "Export evidence (JSON/CSV)" button. That button is disproportionately persuasive to anyone who has survived an audit.

### 4.6 Insight #6 — Suppression is the feature, not an afterthought

An orphan detector that cries wolf is uninstalled in month one. Known false-positive classes, each needing an explicit rule:

| Class | Why it looks orphaned | Handling |
| --- | --- | --- |
| Break-glass / emergency accounts | Deliberately unowned, deliberately dormant | Registry-tagged, excluded from `unowned`, monitored for *use* instead |
| Shared / system accounts | No single human owner by design | Require team owner; `ambiguous` if none |
| Vendor / integration accounts | Owner is external | Sponsor field; sponsor departure is the trigger |
| SSO/SCIM-federated identities | No creator recorded in the app | `unknown`, not `unowned` |
| Bulk-imported / pre-tracking accounts | Predate audit retention | `outside_audit_window` |
| Already-revoked identities | Cleaned up already | `revoked: true` filter — already in the ITAG spec at L175 |

**The non-negotiable rule: absence of data is not evidence of an orphan.** `unknown` must be a distinct state from `unowned` and must never appear in the finding count. This is Delegation Chain §6.6's data-gap transparency requirement (`PRD-delegation-chain.md` L158-162), and it is the single most common way orphan-detection features lose credibility.

### 4.7 Insight #7 — Every finding routes to a live human

Veza's framing is the right one: results should "route to a person, not a queue." An orphan finding whose only remediation is "revoke" will be ignored, because nobody wants to be the person who broke production by revoking a credential of unknown purpose — which is exactly *why* it went unowned.

Remediation ranking, in order of preference:

1. **Reassign** to a live owning team (preferred — resolves accountability without operational risk)
2. **Attest** ("this is intentionally unowned, here's why, expires in 90 days")
3. **Revoke** (only where blast radius is high and last activity is old)

Escalation target when the owner is gone: the owner's former manager or the team that inherited the function. If we don't model that, the finding has nowhere to go.

---

## 5. Recommended detection algorithm

Single pass, per app, then a cross-app rollup. Deterministic, no ML, ~150 lines.

```
INPUT: identities[], creation_edges[], delegation_edges[], hr_records[], owner_registry[]

PHASE 1 — Owner resolution (per identity, per app)
  for each identity i:
    i.owner ← resolveOwner(i)            # precedence chain, §4.1
    i.owner_validity ← validate(i.owner) # HR status + attestation age

PHASE 2 — State classification
  for each identity i where not i.revoked:
    if i.app has no creation audit coverage for i.created_at → 'unknown'/outside_audit_window
    else if i.owner is null and no descendants                → 'unowned'  (or suppressed class)
    else if i.owner is null                                   → 'unowned'/no_owner_on_record
    else if owner departed                                    → 'owner_invalid'/owner_departed
    else if owner role_changed away from this domain          → 'owner_invalid'/owner_role_changed
    else if attestation older than threshold                  → 'owner_invalid'/owner_attestation_stale
    else if conflicting owner signals                         → 'ambiguous'
    else                                                      → 'owned'

PHASE 3 — Residual footprint (F11)
  for each human h where hr_records[h].status == 'departed':
    footprint ← BFS forward over delegation_edges + creation_edges from h
                (visited set — the delegation graph can cycle, §4.4)
    live ← [n in footprint where not n.revoked]
    emit ResidualFootprint{ h, live, max_hops, sensitive_reachable }

PHASE 4 — Ranking
  for each finding f:
    f.reachable_* ← forwardBlastRadius(f.identity)     # reuse F2
    f.severity    ← rank(sensitive_reachable, age_days, identity_type, sla_breached)

PHASE 5 — Suppression + evidence
  apply suppression registry; attach disposition history; freeze as append-only record
```

Complexity is `O(V + E)` per app with memoized owner resolution. At hackathon data scale this is instant; at real scale, the incremental path is event-triggered recompute on account-creation and HR-leaver events (`PRD-delegation-chain.md` L88), touching only the affected subtree.

**Reuse note:** Phase 3 is Phase 2's traversal run in the opposite direction from a different entry point. F5 and F11 must be one code path with two entry points — if they fork into two implementations, they will disagree with each other in the demo, which is worse than not shipping F11.

### 5.1 API surface

```
GET  /api/ownership/:identityId          → OwnershipFinding (single identity)
GET  /api/ownership?state=owner_invalid&app=aws-iam&min_severity=high
                                         → ranked finding list (the CISO queue)
GET  /api/offboarding-sweep              → ResidualFootprint[] per departed human
GET  /api/offboarding-sweep/:humanId     → one human's live downstream tree
POST /api/findings/:id/disposition       → reassign | revoke | attest | suppress
GET  /api/findings/export?format=csv     → auditor evidence pack
```

`GET /api/ownership` with `state` + `severity` filters is the endpoint that matters. It is the one that answers "what do I do Monday morning," and it should be the default landing view, not the graph.

### 5.2 Metrics to expose

| Metric | Why a CISO cares | Computable today? |
| --- | --- | --- |
| % identities with a verified live owner | The single coverage number; Veza targets ≥95% | Yes |
| Orphan MTTR (detect → disposition) | Proves the control works, not just that it detects | Yes, once dispositions exist |
| Residual footprint per departed employee | The off-boarding gap, quantified | Yes (F11) |
| Orphaned identities reachable to sensitive data | The prioritized subset that actually matters | Yes (F2 + F5) |
| SLA breach count vs AC-2(3) threshold | Direct audit exposure | Yes, needs `condition_since` |
| Ownership coverage by identity type | Shows NHI/agent gap vs humans | Yes |

Deliberately **not** on the list: raw orphan count. It goes up when coverage improves, which makes it actively misleading on a board slide.

---

## 6. Unosecur alignment

### 6.1 Side by side

| Dimension | ITAG F5/F11 | Unosecur Delegation Chain | Assessment |
| --- | --- | --- | --- |
| Core signal | Root human departed / role-changed / unreviewed >90d (`ITAG.md` L85-89) | `orphaned_creator`: creator inactive while created identity active (`PRD` L45, L66) | **Complementary.** Unosecur = one hop, ITAG = transitive to root. Same family, different depth. |
| Graph model | One merged graph, `provisioned_by` + `delegates_to`, general digraph | Per-app forest, single `CREATED_BY` parent, app on every edge (`PRD` L52-54) | **Conflict.** Resolve per §4.4 — app-scope the edges, correlate above. |
| Owner semantics | Creator *is* the accountable party | Creator status shown as a column (`PRD` L129) | **Both under-model it.** §4.1 applies to both. Genuine contribution back to the product. |
| Departure ground truth | Mocked `employee_status` (`ITAG.md` L322-328) | Creator active/inactive/offboarded from app data | **ITAG's HRIS framing is stronger.** App-level "inactive" ≠ "left the company." |
| Sweep direction | Forward from departed human, transitive (`ITAG.md` L170-173) | Descendant resolution exists, but no departed-human entry point | **Net-new to Unosecur.** This is the actual contribution. |
| Risk scoring | Severity by sensitivity + escalation fusion | Explicitly a non-goal; deferred to Identity Risk Profile (`PRD` L34) | **Boundary issue.** See §6.2. |
| Data-gap handling | Absent | Required, with per-app banners (`PRD` L158-162) | **ITAG gap.** Must adopt. |
| UX at scale | Graph-first | Table-first, tree as scoped escape hatch (`PRD` L106-108) | **ITAG gap.** Graph-first does not survive 4,000 identities. |

### 6.2 Verdict: (b) — a distinct module alongside Delegation Chain

Not a feature *inside* Delegation Chain, for a concrete reason: Delegation Chain explicitly scopes out risk scoring and attestation workflows (`PRD-delegation-chain.md` L34), and the orphaned-identity capability is worthless without both. Cramming ranking and disposition into Delegation Chain violates its stated boundary and makes it a second Identity Risk Profile.

The clean decomposition:

- **Delegation Chain** stays as specified — per-app creation lineage, structural anomaly flags, table + tree, one hop of creator status. It becomes the *upstream data producer*.
- **Ownership Assurance** (proposed, this work) consumes Delegation Chain's lineage plus HRIS plus the owner registry, and produces ownership state, ranked findings, the off-boarding sweep, and the disposition/evidence trail. It is a governance module with a risk-ranked queue.

This also resolves the ITAG/Delegation-Chain conflict cleanly: ITAG's merged graph becomes Ownership Assurance's *analysis* layer sitting on top of Delegation Chain's app-scoped *storage* layer. Nobody has to give up their model.

### 6.3 Strategic fit — supportive, with one caution

Unosecur's public positioning already includes: a unified identity graph across humans, NHIs, and AI agents; ownership attribution for NHIs; MITRE ATT&CK-aligned prioritized findings; and compliance mapping to SOC 2 / ISO / PCI DSS ([unified identity fabric](https://www.unosecur.com/unified-identity-fabric), [NHI use case](https://www.unosecur.com/use-cases/granular-control-of-non-human-identities-nhi)). Every single one of those is a surface F5/F11 plugs directly into. There is no strategic friction here.

**The caution:** the Unified Identity Fabric page already claims *"Map ownership, including for orphaned and shared accounts."* So internally, presenting this as a new capability invites the response "we already do that." Present it instead as: *the existing ownership mapping resolves one hop and one system; this resolves the full chain across systems, validates the owner against HR rather than app-activity, and sweeps the residual footprint of everyone who has already left.* That is a defensible depth claim rather than a contestable novelty claim.

---

## 7. Gaps, ranked

| # | Gap | Severity | Recommendation | Effort |
| --- | --- | --- | --- | --- |
| 1 | Creator used as owner | **Critical** | `OwnerRef` + precedence chain (§4.1) | 2h |
| 2 | Boolean status, no time modeling | **High** | `condition_since`, `age_days`, SLA fields (§4.3) | 1h |
| 3 | No suppression / no `unknown` state | **High** | Suppression registry + audit-window state (§4.6) | 1.5h |
| 4 | No app scoping on edges | **High** | `app` required on every edge; key `(app, child)` (§4.4) | 1h |
| 5 | No disposition / evidence trail | **High** | Append-only `FindingDisposition` + export (§4.5) | 1.5h |
| 6 | Terminology diverges from industry | **Medium** | `OwnershipState` enum + industry labels in UI (§3.1) | 0.5h |
| 7 | Graph-first UX | **Medium** | Ranked table default, graph on drill-down | 2h |
| 8 | No team-level ownership | **Medium** | `owner.kind: 'team'`, backup owner (§4.2) | 1h |
| 9 | No remediation routing | **Medium** | Reassign/attest/revoke actions with escalation target (§4.7) | 1h |
| 10 | Cycle-unsafe traversal assumption | **Low** | Visited set in BFS (§4.4) | 0.25h |
| 11 | F5 → Repudiation STRIDE mapping is weak | **Low** | Active abuse of an orphan is Spoofing (T1078); Repudiation only fits the "cannot attribute the action" case. Map to both. | 0.25h |

Items 1-5 are the ones that are painful to retrofit because they live in the schema. Do them before writing the seed data, per the build plan's own advice (`ITAG.md` L382).

---

## 8. Demo implications

Seed data must contain, at minimum:

1. **The Colonial case** — a departed employee's identity, still live, MFA disabled. Orphaned *and* control-decayed. This is the headline, and it is a real, citable incident pattern.
2. **A true negative** — creator departed, owning team alive, renders **green**. Proves we don't just count departures (§4.2).
3. **An `unknown`** — identity outside the app's audit-retention window, rendered distinctly from `unowned` and excluded from the count (§4.6).
4. **A suppressed break-glass account** — deliberately unowned, correctly not a finding.
5. **A three-hop residual footprint** — departed human → service account → AI agent, all live, agent reaching something sensitive. This is the transitive depth no competitor's flat owner tag can produce (§3.4).

Items 2, 3 and 4 are what separate this from a report generator. Anyone can show red nodes; showing the ones we correctly *didn't* flag is what a security buyer is actually evaluating.

The closing line at `ITAG.md` L420 should be tightened to lead with the differentiator: not "we find orphans" but *"we find the orphan that can reach production, name the three hops between it and the person who left, and hand you the person who should own it now."*

---

## 9. Open questions

- **HRIS `role_changed` semantics.** AC-2(3) treats role change as a disablement trigger, but a lateral move within the same domain shouldn't invalidate ownership. What distinguishes a mover who keeps ownership from one who loses it — org-unit change, cost-center change, or manager change? Not resolvable from the repo; needs a product decision.
- **Attestation staleness threshold.** ITAG proposes 90 days (`ITAG.md` L88). PCI's 90 days measures *inactivity*, not attestation age. Are we borrowing a number that doesn't apply? Most IGA programs attest quarterly or semi-annually for non-privileged access.
- **Cross-app person correlation.** Required for the full F11 footprint story, explicitly open in `PRD-delegation-chain.md` L180. Ship app-scoped first with correlation behind a flag?
- **Self-registered / OAuth-signup identities.** Neither root nor unlinked (`PRD-delegation-chain.md` L181). Under §4.1 they resolve to `unowned` with no creator — is that correct, or do they need their own state?
- **AI agent ownership under MCP.** Unosecur ships an MCP Gateway for agent identities. When an agent is spawned by another agent at runtime, does the ownership chain resolve to the spawning agent's owner, or does each ephemeral agent need its own owner record? Unverified — no public documentation found on the Gateway's identity attribution model.

---

## 10. Sources

- [PCI DSS 4.0.1 Req 8.2.6 implementation guide](https://learn.daydream.ai/requirements/pci-dss-8-2-6) · [ManageEngine, PCI Req 8](https://www.manageengine.com/compliance-manager/pci-dss-compliance/pci-dss-requirement-8.html)
- [NIST SP 800-53 AC-2(3)](https://learn.daydream.ai/requirements/nist-sp-800-53-n80053-05) · [AC-2 Account Management, CSF Tools](https://csf.tools/reference/nist-sp-800-53/r5/ac/ac-2/)
- [MITRE ATT&CK T1078 Valid Accounts](https://attack.mitre.org/techniques/T1078/)
- [Colonial Pipeline: CRN](https://www.crn.com/news/security/colonial-pipeline-hacked-via-inactive-account-without-mfa) · [DataBreachToday](https://www.databreachtoday.com/colonial-attackers-used-compromised-vpn-credentials-a-16819) · [INL CyOTE case study](https://cyote.inl.gov/content/uploads/24/2025/12/CyOTE-Case-Study_Colonial-Pipeline.pdf)
- [Veza — NHI ownership checklist](https://veza.com/blog/nhi-ownership-security-checklist/) · [Oasis — NHI ownership assignment & attestation](https://www.oasis.security/blog/nhi-ownership) · [Entro — NHI lineage](https://entro.security/blog/non-human-identity-lineage-iam-governance/)
- [SecurEnds — detecting orphaned accounts](https://www.securends.com/blog/orphaned-accounts/) · [Service account governance 2026](https://credentialgovernance.avatier.com/en/blog/service-account-governance-non-human-identity-2026) · [NHI governance 2026](https://www.decryptiondigest.com/blog/non-human-identity-governance-service-accounts)
- [Unosecur — Unified Identity Fabric](https://www.unosecur.com/unified-identity-fabric) · [NHI use case](https://www.unosecur.com/use-cases/granular-control-of-non-human-identities-nhi) · [NHI/agentic identity blog](https://www.unosecur.com/resources/blog/rise-of-the-unseen-managing-the-non-human-agentic-identity-explosion)
