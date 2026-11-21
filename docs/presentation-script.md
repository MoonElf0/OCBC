# Assessment AI — Presentation Script (5 presenters, 15 minutes)

## Timing plan

| Time | Presenter | Navbar tabs | Topic |
|------|-----------|-------------|-------|
| 0:00 – 2:30 | Person 1 | **Assistant** | Opening + core verification flow |
| 2:30 – 4:30 | Person 2 | **Classic**, **Verify answer** | Checking answers from any AI tool |
| 4:30 – 6:30 | Person 3 | **Review queue** | Human in the loop |
| 6:30 – 8:45 | Person 4 | **Library**, **Trends** | Policy sources + where the agent fails |
| 8:45 – 11:00 | Person 5 | **Evaluation**, **Versions** | Proving it works + close |
| 11:00 – 15:00 | Everyone | — | Q&A (4 minutes) |

**Every presenter has about 2 minutes, about 250 spoken words.** Each section has a **[CUT IF LATE]** line you can skip if you're behind. Person 5 checks the clock: if the demo goes past 11:30, skip both of Person 5's [CUT IF LATE] lines.

### Before you start
- Run **offline demo mode**: `cd frontend && npm run dev`, then open `http://localhost:5173` full screen on the **Assistant** tab. In demo mode the answers and scores are scripted, so they're the same every time. In backend mode they change between runs.
- Do a full run-through once before presenting, so you know the answers load in 2–4 seconds.
- One person drives the laptop (suggestion: the next presenter clicks while the current one talks, or each presenter drives their own section).
- Wording rules for everyone: say **"reliability index"**, never "accuracy" or "probability". Never say "live", "real-time" or "connected". All data is synthetic.

---

## 1 · Assistant — Opening + core flow (Person 1 · 2:30)

**Say:**
"Banks are starting to use AI assistants to answer staff questions about policy. The problem is that an AI can sound confident and still be wrong. Our product, **Assessment AI**, is not another chatbot. It's a separate verifier that **audits** the chatbot: it scores each answer, flags claims it can't back up, shows its sources, and sends risky answers to a human."

**Do:** Click the suggested question **"SME cross-border approval limit."**

**Say:**
"An employee asks our answering agent, the Policy Assistant, about the SME cross-border approval limit. The answer appears first, so staff never wait for it."

**Do:** Click **Verify** under the answer. Let the checks finish.

**Say:**
"Assessment AI now checks the answer independently, with six checks against the approved policy library: citation accuracy, freshness, source quality, groundedness, consistency and relevance. The result is a **reliability index**, here *Medium*. The number always comes with a label, because a bare number suggests more precision than we have. And every status has an icon and text, not just a colour, for accessibility."

**Do:** Scroll to **Claims** and click the flagged claim.

**Say:**
"The answer is split into claims, and each is matched to a policy passage. This one is flagged, with the exact passage and a one-line reason why."

**Do:** Scroll to **Sources** and click a source.

**Say:**
"We also show how fresh each source is. This one is outdated: it's been superseded by a newer policy. That's a failure case we built in on purpose."

**[CUT IF LATE]** "A second verifier also checks the answer. If the two disagree, we tell the employee to check the sources. But only a human reviewer can clear a review."

**Handover:** "That's our own assistant. But staff use many AI tools. Over to [Person 2]."

---

## 2 · Classic + Verify answer (Person 2 · 2:00)

**Do:** Click **Classic**.

**Say:**
"This is our Classic view. The left panel explains every flag: *Supported, Unsupported, Conflicting, Stale source, Off the question, Insufficient evidence, Not checked*. It also lists the six checks run on every answer."

**Do:** Click **"Crypto as loan collateral"** and let it resolve.

**Say:**
"This is a failure case. No approved policy covers crypto collateral, so every claim is marked *no source* and the index is low. The system says it doesn't know instead of pretending."

**Do:** Click **Verify answer**.

**Say:**
"This page works with answers from **any** AI tool. You paste the question, the policy date, the AI's answer and its citations."

**Do:** Click **Fill in an example**, then **Verify answer**.

**Say:**
"It pulls out the claims, finds its own evidence in the library *as of that policy date*, and checks whether the citations actually say what the answer claims."

**[CUT IF LATE]** "Two safeguards: library text is treated as evidence, never as instructions, so a document can't take over the verifier. And if a model step can't run, the result is marked **partial** and capped below High. We never fill the gap with made-up data."

**Handover:** "When an answer is risky, a person steps in. [Person 3]."

---

## 3 · Review queue — Human in the loop (Person 3 · 2:00)

**Do:** Click **Review queue** (point at the pending-count badge first).

**Say:**
"Answers with a low index, a high-risk topic or conflicting evidence, plus any an employee escalates, land here. At the top: how many are waiting, the oldest wait time, and how many cases depend on stale documents. The least reliable answers come first."

**Do:** Open **"Can an SME pledge crypto assets as collateral for a loan?"**

**Say:**
"The reviewer sees everything in one place: the question, the AI's answer with numbered claims, and **why it needs a human**: a low index, insufficient evidence, and a high-risk topic. Each flagged claim sits beside its source, or clearly shows that none was found."

**Do:** Scroll to the decision panel.

**Say:**
"Three choices: **Approve**, it's correct as written. **Correct**, send the employee a fixed answer. **Reject**, withdraw it because there's no safe fix."

**Do:** Choose **Correct**, edit a line, add a short note, and send.

**Say:**
"The corrected answer goes back to the employee, and the case moves to Resolved. One firm rule: **only a reviewer can clear a review**. A high score can't skip it."

**[CUT IF LATE]** "Approving an answer that still has flags means acknowledging them and writing a note. Corrections are re-checked by the verifier before they're sent. Reviewer names in this prototype are simulated."

**Handover:** "Reviewers fix one answer at a time. To stop the same mistakes coming back, we fix the sources. [Person 4]."

---

## 4 · Library + Trends (Person 4 · 2:15)

**Do:** Click **Library**.

**Say:**
"This is the library the verifier checks against: 16 synthetic policy documents, each with an owner, a version and a status. Most are *Approved, in force*. Some are **Superseded**, like the old SME cross-border circular. One is **Review overdue**: the Fee Waiver Authority Matrix."

**Do:** Click **SME Lending Policy** and show the versions table.

**Say:**
"Approved text is never edited. A change becomes a **new version**, a draft first and then approved. The old one is kept as superseded, and any answers that used it are flagged to be re-checked. That's our audit trail."

**Do:** Click **Trends**.

**Say:**
"Trends answers one question for management: *is the agent getting more reliable?* Right now it's mixed. Claim accuracy is improving, but stale sources are getting worse. These are synthetic sample figures, calculated from our data rather than typed in."

**Do:** Point at **Fix first**, then **Where it fails most**.

**Say:**
"It tells you what to fix first: retire the superseded SME circular, which affected hundreds of claims. SME Lending is the weakest topic, which matches what we saw in the demo."

**[CUT IF LATE]** "**Next fixes** ranks what's left: review the overdue fee document, publish a policy on digital-asset collateral, and tighten the agent's prompt."

**Handover:** "So the team applies these fixes and builds a new agent. How do we know it's better? [Person 5]."

---

## 5 · Evaluation + Versions + Close (Person 5 · 2:15)

**Do:** Click **Evaluation**.

**Say:**
"First, is the verifier itself any good? We built **41 hand-labelled synthetic cases**, with each claim marked as correct, incorrect or not covered. 27 are **held out**: written after the verifier was built, and never used to tune it."

**[CUT IF LATE]** "We keep this separate from our software tests. Tests show the code does what we wrote. They don't show the verifier is right."

**Do:** Click **Versions**.

**Say:**
"Second, release checks. Is **Agent v2**, built from the Trends fixes, ready to replace v1? The same verifier scored both on 10 fixed questions, two per topic."

**Do:** Point at the **Hold the release** banner, then open the KYC question.

**Say:**
"v2 is much better overall: flagged claims fall from 54% to 17%, and it declines when no policy exists. But it **regressed** on one question: it says the beneficial-owner threshold is 20% when the policy says 25%. So the call is **hold the release**. One confident wrong answer on KYC outweighs a better average."

**[CUT IF LATE]** "It also points out that two claims still rely on an overdue fee document. No agent release can fix that. The document owner has to review it."

**Say (close):**
"To recap: an employee asks, Assessment AI scores and explains the answer, risky answers go to a reviewer, patterns show which documents to fix, and every new agent must pass a release check. To be clear, this is a prototype on synthetic data. Demo answers are scripted, and the pipeline is designed so a real retrieval system can plug in behind the same interface. Thank you. We'd be happy to take your questions."

---

## Q&A (11:00 – 15:00 · 4 minutes)

**How it runs:** Person 5 takes each question and passes it to the owner below. Keep each answer to **30–45 seconds** so you can fit 4–6 questions. If no one owns a question, Person 1 answers.

### Person 1 — product and scoring
- **"How is this different from the chatbot?"** It's a separate system. The answering agent is kept deliberately simple. The verifier audits any agent's output, including other AI tools'.
- **"Is 72/100 the chance the answer is correct?"** No. It's an evidence-based reliability index built from the six checks. It isn't a probability, and it isn't permission to act.
- **"Why show the answer before the score?"** So we never block the employee. The answer shows as *verifying* until the checks finish.

### Person 2 — verification pipeline
- **"Which AI model does it use?"** Demo mode is scripted and makes no model calls. Backend mode can run the model steps on Qwen. If no model is set up, those steps are marked *Not run*, the result is partial, and it's capped below High.
- **"Could a document trick the verifier (prompt injection)?"** Library text is treated as evidence, never as instructions.
- **"How are claims matched to sources?"** By character position in the answer. We never rewrite the answer, so a real pipeline can plug in behind the same interface.

### Person 3 — human review
- **"Can a high score skip review?"** No. Only a reviewer decision clears *Review required*. Not a high index, not feedback, not the second verifier.
- **"What triggers a review?"** A low index, a high-risk topic, conflicting or missing evidence, or an employee choosing to escalate.
- **"Who are the reviewers?"** Simulated identities in this prototype, labelled as such.

### Person 4 — data and policy
- **"Is this connected to OCBC systems or real data?"** No. Everything is synthetic: no live banking connections and no customer data.
- **"What happens when a policy changes?"** A new version is drafted and approved. The old one is kept as superseded, and any answers that used it are flagged to be re-checked.
- **"Are the Trends numbers real?"** They're synthetic sample figures, but calculated from the fixture data, so the dashboard and the demo answers agree.

### Person 5 — evaluation and next steps
- **"How accurate is the verifier?"** We measure it on 41 hand-labelled cases. The 27 held-out ones were never used for tuning, so the result is honest.
- **"What would it take to use this for real?"** Connect a real retrieval system and the approved policy store behind the existing interface, run the evaluation on real labelled questions, and pilot it with reviewers. Production deployment was outside the scope of this challenge.
- **"Why hold v2 when it's mostly better?"** In banking, one confident wrong answer on KYC outweighs an average improvement. The release check catches regressions before staff see them.
