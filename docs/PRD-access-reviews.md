# PRD: Access Reviews

**Product:** IdentityGovern / IdentityTracer (Unosecur)
**Module:** Governance → Access Reviews (attestation campaigns)
**Doc owner:** Sachin (engineering) / Harsha (product boundary)
**Status:** Draft v1 — implemented against this contract

> **Sibling boundary.** Access Discovery (`docs/PRD-access-discovery.md` L33), Delegation
> Chain (`docs/PRD-delegation-chain.md`), and Identity Risk Profile research all push
> **review / attestation workflows** here. This module is the first place that owns
> campaign membership and human decisions. It does **not** rediscover paths, re-score
> risk, or translate MITRE/PTRACE.

---

## 1. Problem Statement

Discovery, ownership, exposure, impact, risk, and threat tell a reviewer *what is true*
about an identity. They do not record *what a human decided* about keeping, removing,
or escalating that access in a certification window.

Access Reviews answers: **for this campaign, which identities still need a decision,
what was decided, by whom, and with what quoted evidence?**

---

## 2. Goals / Non-Goals

**Goals**
- Run periodic attestation campaigns over identities already known to the graph.
- Surface each review item with **quoted** grant, owner, and risk context.
- Record decisions: `pending` | `approved` | `revoked` | `escalated`, with actor and justification.
- Export attestation rows for SOC 2 / ISO 27001 **evidence packs** (honest labeling — not a certification claim).
- Keep summary KPIs (pending / approved / revoked / escalated / live grant count) consistent with the decision journal.

**Non-Goals (handled elsewhere)**
- Path discovery / classification (→ Access Discovery)
- Creation lineage (→ Delegation Chain / Provisioning Lineage)
- Ownership resolution (→ Ownership Assurance) — quoted only
- Exposure / blast-radius scoring (→ Exposure / Impact)
- Factor findings or composite risk scores (→ Identity Risk Profile) — quoted only; **no invented 0–100 score**
- MITRE / PTRACE translation (→ Identity Threat Profile) — **forbidden as an input to this page**
- Stretching `POST /api/findings/:id/disposition` to mean campaign attestation (wrong domain object)

---

## 3. Domain model

| Concept | Definition |
|---|---|
| **Campaign** | Named attestation window: id, name, scope label, primary reviewer, reviewer list, due date, status (`in_progress` \| `closed`). |
| **ReviewItem** | One identity in one campaign. Id scheme: `ri-<identity_id>`. |
| **Decision** | `pending` \| `approved` \| `revoked` \| `escalated`. |
| **DecisionRecord** | Immutable journal entry: item id, identity id, decision, actor, justification, ISO-8601 `at`. Latest record wins for the live decision. |
| **Assignment** | One quoted access path (grant) for the identity — display only. |

### 3.1 Quoted vs owned

| Field | Source | Rule |
|---|---|---|
| Identity id, name, type, app | `GraphSource` / Access profile | Quoted |
| Grants, permissions, path type, hop count | `AccessService.profile` / `list` | Quoted — never reclassified |
| Owner display | `OwnershipService` / risk row `ownership.owner` resolved to a name | Quoted |
| Risk band / factors firing | `RiskService` assessment (`worst_level`, `factors_firing`) | Quoted — **no composite score** |
| Campaign membership | This module | Owned |
| Decision + history | This module's decision store | Owned |
| Export CSV | This module | Owned artifact over quoted facts + decisions |

---

## 4. Detection / assembly logic

1. Enumerate non-group identities from the graph (same exclusion as sibling modules).
2. Assign each identity to a campaign by **owned** rule (seed: `snowflake` / `mcp-gateway` → data-pipeline campaign; else identities campaign).
3. Quote access profile for grant counts and assignment drawer.
4. Quote risk row for `worst_level` → display band (`Critical` / `High` / `Medium` / `Low` / `Desirable` when no findings) and `factors_firing` as the numeric “risk score” column (a count of findings, not a weighted mean).
5. Quote ownership for owner label (`No owner` when null / unowned).
6. Overlay latest decision from the journal; if none, apply **seeded** default decision (demo only), then treat subsequent `POST …/decision` as authoritative for process lifetime.

---

## 5. API sketch

Mounted at `/api/access-reviews`.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/summary` | KPI strip: pending, approved, revoked, escalated, identity_count, grant_count |
| `GET` | `/` | `{ count, items, summary }` — filters: `decision`, `search`, `campaign` |
| `GET` | `/campaigns` | Campaign defs + live tallies |
| `GET` | `/:itemId` | Review item + quoted assignments (optional `connector` query) |
| `POST` | `/:itemId/decision` | Body: `{ action, actor, justification }` where action ∈ approve\|revoke\|escalate (maps to decision verbs) |
| `GET` | `/export?framework=soc2\|iso27001` | CSV: attestation export of decisions + quoted facts. Header must state it is an **attestation evidence export**, not a certification. |

Invalid filters → `400`. Unknown item → `404`.

---

## 6. Seed strategy

- **Grants / owner / risk:** always from `SEED_DATASET` via existing services at boot (`seedGraphSource`). No parallel reviews fixture table unless a measured gap appears.
- **Campaigns:** two in-memory campaign definitions (identities + data-pipeline attestation).
- **Decisions:** may be seeded for demo distribution; overwritten by `POST …/decision` for the process lifetime (in-memory store, same durability class as findings disposition).

---

## 7. Explicit forbids

1. Do not invent a composite 0–100 risk score for this module.
2. Do not read `/api/threat-profile` or threat mapping rules for Access Reviews.
3. Do not recompute access path types or hop counts.
4. Do not treat findings disposition as campaign attestation.
5. Do not claim SOC 2 / ISO certification — exports are reviewer attestation evidence only.

---

## 8. UI contract (dashboard-demo)

The Access Reviews page keeps its existing view-model field names (`id`, `identityName`, `grantCount`, `riskBand`, `owner`, `decision`, assignments shape, etc.). The adapter maps API payloads into that shape; layout and controls stay unchanged. Data **values** come from the live seed via this API.
