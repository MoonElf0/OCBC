// Challenger Agent: a second, adversarial system that tries to disprove the
// answer before any human sees it. Scripted for the demo (see fixtures note);
// the shape mirrors what a real pipeline would return.
// finding = the conflicting / edge-case passage it dug up (null = none found).
// options  = the clarification prompt sent back to the employee in-chat.
const S = (docId, section) => ({ docId, section })
export const CHALLENGES = {
  'sme-limit': {
    searched: 6,
    finding: S('DOC-SME-112', '§3.1'),
    summary: 'The answer’s SGD 250,000 limit conflicts with the current Cross-Border Payments Standard (SGD 200,000, effective May 2026).',
    question: 'Is the transfer you want to approve above SGD 200,000?',
    options: [
      { label: 'No, SGD 200,000 or less', title: 'Resolved in chat · no reviewer needed', text: 'You can approve it as a relationship manager. The correct limit is SGD 200,000 (Cross-Border Payments Standard §3.1), not SGD 250,000. Amounts up to that are within your authority.' },
      { label: 'Yes, above SGD 200,000', title: 'Auto-corrected · no reviewer needed', text: 'It exceeds your authority. A relationship manager may approve up to SGD 200,000 only, so this needs Business Banking Credit Committee approval before release (SME Lending Policy §5.2).' },
    ],
  },
  'fx-override': {
    searched: 5,
    finding: S('DOC-FX-019', '§2.2'),
    summary: 'Edge case: the answer does not say what happens when the override passes the relationship manager’s authority.',
    question: 'Is the override you plan to apply more than 10 basis points?',
    options: [
      { label: 'No, 10 bps or less', title: 'Resolved in chat · no reviewer needed', text: 'Within your authority (FX Rate Override Guidelines §2.1). Record it in the deal ticket with a reason code (§3.1).' },
      { label: 'Yes, more than 10 bps', title: 'Clarified · no reviewer needed', text: 'Prior approval from the Treasury desk head is required first (§2.2). Then record it in the deal ticket with a reason code.' },
    ],
  },
  'fees-waiver': {
    searched: 5,
    finding: S('DOC-OPS-045', 'Row 4'),
    summary: 'Edge case: the authority matrix has a second tier above SGD 500, and the matrix itself is past its review date.',
    question: 'Is the waiver more than SGD 500 per account this year?',
    options: [
      { label: 'No, SGD 500 or less', title: 'Clarified · confirm the matrix is current', text: 'A branch manager can waive it (Row 3). This matrix is overdue for review, so confirm with Branch Operations before relying on it.' },
      { label: 'Yes, above SGD 500', title: 'Clarified · confirm the matrix is current', text: 'It needs area head approval (Row 4). This matrix is overdue for review, so confirm with Branch Operations before relying on it.' },
    ],
  },
  'kyc-ubo': { searched: 4, finding: null, summary: 'Searched 4 documents and 3 edge-case conditions. Nothing contradicts this answer.' },
}

/**
 * The Challenger can clarify an answer for the employee, but it never
 * replaces a mandatory review. When review is required, its outcome titles
 * say so instead of "no reviewer needed".
 */
export function clarification(option, reviewRequired) {
  if (!reviewRequired) return { title: option.title, footer: 'Answering here settles it in the chat, so it does not join the reviewer queue.' }
  const head = option.title.split(' · ')[0]
  return { title: `${head} · reviewer still required`, footer: 'Answering here clarifies it for you. This answer still needs a reviewer’s decision before anyone relies on it.' }
}
