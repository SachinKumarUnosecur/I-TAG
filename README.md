# Identity Blast Radius — Delegation Chain, Escalation & Accountability Tracer

Hackathon project. Traces access backward from any identity (human / service account / AI agent) to the accountable human, flags silent privilege escalation, orphaned accountability, trust decay, stale grants, and off-boarding debt — with an LLM-generated risk narrative.

## Docs

- [`docs/ITAG.md`](./docs/ITAG.md) — the hackathon PRD driving this repo (Sachin, Harshavardhan, Narayana, Pritish, Jayakumar)
- [`docs/PRD-delegation-chain.md`](./docs/PRD-delegation-chain.md) — related Unosecur IdentityGovern module PRD (Harsha), for reference

## Stack

- **Frontend:** Vite + React + TypeScript + [react-flow](https://reactflow.dev/)
- **Backend:** Node.js + Express + TypeScript (LLM proxy so the Anthropic key is not shipped to the browser)
- **Graph engine:** plain in-memory adjacency list, BFS/DFS both directions
- **Data:** static seed JSON, mutated in-memory only for the What-If simulator

## Repo layout

```
ITAG/
├── frontend/            # React + react-flow UI
│   └── src/
│       ├── components/  # UI panels: accountability, explanation, trust badge, sim toggle
│       ├── graph/       # traversal engine (forward/backward), escalation, trust decay, half-life
│       ├── data/        # seed JSON (identities, edges, employee_status, control_history, half_life_table)
│       ├── types/       # shared TS types (Identity, Edge, Grant, ...)
│       └── styles/
└── backend/             # Express LLM proxy
    └── src/
        ├── routes/      # /api/explain, /api/threat-model (STRIDE)
        └── llm/         # Anthropic client + prompt templates (F6, F22)
```

## Getting started

```bash
# 1. install deps for both workspaces
npm install

# 2. set up env
cp .env.example .env
# then edit .env and add your ANTHROPIC_API_KEY

# 3. run frontend + backend together
npm run dev
```

- Frontend: http://localhost:5173
- Backend:  http://localhost:4000  (health check: `GET /healthz`)

## Feature roadmap (from PRD)

| ID  | Feature                                     | Status |
| --- | ------------------------------------------- | ------ |
| F1  | Unified Identity Graph                      | TODO   |
| F2  | Blast Radius (forward trace)                | TODO   |
| F3  | Escalation detection                        | TODO   |
| F4  | Accountability trace (backward)             | TODO   |
| F5  | Orphaned accountability flag                | TODO   |
| F6  | LLM risk narrative                          | TODO   |
| F7  | What-If simulator                           | TODO   |
| F8  | Identity type filter                        | TODO   |
| F9  | Trust decay from control drift              | TODO   |
| F10 | Access half-life predictor                  | TODO   |
| F11 | Off-boarding sweep (identity debt)          | TODO   |
| F22 | STRIDE threat model generator               | TODO   |
