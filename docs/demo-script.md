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

> "Eleven of these 22 can reach production. The oldest finding in the list is 711
> days old and sits eleven rows down, because it can reach nothing. Sorting by age or
> by count gives you a list nobody works. Sorting by what is reachable gives you the
> row you would actually start with — which is where we started."

**Evidences:** SOC 2 CC6.2 · NIST SP 800-53 AC-2(3)

| | |
| --- | --- |
| Findings | 22 |
| Reaching sensitive access | 11, all ranked above every row that reaches nothing |
| Oldest finding | `agent-legacy-sweeper`, 711 days, rank 12, 0 sensitive |
| Rank 1 | `svc-vpn-legacy`, 200 days, 2 sensitive |

Honest framing if pressed on scale: a 39-row curated dataset demonstrates the
ordering, not the ratio. The claim being made is about which rows surface first, and
that property is asserted in `seed.test.ts` rather than eyeballed.

---

## Appendix A — Every curated identity

The contract the UI is built against. Ages and inactivity are days as of
`ITAG_NOW=2026-07-31T00:00:00Z`; every row is asserted in `core/src/data/seed.test.ts`.
Six groups and 21 `svc-fixture-*` probes are omitted.

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
