# Identity Blast Radius — Delegation Chain, Escalation & Accountability Tracer

> **Team:** Sachin Kumar, Harshavardhan Reddy, Narayana Varma, Pritish Paul, Jayakumar
> **Type:** Hackathon Project
> **Status:** Draft v1
>
> Source: `Identity Blast Radius - Delegation Chain, Escalation & Accountability Tracer.pdf` (transcribed for reference alongside the code scaffold in this repo). Companion doc: [`PRD-delegation-chain.md`](./PRD-delegation-chain.md) — a related but structurally distinct **real product** module from Unosecur's IdentityGovern.

## 1. Problem Statement

Access in modern organizations doesn't stay where it's granted — it delegates and inherits:

- A human provisions an API key for a service account
- A service account spawns or configures an AI agent
- Groups nest inside groups, roles inherit from roles

Two things go wrong as these chains grow:

1. **Silent escalation** — a downstream identity (service account, sub-agent) ends up with more effective access than was ever explicitly granted to it, because inheritance and delegation compound in ways nobody reviews end-to-end.
2. **Lost accountability** — even when access is technically "fine," nobody can quickly answer *"whose decision made this possible, and are they still around to explain or revoke it?"* The human who provisioned the root key may have left the company, changed teams, or simply forgotten the grant exists.

Existing tools show what an identity can reach (blast radius) or flag anomalous behavior — but **none trace a chain backward to the accountable human and check whether that accountability is still valid**. This is the gap this project targets.

## 2. Goals / Non-Goals

### Goals

- Model humans, non-human identities (NHIs/service accounts), and AI agents in **one unified delegation graph**.
- Detect privilege escalation at the exact hop it occurs (effective access > explicitly granted access).
- Trace any identity's access **backward to the human** who originated the chain.
- Flag "orphaned accountability" — when that root human is no longer positioned to own the access (departed, role-changed, inactive).
- Track "trust decay" — when protective controls (MFA, conditional access) weaken over time, independent of permissions.
- Predict which grants are statistically likely past their useful "half-life," before they're manually noticed as stale.
- Sweep for identity debt left behind by departed employees — everything they provisioned that's still live.
- Explain all of the above in plain English.
- Let a user simulate removing a grant and see blast radius shrink live.

### Non-goals (hackathon scope)

- No live integration with real IdPs/HRIS systems — all identity and employment-status data is mocked.
- No persistence layer / multi-user accounts — single-session demo tool.
- No fuzzy/ML-based escalation detection — exact-match logic (`effective ⊃ explicit`) is sufficient.
- No real-time monitoring — this is a point-in-time graph analysis tool, not a streaming detector.

## 3. Core Concept

Every identity is a **node**. Every relationship is an **edge**. Two edge types:

- `inherited_from` — group/role membership (Identity X gets permissions from Group Y).
- `delegates_to` — one identity provisions, spawns, or configures another (Human A provisions Service Account B; Service Account B spawns Agent C).

Because both edge types are modeled generically, the same traversal function works for:

- **Forward traversal → blast radius** (what can this identity ultimately reach).
- **Backward traversal → accountability trace** (which human, however many hops back, is the root cause).

This is the key architectural insight that keeps the build simple: **one graph, one traversal engine, two directions, three identity types — no special-casing per type.**

## 4. Features

### F1 — Unified Identity Graph

- Every identity (human, service account, AI agent) is a node with the same schema.
- Edges: `direct_grant` (permission attached directly), `inherited_from` (group/role), `delegates_to` (provisioning/spawning).
- Backing store: single JSON file, loaded into an in-memory graph at startup.

### F2 — Blast Radius Computation (Forward Trace)

- Given any identity, traverse outward via `direct_grant` + `inherited_from` + `delegates_to` (transitively).
- Distinguish **explicit access** (directly granted) from **effective access** (inherited/delegated, never explicitly stated).
- **Output:** full list of reachable permissions/resources, with the path that produced each one.

### F3 — Escalation Detection

- At every hop in the forward trace, compare a node's effective access against its own explicit access.
- Flag any node where `effective ⊃ explicit` (i.e., it can do more than it was ever directly told it could).
- **Severity ranking:** how many "extra" permissions, and how sensitive they are (based on a simple tag like `sensitive: true` on certain permissions in the seed data).

### F4 — Accountability Trace (Backward Trace)

- For any identity (especially a flagged one), walk `delegates_to` edges backward to find the root human who originated the chain.
- Each node stores a `provisioned_by` reference (or is itself the root if `provisioned_by` is null and type is `human`).
- **Output:** an ordered chain from the flagged identity back to the accountable human.

### F5 — Orphaned Accountability Flag

- Mock a simple `employee_status` table: `{ name, status: active|departed|role_changed, last_reviewed_date }`.
- After the accountability trace resolves to a human, check their status.
- If departed, role-changed, or `last_reviewed_date` is beyond a threshold (e.g., 90 days) → flag the entire downstream chain as **orphaned accountability**.

### F6 — Explainable Risk Narrative (combines F3 + F4 + F5)

- For a selected/flagged identity, send the escalation details + accountability trace + employee status to an LLM.
- **Output:** a single coherent narrative combining *what is technically wrong* and *who is (or isn't) accountable for it*, plus 1-2 ranked remediation actions.

### F7 — Risk Reduction Simulator ("What-If")

- UI toggle to disable one grant/edge on a selected identity.
- Re-run the forward traversal (F2) immediately on a modified in-memory copy.
- Show **before/after diff:** resources no longer reachable, whether the escalation flag clears.
- Fully non-destructive — toggles never touch the base seed dataset.

### F8 — Identity Type Filter

- Dropdown/tab filter: All / Human / Service Account / AI Agent.
- Same graph, same features, filtered view only — demonstrates the "one engine, one model" claim.

### F9 — Trust Decay from Silent Config Drift

**Concept:** Permissions aren't the only thing that determines risk — the **protective controls** around an identity matter just as much, and they quietly weaken over time without anyone tracking it (MFA disabled, a conditional access rule loosened, a session-timeout exception granted "temporarily" and never revisited).

**What it adds:** A trust score, separate from the escalation/permission logic in F3, that decays whenever a protective control is removed or weakened for an identity — independent of what that identity can technically access.

**Data needed:** A `control_history` log per identity — a simple list of control-change events:

```json
{
  "identity_id": "user-alice",
  "events": [
    { "control": "mfa_enabled",         "change": "disabled",          "date": "2026-04-10" },
    { "control": "conditional_access",  "change": "exception_granted", "date": "2026-05-02", "note": "temporary - VPN issue" }
  ]
}
```

**Scoring logic:** Start every identity at a baseline trust score (e.g., 100). Each control weakening subtracts points based on severity (MFA disabled = high impact, session timeout extended = low impact). Decay compounds with time — a "temporary" exception that's still active 90+ days later loses additional points, since it signals the exception was never actually revisited.

**Why it's a genuinely different signal than F3:** An identity can have **zero permission escalation** (F3 clean) but still be highly exposed because its protective controls have eroded — e.g., a service account with perfectly scoped permissions but MFA disabled and a stale conditional-access exception. Today's blast-radius/escalation view would miss this entirely; F9 catches it.

**UI treatment:** A second badge on each node (separate from the red escalation flag) — a trust "temperature" indicator (e.g., green → amber → red) based on decayed score. Clicking it shows the control-change timeline that produced the current score.

**Ties into F6 (explanation):** The LLM narrative should mention trust decay alongside escalation and accountability when relevant — e.g., *"Beyond the excess permission this agent holds, its MFA was disabled 4 months ago and never re-enabled — this identity is both over-privileged and under-protected."*

**Feasibility:** Easy. This is pure scoring logic over a mock event log — a running subtraction with a time-based multiplier. No new architecture; it plugs into the same node data structure and explanation pipeline you're already building.

### F10 — Access Half-Life Predictor

**Concept:** Most tools flag access as stale only **after** it's gone unused for a long time. This **predicts, at the moment a grant is created**, how long it's *likely* to remain necessary — based on the historical pattern of similar grants — so a reviewer gets a heads-up before the access becomes a problem, not after.

**What it adds:** A "half-life" estimate attached to each grant: a predicted point in time by which similar grants have historically been forgotten-but-not-revoked, based on grant type and identity type.

**Data needed:** A small lookup table of historical grant patterns:

```json
{
  "grant_type": "contractor_prod_db_access",
  "median_days_to_actual_need": 45,
  "median_days_to_revocation": 210,
  "sample_size": 12
}
```

Each active grant is tagged with a `grant_type` matching this table (e.g., `contractor_prod_db_access`, `temp_admin_elevation`, `service_account_provisioning`).

**Scoring logic:** For any live grant, compare its current age against the historical `median_days_to_actual_need` for its type. If the grant has already outlived the typical "actually needed" window but hasn't hit the typical revocation window yet, flag it as **"likely past its half-life"** — i.e., statistically probably no longer needed, even though nothing else about it looks anomalous.

**Why it's a genuinely different signal:** F3 (escalation) and F9 (trust decay) both look at what's **technically wrong right now**. F10 is predictive/actuarial — it uses historical patterns to flag grants that are **probably dead weight before anyone manually notices**, turning access reviews from reactive to anticipatory.

**UI treatment:** A small "decay clock" icon per grant edge in the graph (or in a grant detail panel) showing predicted vs. actual age, with a simple color cue once a grant crosses its predicted half-life.

**Feasibility:** Very easy — it's a lookup + comparison against a mock historical table, no real statistical modeling needed for a convincing demo. The main work is inventing 3-4 believable grant-type patterns with plausible median values.

### F11 — Identity Debt from Off-boarding Gaps (Deprovisioning Trace)

**Concept:** Off-boarding usually means "did we disable their SSO login" — but access sprawls far beyond that single account: API keys they generated, service accounts they created, OAuth apps they approved, agents they configured. This traces the **full footprint** a departed identity leaves behind, not just their own login.

**What it reuses:** This is the exact same graph engine as F4/F5 (accountability trace), just triggered from the opposite direction — instead of asking "who is accountable for this flagged identity," it asks **"everything this now-departed human created or delegated to, is any of it still live?"**

**How it works:**

1. Pull the `employee_status` table (already built for F5) and find identities marked `departed`.
2. For each departed human, run a forward trace along `delegates_to` edges to find every identity they provisioned, directly or transitively (a service account they created, an agent that service account spawned, and so on).
3. Flag every node in that downstream footprint that is still active (no offsetting "revoked" flag) as **orphaned deprovisioning debt**.

**Data needed:** No new data structures — reuses `employee_status` (from F5) and `delegates_to` edges (from the core graph). The only addition is an optional `revoked: true/false` flag on each identity/grant to distinguish "still live" from "already cleaned up."

**Why it's a genuinely different signal:** F5 asks *"does this specific flagged identity still have a valid accountable owner."* F11 flips the question around and asks *"for every person who has already left, what did we forget to clean up"* — a proactive off-boarding sweep rather than a per-identity lookup, and a natural, high-impact use of a trace you're already building.

**UI treatment:** A dedicated **"Off-boarding Sweep"** view/tab — list departed employees, and under each, a collapsed tree of everything downstream that's still live, sorted by how many hops removed and how sensitive the access is.

**Feasibility:** Very easy given F4/F5 already exist — this is largely a different entry point and view over the same traversal function, plus one boolean field. Low marginal build cost for a feature that lands very well with judges (*"here's what three departed employees left wide open"*).

### F22 — Automated Threat Model Generator (STRIDE-per-Identity)

**Concept:** Instead of a free-form risk narrative alone, auto-generate a structured threat breakdown for any selected identity by mapping the signals your engine already detects (F3, F5, F9, F11) onto **STRIDE** — a well-established, industry-standard threat categorization framework (Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege). This is a **labeling/mapping layer**, not new detection logic or a new methodology — no need to invent a threat model from scratch.

**Mapping table (signal → STRIDE category):**

| Signal (already computed)                                | STRIDE category         |
| -------------------------------------------------------- | ----------------------- |
| F3 — Escalation beyond explicit grant                    | Elevation of Privilege  |
| F5 — Orphaned accountability (no valid owner)            | Repudiation             |
| F9 — Trust decay (MFA disabled, weakened controls)       | Spoofing                |
| F11 — Off-boarding debt (departed employee's live footprint) | Repudiation / Elevation |
| Excess reachable sensitive data (F2 blast radius)        | Information Disclosure  |
| Long/unapproved delegation chain (F13, F15 if built)     | Tampering               |

**Output format:** A structured, categorized list rather than prose — e.g.:

```
Identity: agent-report
Threats identified:
  [Elevation of Privilege]  HIGH   — inherited notion-write via svc-backup's group, never explicitly granted
  [Repudiation]             MEDIUM — accountable human (Alice) departed, no backup owner
  [Spoofing]                MEDIUM — svc-backup has MFA disabled since 2026-04-10

Recommended mitigations (ranked):
  1. Revoke inherited notion-write scope
  2. Assign backup owner for svc-backup
  3. Re-enable MFA on svc-backup
```

**Why this is a strong, low-cost addition:** It reuses every signal you've already built — the only new work is a mapping table and a restructured LLM prompt that outputs categorized threats instead of a paragraph. It also elevates the pitch: *"we auto-generate a STRIDE threat model per identity"* is immediately recognizable and credible to any judge with a security background, and reads as more mature than a narrative explanation alone.

**Stretch credibility flex (verbal only, not built):** You can mention in Q&A that these findings also map to real **MITRE ATT&CK techniques** (e.g., F3 → T1098 Account Manipulation, F11 → T1078 Valid Accounts, F9 → T1556 Modify Authentication Process) — no need to build this mapping into the UI, just have it ready to say if a judge asks *"does this tie to any real framework."*

**Feasibility:** Easy — roughly 1–1.5 hours. It's a mapping table plus a modified LLM prompt requesting structured, categorized output instead of free-form narrative. No new traversal or detection logic required.

## 5. System Flow

```
┌──────────────────────┐
│ Seed Data (JSON)     │  identities: humans, service accounts, agents
│                      │  edges: direct_grant, inherited_from, delegates_to
│                      │  employee_status table (active/departed/role_changed)
│                      │  control_history log (MFA/conditional access changes)
└───────────┬──────────┘
            │
            ▼
┌────────────────────────────────────┐
│ Graph Engine (in-mem)              │
│ - build adjacency list             │
│ - forward traversal (blast radius) │ → F2, F3, F7
│ - backward traversal (account.)    │ → F4, F5
│ - trust decay scoring              │ → F9
└───────────┬────────────────────────┘
            │
            ▼
┌────────────────────────────────────┐
│ API / Data Layer                   │
│ GET  /identities                   │
│ GET  /blast-radius/:id             │
│ GET  /accountability/:id           │
│ GET  /trust-score/:id              │
│ POST /simulate (toggle edge)       │
│ POST /explain/:id → LLM call       │
└───────────┬────────────────────────┘
            │
            ▼
┌────────────────────────────────────────────┐
│ Frontend UI                                │
│ - Graph visualization (react-flow)         │
│ - Identity picker + type filter            │
│ - Escalation flags (red highlight)         │
│ - Trust temperature badge (green/amber/red)│
│ - Accountability panel (root human +       │
│   status badge: active/orphaned)           │
│ - Explanation panel (LLM narrative)        │
│ - Simulator toggle + live diff             │
└────────────────────────────────────────────┘
```

### User flow (demo path)

1. **Load app** → graph renders, escalated nodes shown in red, trust temperature badge shown per node (green/amber/red).
2. **Click a flagged node** → blast radius highlights (forward trace).
3. **Accountability panel auto-populates** → shows the root human and their status badge.
4. If root human is departed/stale → **"Orphaned Accountability"** banner appears.
5. If trust score has decayed → clicking the temperature badge shows the control-change timeline (e.g., *MFA disabled 4 months ago, never re-enabled*).
6. Click **"Explain"** → LLM narrative combines the technical escalation + accountability gap + trust decay into one paragraph with ranked fixes.
7. Toggle off the offending grant in the simulator → escalation flag clears, graph updates live.

## 6. Data Model

```json
{
  "id": "user-alice",
  "type": "human",
  "name": "Alice",
  "direct_grants": ["read:finance-db"],
  "inherited_from": ["group-finance"],
  "delegates_to": ["svc-backup"],
  "provisioned_by": null
}
```

```json
{
  "id": "svc-backup",
  "type": "service_account",
  "name": "backup-service",
  "direct_grants": ["write:s3-backup"],
  "inherited_from": ["group-eng"],
  "delegates_to": ["agent-report"],
  "provisioned_by": "user-alice"
}
```

```json
{
  "id": "agent-report",
  "type": "ai_agent",
  "name": "report-agent",
  "direct_grants": ["mcp:gmail-read"],
  "inherited_from": [],
  "delegates_to": [],
  "provisioned_by": "svc-backup"
}
```

```json
{
  "id": "group-eng",
  "type": "group",
  "name": "Engineering",
  "direct_grants": ["mcp:notion-write"],
  "inherited_from": [],
  "delegates_to": []
}
```

**Employee status table:**

```json
{
  "user-alice": { "status": "departed", "last_reviewed": "2026-06-01" }
}
```

**Control history log (for F9 — Trust Decay):**

```json
{
  "identity_id": "svc-backup",
  "events": [
    { "control": "mfa_enabled",        "change": "disabled",          "date": "2026-04-10" },
    { "control": "conditional_access", "change": "exception_granted", "date": "2026-05-02", "note": "temporary - VPN issue" }
  ]
}
```

**Note:** `agent-report` ends up with `mcp:gmail-read` (explicit) **plus** `mcp:notion-write` (inherited via `svc-backup`'s group membership) — this is the escalation F3 should catch: the agent's effective access includes a permission no one explicitly gave *it*, sourced two hops back through a group its delegator belongs to. Separately, `svc-backup` itself has clean, correctly-scoped direct grants but a decayed trust score (F9) — MFA disabled 4+ months ago and a "temporary" exception that's still active — showing that permission-correctness and trust posture are independent signals that both need to be seen together.

## 7. Tech Stack (optimized for hackathon speed)

| Layer            | Choice                                                                            | Why                                                                                     |
| ---------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Backend          | Node.js + Express, or skip entirely                                                | Traversal logic is simple enough to run client-side if you want zero backend            |
| Graph engine     | Plain JS objects + adjacency list, BFS/DFS both directions                        | No graph DB needed at this data scale                                                    |
| LLM explanation  | Anthropic API, one prompt call per flagged identity                               | See prompt template below                                                                |
| Frontend         | React + react-flow                                                                | Fastest path to an interactive, draggable node graph                                    |
| Data             | Static seed JSON (identities + edges + employee status), mutated in-memory only for simulation | No DB setup needed                                                                      |

**Fastest possible path:** run everything client-side — load JSON, do both traversals in the browser, call the LLM API directly from the frontend. Skips a backend layer entirely.

## 8. LLM Prompt Template (for F6)

```
System: You are a security analyst explaining an identity access risk to a
non-expert. Be concise (4-6 sentences). Explain (1) what excess access this
identity effectively has and how it got it, (2) who is accountable for
that access and whether that accountability is still valid, and (3) whether
this identity's protective controls (MFA, conditional access) have weakened
over time, independent of its permissions. End with 1-2 ranked remediation
actions, prioritizing whichever issue is most severe.

User: Identity "{name}" (type: {type}) has:
- Explicit grants: {direct_grants}
- Effective (inherited/delegated) access: {effective_grants}
- Escalation: {extra_permissions_not_explicitly_granted}
- Accountability chain: {ordered_path_back_to_root_human}
- Root human status: {employee_status}
- Trust score: {trust_score} (baseline 100)
- Control change history: {control_history_events}

Explain the risk and what to fix first.
```

## 9. Build Plan (time-boxed, ~20-22 hrs total, team of 5)

| Step | Task                                                                                                                                                                                                             | Owner suggestion             | Time    |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ------- |
| 1    | Design schema + write seed data (8-10 identities across 3 types + groups, with 2-3 escalation chains, 1-2 orphaned-accountability cases, 2-3 trust-decay cases, grant-type half-life table, and 1-2 departed employees with live downstream footprints) | 1 person, data-focused        | 3 hrs   |
| 2    | Build forward traversal (blast radius + escalation detection)                                                                                                                                                    | 1 person                     | 2 hrs   |
| 3    | Build backward traversal (accountability trace + orphan flag)                                                                                                                                                    | 1 person                     | 1.5 hrs |
| 4    | Build trust decay scoring function (control history → decayed score)                                                                                                                                             | 1 person                     | 1 hr    |
| 5    | Build half-life lookup/comparison function (F10)                                                                                                                                                                 | 1 person                     | 0.75 hr |
| 6    | Build off-boarding sweep view logic (F11 — forward trace from departed humans)                                                                                                                                   | 1 person                     | 1 hr    |
| 7    | Build minimal data/API layer exposing all signals                                                                                                                                                                | 1 person                     | 1 hr    |
| 8    | Build graph visualization with react-flow (color by type, red escalation highlight, trust temperature badge, half-life decay clock icons)                                                                        | 1-2 people                   | 3 hrs   |
| 9    | Build off-boarding sweep UI tab (F11)                                                                                                                                                                            | 1 person                     | 1 hr    |
| 10   | Wire up identity picker/filter → highlight blast radius + accountability panel + trust badge                                                                                                                     | 1 person                     | 1.5 hrs |
| 11   | Add LLM "Explain" call combining all signals + render narrative panel                                                                                                                                            | 1 person                     | 1.5 hrs |
| 12   | Build STRIDE mapping table + structured threat model output (F22)                                                                                                                                                | 1 person                     | 1.25 hrs |
| 13   | Add simulator toggle → re-run traversal → live diff                                                                                                                                                              | 1 person                     | 1.5 hrs |
| 14   | Polish: legend, color coding, badge styling, demo script rehearsal                                                                                                                                               | Whole team                   | 1.5 hrs |

**Parallelization tip:** steps 2-6 (five distinct scoring/traversal functions) can all start simultaneously once the schema (step 1) is locked, since they're largely independent logic modules operating on the same base graph. With a 5-person team, a realistic split is: 1 person on blast radius + escalation (F2/F3), 1 on accountability + off-boarding sweep (F4/F5/F11, since they share the same backward/forward trace), 1 on trust decay + half-life (F9/F10, both simple scoring functions), 1-2 on visualization, and 1 floating across data design and LLM prompts.

### Cut list if short on time (in order)

1. **Identity type filter (F8)** — nice-to-have, not core to the story.
2. **Access Half-Life Predictor (F10)** — interesting but the least central to your core pitch; cut first among the new features if time is tight.
3. **Simulator (F7)** — valuable but the demo still works without it.
4. **Trust decay (F9)** — cut only if truly necessary; it's a strong differentiator but less central than accountability.
5. **STRIDE Threat Model Generator (F22)** — cheap to build but purely a presentation layer over existing signals; safe to cut if F3/F5/F9 aren't finished yet, since there'd be nothing to map.
6. **Off-boarding Sweep (F11)** — try hard to keep this; it's very cheap to build once F4/F5 exist and lands well with judges.
7. **Never cut F4/F5 (accountability trace + orphan flag)** — this is the primary differentiator; protect it over everything else.

## 10. Success Criteria for Demo

- Judges see an identity flagged for having **more effective access than it was ever explicitly granted**.
- Judges see that access traced backward to a specific human — and see a clear *"this person left the company"* or *"hasn't reviewed this in 200 days"* moment.
- Judges see at least one identity that looks "clean" on permissions alone but is flagged amber/red on trust — demonstrating that F9 catches something F3 misses entirely.
- Judges see at least one grant flagged as *"likely past its half-life"* before anyone manually noticed it was stale — demonstrating the predictive angle of F10.
- Judges see an *"Off-boarding Sweep"* view surface at least one departed employee's forgotten downstream footprint (a service account or agent they created that's still live) — demonstrating F11's proactive cleanup value.
- Judges see a structured **STRIDE threat breakdown** for at least one identity, not just a prose explanation — demonstrating F22 and reinforcing that the tool speaks a security team's own language.
- Judges hear **one coherent explanation** that ties the relevant signals together for a given identity, not several disconnected findings.
- The closing line lands:
  > *"We don't just tell you what's risky right now — we tell you whose decision made it possible, whether anyone still owns it, whether it's still as protected as the day it was granted, and what past employees left behind that nobody ever cleaned up."*

## 11. Risks & Mitigations

| Risk                                                                     | Mitigation                                                                                                       |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Seed data feels arbitrary, escalation/orphan cases don't look realistic  | Design seed data first and review as a team before writing any code — this is worth the 2 hours budgeted        |
| Graph gets visually cluttered with 3 identity types + groups             | Use the type filter (F8) and a "focus mode" that dims non-relevant nodes when one is selected                    |
| LLM narrative sounds bolted-together (two separate points, not one story) | Iterate on the prompt early with real seed data, not placeholder text — test it in step 1-2 hours in, not at the end |
| Running out of time before accountability layer is built                  | Build F4/F5 second, immediately after basic traversal — never leave it for "if we have time"                    |

## 12. Open Questions

- **Should escalation severity be binary (flagged/not) or weighted by permission sensitivity?** Recommend binary for hackathon simplicity, with a `sensitive: true` tag on 2-3 permissions to make the top flagged case feel meaningfully worse than others.
- **Pre-generate LLM narratives for known demo identities to avoid live API latency, with live fallback for anything else clicked during Q&A?** Recommended.
- **What decay weights should each control type carry (e.g., MFA disabled vs. session timeout extended)?** Recommend keeping it simple: 2-3 fixed point values per control type (high/medium/low impact) rather than a continuous formula — easier to explain to judges and easier to tune quickly if a demo case doesn't look dramatic enough.
- **Should trust score decay include a time-based multiplier (e.g., an active exception loses more points the longer it's unreviewed) or a flat one-time deduction?** Recommend a simple time multiplier (e.g., +5 points lost per 30 days beyond a 90-day threshold) since it's what makes the "temporary exception forgotten for months" story land, and it's still just basic arithmetic to implement.
