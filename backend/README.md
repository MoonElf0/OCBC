# Assessment AI — backend

A FastAPI service the frontend can run against in **backend mode**. Demo mode
(the default) never calls it and stays fully offline.

```bash
cd backend
python -m venv .venv
.venv/bin/pip install -r requirements-dev.txt          # Windows: .venv\Scripts\pip
.venv/bin/uvicorn app.main:app --reload --port 8000
```

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

SQLite file at `data/assessment.db`, created and seeded on first run. Reset it
with `.venv/bin/python -m app.db --reset` or `POST /api/admin/reset`. A
database written by an older version of the prototype is rebuilt from the seed
automatically (it only ever holds demo data).

## Model provider (optional)

Claim extraction, the support judge and the intent/consistency review need a
language model. Everything else runs as code. The provider is configured on the
server only; nothing reaches the browser.

| Variable | Default | Meaning |
|---|---|---|
| `ASSESSMENT_MODEL_PROVIDER` | `none` | `none` or `anthropic` |
| `ASSESSMENT_MODEL` | `claude-opus-5-5` | model id for the provider |
| `ANTHROPIC_API_KEY` | — | read by the Anthropic SDK (or use `ant auth login`) |

```bash
pip install -r requirements-model.txt
export ASSESSMENT_MODEL_PROVIDER=anthropic
export ANTHROPIC_API_KEY=...
```

With no provider (the default), model steps report themselves as **not run**:
claims are split by sentence (labelled "rule-based"), claims whose meaning
needs a judge are "Not checked", intent and consistency are "Not run", the
result is marked **partial**, its reliability index is capped at 70 (never
High), and it always goes to a reviewer. Nothing is filled in from scripted
data. `GET /api/health` reports the provider status.

A different provider is one class with three methods (`extract_claims`,
`judge_claim`, `review_answer`) in `app/models.py`. The Anthropic provider asks
for structured JSON, uses server-side refusal fallbacks, and turns API errors,
refusals and truncation into an honest "not run".

## What is computed, model-based and scripted

| Step | Policy Assistant answer | Submitted answer / reviewer correction |
|---|---|---|
| Answer | scripted (`app/agent.py`) | supplied by the user / reviewer |
| Claims | scripted spans | **model** extraction, or a rule-based sentence split when no model |
| Offsets | scripted | **computed**: quotes are located in the answer by code; an unlocatable quote is dropped |
| Retrieval | **computed**: lexical, over the library | **computed**: lexical, over the policy versions in force on the question's date, plus the versions they replaced |
| Injection screening | — | **computed**: instruction-like text in a retrieved passage is removed before any step uses it, and flagged |
| Figures (amounts, %, bps, times, durations) | **computed** (cross-referencing) | **computed**: conflict with the current passage, or match only a replaced version |
| Support verdict | scripted judge, guarded by retrieval | **model** judge; its quote must appear in the passage it cites, or the verdict is rejected |
| Intent, consistency | scripted | **model** |
| Citation, freshness | **computed** | **computed** (existence, section, superseded, irrelevant, missing) |
| Reliability index, band, routing | **computed** | **computed** |
| Review queue, decisions, audit trail | **stored** | **stored** |
| Dashboard | **computed** from the database | — |
| Evaluation | — | **computed** from recorded predictions and labels |

Every result carries `provenance`; pipeline results also carry `assessment`
(partial or not, what could not run, policy versions used, latency).

## Review rules and answer states

`app/routing.py`. Review is mandatory when the index is Low, a claim conflicts
with approved policy, a claim has no approved evidence, the assessment is
partial, or the topic is designated high-risk (`HIGH_RISK_TOPICS`: FX &
Treasury, Collateral & Security) — at any index. Only `POST
/api/reviews/{id}/decision` clears it. Approving flagged or unchecked claims
needs `overrideFlags: true`, which is recorded. Reviewer identities are
simulated (`SIMULATED_REVIEWERS`) and every event says so.

States: `verifying` → `review-required` | `cleared` → `approved` | `corrected`
| `rejected`, and `reverify-required` when a policy the latest assessment used
gets a new approved version.

## Policy versions

`policy_versions` holds every version of every document. Approved text is never
edited: `POST /api/library/{docId}/versions` creates a draft, `.../approve`
approves it and marks the version it replaces as superseded (text kept). On
approval, every current assessment that used another version of that document
is marked `evidenceChanged` and its answer moves to `reverify-required`; the
original result is untouched. `POST /api/answers/{id}/reverify` adds a new
assessment and keeps the old one (`replacedBy`).

## Evaluation

`data/eval_cases.json`: 41 labelled synthetic cases (14 tuning, 27 held-out)
plus the extra policy versions they need. `POST /api/eval/run {split}` runs the
pipeline over them with the configured provider and stores the predictions;
`GET /api/eval` returns runs, definitions and the dataset summary. Every rate is
recomputed from the recorded predictions and labels (`tests/test_evaluation.py`
checks this). Runs are labelled `rule-based` or `model-based`.

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
