# Assessment AI — OCBC Trust Layer

An answer-verification layer for AI agents, built for the **OCBC × NYP Ignite Innovation Challenge — Problem Statement 1: Trusted AI Agents**.

An employee asks a banking policy question. A simple answering agent (the **Policy Assistant**) replies. A second, separate system (**Assessment AI**) checks that answer on its own: it scores it, flags unsupported claims, shows the source passages, and sends low-confidence answers to a human reviewer.

> **Two systems, never one.** The Policy Assistant answers. Assessment AI audits it. The answering agent is kept simple on purpose. Its job is to be wrong sometimes, so the verifier has something to catch.

> **Two modes.** *Demo mode* (default) is a scripted, offline front-end demo: every document, answer, verdict and dashboard figure is synthetic and lives in one fixture module. *Backend mode* adds a FastAPI + SQLite service that verifies **any** answer you paste in, re-verifies reviewer corrections, keeps policy versions and an audit trail, and measures itself on labelled cases. Model steps (claim extraction, support judge, intent) run only when a model provider is configured on the server; without one they are reported as **not run** and the result is marked partial — never filled in from scripts. All data is synthetic.

> **Reliability index.** The 0–100 figure is an evidence-based index of how well approved policy backs an answer. It is not the probability that the answer is correct, and not permission to perform a banking action.

---

## Quick start

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```

| Command | What it does |
|---------|--------------|
| `npm run dev` | Starts the Vite dev server on port 5173 |
| `npm test` | Runs the fixture-consistency tests (Vitest) |
| `npm run build` | Builds a static bundle you can host anywhere |
| `npm run preview` | Serves the built bundle locally |

No env vars, no API keys, no backend. It works offline, with the Inter font bundled through `@fontsource`.

### Backend mode

```bash
cd backend
python -m venv .venv && .venv/bin/pip install -r requirements-dev.txt   # Windows: .venv\Scripts\pip
.venv/bin/uvicorn app.main:app --port 8000
# optional, for model-based checks:
#   pip install -r requirements-model.txt
#   export ASSESSMENT_MODEL_PROVIDER=anthropic ANTHROPIC_API_KEY=...
cd ../frontend && npm run dev:backend      # http://localhost:5173, /api proxied to :8000
```

See [`backend/README.md`](backend/README.md) for the configuration, the API, and exactly which steps are computed, model-based or scripted.

## Backend-mode features

- **Verify an answer** (workspace composer → "Verify an answer"): paste the original question, an AI-generated answer, any citations, and the policy date. Assessment AI extracts the claims, locates them in the answer by code, retrieves its own evidence from the policy versions in force on that date, checks citations (exist, right section, current, relevant), freshness, conflicting figures and support, screens retrieved text for injected instructions, and returns supported / conflicting / unsupported / insufficient-evidence / not-checked verdicts with reasons and exact passages. The checks resolve one at a time in the same panel as scripted answers.
- **Mandatory review and answer states**: Under verification · Review required · No review required · Approved · Corrected · Rejected · Evidence changed — re-verification required. Review is mandatory for a Low index, conflicting evidence, insufficient evidence, a partial assessment, or a designated high-risk topic (at any index). Only a reviewer's decision clears it; the Challenger's clarifying question never does.
- **Reviewer corrections in any wording** are re-verified by the same pipeline (the reviewer can check the wording before sending) and stored as their own answer with their own assessment. Decisions record the simulated reviewer identity, note, override, real timestamps and the policy versions the original assessment used. Every assessment is kept; the panel shows the history, a before/after comparison and the audit trail.
- **Knowledge library** (admin): every policy document with version, owner, status (draft / approved / superseded), effective and review dates, and the version it replaces. Approved text is never edited — a change is a draft that is approved. Approving it marks every answer that relied on the replaced version "Evidence changed — re-verification required", keeping the original result for comparison.
- **Evaluation** (admin): 41 labelled synthetic cases (14 tuning, 27 held-out) covering correct claims, wrong amounts / percentages / limits, superseded policies, invented and irrelevant citations, missing evidence, ambiguous questions, reviewer corrections and prompt injection. Shows detection rate, false-positive rate, correct claims confirmed, citation validity, appropriate abstention, review routing, injection containment and latency — each with numerator, denominator and definition, counted from the recorded predictions. Runs are labelled rule-based or model-based.

## Presentation walkthrough (backend mode)

Reset first: `curl -X POST localhost:8000/api/admin/reset` (or delete `backend/data/assessment.db`).

1. **New answer.** Workspace → *Verify an answer* → *Fill in an example* → *Verify answer*. The answer appears first; six checks resolve.
2. **Flagged claim.** The 50 bps claim is *Conflicting* (policy says 10 bps, DOC-FX-019 v2.3 §2.1); the mandate condition has *Insufficient evidence*. State: *Review required* (Low index, conflicting evidence, high-risk topic; partial if no model). Click *See details* and the Trust Map chips.
3. **Human review.** Role menu → *Reviewer queue* → the new item. Pick *Correct*, write your own wording, *Check this wording* to see it re-verified, add a note, submit as the simulated reviewer.
4. **Rewritten answer checked again.** Back in the workspace the answer shows *Corrected* with the reviewer's text, its own index, who decided and when.
5. **Policy update.** Verify a correct answer (e.g. "Relationship managers may apply FX rate overrides of up to 10 basis points.", citing DOC-FX-019). Role menu → *Knowledge library* → FX Rate Override Guidelines → *Draft a new version* (change 10 to 25 bps in §2.1 and §2.2, add a change note) → *Approve v2.4*. The notice lists the affected answers; v2.3 stays, superseded.
6. **Affected answer reassessed.** *Re-verify from the workspace* → the answer shows *Evidence changed* → *Re-verify against current policy*. The 10 bps claim now rests on a replaced version; the history shows both assessments and the before/after comparison.
7. Optional: role menu → *Evaluation* → *Run evaluation* (held-out).

---

## Demo storyline

The main path covers all five user outcomes the brief asks for:

1. **Ask.** An employee asks a synthetic policy question, e.g. *"What's the approval limit for a cross-border transfer under the SME lending policy?"*
2. **Answer, then score.** The answer streams in first. Six checks then finish one by one (about 2–4 s in total). The result is a **Medium** score with one flagged claim: the SGD 250,000 limit comes from a circular that has been replaced (the current limit is SGD 200,000).
3. **See details.** The side panel shows the claim, the passage it relied on, the newer passage that contradicts it, and why it was flagged, including the stale source.
4. **Escalate.** The employee sends the answer for human review. The reviewer sees the question, answer, evidence and flags, then approves, corrects or rejects it. A correction is checked again and gets a new score.
5. **Dashboard.** The Trends dashboard shows the error rate for that topic and recommends updating the stale document.

### Scripted scenarios

| Scenario | Topic | What it shows |
|----------|-------|---------------|
| `sme-limit` | SME Lending | A claim that conflicts with a newer source, plus a replaced circular (main storyline) |
| `kyc-ubo` | KYC & Onboarding | A clean answer: every claim supported, high score |
| `fx-override` | FX & Treasury | An answer that contradicts its own cited source ("no approval needed") |
| `fees-waiver` | Fees & Charges | A source overdue for review, plus an off-topic last sentence |
| `collateral-crypto` | Collateral & Security | **No source found**: every claim unverified, score capped at 10 |
| `fallback` | — | The agent says plainly that it has no answer instead of guessing |

---

## Features

### Employee workspace
- Free-text questions or suggested prompts, each with a topic icon.
- The answer streams in with a typing caret, then shows a "verifying" state. The answer is never held back while it is being scored.
- Claims are highlighted inline using **character offsets** into the answer. The answer text is never rewritten to add markup.
- A footer under each answer shows the score badge, the flag count and a "See details" button.

### Assessment AI panel
- Q1/Q2/Q3 tabs to move between answers in a session.
- A 3D character that changes mood (idle, watching, thinking, verdict).
- **Score card:** a plain verdict headline, the score with its band (e.g. `72 / 100 · Medium`, never a number on its own), a progress bar, and status chips that jump to the matching claim. A "Why this score?" toggle explains the calculation.
- **Flagged claims** and **claim detail:** before/after figures (e.g. ~~SGD 250,000~~ → SGD 200,000), the quoted policy text, freshness and conflict notes.
- **Sources:** document chips that show how recently each document was updated. A "Found by checker" tag marks documents the verifier found by itself.
- **Six checks**, failures listed first:
  | Check | Method |
  |-------|--------|
  | Citation verification | Rule-based (plain code) |
  | Freshness | Rule-based |
  | Cross-referencing | Rule-based |
  | Groundedness | LLM judge (scripted, must cite a passage) |
  | Consistency | LLM judge |
  | Intent alignment | LLM judge |
- "Open full evidence" opens a full-screen view of every check with its passages and a "How this works" explainer.
- Thumbs up/down feedback and "Send for human review" with an optional note.

### Challenger Agent
A second agent that tries to **disprove** the answer using conflicting policies and edge cases. If it finds a doubt, it asks the employee one clarifying question in the chat (e.g. *"Is the transfer above SGD 200,000?"*). Answering that question settles most cases in the chat, so they never reach the reviewer queue.

### Proof-of-Trust Map
Click any claim to follow it step by step: claim → source document and section → any counter-evidence → freshness timeline (green: recent, yellow: review pending, red: outdated or replaced) → dependency risk (backed by one source or cross-checked) → why it got its verdict.

### Reviewer queue
- Pending and Resolved tabs.
- Each item shows why it was routed (low score, conflicting claim, high-stakes topic, or escalated by an employee).
- Full case view with **Approve**, **Correct** (the rewrite is checked again) and **Reject**.

### Trends dashboard
- KPI tiles: claim accuracy, unsupported-claim rate, stale-source rate and review volume, each with a trend against the previous 4 weeks.
- A 12-week trend chart, a "Where it fails most" table by topic, and recommendations generated from the data (e.g. *update this stale document*).
- Every rate is **calculated** from fixture counts in `src/lib/metrics.js`. None are typed in by hand, so the dashboard always matches the demo answers.

### Also included
- **Pitch deck:** built into the app (the "Pitch" button in the top nav). Use the arrow keys to move between slides and Esc to close.
- **Light and dark mode**, saved per browser.
- **Role switcher** in the top nav: Employee, Reviewer, Trends.

### Failure states
These are full scenarios you can demo, not hidden edge cases:
- **No source found:** retrieval returns nothing relevant, so every claim is marked unverified rather than guessed.
- **Stale source:** the answer matches its cited document, but that document is overdue for review or has been replaced.
- **Conflicting claim:** the answer contradicts its own source.
- **Off-topic claim:** the answer is accurate but addresses a different question from the one asked.
- **Paraphrased question:** free text matched to a scripted question lowers the intent check to a warning, and the panel says so.

---

## How it works

```
Employee question
      │
      ▼
Policy Assistant  (src/lib/agent.js)      ← answering agent, deliberately simple
      │  answer text + citations
      ▼
Assessment AI     (src/lib/assess.js)     ← verifier
  ├─ rule checks: citation · freshness · cross-reference   (src/lib/rules.js, computed)
  ├─ judge checks: groundedness · consistency · intent     (scripted in fixtures)
  └─ score + band                                          (computed)
      │
      ▼
Playback          (src/lib/pipeline.js)   ← staged timing, one check at a time
      │
      ▼
UI → score card · claim highlights · Challenger · Trust Map · reviewer queue · dashboard
```

### Score model
Defined in `src/lib/assess.js` (`SCORE_MODEL`) and shown to users in the checks view:

- **60 pts** from claims: supported = 1, stale / off-intent = 0.6, unsupported / conflicting / no-source = 0
- **40 pts** from checks: pass = 1, warning = 0.5, fail = 0
- Capped at **95**, because nothing is ever certain. If **every** claim has no source, the score is capped at **10**.
- Bands: **High** ≥ 80 · **Medium** ≥ 50 · **Low** < 50

### Fixture shape
Each answer's verification mirrors what a real pipeline would return:

```js
verification = {
  explanation,                       // judge's plain-language summary
  claims: [{ id, start, end,         // character offsets into answer.text
             status, source, counter, reason, check }],
  checks: [{ id, status, summary, evidence: [...] }],   // judge checks only
  retrieved: [docId],                // sources the verifier found itself
}
```

Every claim-level flag carries the exact source passage and a one-line reason. The date is fixed at `DEMO_TODAY = '2026-10-07'` so document ages don't change between demo runs.

### Seams for a real system
Replace these and the UI stays the same:
- `src/lib/agent.js`: the answering agent (`ask`, `streamText`)
- `src/lib/pipeline.js`: verifier playback (`verify` emits `onCheckStart` / `onCheckDone` / `onComplete`)

---

## Project structure

```
.
├── CLAUDE.md                 # Project rules and constraints
├── DESIGN.md                 # Design system: tokens, type, components
├── FEATURES.md               # Feature summary
├── OCBC_Four_Problem_Statements_IGNITE_NYP.pdf   # Challenge brief
└── frontend/
    ├── index.html
    ├── vite.config.js
    └── src/
        ├── App.jsx, main.jsx, index.css
        ├── fixtures/
        │   ├── index.js          # ALL scripted data: documents, scenarios, queue, weekly metrics
        │   └── fixtures.test.js  # consistency tests
        ├── lib/
        │   ├── agent.js          # answering agent (seam)
        │   ├── pipeline.js       # verifier playback (seam)
        │   ├── assess.js         # assembles result + computes score
        │   ├── rules.js          # rule-based checks
        │   ├── challenger.js     # Challenger Agent scripts
        │   ├── metrics.js        # dashboard rates + recommendations
        │   ├── freshness.js      # document age / staleness
        │   ├── status.js         # status scale, checks, bands, icons
        │   ├── view.js, theme.js
        ├── state/store.jsx       # app state (React context + reducer)
        ├── components/           # Thread, CharacterPanel, Character, ChecksSheet,
        │                         # Challenger, TrustMap, Evidence, AnswerText, TopNav, ui
        ├── admin/                # ReviewQueue, Trends
        └── pitch/Pitch.jsx       # in-app pitch deck
```

---

## Tests

`cd backend && .venv/bin/python -m pytest -q` covers the backend: parity with the JS demo, retrieval, the general pipeline (offsets, figures, superseded versions, citations, missing evidence, honest partial state without a model, judge-quote guard, prompt-injection screening, policy dates), the review workflow (arbitrary corrections re-verified, mandatory review not bypassable, simulated identities, history kept), policy versions and change impact, and the evaluation metrics (recounted from the recorded predictions).

`npm test` checks that the fixtures are consistent with each other, that every status the contract allows has an icon and a label, and the demo-mode review rules:

- Claim offsets are valid, don't overlap and point into the answer text
- Every cited passage appears word for word in its source document
- Judge verdicts always cite a passage, unless retrieval found none
- Rule-based checks give the expected results for each scenario
- Scores are calculated (none typed in) and land each scenario in its intended band
- Dashboard rates match the demo answers (e.g. the SME unsupported-claim rate matches the SME demo answer)
- Reviewer outcomes add up to each topic's review volume. Approvals never count as corrections
- Agent matching uses whole words and falls back instead of guessing

---

## Design system

See [`DESIGN.md`](DESIGN.md) for the full token set. The key rules:

- **OCBC Red `#E4002B`** is used for exactly one filled action per screen.
- **Verification status colours** (verified `#1F7A4D`, caution `#B06C00`, unsupported `#A3243B`, unknown `#7c7e83`) are a separate scale. They appear only in labels, icons, 1px borders and background tints, never on a button.
- **Colour is never the only signal.** Every status also has an icon and a text label.
- Rounded corners everywhere (12 / 16 / 24 px, pill buttons). Inter at weights 400 / 500 / 600.

---

## Tech stack

- React 19 + Vite 8
- Tailwind CSS 4 (`@tailwindcss/vite`)
- lucide-react icons, `@fontsource/inter`
- Vitest for tests

## Scope

Out of scope, as set by the brief: production deployment, connections to live banking systems, real customer or transaction data, and training a foundation model. All data is synthetic and was written for this prototype.
