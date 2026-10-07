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
} from 'lucide-react'
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
  'no-source': { label: 'No source found', tone: 'unknown', Icon: CircleSlash },
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
  { id: 'citation', name: 'Citation verification', question: 'Do the cited documents exist, and do they say what the answer claims?', method: 'rule', ms: 200 },
  { id: 'freshness', name: 'Freshness', question: 'Is each source current, or superseded or overdue for review?', method: 'rule', ms: 180 },
  { id: 'crossref', name: 'Cross-referencing', question: 'Does the answer match the approved sources on the same point?', method: 'rule', ms: 220 },
  { id: 'groundedness', name: 'Groundedness', question: 'Is each claim supported by a retrieved source passage?', method: 'judge', ms: 320 },
  { id: 'consistency', name: 'Consistency', question: 'Does the answer contradict itself or another approved document?', method: 'judge', ms: 270 },
  { id: 'intent', name: 'Intent alignment', question: 'Did it answer the question asked, or a nearby one?', method: 'judge', ms: 260 },
]

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
