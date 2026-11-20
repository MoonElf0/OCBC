# Project

An AI answer-verification layer for OCBC, built for the OCBC × NYP Ignite Innovation Challenge (Problem Statement 1: Trusted AI Agents). An employee asks a banking policy question, a retrieval agent answers, and this product independently verifies that answer — scoring it, flagging unsupported claims, showing its sources, and routing low-confidence answers to a human reviewer.

**Critical framing:** this is *not* the answering agent. It is a separate verifier that audits the agent. Two distinct systems. Never collapse them into one.

## Tech stack

- **Frontend:** React + Vite, Tailwind CSS
- **Backend:** none. This is a scripted front-end demo — no server, no database, no API keys, no model calls
- **Data:** hardcoded fixtures in a single clearly separated module. Synthetic policy documents, scripted answers, scripted verdicts, scripted dashboard numbers
- **Python:** only for one-off scripts if we need them (generating fixture data, for example). Not part of what runs

It must start with one command and work offline. Do not introduce a server, a second frontend framework, or a different CSS approach without asking.

## Design reference

@DESIGN.md

Load it before writing any UI. It defines the full token set (OCBC red, neutrals, the separate verification-status scale), type scale, radii, shadows, and the component specs for the Character Panel, Confidence Score Block, Claim Highlight, Source Chip and Check Row.

## Hard rules

- **Two colour tracks, never mixed.** OCBC Red `#E4002B` is for exactly one filled action per screen. The verification-status scale (verified / caution / unsupported / unknown) lives only in labels, icons, 1px borders and surface tints — never as a button fill. A status colour on a button makes a warning look clickable.
- **Never colour alone.** Every status carries an icon *and* a text label as well as its colour. This is an accessibility requirement and a judging criterion.
- **Every verdict cites a passage.** Each claim-level flag in the fixtures must carry the exact source passage and a one-line reason. A verdict with no cited passage is a bug, in the demo as much as it would be in the real thing.
- **Fixture shape mirrors a real pipeline.** Per-answer: overall score, verdict band, and per-claim records with character offsets into the answer, status, source, passage, reason. Claims are located by offset — never by rewriting the answer to insert markup. This is what lets a real pipeline drop in behind the same interface, and what makes the design defensible when a judge asks.
- **Fake it convincingly.** Streaming answer text, checks resolving one at a time with a brief working state, roughly 2–4 seconds question to settled score. No instant results.
- **Show the answer before the score.** Answer renders first in a verifying state; checks resolve after. Never block the answer.
- **Failure states are first-class.** "No source found" and "source is stale" must be built and demoable — the brief explicitly asks for failure scenarios.
- **Confidence number is never bare.** Always paired with a verdict label (e.g. "72 / 100 · Medium"). A bare number implies precision the system doesn't have.
- **Check a screen in the browser before calling it done.** Screenshot or render it; do not report a UI task complete from code alone.

## Things to avoid

- **Don't build a general-purpose chatbot.** The answering agent is deliberately simple — its job is to sometimes be wrong so the verifier has something to catch. Resist improving it.
- **Don't use OCBC Red for the "unsupported" flag.** Use the muted `#A3243B`. This has already been decided.
- **Don't add gamification.** No XP bars, levels, streaks or point scores. An early reference mock had a "Lv: 12" bar — it doesn't belong in a banking trust tool.
- **Don't add scope the brief rules out:** production deployment, live banking system connections, real customer or transaction data, training a foundation model.
- **Don't let the fixtures contradict each other.** If the dashboard says a topic has a 32% unsupported-claim rate, the demo answers for that topic must show flags that match. Inconsistent numbers are what a judge spots first.
- **Don't claim it's live.** Nothing in the interface says real-time, connected, or live. The pitch states plainly that verification is scripted for the demo, and explains the pipeline design behind it. Getting caught implying otherwise costs more than the feature is worth.
- **Don't add a backend.** If something seems to need a server, it means the fixture isn't rich enough — extend the fixture instead.
- **Don't use square corners or 0px radius anywhere.** See the radius system in @DESIGN.md.

## How to run

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
npm test             # fixture-consistency tests (offsets, passages, dashboard ↔ demo answers)
npm run build        # static bundle, deployable anywhere
```

No server to start, no env vars, no API keys. It runs offline (Inter is bundled via @fontsource).

All scripted data lives in `frontend/src/fixtures/index.js`. The seams a real system would replace are `src/lib/agent.js` (answering agent) and `src/lib/pipeline.js` (verifier playback). Dashboard rates are computed from the fixture counts in `src/lib/metrics.js`, never typed in.

## Demo storyline

The one thread that has to work end to end, because it hits all five required user outcomes:

1. Employee asks a synthetic policy question
2. Answer returns with a **Medium** score and one flagged unsupported claim
3. Employee clicks "See details" → left panel shows the source and why it was flagged, including one stale source
4. Employee escalates → reviewer sees question, answer, evidence and flags; corrects it
5. Admin dashboard shows that topic's error rate and recommends updating the stale document
