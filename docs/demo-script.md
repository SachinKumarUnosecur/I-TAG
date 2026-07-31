# Demo script

Five minutes, fifteen beats, one dataset. Every number below was read off a running
server, not estimated, and is pinned by `core/src/data/seed.test.ts` — if a threshold
or a resolver changes and a number here stops being true, that test fails.

## Before you present

```bash
ITAG_NOW=2026-07-31T00:00:00Z npm run dev
```

The clock is pinned, so every age, every SLA countdown and every ranking is identical
on any day the demo is run. Without `ITAG_NOW` the dataset still validates, but the
numbers on this page drift and the ranking will eventually change.

Hide `svc-fixture-*` in the queue view before you start. Those rows exist to prove
the traversal cannot be crashed by a cycle, a dangling parent or a 17-hop chain; they
are engine probes, not demo rows. With them hidden the queue is 19 rows.

The one screen to open on: `GET /api/ownership/summary`.

| Number | Value | What to say if asked |
| --- | --- | --- |
| Identities in scope | 60 | Six groups are excluded; they are permission containers, not things a person owns. |
| Findings | 22 | Of 60. Not "everything unowned" — see beats 6, 7 and 8. |
| Reaching sensitive access | 11 | The only number that decides what gets worked first. |
| Critical or high | 11 | |
| Past SLA | 16 | Clock runs from the HR effective date, not from when the scan ran. |
| Unknown | 4 | Data gaps, reported as gaps. Never counted as findings. |
| Ownership coverage | 13% | The problem being demonstrated, stated honestly. |

Beats run in this order on purpose: the headline, then the five rows we deliberately
did **not** flag, then the depth. Anyone can render red nodes. The non-findings are
the part a security buyer is actually evaluating.

---

## Beat 1 — The headline

**Click:** `svc-vpn-legacy` (row 1). `GET /api/ownership/svc-vpn-legacy`

> "This is a VPN service account in our legacy directory. The engineer who created it
> left two hundred days ago, nobody was ever assigned as owner, its MFA was turned off
> nine months ago — and it authenticated five days ago. It can reach the corporate VPN
> and the production database."

**Evidences:** PCI DSS v4.0.1 8.2.6 · NIST SP 800-53 AC-2(3) · ISO 27001:2022 A.5.18 ·
SOC 2 CC6.2

| On screen | Value |
| --- | --- |
| Rank | 1 of 22 |
| State / reason | `owner_invalid` / `creator_deactivated` |
| Severity | `critical` |
| Owner | `user-victor`, `creator_fallback`, **low** confidence |
| Age | 200 days against a 14-day service-account SLA |
| Last activity | 5 days ago |
| Sensitive reachable | 2 (`vpn:corp-network`, `admin:prod-database`) |
| Control history | MFA disabled 2025-11-02 (271 days), conditional-access exception granted 2026-02-14 and still open |

The point to land: neither signal alone puts this at the top. An orphan list sorted by
age puts a 711-day-old agent that can reach nothing above it (beat 15). A control-decay
report flags the MFA change but cannot tell you nobody would answer for it. The fusion
is the ranking.

Note for yourself: Victor's own human account **was** disabled at offboarding. This
account was not. That is the entire pattern — the human was closed out and the
non-human identity he left behind was not.

---

## Beat 4 — A departed creator that renders green

**Click:** `svc-payments-recon`. `GET /api/ownership/svc-payments-recon`

> "This account's creator also left. It is green, because the Payments Platform team
> owns it, that team has people in it, and someone attested to it 23 days ago. We do
> not flag departures. We flag unanswered accountability."

**Evidences:** NIST SP 800-53 AC-2(3) · ISO 27001:2022 A.5.16 · SOC 2 CC6.3

| On screen | Value |
| --- | --- |
| State | `owned` |
| Owner | `team-payments`, `explicit_tag`, **high** confidence, backup `user-heidi` |
| Attested | 2026-07-08, 23 days ago, inside the 90-day floor |
| Creator | `user-erin`, departed |
| Sensitive reachable | 1 |
| Counted | `false` |

This is the most important row in the dataset after the headline. It has a departed
creator and production access, and it is still green — which is the only way to show
that the red rows mean something.

---

## Beat 5 — A recently attested individual owner

**Click:** `svc-invoice-mailer`

> "Same thing without a team: a named human owner who attested 46 days ago. Green."

**Evidences:** ISO 27001:2022 A.5.16 · SOC 2 CC6.3

State `owned` · owner `user-heidi` (`explicit_tag`) · attested 2026-06-15, 46 days ago ·
counted `false`.

Keep this one next to `svc-warehouse-loader` (beat 10), whose owner attested 102 days
ago and is therefore `critical`. Two rows, 56 days apart, opposite verdicts, and the
boundary between them is a documented 90 days.

---

## Beat 6 — Unknown is not unowned

**Click:** `svc-systemroot`. `GET /api/ownership/svc-systemroot`

> "This account predates our legacy directory's audit retention. We cannot see who
> created it, so we are not going to tell you it is an orphan. We are telling you we
> do not know, and that this is an evidence problem rather than an access problem."

**Evidences:** NIST SP 800-53 AC-2(4) · SOC 2 CC6.2

| On screen | Value |
| --- | --- |
| State | `unknown`, rendered differently from a finding |
| Reason | `outside_audit_window` |
| Detail | created 2018-03-14, before `legacy-ldap` creation data begins (2019-01-01) |
| Severity | `none` |
| Counted | `false` |

Four rows sit here: three in the legacy directory (`svc-systemroot`,
`svc-ldap-batch-sync`, `svc-ldap-print-spool`) and `svc-hr-sync`, which is
SSO-federated and has no creator in the app log by design. None of them appear in the
counted queue.

Say the quiet part: reporting a retention gap as an orphan is the fastest way a tool
like this loses an analyst's trust, and it is the most common way these features fail.

---

## Beat 7 — Suppressed by design

**Click:** the suppressed filter. `GET /api/ownership?include_uncounted=true`

> "Three accounts here are supposed to have no human owner: a break-glass root
> credential, a shared mailroom system, and a scanner the vendor operates. They are
> registered exceptions, so they are silent. Every one has an expiry date — an
> exception with no expiry is a permanent hole in the control."

**Evidences:** ISO 27001:2022 A.5.16 · SOC 2 CC6.3 · NIST SP 800-53 AC-2(4)

| Identity | Reason | Effect | Expires |
| --- | --- | --- | --- |
| `svc-breakglass-root` | `break_glass` | `suppressed` | 2026-12-31 |
| `svc-shared-mailroom` | `shared_system` | `suppressed` | 2026-10-31 |
| `svc-vendor-scanner` | `vendor_managed` | `suppressed` | 2026-09-30 |

Then click `svc-migration-bridge`:

> "This one had the same exemption. It expired a month ago, so it is back in the
> queue at medium. The suppression is a clock, not a delete button."

State `unowned` / `no_owner_on_record` · severity `medium` · counted `true` ·
suppression `null`.

---

## Beat 8 — Already revoked, and SSO-federated

**Click:** `svc-legacy-fileshare`

> "Victor left two service accounts behind. This one was actually revoked during
> offboarding, so it is out of scope — but it still shows in his sweep as remediated,
> because 'we already handled it' is a claim an auditor will want evidenced."

**Evidences:** PCI DSS v4.0.1 8.2.6 · ISO 27001:2022 A.5.18

Suppression effect `excluded`, reason `already_revoked`, counted `false`. In
`GET /api/offboarding-sweep/user-victor`: `live: [svc-vpn-legacy]`, `revoked_count: 1`.
One live problem and one closed item, not two problems.

`svc-hr-sync` is the other half: `provisioning_source: 'sso_federated'`, no creator in
the app's log by design, so it resolves to `unknown` rather than being blamed on
nobody.

---

## Beat 2 — The three-hop residual footprint

**Click:** `user-alice` → sweep. `GET /api/offboarding-sweep/user-alice`

> "Alice left 46 days ago. Her account was closed. What she left behind is a backup
> service account, which spawned a reporting agent, which spawned a CRM writer. Three
> hops, three different systems, all live, and the agent in the middle can query the
> production database. A flat owner tag on each of those rows tells you nothing,
> because each row has a plausible-looking parent."

**Evidences:** NIST SP 800-53 AC-2(3) · ISO 27001:2022 A.5.18 · SOC 2 CC6.2

| On screen | Value |
| --- | --- |
| Departed since | 2026-06-15 |
| Live descendants | `svc-backup` (1 hop), `agent-report` (2), `agent-crm-writer` (3) |
| Max hops | 3 |
| Crosses apps | `true` — `aws-iam` → `mcp-gateway` |
| Sensitive reachable | `mcp:prod-db-query` |

`GET /api/offboarding-sweep` ranks all six departed humans by sensitive exposure
first, then breadth, then depth. Alice is first because of the production database,
not because she has the most accounts.

---

## Beat 3 — An agent that spawned another agent

**Click:** `agent-crm-writer` → trace. `GET /api/accountability/agent-crm-writer`

> "This agent was not created by a person. It was created by another agent. The chain
> still resolves to a human — Alice — in four nodes. That question is going to come up
> for every team running an agent gateway, and 'who owns what an agent created' is
> only answerable if you kept the lineage."

**Evidences:** NIST SP 800-53 AC-2(3) · SOC 2 CC6.2

Termination `resolved_human` · chain `agent-crm-writer → agent-report → svc-backup →
user-alice` · root human `user-alice` · orphan reason `departed`.

---

## Beat 9 — Ambiguous: two high-confidence signals disagree

**Click:** `svc-index-builder`, then `svc-backup`

> "We are not going to guess. An explicit record names Payments Platform; the group
> this account inherits from is owned by Search & Discovery. Both signals are
> high-confidence, so the verdict is ambiguous and the finding names both. Guessing
> here is how an owner field ends up holding a name nobody recognises."

**Evidences:** ISO 27001:2022 A.5.16 · SOC 2 CC6.3

`svc-index-builder` — team versus team, severity `low` (reaches nothing sensitive).
`svc-backup` — the other flavour, `user-alice` (`explicit_tag`) versus `team-platform`
(`group_ownership`), severity `high` because it sits on the Alice chain.

---

## Beat 10 — The reason matrix

**Click:** group the queue by reason.

> "Nine reasons, one clean example each, and the wording is what a reviewer acts on."

**Evidences:** NIST SP 800-53 AC-2(3) and AC-2(4) · ISO 27001:2022 A.5.16 ·
SOC 2 CC6.3

| Reason | Identity | Severity | The distinction that matters |
| --- | --- | --- | --- |
| `owner_departed` | `svc-payroll-export` | critical | Someone accepted accountability, then left. The creator is still here. |
| `creator_deactivated` | `svc-batch-recon` | critical | Nobody ever owned it; only the creation record did, and it expired. |
| `owner_role_changed` | `svc-staging-seed` | medium | AC-2(3) names role change alongside separation. Not a nicety. |
| `owner_never_attested` | `svc-cost-report` | medium | A name in a field is not an owner until someone confirms it. |
| `owner_attestation_stale` | `svc-warehouse-loader` | critical | Attested 102 days ago against a 90-day floor. |
| `owner_team_vacant` | `svc-legacy-export` | critical | The team still exists on paper. Everyone in it has left. |
| `no_owner_on_record` | `svc-oauth-dashboards` | medium | No signal at all — not even a creator. |
| `outside_audit_window` | `svc-systemroot` | none | Beat 6. A gap, not a finding. |
| `broken_provenance` | `svc-fixture-dangling-owner` | low | Parent id points at nothing. Reported, not crashed on. |
| `conflicting_owner_signals` | `svc-index-builder` | low | Beat 9. |

The `owner_departed` versus `creator_deactivated` split is worth ten seconds on stage:
they need different remediation. One is a reassignment, the other is a first-time
ownership decision.

---

## Beat 11 — Two clocks, not one

**Click:** `svc-quarterly-audit-pull`

> "This account is perfectly owned — named team, attested three weeks ago, green on
> the ownership queue. It has not been used in two hundred days. That is reportable
> under PCI's 90-day inactivity rule and it is not an ownership problem. If we
> collapsed these into one 'days stale' number we would answer neither question."

**Evidences:** PCI DSS v4.0.1 8.2.6 (inactivity) · NIST SP 800-53 AC-2(3) (trigger-based)

| On screen | Value |
| --- | --- |
| State | `owned` |
| Ownership age | `null` — no ownership condition is true |
| Inactive | 200 days, beyond the 90-day threshold |
| Severity | `none` on this queue |

PCI's clock measures inactivity. The AC-2(3) clock starts at a trigger such as
separation. They are different questions with different owners and different fixes.

---

## Beat 12 — SLA breached versus still inside it

**Click:** `svc-batch-recon`, then `svc-quarter-close`

> "Same app, same permissions, same reason, both created by people who have since
> left. One is 40 days past the departure date against a 14-day SLA, the other is 5
> days past. That is the difference between critical and high, and it is the only
> difference between these two rows."

**Evidences:** NIST SP 800-53 AC-2(3) · SOC 2 CC6.2

| | `svc-batch-recon` | `svc-quarter-close` |
| --- | --- | --- |
| Age | 40 days | 5 days |
| SLA (service account) | 14 days | 14 days |
| Breached | `true` | `false` |
| Sensitive reachable | 1 | 1 |
| Severity | `critical` | `high` |

The clock runs from the HR effective date, not from when a scan noticed. That is what
makes MTTR mean anything. If a judge asks "what if it were 15 days" — it would breach,
and the neighbouring row is one day the other side of that.

---

## Beat 13 — Cross-app correlation

**Click:** any cross-app badge; `crosses_apps: true` on Alice's sweep.

> "Three of these lineage edges cross an application boundary. A per-app view cannot
> answer 'what did this person leave behind', because the answer is in three systems
> and nobody joins them."

**Evidences:** NIST SP 800-53 AC-2(4) · SOC 2 CC6.2

Cross-app edges: `svc-vpn-legacy` (`idp-core` → `legacy-ldap`), `svc-legacy-fileshare`
(same), `agent-report` (`aws-iam` → `mcp-gateway`). These are held separately from the
per-app creation forest, so a cross-app join is never silently treated as same-app
lineage.

---

## Beat 14 — The traversal cannot be broken

**Click:** nothing. Have `GET /api/accountability/svc-fixture-depth-18` ready if asked.

> "A 17-hop provisioning chain terminates at the depth cap and reports
> `depth_limit_exceeded` rather than hanging. A cycle reports `cycle_detected`. A
> parent id that points at nothing reports `dangling_reference`. All three are
> findings, not exceptions."

**Evidences:** NIST SP 800-53 AC-2(4)

Reachable on the default policy with no env override: `maxChainDepth` is 16.

---

## Beat 15 — Ranked by blast radius

**Click:** back to the queue. Sort by age to make the point, then sort back.

> "Twelve of these 24 can reach production. The oldest finding in the list is 711
> days old and sits twelve rows down, because it can reach nothing. Sorting by age or
> by count gives you a list nobody works. Sorting by what is reachable gives you the
> row you would actually start with — which is where we started."

**Evidences:** SOC 2 CC6.2 · NIST SP 800-53 AC-2(3)

| | |
| --- | --- |
| Findings | 24 |
| Reaching sensitive access | 12, all ranked above every row that reaches nothing |
| Oldest finding | `agent-legacy-sweeper`, 711 days, rank 13, 0 sensitive |
| Rank 1 | `svc-vpn-legacy`, 200 days, 2 sensitive |

Honest framing if pressed on scale: a 90-row curated dataset demonstrates the
ordering, not the ratio. The claim being made is about which rows surface first, and
that property is asserted in `seed.test.ts` rather than eyeballed.

---

## Beats 16-18 — Provisioning Lineage

**Not written up.** The module landed in `0cf92bb` and its dataset in `1a7727b` /
`9f9ab34`; the beats are asserted in `core/src/data/seed-lineage.test.ts` but have
never been scripted here. No test guards this document, so it goes stale silently —
that is a standing defect in the demo prep, not a note about these three beats
specifically. Read the test file until this section exists.

---

## Beat 19 — Access nobody can see

**Click:** `/api/access/summary`, then filter the table to Hop.

> "This is every access path in the estate, classified by *how* it is held rather
> than by what it grants. Two of them are hop paths — the identity connects to a
> resource, and the resource carries a privileged identity of its own."
>
> "This one is Jane. She has a dashboard read and one group membership. Someone gave
> her an SSM session on the deploy box for a support ticket and never took it back.
> The deploy box carries a role with `admin:platform`."
>
> "Her IAM policy viewer shows nothing. Her group shows nothing. Our own ownership
> queue shows nothing, because her account is correctly owned and her reachable
> access — by membership — is a dashboard. She holds production platform admin, and
> every view we had before this one says she does not."

**Evidences:** NIST SP 800-53 AC-6 (least privilege) · AC-6(9)

| | |
| --- | --- |
| Path | `user-jane` → `ssm:session-deploy-box` → `role-deploy-box` → `admin:platform` |
| Type / hops | `hop` / 3 |
| Jane's other paths | 2 direct, 1 indirect, none reaching anything sensitive |
| Ownership verdict | `owned`, severity `none` — correctly, and that is the point |

---

## Beat 20 — Sensitive, and correctly not a hop

**Click:** clear the Hop filter, find `user-grace`.

> "Grace reaches a production finance export. It is sensitive and it is worth
> reviewing — and it is `indirect`, through a group, which is the most ordinary
> shape in any estate. We classify the mechanism, not the blast radius. Colouring
> this red because the permission is sensitive would bury Jane's row in a thousand
> like it."

| | |
| --- | --- |
| Path | `user-grace` → `group-finance` → `export:finance-report` |
| Type / hops | `indirect` / 2 · sensitive |
| Hop count | 0 |

---

## Beat 21 — A hop that is supposed to be there

**Click:** the second hop row, `svc-ci-runner`.

> "The other hop in the estate is a CI runner assuming a build role. That is how
> every deployment pipeline on earth works. We report it, because it is a hop, and
> it is green — it terminates in a staging deploy, not production, and both ends are
> owned by a live team."
>
> "Two hop paths, one finding. If everything with this shape came back red, the
> number would be noise."

**Evidences:** the §9 true-negative discipline of `delegation-chain-research.md`

| | |
| --- | --- |
| Path | `svc-ci-runner` → `ci:assume-build-agent` → `role-build-agent` → `deploy:staging` |
| Type / hops | `hop` / 3 · not sensitive |
| Owner | `team-platform`, attested 9 days |

**If asked why the effective-permission column is missing:** it is not implemented
and is not faked. The engine's permission model is additive — no denies, no
boundaries, no SCPs — so the field is named `reachable_permissions` and the
deviation is written up as Amendment 3 in `docs/PRD-access-discovery.md`.

---

## Beat 22 — The same mechanism, on something nobody reviews

**Click:** switch the App selector to MCP Gateway. Keep the Hop filter on.

> "Jane is a person, and people get reviewed. This estate is 103 accounts that are
> not people — service accounts and AI agents — and this is one of them."
>
> "The support triage agent has one direct grant and one group membership. Its
> entitlement list is two rows long. The group it belongs to holds a connect
> permission onto the runbook host, and the runbook host carries a role that can
> query the production database."
>
> "Note the classification: the path starts with a group membership, and we still
> call it a hop. The mechanism is what a reviewer acts on. Filing this under
> 'indirect' would put it next to the thousand ordinary group memberships in this
> estate, which is exactly where it has been sitting."

**Evidences:** NIST SP 800-53 AC-6(9) · AC-3

| | |
| --- | --- |
| Path | `agent-support-triage` → `group-oncall-agents` → `mcp:connect-prod-runbook` → `role-runbook-executor` → `mcp:prod-db-query` |
| Type / hops | `hop` / 4 · sensitive |
| Agent's own paths | 1 direct, 1 indirect, 3 hop |
| Ownership verdict | `owned`, attested 7 days ago |

---

## Beat 23 — It does not stop at one resource

**Click:** the `admin:warehouse` row on the same agent. Expand the chain.

> "The runbook host's role holds a second connect grant, onto the warehouse host.
> That host carries a role with `admin:warehouse`."
>
> "So the full path is six edges: the agent, its group, the runbook host, its role,
> the warehouse host, its role, and finally Snowflake warehouse admin. The agent
> lives in the MCP gateway. The permission lives in Snowflake. No single system's
> console can render this, because no single system holds both ends."
>
> "Every rung is owned. Two different teams attested inside the last ten days.
> Nobody was negligent — nobody owns the *composition*, because until now nothing
> drew it."

**Evidences:** NIST SP 800-53 AC-6 · CA-3 (system interconnections)

| | |
| --- | --- |
| Path | 6 edges, `mcp-gateway` → `snowflake` |
| Resource crossings | 2 (`ASSUMES_ROLE` twice — `PRD` §8's first open question) |
| Grant that closes it | `mcp:connect-prod-runbook`, held by the group |
| Ownership verdicts | every rung `owned`, severity `none` |

Six hop paths across four identities, spanning hop counts 3, 4 and 6 and two apps
— so the App selector and the hop-count range in §6.2 both have something real to
filter. All six are asserted in `core/src/access/classify.test.ts`.

---

## Beats 24-33 — Identity Exposure Map and Blast Radius

**Not written.** Both modules shipped; their beats did not. Beats 24-29 belong to
Identity Exposure Map and 30-33 to Unified Impact Analysis, and the numbers each
needs are pinned in `core/src/data/seed-exposure.test.ts` and
`core/src/impact/choke.test.ts` respectively. Beat 30's row is
`mcp:connect-prod-runbook` at −12 access and −8 mechanisms. Nothing checks this
document, so this gap is recorded here rather than discovered on stage.

---

## Beat 34 — Four independent signals, one identity

**Click:** Identity Risk Profile in the nav. Default sort, top row.

> "Every screen so far has ranked one thing. Ownership ranked findings by urgency.
> Exposure ranked identities by footprint. Blast Radius ranked what to revoke. This
> screen ranks nothing. It reports which of those independent checks fired on the
> same identity, and how many."
>
> "Top row: `svc-vpn-legacy`. Four factors. Its owner is a deactivated employee —
> that severity is Ownership's word, copied, not ours. Its footprint is extensive —
> that band is Exposure's word, copied. Its MFA was turned off 271 days ago and the
> temporary exception covering that is still live after 167 days. And a VPN grant on
> it is 1,914 days old, against a 180-day median revocation for that grant type
> across nine observed grants."
>
> "Notice what the row does not have. There is no composite score, and there is no
> average. Four sources found four different things, and the row says four, not a
> number between them. We measured the alternative: fusing these six factors with
> the weights the spec proposed moves this identity — the one every other screen
> puts first — down to rank nine."

**Evidences:** NIST SP 800-30 Rev 1 (combination rules made explicit) · OECD/JRC
*Handbook on Constructing Composite Indicators* (additive aggregation implies full
compensability) · `ITAG.md` §F9, §F10

| | |
| --- | --- |
| Row | `svc-vpn-legacy` — rank 1, `factors_firing` 4, `worst_level` critical |
| Quoted | `ownership` critical · `exposure` high (band extensive, score 83) |
| Computed here | `control_drift` critical · `grant_staleness` high |
| Not a field | `risk_score`, `peer_percentile`, `score_drift` — see PRD Amendments 2-4 |

---

## Beat 35 — Six rows, not a hundred and twenty-seven

**Click:** set the factor filter to 3 or more.

> "One hundred and twenty-seven identities go in. Six come out with three or more
> independent signals against them. This is the week's list."
>
> "`svc-backup` is second, and it is worth one sentence. Its conditional-access
> exception is ninety days old today — exactly ninety. The rule written eighteen
> months ago says an exception still active ninety-plus days later is a serious
> control failure, so the comparison is greater-than-or-equal and this row reads
> critical rather than high. It is the only identity in the estate sitting on that
> boundary, which is why it has a test of its own."
>
> "The distribution behind the filter is one identity with four factors, five with
> three, seventeen with two, twenty-seven with one, and seventy-seven with none. I
> can defend a six-row queue to an auditor. Under the composite the same estate
> produced thirty-three distinct values and forty-two identities tied on the number
> eight."

**Evidences:** `ITAG.md` §F9 (MFA disabled = high impact; exception still active 90+
days) · NIST/SEMATECH e-Handbook §7.2.6.2 (percentile behaviour at small N)

| | |
| --- | --- |
| Filter | `min_factors=3` → 6 of 127 |
| The six | `svc-vpn-legacy` 4 · `svc-backup`, `svc-batch-recon`, `svc-legacy-export`, `svc-quarter-close`, `svc-etl` 3 |
| Distribution | 4:1 · 3:5 · 2:17 · 1:27 · 0:77 |
| Worst level over the 50 with findings | critical 19 · high 8 · medium 19 · low 4 |

---

## Beat 36 — What we did not look at

**Click:** the coverage block at the top of the summary.

> "This is the number most products do not show you, so I want to show it first.
> Hop access was evaluated on all 127 identities. Exposure on 126. Ownership on 122.
> Control drift on **four**, because four identities in this estate have a control
> history table. Grant staleness on **seven**."
>
> "So seventy-seven identities report no findings, and not one of them is described
> as clean. They come back as partially evaluated, naming the factors we could not
> run. A clean bill of health and a missing input are different claims, and they are
> different shapes in the API — the fields that carry a ranking exist only on the
> arm that has one, so nothing can read a score off a row that has not got one."
>
> "Read the last line separately. Access-review staleness: fourteen evaluated, zero
> unavailable, **one hundred and thirteen not applicable**. No provider records an
> access review for a service account, and none will. That is a scope statement, not
> a backlog item, and it is the distinction the six products we surveyed collapse
> into one grey badge."

**Evidences:** NIST SP 800-53 AC-2(3) · architecture rule 9 (`unknown` is
structurally excluded from counts)

| Factor | Evaluated | Unavailable | Not applicable | Findings |
| --- | --- | --- | --- | --- |
| `hop_access` | 127 | 0 | 0 | 11 |
| `exposure` | 126 | 1 | 0 | 31 |
| `ownership` | 122 | 5 | 0 | 24 |
| `control_drift` | 4 | 123 | 0 | 4 |
| `grant_staleness` | 7 | 120 | 0 | 7 |
| `review_staleness` | 14 | 0 | 113 | 3 |

---

## Beat 37 — The disagreement is the product

**Click:** `user-maya` — highest exposure score in the estate, and not near the top
of this table.

> "Maya has the widest footprint of any identity here. Exposure scores her 97, the
> highest number on that screen. On this screen she has one factor firing, and the
> row says so: exposure high, everything else either clean or unevaluated."
>
> "`svc-vpn-legacy` scores 83 — lower — and outranks her here, because four
> independent checks fired on it and one fired on her."
>
> "Both readings are correct. Exposure is asking how much this identity could reach.
> This screen is asking how many independent checks object to it. If we had averaged
> them, Maya would have landed at rank 62 of 127 — we measured that — and the widest
> footprint in the estate would have been invisible on both screens."
>
> "The sentence explaining that ships on every row, from the engine, not the
> frontend, because it is an answer about how the engine works."

**Evidences:** OECD/JRC Handbook (weights in additive aggregation are substitution
rates, not importance) · FIRST EPSS/CVSS guidance on override versus weighting

| | |
| --- | --- |
| `user-maya` | exposure 97, `factors_firing` 1, unevaluated: `control_drift`, `grant_staleness` |
| `svc-vpn-legacy` | exposure 83, `factors_firing` 4 — ranks above her |
| Ordering | `factors_firing`, then `worst_level`, then id. Never a sum. |
| On every row | `RISK_VERSUS_RANKERS` — the four-surface reconciliation |

Every number in beats 34-37 is asserted in `core/src/data/seed-risk.test.ts`, and the
guards that keep this module from authoring a fourth ranking are in
`core/src/risk/service.test.ts`.

---

## Appendix A — Every curated identity

The contract the UI is built against. Ages and inactivity are days as of
`ITAG_NOW=2026-07-31T00:00:00Z`; every row is asserted in `core/src/data/seed.test.ts`.
Eight groups and 22 `svc-fixture-*` probes are omitted. **Incomplete:** the 41
identities added for beats 16-18 in `1a7727b` / `9f9ab34` were never added to this
table, so it is a subset rather than the full contract it claims to be. `seed.test.ts`
is exhaustive; this document is not, and nothing checks it.

| Identity | App | State | Reason | Severity | Counted | Age | Idle | Sens |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `svc-vpn-legacy` | legacy-ldap | `owner_invalid` | `creator_deactivated` | critical | true | 200 | 5 | 2 |
| `user-bob` | snowflake | `owner_invalid` | `owner_attestation_stale` | critical | true | 197 | 1 | 1 |
| `svc-warehouse-loader` | snowflake | `owner_invalid` | `owner_attestation_stale` | critical | true | 102 | 1 | 1 |
| `svc-legacy-export` | aws-iam | `owner_invalid` | `owner_team_vacant` | critical | true | 72 | 3 | 1 |
| `user-carol` | aws-iam | `owner_invalid` | `creator_deactivated` | critical | true | 67 | 2 | 1 |
| `agent-report` | mcp-gateway | `owner_invalid` | `creator_deactivated` | critical | true | 46 | 1 | 1 |
| `user-alice` | aws-iam | `owner_invalid` | `creator_deactivated` | critical | true | 46 | 47 | 2 |
| `svc-batch-recon` | aws-iam | `owner_invalid` | `creator_deactivated` | critical | true | 40 | 9 | 1 |
| `svc-payroll-export` | aws-iam | `owner_invalid` | `owner_departed` | critical | true | 40 | 7 | 2 |
| `svc-quarter-close` | aws-iam | `owner_invalid` | `creator_deactivated` | high | true | 5 | 1 | 1 |
| `svc-backup` | aws-iam | `ambiguous` | `conflicting_owner_signals` | high | true | — | 2 | 1 |
| `agent-legacy-sweeper` | legacy-ldap | `unowned` | `no_owner_on_record` | medium | true | 711 | 20 | 0 |
| `svc-migration-bridge` | snowflake | `unowned` | `no_owner_on_record` | medium | true | 303 | 33 | 0 |
| `agent-analytics` | snowflake | `owner_invalid` | `owner_attestation_stale` | medium | true | 197 | 2 | 0 |
| `svc-oauth-dashboards` | github | `unowned` | `no_owner_on_record` | medium | true | 182 | 12 | 0 |
| `svc-cost-report` | github | `owner_invalid` | `owner_never_attested` | medium | true | 138 | 3 | 0 |
| `svc-staging-seed` | aws-iam | `owner_invalid` | `owner_role_changed` | medium | true | 67 | 11 | 0 |
| `agent-crm-writer` | mcp-gateway | `owner_invalid` | `creator_deactivated` | medium | true | 46 | 3 | 0 |
| `svc-index-builder` | snowflake | `ambiguous` | `conflicting_owner_signals` | low | true | — | 6 | 0 |
| `svc-payments-recon` | aws-iam | `owned` | — | none | false | — | 2 | 1 |
| `svc-invoice-mailer` | aws-iam | `owned` | — | none | false | — | 4 | 0 |
| `svc-quarterly-audit-pull` | snowflake | `owned` | — | none | false | — | 200 | 0 |
| `svc-monitor` | github | `owned` | — | none | false | — | 1 | 0 |
| `svc-deploy` | aws-iam | `owned` | — | none | false | — | 6 | 1 |
| `svc-etl` | snowflake | `owned` | — | none | false | — | 1 | 1 |
| `user-dan` | github | `owned` | — | none | false | — | 1 | 0 |
| `user-heidi` | aws-iam | `owned` | — | none | false | — | 1 | 2 |
| `user-jane` | aws-iam | `owned` | — | none | false | — | 2 | 0 |
| `user-grace` | aws-iam | `owned` | — | none | false | — | 3 | 1 |
| `role-deploy-box` | aws-iam | `owned` | — | none | false | — | 1 | 1 |
| `role-build-agent` | aws-iam | `owned` | — | none | false | — | 1 | 0 |
| `svc-ci-runner` | aws-iam | `owned` | — | none | false | — | 1 | 0 |
| `agent-support-triage` | mcp-gateway | `owned` | — | none | false | — | 1 | 0 |
| `role-runbook-executor` | mcp-gateway | `owned` | — | none | false | — | 1 | 1 |
| `role-warehouse-admin` | snowflake | `owned` | — | none | false | — | 2 | 1 |
| `svc-systemroot` | legacy-ldap | `unknown` | `outside_audit_window` | none | false | 3061 | 16 | 1 |
| `svc-ldap-batch-sync` | legacy-ldap | `unknown` | `outside_audit_window` | none | false | 3187 | 8 | 0 |
| `svc-ldap-print-spool` | legacy-ldap | `unknown` | `outside_audit_window` | none | false | 3692 | 2677 | 0 |
| `svc-hr-sync` | idp-core | `unknown` | `no_owner_on_record` | none | false | 469 | 1 | 0 |
| `svc-breakglass-root` | aws-iam | `unowned` | `no_owner_on_record` | none | false | 557 | — | 1 |
| `svc-shared-mailroom` | aws-iam | `unowned` | `no_owner_on_record` | none | false | 532 | 1 | 0 |
| `svc-vendor-scanner` | github | `unowned` | `no_owner_on_record` | none | false | 121 | 1 | 0 |
| `svc-legacy-fileshare` | legacy-ldap | `owner_invalid` | `creator_deactivated` | none | false | 200 | 243 | 0 |
| `user-victor` | idp-core | `owner_invalid` | `creator_deactivated` | none | false | 200 | 203 | 2 |
| `user-erin` | aws-iam | `owner_invalid` | `creator_deactivated` | none | false | 143 | 144 | 1 |
| `user-nadia` | aws-iam | `owner_invalid` | `creator_deactivated` | none | false | 40 | 41 | 1 |
| `user-omar` | aws-iam | `owner_invalid` | `creator_deactivated` | none | false | 5 | 6 | 1 |

The five uncounted `owner_invalid` rows at the bottom are identities that were revoked
during offboarding: the state is what the lineage says, and `already_revoked`
suppression is why they are not findings.

## Appendix B — Where every threshold comes from

Read the values in `core/src/domain/policy.ts`; the sourcing is what a judge will ask
about.

| Threshold | Value | Source |
| --- | --- | --- |
| Attestation floor | 90 days | PCI DSS v4.0.1 8.2.6 uses 90 days for inactivity; the same interval is applied to attestation freshness. |
| Inactivity | 90 days | PCI DSS v4.0.1 8.2.6. |
| Disable SLA, non-human | 14 days | Local policy. NIST AC-2(3) requires a defined period and does not set a number. |
| Disable SLA, human | 30 days | Local policy, same basis. |
| Max chain depth | 16 | Engineering limit, not a control. Exceeding it is reported as a finding, never as a silent truncation. |
| Exception staleness | 90 days | `ITAG.md` §F9, "still active 90+ days later". `DEFAULT_RISK_POLICY.exceptionStaleDays`, kept separate from the attestation floor so the two cannot be retuned together by accident. |
| Grant staleness | per grant type | Not a constant. `grant_half_lives` carries an observed median revocation age and a sample size per grant type; the evidence string states both, so a reviewer can judge whether n is large enough. |

## Appendix C — What this dataset does not prove

Say these before a judge finds them.

- **Scale.** 39 curated rows show the ranking property, not "7 of 4,000". A
  deterministic filler population is designed but not built.
- **Ingestion.** Every identity is static seed data. No connector has been written, so
  nothing here proves we can get this graph out of a real IdP.
- **Attestation workflow.** Attestation dates exist; asking a human to attest does not.
- **Agent ownership semantics.** Beat 3 makes the question concrete and takes the
  position that an agent's chain resolves through its spawner to a human. That is a
  defensible default, not a settled answer.
- **Factor coverage.** Beat 36 says this out loud rather than hiding it, but say it
  here too: two of the six risk factors read fixture tables covering four and seven
  identities. The *rules* are tested; the claim "60% of this estate is unassessed" is
  a property of the fixture, not a finding about a real environment.
- **Grant half-lives.** The medians in `grant_half_lives` are seeded constants with
  seeded sample sizes, not measured from an observed revocation history. The
  methodology is what the evidence string exposes; the numbers are invented.
