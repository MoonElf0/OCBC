# Assessment AI — backend

A FastAPI service the frontend can run against in **backend mode**. Demo mode
(the default) never calls it and stays fully offline.

Storage is MongoDB (e.g. a free Atlas cluster). Copy `.env.example` to `.env`
and put your connection string in `MONGODB_URI`; `.env` is git-ignored, so
never put the string anywhere else. In Atlas, allow your IP under
Network Access, or the connection times out.

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/uvicorn app.main:app --reload --port 8000
```

On Windows use `py -m venv .venv`, `.venv\Scripts\pip`, `.venv\Scripts\uvicorn`
and `copy .env.example .env`.

In another terminal:

```bash
cd frontend
npm run dev:backend      # Vite proxies /api to :8000
```

Tests (parity with the JS demo, retrieval, the general pipeline, review
workflow, policy versions, evaluation):

```bash
cd backend
.venv/bin/python -m pytest -q
```

No API keys, no network, no model. SQLite file at `data/assessment.db`,
created and seeded on first run. Reset it with
`.venv/bin/python -m app.db --reset` or `POST /api/admin/reset`.

## What is computed and what is still scripted

| Step | Backend mode | Replaced in phase 4 by |
|---|---|---|
| Agent answer | scripted (`app/agent.py`) | retrieval agent + LLM |
| Claim spans | scripted | LLM extractor; offsets found by code, never by the model |
| Retrieval | **computed**: IDF-weighted term coverage over the library (`app/retrieval.py`) | + embeddings (hybrid) |
| Judge verdicts (groundedness, consistency, intent) | scripted | LLM judge |
| Guard: a verdict must cite a passage retrieval returned | **computed** (`app/verifier.py`) | unchanged |
| Counter-passage, "found by checker", no-source record | **computed** | unchanged |
| Citation, freshness, cross-referencing | **computed** (`app/rules.py`) | unchanged |
| Score, band, routing | **computed** | unchanged |
| Review queue, decisions, feedback | **stored** in SQLite | unchanged |
| Dashboard and recommendations | **computed** from the database (`app/metrics.py`) | unchanged |

Every result carries a `provenance` field saying exactly this, and the UI
labels the mode "backend mode", never "live".

## How the two modes stay in step

- `frontend/src/fixtures/index.js` stays the single source of demo data.
  `npm run export:fixtures` writes `data/fixtures.json` and `data/golden.json`.
  A frontend test fails if either is stale.
- `tests/test_parity.py` and `tests/test_metrics.py` require the Python ports
  to reproduce `golden.json` exactly.
- Both modes validate against `contract/verification-result.schema.json`.

## API

| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | provenance, model status, review rules, simulated reviewers, states |
| POST | `/api/ask` `{question}` | Policy Assistant → `{answerId, scenarioId, text, citations}` |
| POST | `/api/answers` `{question, answer, citations, asOf?}` | submit any answer for verification |
| POST | `/api/verify/preview` | same body; runs the pipeline without storing (reviewer checking a correction) |
| GET | `/api/answers/{id}/verify` | SSE: `check_start`, `check_done`, `complete {result, routed, state, assessmentId}`. `?pace=0` for no delay |
| POST | `/api/answers/{id}/reverify` | new assessment against the library as it is now |
| GET | `/api/answers/{id}` | answer, state, latest result |
| GET | `/api/answers/{id}/history` | every assessment, corrections and their assessments, audit events |
| POST | `/api/answers/{id}/feedback` `{value}` | `helpful`, `wrong` or `null` |
| POST | `/api/answers/{id}/escalate` `{note}` | employee escalation |
| GET | `/api/reviews` | queue items with question, answer, result, state |
| GET | `/api/reviewers` | simulated reviewer identities |
| POST | `/api/reviews/{id}/decision` `{decision, note, correctedText, reviewerId, overrideFlags}` | any correction is re-verified and stored as its own answer |
| GET | `/api/library` | documents and all their versions |
| POST | `/api/library/{docId}/versions` | draft a new version |
| POST | `/api/library/{docId}/versions/{v}/approve` | approve; returns the affected assessments |
| PUT | `/api/documents/{docId}/sections/{sectionId}` | legacy: drafts and approves a new version (no in-place edit) |
| GET | `/api/metrics` | dashboard |
| GET | `/api/eval` · POST `/api/eval/run` | evaluation |
| GET | `/api/events` | full audit trail |
| POST | `/api/admin/reset` | restore the seeded demo state |

`npm run build:backend` then running uvicorn also serves `frontend/dist` from
the same port.
