# Assessment AI — Feature Summary

A scripted front-end demo for the OCBC × NYP Ignite Innovation Challenge (Problem Statement 1: Trusted AI Agents). Two separate systems: a simple **answering agent** ("Policy Assistant") that answers banking policy questions, and a **verifier** ("Assessment AI") that independently checks each answer, scores it, flags unsupported claims, shows evidence, and routes low-confidence answers to a human reviewer. No backend — everything is hardcoded fixture data (`frontend/src/fixtures/index.js`), built to mirror the shape a real pipeline would return.

## Top nav
- Role switcher (dropdown): jump between the Employee workspace, Reviewer queue, and Trends dashboard.
- Pending-review count badge on the Reviewer queue link.

## Employee workspace — chat with the Policy Assistant
- Ask a free-text question or click a suggested prompt (each carries a topic icon); suggestions collapse to one horizontally-scrolling row once a question has been asked.
- Streaming answer text with a typing caret, followed by a brief "verifying" state before checks resolve (~2–4s total, never instant).
- Inline claim highlights placed by exact character offset into the answer (never by rewriting text) — icon + colour + label for supported / unsupported / conflicting / stale / off-topic.
- Chat card footer: score badge, a flag count ("2 flags" / "No flags"), and one "See details" button that opens the sidebar.

## Assessment AI sidebar panel
- Question switcher: numbered Q1/Q2/Q3 tabs (each carrying its verdict icon) with prev/next arrows, so multiple answers in one session stay reachable.
- 3D character with a mood state (idle / watching / thinking); shrinks once an answer is scored so content isn't pushed below the fold.
- **Score card:** verdict headline as the title (e.g. "Don't act on this answer"), big numeral + band pill (High/Medium/Low — the number is never shown bare), a progress bar, and clickable status chips (e.g. "1 conflicting") that jump straight to that claim. Full scoring explanation sits behind a "Why this score?" toggle.
- **Flagged claims:** icon-led cards, each with a few-word summary; click to open that claim's full detail.
- **Claim detail:** for claims with a conflicting figure, leads with a big "~~50 bps~~ → 10 bps" before/after comparison; otherwise shows the exact quoted span. One "What the policy says" card holds the current rule and (if relevant) the source the claim leaned on, with freshness/conflict call-outs. "Full reasoning" is collapsed behind a toggle.
- **Sources:** document chips with freshness ("Updated 2 months ago"); amber + clock icon only when a source is stale or superseded. A "Found by checker" tag marks sources Assessment AI retrieved itself (not cited by the agent).
- **Six checks list:** citation verification, freshness, cross-referencing (rule-based/plain code), groundedness, consistency, intent alignment (LLM-judge, must cite a passage). Failures sort first; each row has a check-type icon + pass/warning/fail pill, and expands to a one-line reason.
- "Open full evidence" launches the full-screen Six Checks modal with every check's evidence passages and a "How this works" explainer (scoring formula, routing rules, rule-based vs. judge-based checks).
- Actions: thumbs up/down feedback, "Send for human review" with an optional note to the reviewer.
- Reviewer outcome banner: once a human decides, shows Approved / Corrected / Rejected with their note; a correction gets automatically re-verified and re-scored.

## Reviewer queue (admin)
- Pending / Resolved tabs with counts.
- Each queued item shows its routing reason (low score, conflicting claim, high-stakes topic, employee-escalated) and how many employees are waiting on it.
- Full case view: question, answer with claim highlights, all evidence; reviewer can Approve, Correct (rewrite, re-verified live), or Reject.

## Trends dashboard (admin)
- KPI tiles: claim accuracy, unsupported-claim rate, stale-source rate, review volume — each with a trend arrow vs. the prior 4 weeks.
- 12-week trend chart for the selected metric.
- "Where it fails most" table: topics ranked by unsupported/conflicting/stale claim rates.
- Auto-generated recommendations (e.g. "update this stale document") computed from the same fixture counts shown elsewhere, so numbers never contradict the demo answers.

## Design system (see `DESIGN.md`)
- One brand colour (OCBC Red `#E4002B`) reserved for exactly one filled action per screen.
- A fully separate, desaturated verification-status colour scale (verified / caution / unsupported / unknown) — never used on a button, always paired with an icon **and** a text label.
- All corners rounded (12–24px cards, pill buttons); Inter typeface; 1560px max content width.

## Failure states (explicitly modeled, not edge cases)
- **No source found:** retrieval returns nothing above its relevance threshold; every claim is marked unverified rather than guessed-at.
- **Stale source:** answer matches its cited document, but that document is overdue for review or has been superseded by a newer one.
- **Off-topic claim:** answer is accurate but addresses a nearby question, not the one asked.
- **Conflicting claim:** answer contradicts its own cited source (the core demo scenario — FX override limits).

## Tech notes
- React + Vite + Tailwind CSS, no server, no API keys, runs fully offline.
- All scripted data lives in `frontend/src/fixtures/index.js`; scoring (`lib/assess.js`), rule-based checks (`lib/rules.js`), and verification playback timing (`lib/pipeline.js`) are computed from it — nothing is hand-typed on screen.
- `npm test` runs fixture-consistency tests (claim offsets, passage text, dashboard-vs-demo-answer consistency, every flagged claim/check carries a short label).
- The seams a real system would replace without UI changes: `src/lib/agent.js` (answering agent) and `src/lib/pipeline.js` (verifier).
