// How each claim was traced: shared by the Trust Map and the printed Trust Report.
// Plain derivations over the verification result — nothing here is scored or judged.
import { CircleCheck, TriangleAlert, CircleX, Layers, GitCompareArrows, CircleSlash } from 'lucide-react'
import { documentById } from './library'
import { freshnessOf } from './freshness'
import { scenarioById } from './pipeline'

/** Normalise a chat message or a review item into one shape. */
export const traceOfMessage = (m) => ({ ref: m.routed?.queueId ?? null, question: m.question, text: m.text, citations: m.citations ?? [], scenarioId: m.scenarioId, result: m.result })
export const traceOfReview = (item, sc, v) => ({ ref: item.id, question: sc.question, text: sc.answer.text, citations: sc.answer.citations ?? [], scenarioId: sc.id, result: v })

export const retrievedOf = (a) => a.result.retrieved ?? scenarioById(a.scenarioId).verification.retrieved ?? []

export const sectionOf = (docId, sectionId) => documentById(docId).sections.find((s) => s.id === sectionId)

// Green = recent, yellow = 6+ months since ratification (review pending), red = superseded or overdue.
export const FRESHNESS_KEY = [
  { tone: 'verified', Icon: CircleCheck, label: 'Recently ratified' },
  { tone: 'caution', Icon: TriangleAlert, label: 'Review pending · 6+ months' },
  { tone: 'unsupported', Icon: CircleX, label: 'Outdated or superseded' },
]

export function freshnessTrace(docId) {
  const f = freshnessOf(docId)
  const d = documentById(docId)
  const tone = f.stale ? 'unsupported' : f.months >= 6 ? 'caution' : 'verified'
  const label = f.state === 'superseded' ? 'Outdated · superseded' : f.state === 'overdue' ? 'Outdated · review overdue' : f.months >= 6 ? 'Review pending' : 'Recently ratified'
  const pct = Math.min(100, Math.round((f.months / d.reviewCycleMonths) * 100))
  return { f, d, tone, label, pct, Icon: FRESHNESS_KEY.find((k) => k.tone === tone).Icon }
}

export function dependencyTrace(c, a) {
  if (!c.source) return { tone: 'unknown', label: 'No source', Icon: CircleSlash, text: 'Nothing in the approved library backs this claim.' }
  if (c.counter) return { tone: 'unsupported', label: 'Conflicting sources', Icon: GitCompareArrows, text: `The claim conflicts with ${documentById(c.counter.docId).title} ${c.counter.section}.` }
  if (a.citations.includes(c.source.docId) && retrievedOf(a).includes(c.source.docId)) return { tone: 'verified', label: 'Cross-validated', Icon: Layers, text: 'The agent cited it and the verifier retrieved it independently.' }
  return { tone: 'caution', label: 'Single-source dependency', Icon: Layers, text: 'Only one document backs this claim. If it changes, the claim fails.' }
}

/** Who pointed at this document: the answering agent, the verifier, or both. */
export const provenance = (docId, a) => ({ cited: a.citations.includes(docId), retrieved: retrievedOf(a).includes(docId) })

// Amounts, rates and times — the parts of a passage two sources can disagree on.
// The lookbehind skips the digits inside document ids such as DOC-SME-087.
const FIGURE = /(?<![-\w])(?:SGD\s?)?\d[\d,]*(?:\.\d+)?(?:\s?(?:basis points|bps|%|pm|am|months?|days?))?/gi

const figuresIn = (text) => new Set((text.match(FIGURE) ?? []).map((x) => x.toLowerCase()))

/**
 * Split a passage into parts, marking figures: in the passage the claim relies on,
 * the figures the claim repeats; in a contradicting passage, the figures it doesn't.
 */
export function markFigures(text, claimText, { contradicting }) {
  const claimed = figuresIn(claimText)
  const parts = []
  let cursor = 0
  for (const m of text.matchAll(FIGURE)) {
    if (claimed.has(m[0].toLowerCase()) === contradicting) continue
    if (m.index > cursor) parts.push({ text: text.slice(cursor, m.index) })
    parts.push({ text: m[0], diff: true })
    cursor = m.index + m[0].length
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor) })
  return parts
}
