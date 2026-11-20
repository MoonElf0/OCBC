import {
  CircleCheck,
  CircleX,
  TriangleAlert,
  Clock,
  CircleHelp,
  GitCompareArrows,
  Shuffle,
  LoaderCircle,
  CircleSlash,
  Building2,
  IdCard,
  ArrowLeftRight,
  Receipt,
  Coins,
  SearchX,
  MessageCircleQuestion,
  Quote,
  Layers,
  Anchor,
  Scale,
  Target,
  Pencil,
  Ban,
} from 'lucide-react'

export const CHECK_ICON = { citation: Quote, freshness: Clock, crossref: Layers, groundedness: Anchor, consistency: Scale, intent: Target }

export const TOPIC_ICON = { sme: Building2, kyc: IdCard, fx: ArrowLeftRight, fees: Receipt, collateral: Coins }
export const topicIcon = (topic) => TOPIC_ICON[topic] ?? MessageCircleQuestion
import { BANDS } from '../fixtures'

// Plural-safe labels for counts, e.g. '2 on stale sources'.
export const CLAIM_COUNT_LABEL = { supported: 'supported', unsupported: 'unsupported', conflicting: 'conflicting', stale: 'on stale sources', 'off-intent': 'off the question', 'no-source': 'with no source found' }

// Every status carries an icon and a text label as well as a colour.
// Tailwind needs literal class names, so each tone spells its classes out.
export const TONES = {
  verified: { text: 'text-status-verified', surface: 'bg-status-verified-surface', border: 'border-status-verified', fill: 'bg-status-verified' },
  caution: { text: 'text-status-caution', surface: 'bg-status-caution-surface', border: 'border-status-caution', fill: 'bg-status-caution' },
  unsupported: { text: 'text-status-unsupported', surface: 'bg-status-unsupported-surface', border: 'border-status-unsupported', fill: 'bg-status-unsupported' },
  unknown: { text: 'text-status-unknown', surface: 'bg-bone', border: 'border-status-unknown', fill: 'bg-status-unknown' },
}

export const CLAIM_STATUS = {
  supported: { label: 'Supported', tone: 'verified', Icon: CircleCheck },
  unsupported: { label: 'Unsupported', tone: 'unsupported', Icon: CircleX },
  conflicting: { label: 'Conflicting', tone: 'unsupported', Icon: GitCompareArrows },
  stale: { label: 'Stale source', tone: 'caution', Icon: Clock },
  'off-intent': { label: 'Off the question', tone: 'caution', Icon: Shuffle },
  'no-source': { label: 'No source found', tone: 'unsupported', Icon: SearchX },
}

export const CHECK_STATUS = {
  pass: { label: 'Pass', tone: 'verified', Icon: CircleCheck },
  warning: { label: 'Warning', tone: 'caution', Icon: TriangleAlert },
  fail: { label: 'Fail', tone: 'unsupported', Icon: CircleX },
  na: { label: 'N/A', tone: 'unknown', Icon: CircleSlash },
  running: { label: 'Checking', tone: 'unknown', Icon: LoaderCircle },
  queued: { label: 'Queued', tone: 'unknown', Icon: CircleHelp },
}

// Resolve order is deliberate: fast rule-based checks first, judge checks after.
export const CHECKS = [
  { id: 'citation', name: 'Citation accuracy', question: 'Do the cited documents exist, and do they say what the answer claims?', method: 'rule', ms: 260 },
  { id: 'freshness', name: 'Freshness', question: 'Is each source current, or superseded or overdue for review?', method: 'rule', ms: 240 },
  { id: 'crossref', name: 'Source quality', question: 'Do the sources used agree with the current approved policy on the same point?', method: 'rule', ms: 280 },
  { id: 'groundedness', name: 'Groundedness', question: 'Is each claim supported by a retrieved source passage?', method: 'judge', ms: 420 },
  { id: 'consistency', name: 'Consistency', question: 'Does the answer contradict itself or another approved document?', method: 'judge', ms: 340 },
  { id: 'intent', name: 'Relevance & intent', question: 'Did it answer the question asked, or a nearby one?', method: 'judge', ms: 320 },
]

// Order the six checks are shown in the verify pane.
// Same as the run order, so boxes fill in top to bottom.
export const CHECK_DISPLAY_ORDER = CHECKS.map((c) => c.id)

// What the employee should do at each score band.
export const VERDICT = {
  high: { tag: 'Trusted', action: 'Safe to use', range: '80-100' },
  medium: { tag: 'Check sources', action: 'Confirm before acting', range: '50-79' },
  low: { tag: 'Human review', action: 'Do not act yet', range: '0-49' },
  none: { tag: 'Nothing to score', action: 'No policy claims', range: '' },
}

// Severity of each claim status, worst first. Drives sort order and the legend.
export const SEVERITY = [
  { id: 'wrong', label: 'Wrong', tone: 'unsupported', Icon: CircleX, statuses: ['conflicting', 'unsupported'] },
  { id: 'nosource', label: 'No source', tone: 'unsupported', Icon: SearchX, statuses: ['no-source'] },
  { id: 'check', label: 'Check', tone: 'caution', Icon: TriangleAlert, statuses: ['stale', 'off-intent'] },
  { id: 'correct', label: 'Correct', tone: 'verified', Icon: CircleCheck, statuses: ['supported'] },
]
export const severityFor = (status) => SEVERITY.find((s) => s.statuses.includes(status))
export const severityOf = (status) => SEVERITY.findIndex((s) => s.statuses.includes(status))

export const OUTCOME_META = {
  approved: { label: 'Approved by reviewer', tone: 'verified', Icon: CircleCheck },
  corrected: { label: 'Corrected by reviewer', tone: 'verified', Icon: Pencil },
  rejected: { label: 'Rejected by reviewer · do not use', tone: 'unsupported', Icon: Ban },
}

export const METHOD_LABEL = {
  rule: 'Rule-based check',
  judge: 'LLM judge · must cite a passage',
}

export function bandFor(score) {
  if (score == null) return { id: 'none', label: 'Not scored', status: 'unknown' }
  return BANDS.find((b) => score >= b.min)
}

export const BAND_ICON = {
  verified: CircleCheck,
  caution: TriangleAlert,
  unsupported: CircleX,
  unknown: CircleHelp,
}

export const REASONS = {
  'low-confidence': { label: 'Low confidence', tone: 'unsupported', Icon: CircleX },
  conflicting: { label: 'Conflicting claim', tone: 'unsupported', Icon: GitCompareArrows },
  unsupported: { label: 'Unsupported claim', tone: 'unsupported', Icon: CircleX },
  'no-source': { label: 'No source found', tone: 'unknown', Icon: CircleSlash },
  stale: { label: 'Stale source', tone: 'caution', Icon: Clock },
  'high-stakes': { label: 'High-stakes topic', tone: 'unknown', Icon: TriangleAlert },
  employee: { label: 'Escalated by employee', tone: 'unknown', Icon: CircleHelp },
  paraphrased: { label: 'Free-text question', tone: 'unknown', Icon: CircleHelp },
}
