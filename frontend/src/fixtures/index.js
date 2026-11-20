/**
 * SCRIPTED DEMO DATA — the only source of truth for every number on screen.
 *
 * Nothing here is real OCBC data. Every policy document, question, answer,
 * claim flag, reviewer item and dashboard figure is synthetic and was
 * written by hand for the OCBC × NYP Ignite Innovation Challenge prototype.
 *
 * What is scripted vs computed:
 *   scripted here  — the agent's answers, what retrieval returned (claim
 *                    sources and counter-passages), and the three LLM-judge
 *                    verdicts (groundedness, consistency, intent alignment)
 *   computed in    — citation verification, freshness and cross-referencing
 *   src/lib/rules.js  (plain code over the passages below), and the score
 *                    (src/lib/assess.js). No score is typed in by hand.
 *
 * The shapes mirror what a real pipeline would return, so a live agent,
 * retriever and judge could replace this module behind the same interface
 * (src/lib/agent.js and src/lib/pipeline.js):
 *
 *   verification = {
 *     explanation,                     // judge's plain-language summary
 *     claims: [{ id, start, end,       // character offsets into answer.text
 *                status, source, counter, reason, check }],
 *     checks: [{ id, status, summary, evidence: [...] }],   // judge checks only
 *     retrieved: [docId],              // sources the verifier found itself
 *   }
 */

// Fixed "today" so ages like "14 months ago" never drift between takes.
export const DEMO_TODAY = '2026-10-07'

// ─── Synthetic policy library ───────────────────────────────────────────────

export const DOCUMENTS = {
  'DOC-SME-104': {
    id: 'DOC-SME-104',
    title: 'SME Lending Policy',
    version: 'v4.2',
    topic: 'sme',
    owner: 'Business Banking Credit Risk',
    updated: '2026-06-12',
    reviewCycleMonths: 12,
    supersededBy: null,
    sections: [
      { id: '§5.1', heading: 'Transaction approval', text: 'Relationship managers may approve SME cross-border transfers within the limits set by the current Cross-Border Payments Standard.' },
      { id: '§5.2', heading: 'Escalation', text: 'Transfers above the relationship manager limit require approval from the Business Banking Credit Committee before release.' },
    ],
  },
  'DOC-SME-087': {
    id: 'DOC-SME-087',
    title: 'SME Cross-Border Transfer Limits Circular',
    version: 'v1.3',
    topic: 'sme',
    owner: 'Business Banking Operations',
    updated: '2025-08-04',
    reviewCycleMonths: 12,
    supersededBy: 'DOC-SME-112',
    sections: [
      { id: '§2', heading: 'Relationship manager limit', text: 'A relationship manager may approve a single SME cross-border transfer of up to SGD 250,000.' },
      { id: '§4', heading: 'Cut-off', text: 'Transfers approved before 3:00 pm Singapore time are targeted for same-day processing, subject to correspondent bank availability.' },
    ],
  },
  'DOC-SME-112': {
    id: 'DOC-SME-112',
    title: 'Cross-Border Payments Standard',
    version: 'v2.0',
    topic: 'sme',
    owner: 'Payments Policy Office',
    updated: '2026-05-20',
    reviewCycleMonths: 12,
    supersededBy: null,
    sections: [
      { id: '§3.1', heading: 'Relationship manager limit', text: 'A relationship manager may approve a single SME cross-border transfer of up to SGD 200,000. This replaces the SGD 250,000 limit in circular DOC-SME-087.' },
      { id: '§3.4', heading: 'Processing', text: 'Transfers approved before 2:30 pm Singapore time are targeted for same-day processing. Same-day processing depends on correspondent bank cut-offs.' },
    ],
  },
  'DOC-KYC-031': {
    id: 'DOC-KYC-031',
    title: 'Customer Due Diligence Procedures — SME',
    version: 'v3.1',
    topic: 'kyc',
    owner: 'Financial Crime Compliance',
    updated: '2026-03-02',
    reviewCycleMonths: 12,
    supersededBy: null,
    sections: [
      { id: '§4.1', heading: 'Beneficial owners', text: "Identify every beneficial owner who holds 25% or more of the company's shares or voting rights." },
      { id: '§4.2', heading: 'Identity evidence', text: 'For each beneficial owner, obtain a government-issued photo ID and proof of residential address dated within the last three months.' },
      { id: '§4.3', heading: 'Company records', text: "Obtain the company's latest business profile from the company registry." },
      { id: '§4.4', heading: 'Ownership confirmation', text: 'The ownership structure must be confirmed in writing by a director of the company.' },
    ],
  },
  'DOC-FX-019': {
    id: 'DOC-FX-019',
    title: 'FX Rate Override Guidelines',
    version: 'v2.3',
    topic: 'fx',
    owner: 'Global Markets Treasury',
    updated: '2026-07-15',
    reviewCycleMonths: 12,
    supersededBy: null,
    sections: [
      { id: '§2.1', heading: 'Relationship manager authority', text: 'Relationship managers may apply FX rate overrides of up to 10 basis points.' },
      { id: '§2.2', heading: 'Approval above authority', text: 'Any override above 10 basis points requires prior approval from the Treasury desk head.' },
      { id: '§3.1', heading: 'Record keeping', text: 'Every override must be recorded in the deal ticket with a reason code.' },
    ],
  },
  'DOC-OPS-045': {
    id: 'DOC-OPS-045',
    title: 'Fee Waiver Authority Matrix',
    version: 'v1.6',
    topic: 'fees',
    owner: 'Branch Operations',
    updated: '2024-11-18',
    reviewCycleMonths: 12,
    supersededBy: null,
    sections: [
      { id: 'Row 3', heading: 'Branch manager', text: 'Branch managers may waive account service fees of up to SGD 500 per account per year.' },
      { id: 'Row 4', heading: 'Area head', text: 'Waivers above SGD 500 require approval from the area head.' },
    ],
  },
  'DOC-CRD-022': {
    id: 'DOC-CRD-022',
    title: 'Cards Servicing Handbook',
    version: 'v5.0',
    topic: 'fees',
    owner: 'Cards & Payments',
    updated: '2026-04-08',
    reviewCycleMonths: 12,
    supersededBy: null,
    sections: [
      { id: '§7.2', heading: 'Annual fee reversals', text: 'Annual fee reversals for retail credit cards are handled by the Cards Service team.' },
    ],
  },

  // Wider library for free-text questions (backend mode, model-written answers).
  // No scripted scenario uses these, so they change no dashboard figure.
  'DOC-DEP-210': {
    id: 'DOC-DEP-210',
    title: 'Savings Account Terms — Retail',
    version: 'v3.0',
    topic: 'fees',
    owner: 'Deposits Product Office',
    updated: '2026-02-10',
    reviewCycleMonths: 12,
    supersededBy: null,
    sections: [
      { id: '§2.1', heading: 'Minimum balance', text: 'A standard savings account requires an average daily balance of SGD 1,000 in each calendar month.' },
      { id: '§2.2', heading: 'Fall-below fee', text: 'A fall-below fee of SGD 2 is charged for any month in which the average daily balance is under SGD 1,000. The fee is waived for account holders aged 21 and below.' },
      { id: '§3.1', heading: 'Interest', text: 'Interest is calculated on the end-of-day balance and credited monthly on the last business day of the month.' },
      { id: '§4.1', heading: 'Dormant accounts', text: 'An account with no customer-initiated transaction for 24 months is classified as dormant.' },
    ],
  },
  'DOC-KYC-040': {
    id: 'DOC-KYC-040',
    title: 'Retail Account Opening Procedures',
    version: 'v2.2',
    topic: 'kyc',
    owner: 'Financial Crime Compliance',
    updated: '2026-04-21',
    reviewCycleMonths: 12,
    supersededBy: null,
    sections: [
      { id: '§2.1', heading: 'Eligibility', text: 'Individual accounts may be opened by applicants aged 16 and above. Applicants under 18 need a parent or guardian as a joint signatory.' },
      { id: '§3.1', heading: 'Identity documents — citizens and residents', text: 'Singapore citizens and permanent residents must provide their NRIC to open an account.' },
      { id: '§3.2', heading: 'Identity documents — foreigners', text: 'Foreign applicants must provide a passport, a valid employment or student pass, and proof of residential address dated within the last three months.' },
      { id: '§4.1', heading: 'Initial deposit', text: 'An initial deposit of SGD 500 must be made within 30 days of the account being opened.' },
      { id: '§5.1', heading: 'Politically exposed persons', text: 'An applicant identified as a politically exposed person needs senior management approval before the account is opened.' },
    ],
  },
  'DOC-SME-130': {
    id: 'DOC-SME-130',
    title: 'SME Loan Repayment and Restructuring Guidelines',
    version: 'v1.4',
    topic: 'sme',
    owner: 'Business Banking Credit Risk',
    updated: '2026-01-15',
    reviewCycleMonths: 12,
    supersededBy: null,
    sections: [
      { id: '§2.1', heading: 'Grace period', text: 'A loan repayment received within 7 calendar days of its due date is not treated as late.' },
      { id: '§2.2', heading: 'Late payment fee', text: 'After the grace period, a late payment fee of 2% of the overdue instalment is charged, subject to a minimum of SGD 50.' },
      { id: '§3.1', heading: 'Early repayment', text: "A borrower may repay a term loan in full early by giving 30 days' written notice. A prepayment fee of 1.5% of the amount repaid applies during the first two years of the loan." },
      { id: '§4.1', heading: 'Restructuring', text: 'A request to restructure an SME loan must be approved by the Business Banking Credit Committee.' },
    ],
  },
  'DOC-CRD-031': {
    id: 'DOC-CRD-031',
    title: 'Card Dispute Handling Procedure',
    version: 'v2.1',
    topic: 'fees',
    owner: 'Cards & Payments',
    updated: '2026-08-03',
    reviewCycleMonths: 12,
    supersededBy: null,
    sections: [
      { id: '§2.1', heading: 'Time limit', text: 'A customer must raise a card transaction dispute within 60 days of the statement date.' },
      { id: '§2.2', heading: 'Provisional credit', text: 'For a dispute above SGD 100, a provisional credit is posted within 10 business days while the case is investigated.' },
      { id: '§3.1', heading: 'Suspected fraud', text: 'A suspected fraudulent transaction must be reported immediately, and the card is blocked before the dispute is logged.' },
      { id: '§4.1', heading: 'Resolution', text: 'Card disputes are resolved within 90 days of being logged.' },
    ],
  },
  'DOC-REM-014': {
    id: 'DOC-REM-014',
    title: 'Remittance Fee Schedule 2025',
    version: 'v1.0',
    topic: 'fees',
    owner: 'Retail Payments',
    updated: '2025-01-06',
    reviewCycleMonths: 12,
    supersededBy: 'DOC-REM-019',
    sections: [
      { id: '§1', heading: 'Online remittance', text: 'Overseas remittances made through online banking are charged a flat fee of SGD 10 per transaction.' },
      { id: '§2', heading: 'Branch remittance', text: 'Overseas remittances made at a branch are charged SGD 30 per transaction.' },
    ],
  },
  'DOC-REM-019': {
    id: 'DOC-REM-019',
    title: 'Remittance Fee Schedule 2026',
    version: 'v2.0',
    topic: 'fees',
    owner: 'Retail Payments',
    updated: '2026-03-30',
    reviewCycleMonths: 12,
    supersededBy: null,
    sections: [
      { id: '§1', heading: 'Online remittance', text: 'Overseas remittances made through online banking are charged a flat fee of SGD 5 per transaction. This replaces the SGD 10 fee in DOC-REM-014.' },
      { id: '§2', heading: 'Branch remittance', text: 'Overseas remittances made at a branch are charged SGD 25 per transaction.' },
      { id: '§3', heading: 'Daily limit', text: 'Online overseas remittances are limited to SGD 50,000 per customer per day.' },
    ],
  },
}

export const TOPICS = {
  sme: { id: 'sme', name: 'SME Lending' },
  kyc: { id: 'kyc', name: 'KYC & Onboarding' },
  fx: { id: 'fx', name: 'FX & Treasury' },
  fees: { id: 'fees', name: 'Fees & Charges' },
  collateral: { id: 'collateral', name: 'Collateral & Security' },
}

// Score bands. A score is never shown without its band.
export const BANDS = [
  { id: 'high', label: 'High', min: 80, status: 'verified' },
  { id: 'medium', label: 'Medium', min: 50, status: 'caution' },
  { id: 'low', label: 'Low', min: 0, status: 'unsupported' },
]

// ─── Helpers for writing fixtures by hand ──────────────────────────────────
// Claims are stored as character offsets. These helpers locate the offsets
// once, at load time, so the hand-written fixtures stay readable. The answer
// text is never rewritten to insert markup.

function locate(text, quote) {
  const start = text.indexOf(quote)
  if (start < 0) throw new Error(`Fixture claim not found in answer: "${quote}"`)
  return { start, end: start + quote.length }
}

function passageOf(docId, sectionId) {
  const doc = DOCUMENTS[docId]
  const section = doc.sections.find((s) => s.id === sectionId)
  return { docId, section: sectionId, passage: section.text }
}

function scenario(def) {
  const text = def.answer.text
  const claims = def.verification.claims.map(({ quote, ...rest }, i) => ({
    id: `${def.id}-c${i + 1}`,
    ...locate(text, quote),
    ...rest,
  }))
  return { ...def, verification: { ...def.verification, claims } }
}

// ─── Scripted questions, answers and verification results ──────────────────

export const SCENARIOS = [
  // 1 · Demo storyline. Medium score, one unsupported claim resting on a stale circular.
  scenario({
    id: 'sme-limit',
    topic: 'sme',
    prompt: 'SME cross-border approval limit',
    question: "What's the approval limit for a cross-border transfer under the SME lending policy?",
    keywords: ['transfer', 'sme', 'limit', 'approve', 'approval', 'rm', 'relationship manager', 'payment', 'how much'],
    strong: ['cross-border', 'cross border', 'overseas', 'approval limit', 'transfer limit'],
    excludes: ['mortgage', 'home loan', 'personal loan', 'credit card', 'car loan'],
    highStakes: false,
    answer: {
      text: 'Under the SME Lending Policy, a relationship manager can approve a single SME cross-border transfer of up to SGD 250,000. Anything above that limit needs approval from the Business Banking Credit Committee before it is released. Transfers approved before 2:30 pm Singapore time are targeted for same-day processing.',
      citations: ['DOC-SME-104', 'DOC-SME-087'],
    },
    verification: {
      explanation:
        'Two of three claims match current policy. The SGD 250,000 limit comes only from a circular that was superseded in May 2026 — the current standard sets SGD 200,000. Confirm the limit before acting on it.',
      headline: 'Confirm the limit before acting',
      retrieved: ['DOC-SME-112'],
      claims: [
        {
          quote: 'a relationship manager can approve a single SME cross-border transfer of up to SGD 250,000',
          status: 'unsupported',
          check: 'freshness',
          source: passageOf('DOC-SME-087', '§2'),
          counter: passageOf('DOC-SME-112', '§3.1'),
          short: 'SGD 250k is outdated — now SGD 200k',
          reason: 'No current approved source supports SGD 250,000. The only passage stating it is in a superseded circular, so it counts as unsupported rather than conflicting: the agent copied its source faithfully, but the source is no longer approved. The current standard sets SGD 200,000.',
        },
        {
          quote: 'Anything above that limit needs approval from the Business Banking Credit Committee before it is released',
          status: 'supported',
          check: 'groundedness',
          source: passageOf('DOC-SME-104', '§5.2'),
          reason: 'Matches the escalation rule in the SME Lending Policy.',
        },
        {
          quote: 'Transfers approved before 2:30 pm Singapore time are targeted for same-day processing',
          status: 'supported',
          check: 'groundedness',
          source: passageOf('DOC-SME-112', '§3.4'),
          reason: 'Matches the current Cross-Border Payments Standard. The agent did not cite this document; Assessment AI retrieved it independently.',
        },
      ],
      checks: [
        { id: 'groundedness', status: 'warning', short: '1 claim rests on a replaced circular', summary: '2 of 3 claims are supported by a current approved source. 1 claim rests only on a superseded document.', evidence: [passageOf('DOC-SME-087', '§2'), passageOf('DOC-SME-104', '§5.2'), passageOf('DOC-SME-112', '§3.4')] },
        { id: 'consistency', status: 'pass', short: 'No contradictions', summary: 'The answer does not contradict itself. The limit discrepancy is reported under cross-referencing.', evidence: [passageOf('DOC-SME-104', '§5.1')] },
        { id: 'intent', status: 'pass', short: 'Answers the question asked', summary: 'The question asks for an approval limit. The answer states a limit and the escalation path above it.', evidence: [{ kind: 'question' }] },
      ],
    },
  }),

  // 2 · Clean answer. High score, every claim supported.
  scenario({
    id: 'kyc-ubo',
    topic: 'kyc',
    prompt: 'Beneficial owner documents',
    question: 'What documents do I need to verify the beneficial owners of a new SME client?',
    keywords: ['owners', 'documents', 'verify', 'onboard', 'new client'],
    strong: ['beneficial owner', 'ubo', 'kyc', 'due diligence'],
    highStakes: false,
    answer: {
      text: "For each beneficial owner holding 25% or more of the company, collect a government-issued photo ID and proof of residential address dated within the last three months. You also need the company's latest business profile from the company registry, and the ownership structure must be confirmed in writing by a director.",
      citations: ['DOC-KYC-031'],
    },
    verification: {
      explanation: 'All four claims match the current Customer Due Diligence Procedures, updated seven months ago. No conflicts with other approved documents.',
      headline: 'Safe to use',
      retrieved: [],
      claims: [
        { quote: 'each beneficial owner holding 25% or more of the company', status: 'supported', check: 'groundedness', source: passageOf('DOC-KYC-031', '§4.1'), reason: 'Matches the 25% ownership threshold.' },
        { quote: 'collect a government-issued photo ID and proof of residential address dated within the last three months', status: 'supported', check: 'groundedness', source: passageOf('DOC-KYC-031', '§4.2'), reason: 'Matches the identity evidence requirement.' },
        { quote: "the company's latest business profile from the company registry", status: 'supported', check: 'groundedness', source: passageOf('DOC-KYC-031', '§4.3'), reason: 'Matches the company records requirement.' },
        { quote: 'the ownership structure must be confirmed in writing by a director', status: 'supported', check: 'groundedness', source: passageOf('DOC-KYC-031', '§4.4'), reason: 'Matches the ownership confirmation requirement.' },
      ],
      checks: [
        { id: 'groundedness', status: 'pass', short: 'All 4 claims backed by policy', summary: '4 of 4 claims are supported by an approved source.', evidence: [passageOf('DOC-KYC-031', '§4.1'), passageOf('DOC-KYC-031', '§4.2'), passageOf('DOC-KYC-031', '§4.3'), passageOf('DOC-KYC-031', '§4.4')] },
        { id: 'consistency', status: 'pass', short: 'No contradictions', summary: 'The answer does not contradict itself or another approved document.', evidence: [passageOf('DOC-KYC-031', '§4.4')] },
        { id: 'intent', status: 'pass', short: 'Answers the question asked', summary: 'The question asks which documents are needed. The answer lists them.', evidence: [{ kind: 'question' }] },
      ],
    },
  }),

  // 3 · Contradicts its source. Low score, auto-routed to a reviewer.
  scenario({
    id: 'fx-override',
    topic: 'fx',
    prompt: 'FX rate override authority',
    question: 'Can I override the FX rate for a corporate client without approval?',
    keywords: ['fx', 'rate', 'treasury', 'foreign exchange', 'corporate', 'approval'],
    strong: ['override', 'basis points', 'bps'],
    highStakes: true,
    answer: {
      text: 'Yes. Relationship managers can apply an FX rate override of up to 50 basis points without further approval, as long as the client has an active treasury mandate. Every override must be recorded in the deal ticket with a reason code.',
      citations: ['DOC-FX-019'],
    },
    verification: {
      explanation:
        'The answer contradicts its own cited source. The FX guidelines cap relationship-manager overrides at 10 basis points — not 50 — and nothing in the library mentions a treasury-mandate exception. Do not act on this answer.',
      headline: 'Don’t act on this answer',
      retrieved: [],
      claims: [
        {
          quote: 'Relationship managers can apply an FX rate override of up to 50 basis points without further approval',
          status: 'conflicting',
          check: 'consistency',
          source: passageOf('DOC-FX-019', '§2.2'),
          counter: passageOf('DOC-FX-019', '§2.1'),
          short: 'Says 50 bps — policy caps it at 10 bps',
          reason: 'The guideline caps relationship-manager overrides at 10 basis points. Anything above needs prior approval from the Treasury desk head.',
        },
        {
          quote: 'as long as the client has an active treasury mandate',
          status: 'unsupported',
          check: 'groundedness',
          source: passageOf('DOC-FX-019', '§2.1'),
          nearest: true,
          short: 'Mandate exception isn’t in any policy',
          reason: 'No retrieved passage mentions a treasury-mandate condition. The nearest passage, shown here, sets the authority limit without any exception.',
        },
        {
          quote: 'Every override must be recorded in the deal ticket with a reason code',
          status: 'supported',
          check: 'groundedness',
          source: passageOf('DOC-FX-019', '§3.1'),
          reason: 'Matches the record-keeping rule.',
        },
      ],
      checks: [
        { id: 'groundedness', status: 'fail', short: 'Only 1 of 3 claims backed', summary: '1 of 3 claims is supported. 1 conflicts with the source and 1 has no supporting passage.', evidence: [passageOf('DOC-FX-019', '§2.1'), passageOf('DOC-FX-019', '§3.1')] },
        { id: 'consistency', status: 'fail', short: 'Says no approval — policy requires it', summary: 'The answer says no approval is needed; the cited guideline says approval is required above 10 bps.', evidence: [passageOf('DOC-FX-019', '§2.2')] },
        { id: 'intent', status: 'pass', short: 'Answers the question asked', summary: 'The question asks whether approval is needed. The answer addresses that directly.', evidence: [{ kind: 'question' }] },
      ],
    },
  }),

  // 4 · Rests on a stale document, and drifts off the question.
  scenario({
    id: 'fees-waiver',
    topic: 'fees',
    prompt: 'Branch manager fee waiver',
    question: 'Can a branch manager waive the annual fee on an SME business account?',
    keywords: ['fee', 'fees', 'branch manager', 'annual fee', 'charges'],
    strong: ['waive', 'waiver'],
    highStakes: false,
    answer: {
      text: 'Yes. A branch manager can waive account service fees of up to SGD 500 per account per year. Waivers above SGD 500 need approval from the area head. For retail credit cards, annual fee reversals are handled by the Cards Service team.',
      citations: ['DOC-OPS-045', 'DOC-CRD-022'],
    },
    verification: {
      explanation:
        'The waiver limits match the Fee Waiver Authority Matrix, but that document is 22 months old and past its 12-month review. The last sentence answers a question about retail cards that was not asked.',
      headline: 'Right limits, outdated source',
      retrieved: [],
      claims: [
        { quote: 'A branch manager can waive account service fees of up to SGD 500 per account per year', status: 'stale', check: 'freshness', source: passageOf('DOC-OPS-045', 'Row 3'), short: 'SGD 500 limit — source overdue for review', reason: 'Matches the source, but the source is 22 months old and overdue for its annual review. The limit may have changed.' },
        { quote: 'Waivers above SGD 500 need approval from the area head', status: 'stale', check: 'freshness', source: passageOf('DOC-OPS-045', 'Row 4'), short: 'Area-head rule — source overdue', reason: 'Matches the source, but the source is overdue for review.' },
        { quote: 'For retail credit cards, annual fee reversals are handled by the Cards Service team', status: 'off-intent', check: 'intent', source: passageOf('DOC-CRD-022', '§7.2'), short: 'About retail cards — not what you asked', reason: 'Accurate, but it answers a different question: you asked about SME business accounts, not retail credit cards.' },
      ],
      checks: [
        { id: 'groundedness', status: 'pass', short: 'All 3 claims match a source', summary: '3 of 3 claims match a source passage. 2 of them rest on a document overdue for review.', evidence: [passageOf('DOC-OPS-045', 'Row 3'), passageOf('DOC-OPS-045', 'Row 4'), passageOf('DOC-CRD-022', '§7.2')] },
        { id: 'consistency', status: 'pass', short: 'No contradictions', summary: 'The answer does not contradict itself or another approved document.', evidence: [passageOf('DOC-OPS-045', 'Row 4')] },
        { id: 'intent', status: 'warning', short: 'Last sentence is off-topic', summary: 'The question is about an SME business account. The final sentence answers a nearby question about retail credit cards.', evidence: [{ kind: 'question' }, passageOf('DOC-CRD-022', '§7.2')] },
      ],
    },
  }),

  // 5 · Failure state: no source found. The agent answers confidently anyway.
  scenario({
    id: 'collateral-crypto',
    topic: 'collateral',
    prompt: 'Crypto as loan collateral',
    question: 'Can an SME pledge crypto assets as collateral for a loan?',
    keywords: ['collateral', 'pledge', 'security', 'loan'],
    strong: ['crypto', 'bitcoin', 'ether', 'digital asset', 'digital assets', 'cryptocurrency'],
    highStakes: true,
    answer: {
      text: 'Yes. Major crypto assets such as Bitcoin and Ether can be accepted as collateral for SME loans at a 50% haircut, provided they are held with an approved custodian. Valuations are refreshed daily.',
      citations: [],
    },
    verification: {
      noSource: true,
      explanation:
        'No approved document covers crypto or digital-asset collateral, and the answer cites nothing. Every claim here is unverified. Treat it as unknown until a reviewer confirms policy.',
      headline: 'No policy covers this',
      retrieved: [],
      search: { documentsSearched: 7, query: 'crypto digital asset collateral haircut custodian', topMatch: 0.21, threshold: 0.6 },
      claims: [
        { quote: 'Major crypto assets such as Bitcoin and Ether can be accepted as collateral for SME loans at a 50% haircut', status: 'no-source', check: 'groundedness', source: null, short: 'No policy on crypto collateral', reason: 'No source found. Retrieval returned no passage above the relevance threshold.' },
        { quote: 'provided they are held with an approved custodian', status: 'no-source', check: 'groundedness', source: null, short: 'Custodian rule not found', reason: 'No source found. No approved document mentions custodians.' },
        { quote: 'Valuations are refreshed daily', status: 'no-source', check: 'groundedness', source: null, short: 'Daily valuation rule not found', reason: 'No source found. No approved document sets a valuation frequency for this asset class.' },
      ],
      checks: [
        { id: 'groundedness', status: 'fail', short: '0 of 3 claims backed', summary: '0 of 3 claims are supported. No approved passage was retrieved.', evidence: [{ kind: 'search' }] },
        { id: 'consistency', status: 'pass', short: 'No contradictions', summary: 'The answer does not contradict itself.', evidence: [{ kind: 'search' }] },
        { id: 'intent', status: 'pass', short: 'Answers the question asked', summary: 'The question asks whether crypto is acceptable collateral. The answer addresses that.', evidence: [{ kind: 'question' }] },
      ],
    },
  }),
]

// Returned when the input matches no scripted question. Not an error.
export const FALLBACK = {
  id: 'fallback',
  topic: null,
  question: null,
  highStakes: false,
  answer: {
    text: "I couldn't find an approved policy document that answers this. Try one of the suggested questions, or rephrase with the policy name.",
    citations: [],
  },
  verification: {
    explanation: 'The reply makes no policy claims, so there is nothing to verify. No score is given.',
    headline: 'Nothing to verify',
    retrieved: [],
    claims: [],
    checks: [
      { id: 'groundedness', status: 'na', short: 'No claims to check', summary: 'No factual claims to check.', evidence: [{ kind: 'search' }] },
      { id: 'consistency', status: 'na', short: 'No claims to compare', summary: 'No claims to compare.', evidence: [{ kind: 'search' }] },
      { id: 'intent', status: 'pass', short: 'Says plainly it has no answer', summary: 'The reply says plainly that it has no answer, rather than guessing.', evidence: [{ kind: 'question' }] },
    ],
  },
}

// ─── Reviewer queue (pending items from other employees) ───────────────────

export const REVIEW_QUEUE_SEED = [
  { id: 'RQ-1041', scenarioId: 'fx-override', askedBy: 'Relationship Manager · Corporate Banking', askedAt: '2026-10-07T09:12', routedBy: 'auto', reasons: ['low-confidence', 'conflicting', 'high-stakes'] },
  { id: 'RQ-1039', scenarioId: 'collateral-crypto', askedBy: 'Relationship Manager · Business Banking', askedAt: '2026-10-06T16:40', routedBy: 'auto', reasons: ['low-confidence', 'no-source', 'high-stakes'] },
  { id: 'RQ-1036', scenarioId: 'fees-waiver', askedBy: 'Branch Service Lead · Tampines', askedAt: '2026-10-06T11:05', routedBy: 'employee', reasons: ['employee', 'stale'] },
]

// What a reviewer's decision on each scenario is filed under, plus a draft
// correction assembled from the flagged claims' own passages. When the
// reviewer sends the draft unchanged, Assessment AI re-verifies it (the
// draft is a scenario of its own in CORRECTIONS below).
export const REVIEW_HINTS = {
  'sme-limit': { docId: 'DOC-SME-087', category: 'stale-source', placeholder: 'e.g. Limit came from DOC-SME-087, which DOC-SME-112 superseded.' },
  'fx-override': { docId: 'DOC-FX-019', category: 'overstated-authority', placeholder: 'e.g. Guideline caps RM overrides at 10 bps; above needs desk head approval.' },
  'collateral-crypto': { docId: null, category: 'no-source', placeholder: 'e.g. No approved policy covers digital-asset collateral.' },
  'fees-waiver': { docId: 'DOC-OPS-045', category: 'off-intent', placeholder: 'e.g. Removed the retail-cards sentence; matrix is overdue for review.' },
  'kyc-ubo': { docId: 'DOC-KYC-031', category: 'none', placeholder: 'e.g. Matches DOC-KYC-031 §4.1–4.4.' },
  fallback: { docId: null, category: 'none', placeholder: 'Explain the decision.' },
}

// Draft corrections, verified like any other answer.
export const CORRECTIONS = {
  'sme-limit': scenario({
    id: 'sme-limit~corrected',
    topic: 'sme',
    question: "What's the approval limit for a cross-border transfer under the SME lending policy?",
    answer: {
      text: 'Under the SME Lending Policy, a relationship manager can approve a single SME cross-border transfer of up to SGD 200,000 (Cross-Border Payments Standard DOC-SME-112 §3.1). Anything above that limit needs approval from the Business Banking Credit Committee before it is released. Transfers approved before 2:30 pm Singapore time are targeted for same-day processing.',
      citations: ['DOC-SME-112', 'DOC-SME-104'],
    },
    verification: {
      explanation: 'All three claims now match current policy. The limit cites the current Cross-Border Payments Standard instead of the superseded circular.',
      headline: 'Now matches current policy',
      retrieved: [],
      claims: [
        { quote: 'a relationship manager can approve a single SME cross-border transfer of up to SGD 200,000', status: 'supported', check: 'groundedness', source: passageOf('DOC-SME-112', '§3.1'), reason: 'Matches the current relationship manager limit.' },
        { quote: 'Anything above that limit needs approval from the Business Banking Credit Committee before it is released', status: 'supported', check: 'groundedness', source: passageOf('DOC-SME-104', '§5.2'), reason: 'Matches the escalation rule.' },
        { quote: 'Transfers approved before 2:30 pm Singapore time are targeted for same-day processing', status: 'supported', check: 'groundedness', source: passageOf('DOC-SME-112', '§3.4'), reason: 'Matches the processing rule.' },
      ],
      checks: [
        { id: 'groundedness', status: 'pass', short: 'All 3 claims backed', summary: '3 of 3 claims are supported by a current approved source.', evidence: [passageOf('DOC-SME-112', '§3.1'), passageOf('DOC-SME-104', '§5.2'), passageOf('DOC-SME-112', '§3.4')] },
        { id: 'consistency', status: 'pass', short: 'No contradictions', summary: 'No contradiction with any approved document.', evidence: [passageOf('DOC-SME-112', '§3.1')] },
        { id: 'intent', status: 'pass', short: 'Answers the question asked', summary: 'States the limit asked for and the escalation path.', evidence: [{ kind: 'question' }] },
      ],
    },
  }),
  'fx-override': scenario({
    id: 'fx-override~corrected',
    topic: 'fx',
    question: 'Can I override the FX rate for a corporate client without approval?',
    answer: {
      text: 'No. Relationship managers may apply FX rate overrides of up to 10 basis points. Any override above 10 basis points requires prior approval from the Treasury desk head (DOC-FX-019 §2.2). Every override must be recorded in the deal ticket with a reason code.',
      citations: ['DOC-FX-019'],
    },
    verification: {
      explanation: 'All three claims match the FX Rate Override Guidelines word for word. The treasury-mandate exception has been removed.',
      headline: 'Now matches the guideline',
      retrieved: [],
      claims: [
        { quote: 'Relationship managers may apply FX rate overrides of up to 10 basis points', status: 'supported', check: 'groundedness', source: passageOf('DOC-FX-019', '§2.1'), reason: 'Matches the authority limit.' },
        { quote: 'Any override above 10 basis points requires prior approval from the Treasury desk head', status: 'supported', check: 'groundedness', source: passageOf('DOC-FX-019', '§2.2'), reason: 'Matches the approval rule.' },
        { quote: 'Every override must be recorded in the deal ticket with a reason code', status: 'supported', check: 'groundedness', source: passageOf('DOC-FX-019', '§3.1'), reason: 'Matches the record-keeping rule.' },
      ],
      checks: [
        { id: 'groundedness', status: 'pass', short: 'All 3 claims backed', summary: '3 of 3 claims are supported.', evidence: [passageOf('DOC-FX-019', '§2.1'), passageOf('DOC-FX-019', '§2.2')] },
        { id: 'consistency', status: 'pass', short: 'No contradictions', summary: 'No contradiction with the guideline.', evidence: [passageOf('DOC-FX-019', '§2.2')] },
        { id: 'intent', status: 'pass', short: 'Answers the question asked', summary: 'Answers whether approval is needed.', evidence: [{ kind: 'question' }] },
      ],
    },
  }),
  'fees-waiver': scenario({
    id: 'fees-waiver~corrected',
    topic: 'fees',
    question: 'Can a branch manager waive the annual fee on an SME business account?',
    answer: {
      text: 'Yes. A branch manager can waive account service fees of up to SGD 500 per account per year, and waivers above SGD 500 need approval from the area head (DOC-OPS-045). This matrix is overdue for review, so confirm the limit with Branch Operations.',
      citations: ['DOC-OPS-045'],
    },
    verification: {
      explanation: 'The off-topic sentence is gone. The limits still rest on a matrix that is overdue for review, so the score stays Medium until Branch Operations confirms it.',
      headline: 'Fixed — source still overdue',
      retrieved: [],
      claims: [
        { quote: 'A branch manager can waive account service fees of up to SGD 500 per account per year', status: 'stale', check: 'freshness', source: passageOf('DOC-OPS-045', 'Row 3'), short: 'SGD 500 limit — source overdue for review', reason: 'Matches the source, which is overdue for review.' },
        { quote: 'waivers above SGD 500 need approval from the area head', status: 'stale', check: 'freshness', source: passageOf('DOC-OPS-045', 'Row 4'), short: 'Area-head rule — source overdue', reason: 'Matches the source, which is overdue for review.' },
      ],
      checks: [
        { id: 'groundedness', status: 'pass', short: 'Both claims match a source', summary: '2 of 2 claims match a source passage.', evidence: [passageOf('DOC-OPS-045', 'Row 3'), passageOf('DOC-OPS-045', 'Row 4')] },
        { id: 'consistency', status: 'pass', short: 'No contradictions', summary: 'No contradiction with any approved document.', evidence: [passageOf('DOC-OPS-045', 'Row 4')] },
        { id: 'intent', status: 'pass', short: 'Answers the question asked', summary: 'Answers only about the SME business account asked about.', evidence: [{ kind: 'question' }] },
      ],
    },
  }),
  'collateral-crypto': scenario({
    id: 'collateral-crypto~corrected',
    topic: 'collateral',
    question: 'Can an SME pledge crypto assets as collateral for a loan?',
    answer: {
      text: 'There is no approved policy on accepting crypto or digital assets as collateral. Do not offer this to the client. Refer the question to Business Banking Credit Risk.',
      citations: [],
    },
    verification: {
      explanation: 'The corrected reply makes no policy claims. It states that no policy exists, which is what retrieval found.',
      headline: 'Correctly says no policy exists',
      retrieved: [],
      claims: [],
      checks: [
        { id: 'groundedness', status: 'na', short: 'No policy claims to check', summary: 'No factual policy claims.', evidence: [{ kind: 'search' }] },
        { id: 'consistency', status: 'pass', short: 'Matches the empty search result', summary: 'Consistent with the empty retrieval result.', evidence: [{ kind: 'search' }] },
        { id: 'intent', status: 'pass', short: 'Answers the question asked', summary: 'Answers the question asked.', evidence: [{ kind: 'question' }] },
      ],
    },
  }),
}

// ─── Agent release check: v1 vs v2 on a fixed test set ─────────────────────
// The same verifier scores both versions on the same questions; the
// comparison (src/lib/releaseCheck.js) is computed from those results. Agent v1
// is the agent in the workspace — its answers to the five demo questions are
// the SCENARIOS above. Agent v2 is a candidate release that exists only here:
// it is never used to answer questions in the workspace.

export const AGENT_VERSIONS = [
  {
    id: 'v1',
    label: 'Agent v1',
    stage: 'In production',
    summary: 'The agent employees use today. Every answer in the workspace comes from v1.',
    changes: [],
  },
  {
    id: 'v2',
    label: 'Agent v2',
    stage: 'Release candidate',
    summary: 'Built from the Trends recommendations. Not used in the workspace until it passes this check.',
    changes: [
      'Retrieval index excludes superseded documents',
      'Prompt: quote numeric limits verbatim and say when approval is needed',
      'Prompt: answer only for the product named in the question',
      'Prompt: decline when no approved source is found',
      'New step: summarise long passages before answering',
    ],
  },
]

const DECLINE_CHECKS = [
  { id: 'groundedness', status: 'na', short: 'No policy claims to check', summary: 'The reply makes no factual policy claims.', evidence: [{ kind: 'search' }] },
  { id: 'consistency', status: 'pass', short: 'Matches the empty search result', summary: 'Consistent with the empty retrieval result.', evidence: [{ kind: 'search' }] },
  { id: 'intent', status: 'pass', short: 'Says plainly there is no policy', summary: 'The reply addresses the question by saying no approved policy covers it, rather than guessing.', evidence: [{ kind: 'question' }] },
]

// Answers written for the test set. v1's answers to the five demo questions
// are reused from SCENARIOS, so the test set and the workspace agree.
export const EVAL_ANSWERS = [
  // SME · limit — v2 retrieves the current standard, not the superseded circular.
  scenario({
    id: 'eval-sme-limit-v2',
    topic: 'sme',
    question: "What's the approval limit for a cross-border transfer under the SME lending policy?",
    answer: {
      text: 'A relationship manager can approve a single SME cross-border transfer of up to SGD 200,000. Transfers above the relationship manager limit require approval from the Business Banking Credit Committee before release.',
      citations: ['DOC-SME-112', 'DOC-SME-104'],
    },
    verification: {
      explanation: 'Both claims match current policy. The limit comes from the current Cross-Border Payments Standard, not the superseded circular.',
      headline: 'Safe to use',
      retrieved: [],
      claims: [
        { quote: 'A relationship manager can approve a single SME cross-border transfer of up to SGD 200,000', status: 'supported', check: 'groundedness', source: passageOf('DOC-SME-112', '§3.1'), reason: 'Matches the current relationship manager limit.' },
        { quote: 'Transfers above the relationship manager limit require approval from the Business Banking Credit Committee before release', status: 'supported', check: 'groundedness', source: passageOf('DOC-SME-104', '§5.2'), reason: 'Matches the escalation rule.' },
      ],
      checks: [
        { id: 'groundedness', status: 'pass', short: 'Both claims backed by current policy', summary: '2 of 2 claims are supported by a current approved source.', evidence: [passageOf('DOC-SME-112', '§3.1'), passageOf('DOC-SME-104', '§5.2')] },
        { id: 'consistency', status: 'pass', short: 'No contradictions', summary: 'No contradiction with any approved document.', evidence: [passageOf('DOC-SME-112', '§3.1')] },
        { id: 'intent', status: 'pass', short: 'Answers the question asked', summary: 'States the limit asked for and the escalation path.', evidence: [{ kind: 'question' }] },
      ],
    },
  }),

  // SME · cut-off — v1 quotes the superseded circular's 3:00 pm.
  scenario({
    id: 'eval-sme-cutoff-v1',
    topic: 'sme',
    question: "What's the same-day processing cut-off for SME cross-border transfers?",
    answer: {
      text: 'Transfers approved before 3:00 pm Singapore time are targeted for same-day processing, subject to correspondent bank availability.',
      citations: ['DOC-SME-087'],
    },
    verification: {
      explanation: 'The 3:00 pm cut-off comes only from a circular that was superseded in May 2026. The current standard sets 2:30 pm.',
      headline: 'Cut-off is outdated',
      retrieved: ['DOC-SME-112'],
      claims: [
        {
          quote: 'Transfers approved before 3:00 pm Singapore time are targeted for same-day processing',
          status: 'unsupported',
          check: 'freshness',
          source: passageOf('DOC-SME-087', '§4'),
          counter: passageOf('DOC-SME-112', '§3.4'),
          short: '3:00 pm cut-off is outdated — now 2:30 pm',
          reason: 'No current approved source supports 3:00 pm. The only passage stating it is in a superseded circular; the current Cross-Border Payments Standard sets 2:30 pm.',
        },
      ],
      checks: [
        { id: 'groundedness', status: 'fail', short: 'Claim rests on a replaced circular', summary: '0 of 1 claims is supported by a current approved source.', evidence: [passageOf('DOC-SME-087', '§4')] },
        { id: 'consistency', status: 'pass', short: 'No contradictions', summary: 'The answer does not contradict itself. The cut-off discrepancy is reported under cross-referencing.', evidence: [passageOf('DOC-SME-087', '§4')] },
        { id: 'intent', status: 'pass', short: 'Answers the question asked', summary: 'The question asks for the cut-off. The answer states one.', evidence: [{ kind: 'question' }] },
      ],
    },
  }),
  scenario({
    id: 'eval-sme-cutoff-v2',
    topic: 'sme',
    question: "What's the same-day processing cut-off for SME cross-border transfers?",
    answer: {
      text: 'Transfers approved before 2:30 pm Singapore time are targeted for same-day processing. Same-day processing depends on correspondent bank cut-offs.',
      citations: ['DOC-SME-112'],
    },
    verification: {
      explanation: 'Both claims match the current Cross-Border Payments Standard.',
      headline: 'Safe to use',
      retrieved: [],
      claims: [
        { quote: 'Transfers approved before 2:30 pm Singapore time are targeted for same-day processing', status: 'supported', check: 'groundedness', source: passageOf('DOC-SME-112', '§3.4'), reason: 'Matches the current processing cut-off.' },
        { quote: 'Same-day processing depends on correspondent bank cut-offs', status: 'supported', check: 'groundedness', source: passageOf('DOC-SME-112', '§3.4'), reason: 'Matches the processing rule.' },
      ],
      checks: [
        { id: 'groundedness', status: 'pass', short: 'Both claims backed', summary: '2 of 2 claims are supported by a current approved source.', evidence: [passageOf('DOC-SME-112', '§3.4')] },
        { id: 'consistency', status: 'pass', short: 'No contradictions', summary: 'No contradiction with any approved document.', evidence: [passageOf('DOC-SME-112', '§3.4')] },
        { id: 'intent', status: 'pass', short: 'Answers the question asked', summary: 'States the cut-off asked for.', evidence: [{ kind: 'question' }] },
      ],
    },
  }),

  // KYC · documents — v2's new summarising step changes the 25% threshold. A regression.
  scenario({
    id: 'eval-kyc-ubo-v2',
    topic: 'kyc',
    question: 'What documents do I need to verify the beneficial owners of a new SME client?',
    answer: {
      text: "For each beneficial owner holding 20% or more of the company, collect a government-issued photo ID and proof of residential address dated within the last three months. You also need the company's latest business profile from the company registry, and the ownership structure must be confirmed in writing by a director.",
      citations: ['DOC-KYC-031'],
    },
    verification: {
      explanation: 'Three of four claims match the due-diligence procedure, but the ownership threshold is wrong: the procedure says 25%, the answer says 20%. v1 stated this correctly.',
      headline: 'Wrong ownership threshold',
      retrieved: [],
      claims: [
        {
          quote: 'each beneficial owner holding 20% or more of the company',
          status: 'conflicting',
          check: 'consistency',
          source: passageOf('DOC-KYC-031', '§4.1'),
          counter: passageOf('DOC-KYC-031', '§4.1'),
          short: 'Says 20% — policy threshold is 25%',
          reason: 'The procedure identifies beneficial owners at 25% or more. The answer restates the threshold as 20%, so it contradicts its own cited source.',
        },
        { quote: 'collect a government-issued photo ID and proof of residential address dated within the last three months', status: 'supported', check: 'groundedness', source: passageOf('DOC-KYC-031', '§4.2'), reason: 'Matches the identity evidence requirement.' },
        { quote: "the company's latest business profile from the company registry", status: 'supported', check: 'groundedness', source: passageOf('DOC-KYC-031', '§4.3'), reason: 'Matches the company records requirement.' },
        { quote: 'the ownership structure must be confirmed in writing by a director', status: 'supported', check: 'groundedness', source: passageOf('DOC-KYC-031', '§4.4'), reason: 'Matches the ownership confirmation requirement.' },
      ],
      checks: [
        { id: 'groundedness', status: 'warning', short: '3 of 4 claims backed', summary: '3 of 4 claims are supported. 1 contradicts the cited source.', evidence: [passageOf('DOC-KYC-031', '§4.1'), passageOf('DOC-KYC-031', '§4.2')] },
        { id: 'consistency', status: 'fail', short: 'Says 20% — procedure says 25%', summary: 'The answer gives a 20% ownership threshold; the cited procedure sets 25%.', evidence: [passageOf('DOC-KYC-031', '§4.1')] },
        { id: 'intent', status: 'pass', short: 'Answers the question asked', summary: 'The question asks which documents are needed. The answer lists them.', evidence: [{ kind: 'question' }] },
      ],
    },
  }),

  // KYC · address — both versions answer correctly.
  scenario({
    id: 'eval-kyc-address-v1',
    topic: 'kyc',
    question: "How recent must a beneficial owner's proof of address be?",
    answer: {
      text: 'Proof of residential address must be dated within the last three months, alongside a government-issued photo ID for each beneficial owner.',
      citations: ['DOC-KYC-031'],
    },
    verification: {
      explanation: 'Both claims match the identity evidence requirement in the current due-diligence procedure.',
      headline: 'Safe to use',
      retrieved: [],
      claims: [
        { quote: 'Proof of residential address must be dated within the last three months', status: 'supported', check: 'groundedness', source: passageOf('DOC-KYC-031', '§4.2'), reason: 'Matches the three-month requirement.' },
        { quote: 'a government-issued photo ID for each beneficial owner', status: 'supported', check: 'groundedness', source: passageOf('DOC-KYC-031', '§4.2'), reason: 'Matches the identity evidence requirement.' },
      ],
      checks: [
        { id: 'groundedness', status: 'pass', short: 'Both claims backed', summary: '2 of 2 claims are supported.', evidence: [passageOf('DOC-KYC-031', '§4.2')] },
        { id: 'consistency', status: 'pass', short: 'No contradictions', summary: 'No contradiction with any approved document.', evidence: [passageOf('DOC-KYC-031', '§4.2')] },
        { id: 'intent', status: 'pass', short: 'Answers the question asked', summary: 'States how recent the proof of address must be.', evidence: [{ kind: 'question' }] },
      ],
    },
  }),
  scenario({
    id: 'eval-kyc-address-v2',
    topic: 'kyc',
    question: "How recent must a beneficial owner's proof of address be?",
    answer: {
      text: 'Each beneficial owner must provide proof of residential address dated within the last three months, together with a government-issued photo ID.',
      citations: ['DOC-KYC-031'],
    },
    verification: {
      explanation: 'Both claims match the identity evidence requirement in the current due-diligence procedure.',
      headline: 'Safe to use',
      retrieved: [],
      claims: [
        { quote: 'proof of residential address dated within the last three months', status: 'supported', check: 'groundedness', source: passageOf('DOC-KYC-031', '§4.2'), reason: 'Matches the three-month requirement.' },
        { quote: 'a government-issued photo ID', status: 'supported', check: 'groundedness', source: passageOf('DOC-KYC-031', '§4.2'), reason: 'Matches the identity evidence requirement.' },
      ],
      checks: [
        { id: 'groundedness', status: 'pass', short: 'Both claims backed', summary: '2 of 2 claims are supported.', evidence: [passageOf('DOC-KYC-031', '§4.2')] },
        { id: 'consistency', status: 'pass', short: 'No contradictions', summary: 'No contradiction with any approved document.', evidence: [passageOf('DOC-KYC-031', '§4.2')] },
        { id: 'intent', status: 'pass', short: 'Answers the question asked', summary: 'States how recent the proof of address must be.', evidence: [{ kind: 'question' }] },
      ],
    },
  }),

  // FX · override — v2 quotes the 10 bps limit verbatim.
  scenario({
    id: 'eval-fx-override-v2',
    topic: 'fx',
    question: 'Can I override the FX rate for a corporate client without approval?',
    answer: {
      text: 'Only within your authority. Relationship managers may apply FX rate overrides of up to 10 basis points. Any override above 10 basis points requires prior approval from the Treasury desk head. Every override must be recorded in the deal ticket with a reason code.',
      citations: ['DOC-FX-019'],
    },
    verification: {
      explanation: 'All three claims match the FX Rate Override Guidelines.',
      headline: 'Safe to use',
      retrieved: [],
      claims: [
        { quote: 'Relationship managers may apply FX rate overrides of up to 10 basis points', status: 'supported', check: 'groundedness', source: passageOf('DOC-FX-019', '§2.1'), reason: 'Matches the authority limit.' },
        { quote: 'Any override above 10 basis points requires prior approval from the Treasury desk head', status: 'supported', check: 'groundedness', source: passageOf('DOC-FX-019', '§2.2'), reason: 'Matches the approval rule.' },
        { quote: 'Every override must be recorded in the deal ticket with a reason code', status: 'supported', check: 'groundedness', source: passageOf('DOC-FX-019', '§3.1'), reason: 'Matches the record-keeping rule.' },
      ],
      checks: [
        { id: 'groundedness', status: 'pass', short: 'All 3 claims backed', summary: '3 of 3 claims are supported.', evidence: [passageOf('DOC-FX-019', '§2.1'), passageOf('DOC-FX-019', '§2.2'), passageOf('DOC-FX-019', '§3.1')] },
        { id: 'consistency', status: 'pass', short: 'No contradictions', summary: 'No contradiction with the guideline.', evidence: [passageOf('DOC-FX-019', '§2.2')] },
        { id: 'intent', status: 'pass', short: 'Answers the question asked', summary: 'Answers whether approval is needed.', evidence: [{ kind: 'question' }] },
      ],
    },
  }),

  // FX · approver — v1 invents approval after booking.
  scenario({
    id: 'eval-fx-approver-v1',
    topic: 'fx',
    question: 'Who approves an FX rate override above 10 basis points?',
    answer: {
      text: 'Any override above 10 basis points requires approval from the Treasury desk head. The Treasury desk head can give that approval after the deal is booked.',
      citations: ['DOC-FX-019'],
    },
    verification: {
      explanation: 'The approver is right, but the guideline requires approval before the override, not after. No approved document allows approval after booking.',
      headline: 'Approval timing is wrong',
      retrieved: [],
      claims: [
        { quote: 'Any override above 10 basis points requires approval from the Treasury desk head', status: 'supported', check: 'groundedness', source: passageOf('DOC-FX-019', '§2.2'), reason: 'Matches the approval rule.' },
        {
          quote: 'The Treasury desk head can give that approval after the deal is booked',
          status: 'unsupported',
          check: 'groundedness',
          source: passageOf('DOC-FX-019', '§2.2'),
          nearest: true,
          short: 'Approval after booking isn’t in any policy',
          reason: 'No retrieved passage allows approval after the deal is booked. The nearest passage, shown here, requires prior approval.',
        },
      ],
      checks: [
        { id: 'groundedness', status: 'warning', short: '1 of 2 claims backed', summary: '1 of 2 claims is supported. 1 has no supporting passage.', evidence: [passageOf('DOC-FX-019', '§2.2')] },
        { id: 'consistency', status: 'warning', short: 'Timing contradicts “prior approval”', summary: 'The answer allows approval after booking; the guideline requires prior approval.', evidence: [passageOf('DOC-FX-019', '§2.2')] },
        { id: 'intent', status: 'pass', short: 'Answers the question asked', summary: 'Names who approves.', evidence: [{ kind: 'question' }] },
      ],
    },
  }),
  scenario({
    id: 'eval-fx-approver-v2',
    topic: 'fx',
    question: 'Who approves an FX rate override above 10 basis points?',
    answer: {
      text: 'Any override above 10 basis points requires prior approval from the Treasury desk head. Every override must be recorded in the deal ticket with a reason code.',
      citations: ['DOC-FX-019'],
    },
    verification: {
      explanation: 'Both claims match the FX Rate Override Guidelines.',
      headline: 'Safe to use',
      retrieved: [],
      claims: [
        { quote: 'Any override above 10 basis points requires prior approval from the Treasury desk head', status: 'supported', check: 'groundedness', source: passageOf('DOC-FX-019', '§2.2'), reason: 'Matches the approval rule.' },
        { quote: 'Every override must be recorded in the deal ticket with a reason code', status: 'supported', check: 'groundedness', source: passageOf('DOC-FX-019', '§3.1'), reason: 'Matches the record-keeping rule.' },
      ],
      checks: [
        { id: 'groundedness', status: 'pass', short: 'Both claims backed', summary: '2 of 2 claims are supported.', evidence: [passageOf('DOC-FX-019', '§2.2'), passageOf('DOC-FX-019', '§3.1')] },
        { id: 'consistency', status: 'pass', short: 'No contradictions', summary: 'No contradiction with the guideline.', evidence: [passageOf('DOC-FX-019', '§2.2')] },
        { id: 'intent', status: 'pass', short: 'Answers the question asked', summary: 'Names who approves.', evidence: [{ kind: 'question' }] },
      ],
    },
  }),

  // Fees · waiver — v2 drops the off-topic sentence; the matrix is still overdue.
  scenario({
    id: 'eval-fees-waiver-v2',
    topic: 'fees',
    question: 'Can a branch manager waive the annual fee on an SME business account?',
    answer: {
      text: 'Yes. A branch manager can waive account service fees of up to SGD 500 per account per year. Waivers above SGD 500 need approval from the area head.',
      citations: ['DOC-OPS-045'],
    },
    verification: {
      explanation: 'Both limits match the Fee Waiver Authority Matrix, but that document is 22 months old and past its 12-month review. No agent change fixes this; the document needs reviewing.',
      headline: 'Right limits, outdated source',
      retrieved: [],
      claims: [
        { quote: 'A branch manager can waive account service fees of up to SGD 500 per account per year', status: 'stale', check: 'freshness', source: passageOf('DOC-OPS-045', 'Row 3'), short: 'SGD 500 limit — source overdue for review', reason: 'Matches the source, but the source is 22 months old and overdue for its annual review.' },
        { quote: 'Waivers above SGD 500 need approval from the area head', status: 'stale', check: 'freshness', source: passageOf('DOC-OPS-045', 'Row 4'), short: 'Area-head rule — source overdue', reason: 'Matches the source, but the source is overdue for review.' },
      ],
      checks: [
        { id: 'groundedness', status: 'pass', short: 'Both claims match a source', summary: '2 of 2 claims match a source passage. Both rest on a document overdue for review.', evidence: [passageOf('DOC-OPS-045', 'Row 3'), passageOf('DOC-OPS-045', 'Row 4')] },
        { id: 'consistency', status: 'pass', short: 'No contradictions', summary: 'No contradiction with any approved document.', evidence: [passageOf('DOC-OPS-045', 'Row 4')] },
        { id: 'intent', status: 'pass', short: 'Answers the question asked', summary: 'Answers only about the SME business account asked about.', evidence: [{ kind: 'question' }] },
      ],
    },
  }),

  // Fees · cards — both versions answer correctly.
  scenario({
    id: 'eval-fees-cards-v1',
    topic: 'fees',
    question: 'Who handles annual fee reversals for retail credit cards?',
    answer: {
      text: 'Annual fee reversals for retail credit cards are handled by the Cards Service team.',
      citations: ['DOC-CRD-022'],
    },
    verification: {
      explanation: 'The claim matches the current Cards Servicing Handbook.',
      headline: 'Safe to use',
      retrieved: [],
      claims: [{ quote: 'Annual fee reversals for retail credit cards are handled by the Cards Service team', status: 'supported', check: 'groundedness', source: passageOf('DOC-CRD-022', '§7.2'), reason: 'Matches the handbook.' }],
      checks: [
        { id: 'groundedness', status: 'pass', short: 'Claim backed by policy', summary: '1 of 1 claims is supported.', evidence: [passageOf('DOC-CRD-022', '§7.2')] },
        { id: 'consistency', status: 'pass', short: 'No contradictions', summary: 'No contradiction with any approved document.', evidence: [passageOf('DOC-CRD-022', '§7.2')] },
        { id: 'intent', status: 'pass', short: 'Answers the question asked', summary: 'Names the team asked about.', evidence: [{ kind: 'question' }] },
      ],
    },
  }),
  scenario({
    id: 'eval-fees-cards-v2',
    topic: 'fees',
    question: 'Who handles annual fee reversals for retail credit cards?',
    answer: {
      text: 'The Cards Service team handles annual fee reversals for retail credit cards.',
      citations: ['DOC-CRD-022'],
    },
    verification: {
      explanation: 'The claim matches the current Cards Servicing Handbook.',
      headline: 'Safe to use',
      retrieved: [],
      claims: [{ quote: 'The Cards Service team handles annual fee reversals for retail credit cards', status: 'supported', check: 'groundedness', source: passageOf('DOC-CRD-022', '§7.2'), reason: 'Matches the handbook.' }],
      checks: [
        { id: 'groundedness', status: 'pass', short: 'Claim backed by policy', summary: '1 of 1 claims is supported.', evidence: [passageOf('DOC-CRD-022', '§7.2')] },
        { id: 'consistency', status: 'pass', short: 'No contradictions', summary: 'No contradiction with any approved document.', evidence: [passageOf('DOC-CRD-022', '§7.2')] },
        { id: 'intent', status: 'pass', short: 'Answers the question asked', summary: 'Names the team asked about.', evidence: [{ kind: 'question' }] },
      ],
    },
  }),

  // Collateral — no approved policy exists. v1 answers anyway; v2 declines.
  scenario({
    id: 'eval-collateral-crypto-v2',
    topic: 'collateral',
    question: 'Can an SME pledge crypto assets as collateral for a loan?',
    answer: {
      text: "I couldn't find an approved policy on accepting crypto or digital assets as collateral, so I can't confirm this. Refer the question to Business Banking Credit Risk before discussing it with the client.",
      citations: [],
    },
    verification: {
      explanation: 'The reply makes no policy claims. It says plainly that no approved policy covers this, which is what retrieval found.',
      headline: 'Declines — no policy exists',
      retrieved: [],
      claims: [],
      checks: DECLINE_CHECKS,
    },
  }),
  scenario({
    id: 'eval-collateral-gold-v1',
    topic: 'collateral',
    question: 'Can an SME pledge a gold ETF as collateral for a term loan?',
    answer: {
      text: 'Yes. Gold ETFs are accepted as collateral at a 30% haircut, and the units must be held in a bank custody account.',
      citations: [],
    },
    verification: {
      noSource: true,
      explanation: 'No approved document covers gold or ETF collateral, and the answer cites nothing. Both claims are unverified.',
      headline: 'No policy covers this',
      retrieved: [],
      search: { documentsSearched: 7, query: 'gold etf collateral haircut custody', topMatch: 0.17, threshold: 0.5 },
      claims: [
        { quote: 'Gold ETFs are accepted as collateral at a 30% haircut', status: 'no-source', check: 'groundedness', source: null, short: 'No policy on gold ETF collateral', reason: 'No source found. Retrieval returned no passage above the relevance threshold.' },
        { quote: 'the units must be held in a bank custody account', status: 'no-source', check: 'groundedness', source: null, short: 'Custody rule not found', reason: 'No source found. No approved document mentions custody accounts.' },
      ],
      checks: [
        { id: 'groundedness', status: 'fail', short: '0 of 2 claims backed', summary: '0 of 2 claims are supported. No approved passage was retrieved.', evidence: [{ kind: 'search' }] },
        { id: 'consistency', status: 'pass', short: 'No contradictions', summary: 'The answer does not contradict itself.', evidence: [{ kind: 'search' }] },
        { id: 'intent', status: 'pass', short: 'Answers the question asked', summary: 'The question asks whether gold ETFs are acceptable collateral. The answer addresses that.', evidence: [{ kind: 'question' }] },
      ],
    },
  }),
  scenario({
    id: 'eval-collateral-gold-v2',
    topic: 'collateral',
    question: 'Can an SME pledge a gold ETF as collateral for a term loan?',
    answer: {
      text: "I couldn't find an approved policy on accepting gold or ETF units as collateral, so I can't confirm this. Refer the question to Business Banking Credit Risk.",
      citations: [],
    },
    verification: {
      explanation: 'The reply makes no policy claims. It says plainly that no approved policy covers this, which is what retrieval found.',
      headline: 'Declines — no policy exists',
      retrieved: [],
      claims: [],
      checks: DECLINE_CHECKS,
    },
  }),
]

// Two questions per topic: the demo question, and one more. Deliberately
// weighted to known failure cases, so its rates run higher than Trends.
export const EVAL_SET = [
  { id: 'q-sme-limit', topic: 'sme', question: "What's the approval limit for a cross-border transfer under the SME lending policy?", answers: { v1: 'sme-limit', v2: 'eval-sme-limit-v2' } },
  { id: 'q-sme-cutoff', topic: 'sme', question: "What's the same-day processing cut-off for SME cross-border transfers?", answers: { v1: 'eval-sme-cutoff-v1', v2: 'eval-sme-cutoff-v2' } },
  { id: 'q-kyc-ubo', topic: 'kyc', question: 'What documents do I need to verify the beneficial owners of a new SME client?', answers: { v1: 'kyc-ubo', v2: 'eval-kyc-ubo-v2' } },
  { id: 'q-kyc-address', topic: 'kyc', question: "How recent must a beneficial owner's proof of address be?", answers: { v1: 'eval-kyc-address-v1', v2: 'eval-kyc-address-v2' } },
  { id: 'q-fx-override', topic: 'fx', question: 'Can I override the FX rate for a corporate client without approval?', answers: { v1: 'fx-override', v2: 'eval-fx-override-v2' } },
  { id: 'q-fx-approver', topic: 'fx', question: 'Who approves an FX rate override above 10 basis points?', answers: { v1: 'eval-fx-approver-v1', v2: 'eval-fx-approver-v2' } },
  { id: 'q-fees-waiver', topic: 'fees', question: 'Can a branch manager waive the annual fee on an SME business account?', answers: { v1: 'fees-waiver', v2: 'eval-fees-waiver-v2' } },
  { id: 'q-fees-cards', topic: 'fees', question: 'Who handles annual fee reversals for retail credit cards?', answers: { v1: 'eval-fees-cards-v1', v2: 'eval-fees-cards-v2' } },
  { id: 'q-collateral-crypto', topic: 'collateral', question: 'Can an SME pledge crypto assets as collateral for a loan?', answers: { v1: 'collateral-crypto', v2: 'eval-collateral-crypto-v2' } },
  { id: 'q-collateral-gold', topic: 'collateral', question: 'Can an SME pledge a gold ETF as collateral for a term loan?', answers: { v1: 'eval-collateral-gold-v1', v2: 'eval-collateral-gold-v2' } },
]

// ─── Reviewer outcomes, last 4 weeks (7 Sep – 4 Oct 2026) ──────────────────
// Every review is tagged with a decision and a root cause. Counts per topic
// add up to that topic's review volume in WEEKLY — a test enforces this.

export const REVIEW_OUTCOMES = [
  { topic: 'sme', decision: 'approved', category: 'none', docId: null, count: 31 },
  { topic: 'sme', decision: 'corrected', category: 'stale-source', docId: 'DOC-SME-087', count: 41 },
  { topic: 'sme', decision: 'corrected', category: 'other', docId: null, count: 11 },
  { topic: 'sme', decision: 'rejected', category: 'other', docId: null, count: 7 },
  { topic: 'kyc', decision: 'approved', category: 'none', docId: null, count: 22 },
  { topic: 'kyc', decision: 'corrected', category: 'other', docId: null, count: 5 },
  { topic: 'kyc', decision: 'rejected', category: 'other', docId: null, count: 1 },
  { topic: 'fx', decision: 'approved', category: 'none', docId: null, count: 30 },
  { topic: 'fx', decision: 'corrected', category: 'overstated-authority', docId: 'DOC-FX-019', count: 29 },
  { topic: 'fx', decision: 'corrected', category: 'other', docId: null, count: 9 },
  { topic: 'fx', decision: 'rejected', category: 'other', docId: null, count: 6 },
  { topic: 'fees', decision: 'approved', category: 'none', docId: null, count: 20 },
  { topic: 'fees', decision: 'corrected', category: 'off-intent', docId: 'DOC-OPS-045', count: 9 },
  { topic: 'fees', decision: 'corrected', category: 'stale-source', docId: 'DOC-OPS-045', count: 8 },
  { topic: 'fees', decision: 'corrected', category: 'other', docId: null, count: 5 },
  { topic: 'fees', decision: 'rejected', category: 'other', docId: null, count: 4 },
  { topic: 'collateral', decision: 'approved', category: 'none', docId: null, count: 6 },
  { topic: 'collateral', decision: 'corrected', category: 'other', docId: null, count: 12 },
  { topic: 'collateral', decision: 'rejected', category: 'no-source', docId: null, count: 42 },
]

// ─── Weekly reliability history, per topic (12 weeks) ──────────────────────
// Counts of scored answers and claims. Rates on the dashboard are computed
// from these counts in src/lib/metrics.js — never typed in separately.

export const WEEKS = ['13 Jul', '20 Jul', '27 Jul', '3 Aug', '10 Aug', '17 Aug', '24 Aug', '31 Aug', '7 Sep', '14 Sep', '21 Sep', '28 Sep']
export const WINDOW_WEEKS = 4 // "last 4 weeks" = 7 Sep – 4 Oct 2026

export const WEEKLY = {
  sme: {
    answers: [112, 104, 110, 109, 112, 117, 125, 114, 116, 112, 116, 137],
    claims: [325, 288, 311, 327, 330, 322, 353, 315, 340, 317, 334, 394],
    unsupported: [101, 81, 87, 91, 93, 100, 116, 99, 113, 95, 102, 128],
    conflicting: [13, 11, 13, 14, 13, 13, 14, 12, 14, 13, 12, 15],
    stale: [64, 60, 64, 70, 66, 67, 78, 62, 76, 73, 68, 88],
    noSource: [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3],
    reviews: [21, 20, 21, 19, 21, 23, 25, 21, 22, 22, 22, 24],
  },
  kyc: {
    answers: [173, 171, 162, 174, 178, 169, 193, 177, 186, 167, 173, 178],
    claims: [533, 529, 527, 519, 572, 535, 570, 550, 561, 520, 511, 527],
    unsupported: [48, 42, 43, 36, 39, 36, 39, 31, 32, 28, 24, 23],
    conflicting: [6, 6, 6, 6, 6, 5, 6, 5, 5, 5, 4, 4],
    stale: [16, 14, 14, 15, 15, 13, 14, 12, 13, 11, 11, 10],
    noSource: [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
    reviews: [7, 7, 7, 7, 8, 7, 8, 8, 7, 7, 7, 7],
  },
  fx: {
    answers: [77, 74, 75, 75, 74, 79, 72, 72, 77, 72, 84, 84],
    claims: [192, 191, 201, 196, 190, 209, 178, 181, 204, 179, 216, 226],
    unsupported: [24, 23, 24, 23, 19, 20, 17, 16, 19, 15, 18, 19],
    conflicting: [27, 29, 27, 28, 24, 27, 22, 19, 22, 18, 20, 22],
    stale: [6, 6, 5, 6, 6, 6, 5, 5, 6, 5, 5, 5],
    noSource: [1, 1, 1, 2, 2, 2, 1, 1, 2, 1, 2, 2],
    reviews: [18, 17, 19, 17, 19, 18, 18, 17, 18, 18, 19, 19],
  },
  fees: {
    answers: [103, 87, 90, 90, 103, 95, 104, 97, 106, 97, 100, 102],
    claims: [248, 200, 211, 219, 251, 232, 261, 237, 257, 243, 229, 243],
    unsupported: [26, 20, 21, 22, 24, 22, 23, 22, 24, 21, 20, 21],
    conflicting: [7, 6, 6, 7, 7, 7, 7, 7, 7, 7, 6, 6],
    stale: [28, 23, 24, 26, 35, 33, 38, 35, 41, 36, 40, 41],
    noSource: [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
    reviews: [12, 10, 10, 10, 12, 10, 12, 10, 13, 10, 11, 12],
  },
  collateral: {
    answers: [38, 34, 36, 38, 35, 38, 36, 42, 38, 42, 43, 40],
    claims: [87, 73, 80, 80, 81, 80, 81, 97, 83, 96, 94, 90],
    unsupported: [35, 33, 35, 34, 32, 34, 31, 38, 30, 34, 35, 35],
    conflicting: [2, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
    stale: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    noSource: [12, 12, 11, 13, 11, 13, 13, 13, 13, 14, 15, 13],
    reviews: [14, 12, 14, 15, 12, 13, 13, 15, 14, 15, 16, 15],
  },
}

// Demo identities. Synthetic roles, not real people.
export const PEOPLE = {
  employee: { name: 'You', role: 'Relationship Manager · Business Banking', initials: 'RM' },
  reviewer: { name: 'Policy Reviewer', role: 'Business Banking Credit Risk', initials: 'PR' },
}
