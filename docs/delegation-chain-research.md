# Delegation Chain — Implementation Research

> **Lens:** Principal Backend Engineer + CISO, Unosecur
> **Scope:** `docs/PRD-delegation-chain.md` — per-app `CREATED_BY` forests, generation depth, fan-out, `orphaned_creator`, `unlinked`, the §4.3 chain object, and the table-first + scoped-tree UX — evaluated against provider reality, auditor expectations, and Unosecur's IdentityGovern direction.
> **Companions:** [`ITAG.md`](./ITAG.md), [`PRD-delegation-chain.md`](./PRD-delegation-chain.md), [`orphaned-identity-research.md`](./orphaned-identity-research.md)
> **Status:** research output, Jul 2026
> **Repo state at time of writing:** `d5e6d6b`, clean tree, 91/91 core tests passing.

---

## 1. Executive summary

1. **Creation lineage is not a queryable property of any provider we plan to ingest — it is a decaying audit artifact — so this module's job is forward capture from install date, not backward reconstruction.** For every provider in the PRD's §5 table, `created_by` does not exist as a field on the identity object; it exists only as an audit event with a retention window of 7 to 400 days, against identities that live for years. That inverts the product: we are not reading a forest that exists, we are *becoming the system of record* for one the providers discard. Persist edges append-only at ingest; never recompute lineage from the provider on each scan. This is the most expensive decision to reverse, because a recompute-based design is permanently lossy — the data it failed to capture is gone.

2. **`Identity.app` and the PRD's `(app, child_id)` uniqueness key are in latent conflict. Resolve it by declaring that `Identity` is an *account*, not a person.** The PRD's key presumes one identity can appear in several apps (`PRD` L52-54); `core/src/domain/types.ts` L26 makes `app` a required scalar, so the key collapses to `(child_id)`. Keep the repo's model and add an optional, non-key `person_id`. Making `app` an array instead would give one node two creators, two revocation states and two activity clocks, which makes `buildTimeline` ambiguous and `graph.byApp` non-partitioning.

3. **The actor on a real creation event is usually a role session or an application, not a human, and the PRD has no model for it.** CloudTrail routinely records `type: AssumedRole`, where `sessionContext.sessionIssuer` names the *role*; Entra's `initiatedBy` is a union of `user` **or** `app`. Treating the automation as the creator is correct — stopping there is not. Split the edge into `CreationActor` (immutable, exactly what the log said) and `AuthorizingHuman` (resolved, carrying basis and confidence), mirroring the `OwnerRef` pattern already established at `core/src/ownership/resolve.ts` L40-48.

4. **Kill `deep_chain`. Replace `high_fanout` with a baseline-relative rate scoped to actor class. Demote `orphaned_creator`. Make `unlinked` a denominator with reason buckets, never a flag.** The decisive evidence is that on this module's own canonical incident — Midnight Blizzard — the malicious account had a fan-out of 1 and a generation of 2, so **two of the PRD's four flags are silent on the exact attack the module exists to catch.** Corroborating base rates from the repo's own seed: excluding synthetic fixtures, maximum generation is 3 (against a proposed `>4` threshold) and maximum fan-out is 2.

5. **The flag that replaces them is `self_authorized`: one principal both created an account and granted it privilege, with no second party in either event.** It maps precisely to NIST SP 800-53 AC-2(e), it is the literal shape of the Midnight Blizzard chain, it is a two-event join rather than a graph traversal, and no native cloud tool emits it. It is the only signal in this analysis that is simultaneously predictive, control-mapped, and not free elsewhere.

6. **Verdict: this is a data producer, not a module.** Strip the flags that do not survive §4.2 and §4.3 and what remains is an append-only app-scoped edge store, an actor-to-human resolution layer, and two signals that are not actionable until something ranks them by blast radius — which this PRD explicitly refuses to do (L34). This confirms `orphaned-identity-research.md` §6.2 from the delegation side and sharpens it: Delegation Chain's own flag set is thinner than the PRD believes, so there is less to give up than it looks.

---

## 2. As-built vs as-specified

Two of the structures that exist *specifically* to serve this PRD are constructed on every boot and **read by no production code path**. Correcting a claim I held going in: they are not literally unreferenced — `seed.test.ts` L461/L464 and `assess.test.ts` L310-311/L336-337 assert against them. But a test pinning a structure's shape is not a consumer. Nothing in the request path, no service, and no route reads either map.

| Item | Specified | Built | Evidence |
| --- | --- | --- | --- |
| `CREATED_BY`, at most one parent per app (§4.1) | Yes — `PRD` L52 | Yes | `domain/types.ts` L40 `provisioned_by: string \| null` |
| App scope on every edge (§4.1) | Yes — `PRD` L54 | Yes | `domain/types.ts` L26; `graph/build.ts` L17 `creationEdgeKey` |
| Per-app creation forest (§4.2.2) | Yes — `PRD` L57 | **Structure only — no production reader** | built `graph/build.ts` L45/L102/L119/L137; exported `index.ts` L76; read only by tests |
| Cross-app edges held apart | PRD defers to §8 (L180) | **Structure only — no production reader** | `graph/build.ts` L54/L119 |
| Ancestor resolution to root (§4.2.3) | Yes — `PRD` L59 | **Partial — halts at the first human** | `accountability/trace.ts` L33 `haltOn: identity.type === 'human'`; L17-22 states it deliberately does *not* answer this PRD |
| Descendant reverse index (§4.2.4) | Yes — `PRD` L60 | Yes, and consumed | `graph/build.ts` L31; `ownership/sweep.ts` L38 |
| Generation / depth (§3, §4.2.5) | Yes — `PRD` L42, L62 | No | no `generation` symbol in `core`, `backend` or `frontend` |
| Fan-out (§3, §4.2.5) | Yes — `PRD` L43, L63 | No | no symbol; O(1) derivable from `provisionedChildren` |
| `deep_chain` flag | Yes — `PRD` L62 | No | `depth_limit_exceeded` (`domain/results.ts` L14) is a traversal *safety state*, not a risk signal — do not conflate |
| `high_fanout` flag | Yes — `PRD` L63 | No | — |
| `orphaned_creator` flag | Yes — `PRD` L45, L64 | Yes, renamed and deliberately demoted | `creator_deactivated` reason; `creator_fallback` is last in the `ownership/resolve.ts` precedence chain |
| `unlinked` flag | Yes — `PRD` L65 | No | — |
| §4.3 chain object | Yes — `PRD` L69-84 | No | nearest is `AccountabilityAssessment` (`domain/results.ts` L72) — no generation, no descendants, no flags |
| Data-gap transparency (§6.6) | Yes — `PRD` L158-162 | **Yes, and better than specified** | `ownership/suppression.ts` L101-125 (`outside_audit_window`); `domain/types.ts` L164 `creation_data_from` |
| App filter as primary control (§6.2) | Yes — `PRD` L112-117 | API only, no UI | `ownership/classify.ts` L182 reads `graph.byApp` |
| Table-first + scoped tree (§6.1) | Yes — `PRD` L106-108 | No | `frontend/src/graph/` contains only `.gitkeep` |
| Self-registered classification (§8) | Open question — `PRD` L181 | **Value exists, no rule reads it** | `domain/types.ts` L55 declares `self_registered` and `bulk_import`; only `sso_federated` is branched on (`suppression.ts` L82) |

**Exported-but-unreachable, flagged explicitly.** `IdentityGraph.creationEdges` and `IdentityGraph.crossAppEdges` — public via `index.ts` L76, zero production readers. By the same test, `dataset.control_history`, `grant_half_lives` and `grant_records` are validated at load (`data/validate.ts` L175-188) and consumed by nothing, which is expected since F9/F10 are out of scope. Note the contrast: `creationEdgeKey` *does* have production readers (`data/validate.ts` L57, `adapters/dataset-directories.ts` L50/L56) — the key function is wired, the maps it keys are not.

**Consequence for planning.** This module is not partially built. One traversal primitive (`graph/traverse.ts`) and one index (`provisionedChildren`) are genuinely reusable; every output the PRD specifies is greenfield.

---

## 3. What the outside world calls this

### 3.1 Terminology — "Delegation Chain" is the wrong name

In every standard and provider vocabulary, **delegation means permission delegation**: AWS cross-account role delegation, Entra delegated permissions, OAuth delegated consent. An auditor or a buyer hearing "Delegation Chain" will assume we mean consent grants — which is precisely what this module scopes *out* (`PRD` L32).

The industry has no settled term for the thing itself. Candidates in use: *provisioning lineage*, *account creation lineage*, *identity lineage* (Entro's marketing term). **Recommendation: rename to Provisioning Lineage.** Fifteen minutes of work; the cost of skipping it is a disambiguation paragraph at the start of every demo and every security review.

### 3.2 Provider reality — the empirical core of this document

This table answers the only question that determines whether the module is viable: is `created_by` obtainable, and for how long.

| Provider | Creator on the object? | Creator from audit event | Retention | What the actor actually is |
| --- | --- | --- | --- | --- |
| **AWS IAM** | **No.** `GetUser` returns Arn, CreateDate, Path, UserId, UserName, PasswordLastUsed, PermissionsBoundary, Tags — no creator field ([IAM `User`](https://docs.aws.amazon.com/IAM/latest/APIReference/API_User.html)) | CloudTrail `CreateUser` / `CreateRole`, `userIdentity` | **90 days** free Event history, management events only; anything longer needs a trail or Lake event data store created *before* the event; Lake retains up to 3,653 days ([Event history](https://docs.aws.amazon.com/awscloudtrail/latest/userguide/view-cloudtrail-events.html)) | Frequently `type: AssumedRole`, where `sessionContext.sessionIssuer` names the **role**. `sourceIdentity` carries the human **only if an admin configured STS to require it**; `onBehalfOf` carries it for `IdentityCenterUser` ([`userIdentity`](https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-event-reference-user-identity.html)) |
| **Microsoft Entra ID** | **No creator.** Has `createdDateTime` (null for some pre-June-2018 and pre-June-2018-synced users) and `creationType` — a *method*, not an actor ([`user`](https://learn.microsoft.com/en-us/graph/api/resources/user?view=graph-rest-1.0)) | `directoryAudit.initiatedBy`, `targetResources` ([`directoryAudit`](https://learn.microsoft.com/en-us/graph/api/resources/directoryaudit?view=graph-rest-1.0)) | **7 days Free / 30 days P1 and P2**, explicitly **not retroactive** on upgrade ([data retention](https://learn.microsoft.com/en-us/entra/identity/monitoring-health/reference-reports-data-retention)) | `initiatedBy` is a union of `user` **or** `app`. An app-initiated creation contains no human at all |
| **Okta** | Not exposed as creator | System Log, `actor` | **90 days**, then purged from the UI *and* the API ([retention policy](https://support.okta.com/help/s/article/Customer-Data-Retention-Policy)) | May be an API token or a SCIM client |
| **GitHub** | No | Org audit log, `actor` (inviter) | **180 days**; Git events **7 days** ([audit log](https://docs.github.com/en/organizations/keeping-your-organization-secure/managing-security-settings-for-your-organization/reviewing-the-audit-log-for-your-organization)) | Usually a human; app installs are apps |
| **Google Cloud** | No | Admin Activity, `authenticationInfo.principalEmail` | **400 days**, fixed, in `_Required`; always written, cannot be configured, excluded or disabled ([audit overview](https://docs.cloud.google.com/logging/docs/audit), [log buckets](https://docs.cloud.google.com/logging/docs/store-log-entries)) | **Best case of the seven** — longest retention, undisableable |
| **Salesforce** | `CreatedBy` on the audit record | `SetupAuditTrail`, "at least the last 180 days" ([object reference](https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_setupaudittrail.htm)) | 180 days | Admin user |
| **Kubernetes** | No | API server audit event `user.username` | **None by default — auditing is off.** "If the flag is omitted, no events are logged" ([Auditing](https://kubernetes.io/docs/tasks/debug/debug-cluster/audit/)) | Frequently a controller ServiceAccount |

**Object field or audit event — which wins?** There is no contest, because for six of seven providers the object field does not exist. The audit event is the only source. Entra's `creationType` is the sole object-level signal and it names the *method* (`Invitation`, `LocalAccount`, `EmailVerified`, `SelfServiceSignUp`, or `null`), which makes it valuable for §4.5's gap buckets and useless as a creator. **The consequence for design: creation lineage is derived and perishable, never a property you can re-read. That is the whole argument for §4.6.**

**What fraction of edges is recoverable?** If an edge survives only inside a retention window of *R* days while identities live *L* days, then — assuming a uniform creation rate and no archival export configured beforehand — the recoverable fraction is approximately `min(1, R/L)`.

> **This is a model, not a measurement.** It is arithmetic over the verified retention numbers above plus an assumed identity lifetime. Real estates have front-loaded creation (migrations, bulk onboarding), which makes the true figure *worse* for old estates, not better. Verifying it requires running the recovery against one real tenant and comparing recovered edges against total identity count.

For a three-year-old estate the model gives: Entra P1 ≈ 3%, Okta ≈ 8%, GitHub ≈ 16%, GCP ≈ 37%, Kubernetes ≈ 0% unless auditing was turned on deliberately.

**So `unlinked` is not the exception — it is the regime.** The PRD says this is "expected and normal, not a data-quality failure" (L57) and is directionally right, but it files it as a footnote and answers it with a banner (§6.6). Three things follow, and together they *are* the product:

- Classify *why* the creator is missing into countable, trendable buckets rather than one banner (§4.5).
- Report **explanation coverage**, not lineage completeness, as the success metric.
- **Start the clock at install.** From connection day, persist every creation edge off the live event stream so completeness climbs monotonically from a known date. `AppRecord.creation_data_from` (`domain/types.ts` L164) is already the right field; in a real deployment its value becomes `max(provider retention floor, our install date)`.

That reframing converts the retention problem from an embarrassing limitation into the module's reason to exist, and it is also the honest competitive answer (§3.5).

### 3.3 Compliance mapping — control ID to emitted artifact

Only mappings sourced precisely. Speculative mappings are worse than none.

| Framework | Control | Exact demand | What we emit |
| --- | --- | --- | --- |
| NIST SP 800-53 Rev 5 | **AC-2(4)** | "Automatically audit account creation, modification, enabling, disabling, and removal actions"; records defined per AU-2, reviewed per AU-6 ([CSF Tools](https://csf.tools/reference/nist-sp-800-53/r5/ac/ac-2/ac-2-4/)) | Per-identity creation record (actor, target, timestamp, app) **plus a per-app coverage report** naming which systems have automated creation audit and which do not. The coverage half is the part an assessor cannot obtain from a provider console. |
| NIST SP 800-53 Rev 5 | **AC-2(e)** | "Require approvals by [Assignment: organization-defined personnel or roles] for requests to create accounts" ([OSCAL-derived control text](https://csrc.nist.gov/CSRC/media/Projects/risk-management/800-53%20Downloads/800-53r5/SP_800-53_v5_1-derived-OSCAL.pdf)) | The `self_authorized` finding (§4.4) — evidence that a create occurred with no second party |
| ISO 27001:2022 | A.5.16 | Identity lifecycle management | The creation half of the lifecycle, handing owner-of-record to Ownership Assurance |
| PCI DSS v4.0.1 | Req 8 | — | **No claim.** 8.2.6's clock measures inactivity, which this module does not measure. I did not verify a creation-lineage clause in 8.2.x from the standard text, so there is no mapping here. Verifying requires reading PCI DSS v4.0.1 §8 directly. |
| SOC 2 | CC6.2 | Registration and authorization before issuing credentials | Plausible and a good conceptual fit for the creation side, but **unverified** — I have not read the Trust Services Criteria text. Do not put it on a slide until someone does. |

**Segregation of duties — real control, or a narrative we like?** Real, but not where the PRD points it. "Creation is a privilege that is rarely governed" (§1) is rhetoric until a clause is named. AC-2(e) is that clause: approvals are *required* for account-creation requests. The computable violation is not "this admin created many accounts" — it is **"the same principal created this account and granted it privilege, and no second party appears in either event."**

> **CISO:** This is the only place in the PRD where I can hand an assessor a finding and point at a control clause in the same sentence. Everything else in §4.2.5 is structural trivia I would have to justify from first principles in the room.
> **Engineer:** Agreed, and it is also the cheapest of the four to compute — a join on `(target, actor)` over two event types inside a time window. No traversal, no thresholds to tune, no baseline to learn. It is strange that the flag requiring the least machinery is the one the PRD omits.

### 3.4 The canonical incident — Midnight Blizzard, January 2024

Microsoft's own account ([Microsoft Security Blog, 25 Jan 2024](https://www.microsoft.com/en-us/security/blog/2024/01/25/midnight-blizzard-guidance-for-responders-on-nation-state-attack/)):

> Midnight Blizzard utilized password spray attacks that successfully compromised a legacy, non-production test tenant account that did not have multifactor authentication (MFA) enabled. […] Midnight Blizzard leveraged their initial access to identify and compromise a legacy test OAuth application that had elevated access to the Microsoft corporate environment. **The actor created additional malicious OAuth applications. They created a new user account to grant consent** in the Microsoft corporate environment to the actor controlled malicious OAuth applications. The threat actor then used the legacy test OAuth application to grant them the Office 365 Exchange Online `full_access_as_app` role, which allows access to mailboxes.

Per-edge breakdown of what this module would and would not have surfaced:

| Edge in the chain | Surfaced by Delegation Chain? |
| --- | --- |
| Password spray against a legacy no-MFA account | **No.** Authentication event, not creation. F9 trust-decay territory. |
| Compromise of the legacy test OAuth application | **No.** Not a creation event. |
| "created additional malicious OAuth applications" | **Only if** we ingest Entra app-registration and service-principal creation. The PRD's §5 provider table lists "Admin audit log 'user created by' events, SCIM provisioning actor field" and **omits service principals entirely** — a real gap, given MITRE notes that in Azure "service accounts include service principals and managed identities" ([T1136.003](https://attack.mitre.org/techniques/T1136/003/)). |
| **"created a new user account to grant consent"** | **Yes — this is the module's edge**, and the reason it should exist. |
| Granting `full_access_as_app` | **No.** Permission edge; out of scope by §2 non-goals. |
| Collection via EWS | **No.** |

Two uncomfortable conclusions follow.

**First, the PRD's shape-based flags are silent here.** The malicious account had one parent and one child: fan-out 1, generation 2. `high_fanout` does not fire. `deep_chain` does not fire. `unlinked` does not apply. Only `orphaned_creator` is even adjacent, and only because the creating identity was a legacy test account nobody owned. A flag set that misses its own canonical incident needs replacing, not threshold tuning.

**Second, retention probably destroyed the evidence.** Microsoft states detection on 12 January 2024 (verified). Entra audit logs retain 7 days (Free) or 30 days (P1/P2) and are explicitly not retroactive. The initial-access start date is **unverified** — I have not read it in a primary source — and it matters more than any other missing fact in this document: if the interval between first access and detection exceeded 30 days, then the creation events had already aged out of the audit log before the investigation began, unless diagnostic export to Log Analytics or storage had been configured in advance. Verifying it requires reading the MSRC disclosure of 19 January 2024 directly. Either way the design implication is the same and it is §4.6.

**What the incident says the real signal is.** Not the *shape* of the chain but a *property of the creator*: an account created by a legacy, non-production, MFA-less, unowned test identity exercising a production-tenant creation privilege. That is `creator_privilege_mismatch` plus `self_authorized` (§4.4).

MITRE frames the pattern identically — create a cloud account, then "manipulate that account to ensure persistence and allow access to additional resources - for example, by adding [Additional Cloud Credentials (T1098.001)] or assigning [Additional Cloud Roles (T1098.003)]" ([T1136.003](https://attack.mitre.org/techniques/T1136/003/)), which also lists APT29 — the same actor — as able to create users through Azure AD. **Create-then-escalate is the documented pattern, and it is a two-event join, not a graph shape.**

### 3.5 Competitive reality — what is genuinely differentiated

| Source | What it gives you | Overlap with this module |
| --- | --- | --- |
| AWS IAM Access Analyzer | Unused roles, unused access keys and passwords, unused permissions, with guided revocation ([findings](https://docs.aws.amazon.com/IAM/latest/UserGuide/access-analyzer-findings.html)) | **None.** It is a *usage* analyzer and does not model creation lineage at all. |
| Entra audit log query | "Who created this user" — one hop, inside 7–30 days | The single hop, free |
| Okta System Log search | `actor` on lifecycle-create events — one hop, inside 90 days | The single hop, free |
| GCP Admin Activity | One hop, 400 days, undisableable | The single hop, free, **with better retention than we will have** |
| Entro — *vendor marketing, not documented behavior* | "Identity lineage": human outward to owned NHIs ([blog](https://entro.security/blog/non-human-identity-lineage-iam-governance/)) | Conceptual overlap with the framing |

**Honest verdict, in the spirit of the companion doc's §3.4.** The single hop is commoditized and free in every provider console — and in GCP's case, free with *longer* retention than we can offer by re-querying. The multi-generation chain is not commoditized, but §3.2 shows it is also mostly unreconstructible from history, so building an analytics layer over provider data is building on sand. Exactly one claim survives both tests:

> A persisted, append-only, cross-app creation-edge store that outlives every provider's retention window, plus resolution from the automation that acted to the human who authorized it.

That is an ingestion and storage product. It is not an anomaly-detection product. Which settles §7 before we get there.

---

## 4. Implementation insights

### 4.1 Insight #1 — Two-layer actor model (the most consequential ingestion decision)

The PRD assumes the `CREATED_BY` parent is an identity drawn from the same population as the child. In production it is a role session, a service principal, a SCIM client, or a CI runner. For machine-provisioned estates that is the majority case, not an edge case.

```ts
type ActorKind =
  | 'human' | 'role_session' | 'service_principal'
  | 'automation' | 'provider_service' | 'unknown';

/** Exactly what the audit log said. Immutable. Never overwritten by resolution. */
interface CreationActor {
  readonly raw_principal: string;
  readonly kind: ActorKind;
  readonly app: string;
  /** CloudTrail sessionContext.sessionIssuer — the role, not the human. */
  readonly issuer: string | null;
  /** Provider-attested human (STS sourceIdentity, onBehalfOf). Never inferred. */
  readonly attested_human: string | null;
}

interface AuthorizingHuman {
  readonly human_id: string;
  readonly basis:
    | 'sts_source_identity'          // attested by AWS STS
    | 'identity_center_user'         // userIdentity.onBehalfOf
    | 'entra_initiated_by_user'      // directoryAudit initiatedBy.user
    | 'pipeline_trigger'             // CI run actor
    | 'pr_approver'                  // IaC review record
    | 'role_assumption_correlation'; // our own join — weakest
  readonly confidence: 'attested' | 'correlated' | 'inferred';
}
```

Precedence is list order, first match wins, and `basis` plus `confidence` ship with every resolution — the identical discipline `OwnerRef` already uses at `ownership/resolve.ts` L40-48. Reuse that pattern rather than inventing a parallel vocabulary.

**What breaks if ignored.** Every Terraform-provisioned identity resolves to `terraform-ci`; that single node accumulates a fan-out in the thousands and permanently occupies the top of any fan-out ranking; and `no_human_root` becomes the dominant trace termination, so the engine reports "no accountable human" across most of a real estate. That last failure is precisely what the repo's five-way discriminated union (`domain/results.ts` L27-56) was written to prevent — getting this wrong does not merely degrade this module, it poisons F4.

**Cost of deferring: high.** This is schema, upstream of every adapter. Retrofitting it after ingestion exists means rewriting all of them.

### 4.2 Insight #2 — Kill `deep_chain`

Creation chains are shallow by construction, because bootstrapping is flat: an admin creates accounts directly. Reaching generation 4 requires four successive provisioning acts *recorded in the same app inside the same retention window*, which §3.2's arithmetic makes close to unobservable.

Measured in the repo's own seed at `d5e6d6b`, excluding synthetic depth fixtures: **45 identities, generation distribution 0 → 30, 1 → 12, 2 → 2, 3 → 1. Maximum generation 3**, against the PRD's suggested threshold of ">4 generations" (L62). It would fire on nothing. All 14 identities at generation ≥ 4 are `svc-fixture-depth-*`, which the seed's own conventions filter out of every demo view.

The plausible false-positive class, when it does fire, is a **legitimate automation ladder**: bootstrap admin → Terraform service principal → cluster ServiceAccount → workload ServiceAccount. That is correct architecture, not a finding.

**A flag with a near-zero base rate that fires on good design is not a detection. Delete it.** Keep generation as a sortable column — useful context, zero cost.

> **CISO:** I want to push back once. A deep chain is the kind of thing an auditor finds intuitively suspicious, and having the column is not the same as having the flag in the report.
> **Engineer:** The column *is* in the report, sortable, and the tree view shows the shape directly. What I refuse to ship is a red badge that in our own dataset fires on zero real identities and in a customer's fires on their cleanest IaC pipeline. If we want the auditor's intuition served, serve it with the ladder rendered — not with a severity.
> **CISO:** Accepted, on condition the tree view is one click from the row. If the shape is only visible via an export, we have lost the argument.

Do not fold `depth_limit_exceeded` (`domain/results.ts` L14) into this space. It asserts "the walk gave up," which is a different claim from "this chain is suspicious." Two concepts, two names, no merge.

### 4.3 Insight #3 — Fan-out must be a rate against the actor's own baseline

The PRD identifies the problem — "a legitimate automation/service account may have high fan-out by design while a human admin should not" (L63) — and then selects a static configurable threshold, an instrument that cannot express it.

```ts
interface FanOutSignal {
  readonly actor_id: string;
  readonly actor_kind: ActorKind;
  readonly window_days: number;
  readonly created_in_window: number;
  readonly trailing_median: number;    // this principal's own history
  readonly deviation_sigma: number;
  /** First time this actor created this class of target. Strongest sub-signal. */
  readonly novel_target_class: boolean;
}
```

Defensible starting values — **explicitly starting points, not evidence-based**, since no public dataset of enterprise account-creation rates by actor class exists (§10):

- **Human actor:** more than 5 creations in a rolling 7 days, **or** any creation in an app outside their historical set.
- **Automation actor:** more than 3σ above that principal's own trailing 30-day median, **or** first-ever creation of a privileged target.
- **Never** threshold on lifetime totals. Lifetime fan-out measures tenure, not risk.

**What breaks if ignored.** The queue is permanently topped by `scim-provisioner` and `terraform-ci`, the analyst mutes the flag in week one, and we have rebuilt the "list of 4,000 orphans nobody reads" failure that `orphaned-identity-research.md` §3.4 warns against.

### 4.4 Insight #4 — The flag that earns its place: creation authority

Derived from §3.4 and AC-2(e).

```ts
interface CreationAuthoritySignal {
  readonly child_id: string;
  readonly actor: CreationActor;
  /** Ownership Assurance's verdict on the creator itself, then and now. */
  readonly actor_ownership_state: OwnershipState;
  readonly actor_is_non_production: boolean;
  readonly actor_dormant_days: number | null;
  /**
   * Same principal performed the create AND the privilege grant, with no second
   * party in either event. The AC-2(e) violation, and the Midnight Blizzard shape.
   */
  readonly self_authorized: boolean;
  readonly granted_permissions: readonly string[];
}
```

Computation is a join of two audit events on `(target, actor)` inside a time window — no traversal at all. That it needs no traversal is itself evidence about what this module fundamentally is (§7).

**Why this one survives when the others do not.** It has a plausible base rate — rare but non-zero in every real tenant. Its false-positive class is specific and suppressible by registry: break-glass and bootstrap flows are legitimately self-authorized, and `ownership/suppression.ts` L134-141 already handles exactly that class. It maps to a named control clause. And no provider console emits it.

**What breaks if ignored.** The module ships four flags, two of which never fire (§4.2, and `unlinked` which is not a finding at all), one of which is commoditized (§3.5), and none of which would have surfaced Midnight Blizzard's decisive edge. There is then no answer to "what does this catch that my cloud console doesn't."

### 4.5 Insight #5 — `unlinked` is a denominator, not a flag

Split the single PRD flag (L65) into reasons. The repo already models most of them, and better than the PRD specifies:

| Bucket | Meaning | Status in repo |
| --- | --- | --- |
| `root_by_design` | Break-glass, bootstrap, genuine root | Suppression registry — `suppression.ts` L138 |
| `outside_audit_window` | Predates the app's retention floor | **Built** — `suppression.ts` L101-125 |
| `federated_elsewhere` | SSO/SCIM; the creator lives in the IdP | **Built** — `suppression.ts` L79-92 |
| `self_registered` | OAuth signup; Entra `creationType` `SelfServiceSignUp`/`EmailVerified` | **Value exists, no rule reads it** — `types.ts` L55 |
| `bulk_imported` | Migration; no per-identity actor was ever recorded | **Value exists, no rule reads it** — `types.ts` L55 |
| `not_yet_captured` | Created before *our* install date | **Missing — and it is the bucket that makes the metric move** |

Metric: `explanation_coverage = 1 − (unexplained / total)`. Never publish a raw `unlinked` count; like the raw orphan count in the companion doc §5.2, it moves in the wrong direction as the product improves.

**What breaks if ignored.** The PRD's banner (§6.6) *tells* you data is missing. A bucket lets you count it, trend it, exclude it from a denominator, and draw a coverage line climbing from install date. That difference is the entire §6 landing view. This is a place where the repo's structural approach should be pushed back into the PRD rather than the reverse.

This also settles the PRD's §8 open question on self-service signups (L181): they are neither root nor unlinked, they are their own bucket, and Entra already exposes the field that populates it.

### 4.6 Insight #6 — Persist the forest; never recompute it from the provider

Because retention is shorter than identity lifetime for six of seven providers (§3.2), our store must be the system of record.

```ts
interface PersistedCreationEdge {
  readonly app: string;
  readonly child_id: string;
  readonly actor: CreationActor;
  /** When WE observed it. The honest field. */
  readonly observed_at: string;
  /** When it happened, if the provider told us. */
  readonly occurred_at: string | null;
  readonly source: 'audit_event' | 'object_field' | 'backfill_import' | 'declared';
  /** Append-only. Corrections supersede; nothing is mutated in place. */
  readonly superseded_by: string | null;
}
```

`source` is what separates "we watched this happen" from "someone told us," which in front of an assessor is the difference between evidence and assertion.

> **Engineer:** I want to name the cost. This turns a derived index into a durable store with its own migrations, retention policy, and backfill semantics. It is the difference between a stateless analyzer and a system with a database I have to operate. That is not a 2-hour change in the real product.
> **CISO:** And without it, on day 400 the tool knows strictly less than it knew on day 1, because the provider aged the events out and we never wrote them down. I cannot take a control to an assessor whose evidence base shrinks over time. Pay the operational cost.
> **Engineer:** Then pay it *first*, before the analytics layer, because the append-only decision is unwinnable later. Same argument as the disposition journal in the companion doc §4.5, and for the same reason: point-in-time reconstruction cannot be retrofitted onto mutable rows.

### 4.7 Insight #7 — `Identity` is an account; `person_id` is not a key

The mismatch stated plainly: `PRD` L54 keys creation edges on `(app, child_id)`, implying an identity spans apps; `domain/types.ts` L26 makes `app` a required scalar, so the key is currently redundant.

**Keep the repo's model.** `Identity` is an *account* in exactly one app. `creationEdgeKey(app, childId)` (`graph/build.ts` L17) stays as written — redundant today, correct the moment a correlation layer exists, and free either way. Add:

```ts
interface Identity {
  // ... existing fields unchanged
  /** Correlation only. Never a storage key, never required, never inferred. */
  readonly person_id?: string;
}
```

**What breaks if you "fix" it the other way** by making `app` an array: one node carries two creators, two revocation states and two last-activity clocks, which makes `buildTimeline` ambiguous, `graph.byApp` non-partitioning, and the PCI inactivity clock undefined. The redundant key is the cheap option, and the repo already chose it.

### 4.8 Insight #8 — The strict-forest assumption is wrong twice, and the code already knows

`PRD` L28 asserts creation lineage is "strictly hierarchical — each identity has at most one direct creator (a tree edge)… **not** a general directed graph with cycles/multiple path types." As a statement about individual creation *acts*, true. As an implementation assumption about the identity-id graph, false in two specific ways:

1. **Identifier reuse produces genuine cycles.** A creates B; A is deleted; later an admin acting through B recreates A under the same name, and in providers where the principal name is the join key, the id-level graph now contains A → B → A. Each act had one actor; the graph still has a cycle. The repo handles this — `onRevisit: 'stop'` yielding `cycle_detected` (`graph/traverse.ts` L100-105) — and the seed pins it with `svc-fixture-cycle-a`/`-b`.
2. **Service-linked and provider-service creation produces parents outside the population.** AWS `CreateServiceLinkedRole` records an AWS service as the actor; the parent is not an identity in the customer's estate at all. That is a dangling parent by construction, and the repo already has `dangling_reference` for it.

**What breaks if ignored.** A traversal written to the PRD's stated assumption — no visited set, no dangling branch — either loops forever or throws on real data. `graph/traverse.ts` is already correct; the PRD's §2 wording is what needs amending, because it is the thing a future implementer would read first.

### 4.9 Insight #9 — Cross-app correlation: minimum signal, and what a wrong join costs

**Minimum viable signal:** the IdP object id, where the app is SSO-federated — in which case it is not a fuzzy join at all, it is a foreign key. Second best: a verified email or UPN asserted by the IdP. **Never** display name, and never local-part matching.

**False-match rate: unverified.** I found no primary source giving an identity-resolution false-match rate for enterprise IdP joins, and I will not invent one. Verifying it: run the email join against a tenant where the IdP object id is present on both sides and measure disagreement against that ground truth. Half a day against one real tenant, and it should happen before correlation ships enabled by default.

> **Engineer:** Joining on verified email is twenty lines and it makes the cross-app footprint story work. I would ship it behind a flag today.
> **CISO:** State the failure mode in operational terms and then tell me that again. A wrong join attributes one person's residual footprint to another. Downstream in the off-boarding sweep that is either revoking a live production credential belonging to a currently employed engineer, or filing a real departed-employee footprint under the wrong name and closing it. Both outcomes are worse than not joining, and the second one is worse than having no product.
> **Engineer:** Then: attested keys only, correlated edges rendered visually distinct from observed ones, and never auto-remediate across a correlated edge. `graph.crossAppEdges` (`build.ts` L54) is already the right substrate for keeping them separate — it just needs a reader.

---

## 5. Recommended algorithm

```
INGEST (per app, continuous — not a nightly batch)
  for each creation event e in the provider audit stream:
    actor ← normalizeActor(e)                  # §4.1, one adapter per provider
    edge  ← PersistedCreationEdge{ app, child, actor,
                                   observed_at: now, occurred_at: e.time,
                                   source: 'audit_event' }
    append(edge)                               # append-only, never update in place
    invalidate(generationOf(descendants(child)))

BUILD (per app, on load)                       # O(V + E)
  parentOf   ← index edges by (app, child)
  childrenOf ← inverse index
  roots      ← identities with no edge in this app
  generation ← ONE bottom-up pass from roots, memoized      # O(V), not O(V·d)

RESOLVE (per identity)
  ancestors(i)   ← traverse(select: provisioned_by,      onRevisit: 'stop')   # O(d)
  descendants(i) ← traverse(select: provisionedChildren, onRevisit: 'skip')   # O(subtree)
  fanout(i)      ← |childrenOf[i]|                                            # O(1)

SIGNALS (per identity)
  authorizing_human  ← resolveHuman(actor)      # §4.1 precedence, attested > correlated > inferred
  creation_authority ← §4.4                     # self_authorized, non-prod creator, unowned creator
  fanout_signal      ← §4.3                     # rate vs this actor's own trailing baseline
  lineage_gap        ← §4.5                     # reason bucket when no edge exists

EMIT
  ProvenanceRecord — state and reason only.
  NEVER a severity. NEVER a rank. Ownership Assurance owns ranking (§7).
```

**Complexity.** Build is `O(V + E)`. Because each identity has at most one parent per app, `E ≤ V`, so the forest is linear in identity count. Ancestor queries are `O(d)` bounded by `maxDepth`; descendant queries are `O(subtree)`. Computing generation bottom-up once at build is what keeps the table view `O(V)` instead of `O(V·d)`.

**What actually breaks at 100k identities — and it is not the graph.** Two indexes of ~100k entries are tens of megabytes and the traversal is linear in a language that does this comfortably. The real failure modes are:

1. **The table view**, if generation is recomputed per row on render. Solved by the bottom-up memo above. This is the only traversal-adjacent risk and it is cheap to avoid.
2. **The ingest pipeline.** With 100k identities across six apps and 7–30 day IdP retention, a nightly full pull *cannot* work — events age out between polls, silently, with no error. This module must stream, which is an operational commitment rather than a code change, and the PRD's §4.4 ("rebuild per-app forests on the same cadence as Access Discovery's graph rebuild, plus event-triggered updates") understates it. Event-triggered is not an optimization here; it is the only correct mode.

**Incremental update path.** A new creation event touches exactly one edge and invalidates only the descendant subtree's generation values — ancestors are unaffected, so no upward recompute is ever needed. An HR leaver event invalidates *no* lineage at all: it changes owner validity, which belongs to Ownership Assurance. **That asymmetry is the module seam**, and it is why the decomposition in §7 is not arbitrary.

**Reuse, non-negotiable.** Both walks are `traverse` (`graph/traverse.ts` L59) with different selectors; the primitive already supports everything needed, including the cycle and dangling cases from §4.8. The single required change is dropping `haltOn: identity.type === 'human'` (`accountability/trace.ts` L33), because this module must continue *past* humans to the true root — and `trace.ts` L17-22 already documents that its halt is deliberate and that this PRD is the question it is not answering. **Do not write a second BFS.** If ancestor resolution forks into its own implementation, it will disagree with F4 on the same dataset in the same demo, which is worse than not shipping it.

---

## 6. API surface

```
GET /api/lineage/coverage?app=aws-iam
      → explanation coverage + gap buckets (§4.5).   ← DEFAULT LANDING VIEW
GET /api/lineage?app=aws-iam&flag=self_authorized&min_generation=1&hide_unlinked=true
      → filterable table (PRD §6.3, minus the killed flags)
GET /api/lineage/:identityId
      → ProvenanceRecord: ancestors, descendants, actor, authorizing human, gap reason
GET /api/lineage/:identityId/tree?direction=both&depth=3
      → PRD §6.5 collapsible tree, depth-bounded so a 40-child bot cannot blow the payload
GET /api/lineage/actors
      → fan-out leaderboard, each actor against its own baseline (§4.3)
GET /api/lineage/export?format=csv
      → AC-2(4) evidence pack
```

**The default landing view is `/coverage`, not the table** — a deliberate departure from `PRD` §6.1.

> **Engineer:** The table is the cheap default and it is what the PRD asked for. Coverage is a second endpoint and a second view to build.
> **CISO:** On day one in a real tenant the table is 90% unlinked rows (§3.2). Open on it and the product looks broken at exactly the moment the buyer forms their opinion — and worse, it looks like *we* are broken rather than their audit configuration. Open on coverage and the first sentence is "we can explain the origin of 37% of your GCP identities and 8% of your Okta ones, here is why the rest are unexplained, and here is the date that number starts climbing from." Same data, and it makes the retention problem the reason to buy.
> **Engineer:** Conceded, and it is cheaper than it looks — coverage is an aggregation over the same buckets the table filters on, so it is one query, not one subsystem.

Scope note: `/coverage` is *this module's* landing view. When Provisioning Lineage is consumed inside Ownership Assurance, the ranked ownership queue remains the product's landing view, exactly as `orphaned-identity-research.md` §5.1 argued.

---

## 7. Unosecur alignment

### 7.1 Side by side

| Dimension | PRD as written | This analysis | Assessment |
| --- | --- | --- | --- |
| Core artifact | Per-app forest of `CREATED_BY` trees (L57) | Same, but **persisted and append-only** (§4.6) | **Extension.** The PRD implies rebuild-from-provider (L88); retention makes that lossy. |
| Edge parent | An identity (L52) | `CreationActor` + resolved `AuthorizingHuman` (§4.1) | **Correction.** The PRD has no model for role sessions or app-initiated creation. |
| Graph shape | "Strictly hierarchical… not a general directed graph with cycles" (L28) | Forest per *act*; cycles and dangling parents occur at the id level (§4.8) | **Correction, already handled in code.** `traverse.ts` L100-105 is correct; the PRD wording is not. |
| `deep_chain` | Flag, >4 generations (L62) | **Deleted.** Sortable column only. | **Correction.** Zero base rate in our own data; fires on good architecture. |
| `high_fanout` | Static threshold, configurable per app/type (L63) | Rate against the actor's own trailing baseline (§4.3) | **Correction.** The PRD names the problem then picks an instrument that cannot express it. |
| `orphaned_creator` | "The core differentiating finding for this module" (L171) | Real, but the weakest ownership signal | **Conflict, already resolved in code.** `ownership/resolve.ts` puts `creator_fallback` last by design. |
| `unlinked` | Informational flag (L65) | Six countable buckets plus a coverage metric (§4.5) | **Correction.** The repo is already ahead of the PRD here. |
| SoD signal | Absent | `self_authorized` (§4.4) | **Net-new, and the only differentiated finding.** |
| Data-gap handling | Per-app banner (L158-162) | Structural state, excluded from counts | **Repo is ahead.** Push `suppression.ts`'s model back into the PRD. |
| Risk scoring | Explicit non-goal (L34) | Agreed — emit state and reason, rank nothing | **Consistent**, and it is why this cannot stand alone. |
| Retention | Not addressed | The central design constraint (§3.2) | **Gap in the PRD.** |
| Service principals | Absent from the §5 provider table | Required — the Midnight Blizzard chain runs through them | **Gap in the PRD.** |
| UX | Table-first, tree as escape hatch (L106-108) | Agreed, but land on coverage (§6) | **Refinement.** |

### 7.2 Verdict: (c) — a data producer for another module

Not a feature, and not a standalone module.

Remove the flags that do not survive §4.2 and §4.3 and what remains is: an app-scoped append-only creation-edge store, an actor-to-human resolution layer, and two signals (`self_authorized`, `creator_privilege_mismatch`) that are not actionable until something ranks them by reachable blast radius — which this PRD explicitly refuses to do (L34). A module that cannot rank its own findings, and whose surviving detections are two event joins rather than graph analysis, is an ingestion service.

This **confirms and sharpens** `orphaned-identity-research.md` §6.2, which already proposed that Delegation Chain "stays as specified… It becomes the *upstream data producer*." Arriving from the delegation side reaches the same seam independently, and adds one thing that doc could not see from where it stood: the PRD's own flag set is thinner than it believes, so becoming a data producer costs it almost nothing.

**The clean decomposition, restated:**

- **Provisioning Lineage** (renamed, §3.1) — streams creation events, normalizes actors, resolves them to humans with attested confidence, persists edges append-only, reports explanation coverage. Emits state and reason. Ranks nothing.
- **Ownership Assurance** — consumes lineage plus HRIS plus the owner registry, resolves current ownership, ranks by reachable sensitive access, owns the queue and the disposition trail.

`self_authorized` crosses that seam as an *input to severity*, never as a finding carrying its own severity. That keeps `ownership/severity.ts` the single place in the engine where anything is ranked, which is the property that stops the two modules from disagreeing in front of a customer.

---

## 8. Gaps, ranked

| # | Gap | Severity | Recommendation | Effort | Blocks if deferred |
| --- | --- | --- | --- | --- | --- |
| 1 | No actor model — `provisioned_by` assumes a human-or-null world | **Critical** | `CreationActor` + `AuthorizingHuman` (§4.1) | 3h | All real ingestion. Schema-level, so cost rises steeply once adapters exist. |
| 2 | Lineage recomputed from provider; no persisted edge store | **High** | `PersistedCreationEdge`, append-only (§4.6) | 2h *(hackathon)* | Outliving provider retention — i.e. the entire product thesis |
| 3 | `creationEdges` / `crossAppEdges` have no production reader | **High** | Wire a `LineageService`, or delete them and stop claiming the capability | 4h | Any Delegation Chain claim at all |
| 4 | Ancestor walk halts at the first human | **High** | Second `traverse` config without `haltOn` (§5) | 1h | Generation, true roots, and the §4.3 chain object |
| 5 | `deep_chain` and `high_fanout` as specified | **High** *(spec defect)* | Delete the first; baseline-relative rate for the second (§4.2, §4.3) | 2h | Analyst trust, permanently — a muted flag never un-mutes |
| 6 | `self_authorized` SoD signal missing | **Medium** | Join create + grant on `(target, actor)` (§4.4) | 2h | The only differentiated finding, and the AC-2(e) mapping |
| 7 | Generation and fan-out not computed | **Medium** | Bottom-up memo pass at build (§5) | 1.5h | The table view at scale |
| 8 | Service-principal creation absent from `PRD` §5 | **Medium** | Add Entra app-registration and service-principal creation to data requirements | 0.5h *(doc)* | Coverage of the Midnight Blizzard chain |
| 9 | `bulk_import` / `self_registered` have no rule reading them | **Low** | Two lineage-gap rules appended to the existing frozen registry (§4.5) | 0.5h | Coverage buckets, and the PRD's §8 open question |
| 10 | §4.3 chain object shape unbuilt | **Low** | Derive from `TraversalResult` | 1h | API parity with the PRD |
| 11 | "Delegation" collides with OAuth/permission delegation | **Low** | Rename to Provisioning Lineage (§3.1) | 0.25h | Nothing technical; costs credibility in every demo and review |
| 12 | `PRD` L28 asserts an acyclic single-parent graph | **Low** *(spec defect)* | Amend to "forest per creation act; cycles possible under identifier reuse" (§4.8) | 0.25h | A future implementer writing a visited-set-free walk |

Items 1 and 2 live in the schema and are the ones that hurt to retrofit. Do them before any adapter is written — the same advice the companion doc gave about the seed, for the same reason.

---

## 9. Demo implications

**Measured against the seed at `d5e6d6b`** (`ITAG_NOW=2026-07-31T00:00:00Z`, 66 identities — 9 human, 47 service account, 4 AI agent, 6 group), so nothing below is guessed:

- **Maximum fan-out is 2** (`user-victor`, `user-erin`). The PRD's motivating example is a bot that created 40 accounts.
- **Generation distribution excluding fixtures: 30 at gen 0, 12 at gen 1, 2 at gen 2, 1 at gen 3.** Maximum 3, against a proposed `deep_chain` threshold of >4.
- **All 14 identities at generation ≥ 4 are `svc-fixture-depth-*`**, filtered from every demo view by convention.
- 31 identities have no creator on record; **20 are fully unlinked** — independent confirmation of `PRD` L57.
- 32 same-app creation edges, 3 cross-app.

**What the seed needs before this module can be demoed:**

1. **A Midnight Blizzard row.** A legacy, non-production, unowned account that created exactly one new account and granted it privilege. Fan-out 1, generation 2 — so it visibly proves the shape flags stay silent while the authority flag fires. This is the headline, and it is a real, quotable, citable incident.
2. **A provisioning bot with realistic fan-out** (30–40 children), so the rate-based flag has something meaningful to *not* fire on.
3. **A five-generation automation ladder**, so the deleted `deep_chain` has a concrete counterexample to point at when a judge asks why it is missing.

**The true negatives — what a security buyer is actually evaluating:**

1. `terraform-ci` with fan-out 40 — **green**, because that is baseline-normal for an automation actor with a declared owner. This is the row that proves we did not simply threshold on a number.
2. The generation-5 automation ladder — **green**, proving `deep_chain` was removed on purpose rather than never finished.
3. A cluster of unlinked `legacy-ldap` identities — **not a finding**, sitting in the coverage denominator with the reason displayed on screen. Absence of data is not a finding, and here it is visibly being not-a-finding.
4. An SSO-federated identity with no creator — **`unknown`**, not `unowned`. Already built (`suppression.ts` L79-92).

Order them immediately after the headline, per `orphaned-identity-research.md` §8: anyone can render red nodes.

**The line to land:** *"Every identity on this screen has no creator on record. Twenty of them are fine and we can tell you exactly why, one by one. The number that matters isn't how many chains we found — it's how much of your estate we can explain, and the date that number started climbing from."*

That closing turns retention from the module's weakness into its pitch, and it is the one claim a competitor cannot make without having been installed for a year.

---

## 10. Open questions

- **Cross-app false-match rate (§4.9).** No primary source found. Verifiable in half a day against one tenant where the IdP object id is present on both sides of the join; do it before correlation ships enabled by default.
- **Midnight Blizzard initial-access date (§3.4).** Detection on 12 January 2024 is verified from Microsoft. The start date is not, and it decides whether the creation events survived Entra's 7/30-day retention or had already aged out before the investigation began. Verifiable from the MSRC disclosure of 19 January 2024, which I did not read directly.
- **Service-principal creation fidelity in Entra.** Whether app registration and service principal creation are obtainable with an actor at the same fidelity as user creation. The PRD's §5 table omits them and the canonical incident runs through them. Needs a tenant test, not a documentation read.
- **Whether AC-2(e) approval evidence exists in any provider audit log**, or only in a ticketing system. This decides whether `self_authorized` is a *finding* or a *hypothesis requiring external corroboration* — a material difference to an assessor, and it changes the API contract.
- **SOC 2 CC6.2 applicability (§3.3).** Conceptually a good fit for the creation side; I have not read the Trust Services Criteria text. Verifiable by reading it.
- **Fan-out baselines (§4.3).** No public dataset of enterprise account-creation rates by actor class exists. The starting values are reasoned, not measured, and the UI should say so until customer telemetry replaces them.
- **MCP agent-spawned-agent attribution.** Carried forward unresolved from `orphaned-identity-research.md` §9. When an agent spawns an agent at runtime, does the creation edge point at the spawning agent or at its owner? Still no public documentation on the Gateway's identity attribution model.

---

## 11. Sources

**Provider documentation (official)**

- AWS — [CloudTrail Event history (90 days)](https://docs.aws.amazon.com/awscloudtrail/latest/userguide/view-cloudtrail-events.html) · [CloudTrail `userIdentity` element](https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-event-reference-user-identity.html) · [IAM `User` data type](https://docs.aws.amazon.com/IAM/latest/APIReference/API_User.html) · [IAM `GetUser`](https://docs.aws.amazon.com/IAM/latest/APIReference/API_GetUser.html) · [IAM Access Analyzer findings](https://docs.aws.amazon.com/IAM/latest/UserGuide/access-analyzer-findings.html)
- Microsoft Entra — [Data retention by license](https://learn.microsoft.com/en-us/entra/identity/monitoring-health/reference-reports-data-retention) · [`directoryAudit` resource](https://learn.microsoft.com/en-us/graph/api/resources/directoryaudit?view=graph-rest-1.0) · [`targetResource`](https://learn.microsoft.com/en-us/graph/api/resources/targetresource?view=graph-rest-1.0) · [`user` resource — `createdDateTime`, `creationType`](https://learn.microsoft.com/en-us/graph/api/resources/user?view=graph-rest-1.0)
- Okta — [Customer data retention policy (System Log, 90 days)](https://support.okta.com/help/s/article/Customer-Data-Retention-Policy) · [Access and export System Log events](https://support.okta.com/help/s/article/Exporting-Okta-Log-Data)
- GitHub — [Reviewing the organization audit log (180 days; Git events 7 days)](https://docs.github.com/en/organizations/keeping-your-organization-secure/managing-security-settings-for-your-organization/reviewing-the-audit-log-for-your-organization) · [Audit log REST API](https://docs.github.com/en/enterprise-cloud@latest/rest/enterprise-admin/audit-log)
- Google Cloud — [Cloud Audit Logs overview](https://docs.cloud.google.com/logging/docs/audit) · [Store log entries (`_Required`, 400 days)](https://docs.cloud.google.com/logging/docs/store-log-entries) · [Logging quotas and retention periods](https://docs.cloud.google.com/logging/quotas)
- Salesforce — [`SetupAuditTrail` object reference](https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_setupaudittrail.htm)
- Kubernetes — [Auditing (audit policy; not enabled by default)](https://kubernetes.io/docs/tasks/debug/debug-cluster/audit/)

**Standards and control frameworks**

- [NIST SP 800-53 Rev 5 AC-2(4), Automated Audit Actions](https://csf.tools/reference/nist-sp-800-53/r5/ac/ac-2/ac-2-4/) · [AC-2(4) assessment objectives](https://grcacademy.io/nist-800-53/controls/ac-2-4/) · [SP 800-53 Rev 5 OSCAL-derived control text (AC-2 base, including AC-2(e) approvals)](https://csrc.nist.gov/CSRC/media/Projects/risk-management/800-53%20Downloads/800-53r5/SP_800-53_v5_1-derived-OSCAL.pdf)

**Threat intelligence**

- [Microsoft Security Blog — Midnight Blizzard: Guidance for responders on nation-state attack, 25 Jan 2024](https://www.microsoft.com/en-us/security/blog/2024/01/25/midnight-blizzard-guidance-for-responders-on-nation-state-attack/)
- [MITRE ATT&CK T1136.003 — Create Account: Cloud Account](https://attack.mitre.org/techniques/T1136/003/) (links T1098.001 Additional Cloud Credentials, T1098.003 Additional Cloud Roles)
- [MITRE ATT&CK T1078 — Valid Accounts](https://attack.mitre.org/techniques/T1078/)

**Repository evidence** — `core/src/graph/{build,traverse}.ts`, `core/src/accountability/trace.ts`, `core/src/ownership/{resolve,suppression,classify,sweep,severity}.ts`, `core/src/domain/{types,results,ownership-results}.ts`, `core/src/data/validate.ts`, `core/src/adapters/dataset-directories.ts`, `core/src/index.ts`. Seed measurements taken at `d5e6d6b` with `ITAG_NOW=2026-07-31T00:00:00Z`.

**Vendor marketing (labeled as such, not documented behavior)** — [Entro, NHI lineage](https://entro.security/blog/non-human-identity-lineage-iam-governance/) · [Unosecur, Unified Identity Fabric](https://www.unosecur.com/unified-identity-fabric)
