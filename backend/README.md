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
cp .env.example .env     # then edit MONGODB_URI
.venv/bin/uvicorn app.main:app --reload --port 8000
```

On Windows use `py -m venv .venv`, `.venv\Scripts\pip`, `.venv\Scripts\uvicorn`
and `copy .env.example .env`.

In another terminal:

```bash
cd frontend
npm run dev:backend      # Vite proxies /api to :8000
```

Tests (parity with the JS demo, retrieval, API end to end):

```bash
cd backend
.venv/bin/python -m pytest -q
```

Tests use `mongomock` (in memory) and never touch your cluster.

No API keys and no model. Data lives in the MongoDB database named by
`MONGODB_DB` (default `assessment`), created and seeded on first run;
collections: `documents` (sections embedded), `topics`, `weekly_counts`,
`review_outcomes`, `answers`, `reviews`, `meta`. Reset it with
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
| Review queue, decisions, feedback | **stored** in MongoDB | unchanged |
| Dashboard and recommendations | **computed** from the database (`app/metrics.py`) | unchanged |

Every result carries a `provenance` field saying exactly this, and the UI
labels the mode "backend mode", never "live".

## How the two modes stay in step

- `frontend/src/fixtures/index.js` stays the single source of data.
  `npm run export:fixtures` writes `data/fixtures.json` (what the backend
  reads) and `data/golden.json` (what the JS `assess()` and `metrics.js`
  produce). A frontend test fails if either file is stale.
- `tests/test_parity.py` and `tests/test_metrics.py` require the Python ports
  to reproduce `golden.json` exactly.
- `tests/test_retrieval.py` requires the live verifier, starting from the
  documents alone, to reproduce every scripted source, counter-passage and
  "found by checker" document. This is the start of the evaluation harness.
- Both modes validate against `contract/verification-result.schema.json`.

## API

| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | mode and provenance |
| POST | `/api/ask` `{question}` | answering agent → `{answerId, scenarioId, text, citations}` |
| GET | `/api/answers/{id}/verify` | server-sent events: `check_start {i}`, `check_done {i, check[, claims]}`, `complete {result, routed}`. `?pace=0` for no delay |
| GET | `/api/answers/{id}` | stored answer, result, feedback |
| POST | `/api/answers/{id}/feedback` `{value}` | `helpful`, `wrong` or `null` |
| POST | `/api/answers/{id}/escalate` `{note}` | employee escalation → `{routed, queue}` |
| GET | `/api/reviews` | queue items with question, answer and result |
| POST | `/api/reviews/{id}/decision` `{decision, note, correctedText}` | → `{outcome, askers, queue}`; a correction sent as drafted is re-verified |
| GET | `/api/metrics` | dashboard: overall, series, topics, recommendations, live decisions |
| GET | `/api/documents` | library with freshness |
| PUT | `/api/documents/{docId}/sections/{sectionId}` `{text, updated?}` | edit the library; the next verification uses it |
| POST | `/api/admin/reset` | restore the seeded demo state |

`npm run build:backend` then running uvicorn also serves `frontend/dist`
from the same port.
