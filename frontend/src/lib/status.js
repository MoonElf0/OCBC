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
  Vault,
  MessageCircleQuestion,
  Quote,
  Layers,
  Anchor,
  Scale,
  Target,
  CircleDashed,
  SearchX,
  Inbox,
  Pencil,
  Ban,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react'

export const CHECK_ICON = { citation: Quote, freshness: Clock, crossref: Layers, groundedness: Anchor, consistency: Scale, intent: Target }

export const TOPIC_ICON = { sme: Building2, kyc: IdCard, fx: ArrowLeftRight, fees: Receipt, collateral: Vault }
export const topicIcon = (topic) => TOPIC_ICON[topic] ?? MessageCircleQuestion
import { BANDS } from '../fixtures'

// Plural-safe labels for counts, e.g. '2 on stale sources'.
export const CLAIM_COUNT_LABEL = { supported: 'supported', unsupported: 'unsupported', conflicting: 'conflicting', stale: 'on stale sources', 'off-intent': 'off the question', 'no-source': 'with no source found', insufficient: 'without approved evidence', unassessed: 'not checked' }

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
  insufficient: { label: 'Insufficient evidence', tone: 'unknown', Icon: SearchX },
  unassessed: { label: 'Not checked', tone: 'unknown', Icon: CircleDashed },
}

export const CHECK_STATUS = {
  pass: { label: 'Pass', tone: 'verified', Icon: CircleCheck },
  warning: { label: 'Warning', tone: 'caution', Icon: TriangleAlert },
  fail: { label: 'Fail', tone: 'unsupported', Icon: CircleX },
  na: { label: 'N/A', tone: 'unknown', Icon: CircleSlash },
  unavailable: { label: 'Not run', tone: 'unknown', Icon: CircleDashed },
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
  'low-confidence': { label: 'Low reliability index', tone: 'unsupported', Icon: CircleX },
  conflicting: { label: 'Conflicting evidence', tone: 'unsupported', Icon: GitCompareArrows },
  unsupported: { label: 'Unsupported claim', tone: 'unsupported', Icon: CircleX },
  'no-source': { label: 'Insufficient evidence', tone: 'unknown', Icon: CircleSlash },
  stale: { label: 'Stale source', tone: 'caution', Icon: Clock },
  'high-stakes': { label: 'High-risk topic', tone: 'unknown', Icon: TriangleAlert },
  partial: { label: 'Partial assessment', tone: 'unknown', Icon: CircleDashed },
  'evidence-changed': { label: 'Evidence changed', tone: 'caution', Icon: RefreshCw },
  employee: { label: 'Escalated by employee', tone: 'unknown', Icon: CircleHelp },
  paraphrased: { label: 'Free-text question', tone: 'unknown', Icon: CircleHelp },
}

// Where an answer is in its life. Every state says what has to happen next.
export const ANSWER_STATES = {
  verifying: { label: 'Under verification', tone: 'unknown', Icon: LoaderCircle, next: 'Assessment AI is checking the answer. Wait for the result before using it.' },
  'review-required': { label: 'Review required', tone: 'caution', Icon: Inbox, next: 'A reviewer must approve, correct or reject this answer before anyone relies on it.' },
  cleared: { label: 'No review required', tone: 'unknown', Icon: ShieldCheck, next: 'No review rule applies. Check the flags and sources before acting.' },
  approved: { label: 'Approved', tone: 'verified', Icon: CircleCheck, next: 'A reviewer approved this answer.' },
  corrected: { label: 'Corrected', tone: 'verified', Icon: Pencil, next: 'Use the reviewer’s corrected answer, not the original.' },
  rejected: { label: 'Rejected', tone: 'unsupported', Icon: Ban, next: 'Do not use this answer.' },
  'reverify-required': { label: 'Evidence changed · re-verification required', tone: 'caution', Icon: RefreshCw, next: 'A policy this answer relied on has a new version. Re-verify it before relying on it.' },
}
