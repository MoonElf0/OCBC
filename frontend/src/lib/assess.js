/**
 * Assemble a full verification result: computed rule checks + the judge's
 * scripted verdicts + a computed score. Pure, so tests and the UI agree.
 */
import { SCENARIOS, FALLBACK, CORRECTIONS } from '../fixtures'
import { CHECKS, bandFor } from './status'
import { citationCheck, freshnessCheck, crossrefCheck } from './rules'

const ALL = [...SCENARIOS, FALLBACK, ...Object.values(CORRECTIONS)]

export function scenarioById(id) {
  return ALL.find((s) => s.id === id) ?? FALLBACK
}

// Score formula. Visible to the user in the checks view.
export const SCORE_MODEL = {
  claimWeight: 60,
  checkWeight: 40,
  cap: 95,
  claimCredit: { supported: 1, stale: 0.6, 'off-intent': 0.6, unsupported: 0, conflicting: 0, 'no-source': 0 },
  noSourceCap: 10,
  checkCredit: { pass: 1, warning: 0.5, fail: 0 },
}

export function scoreOf(claims, checks) {
  if (!claims.length) return { score: null, parts: null }
  const m = SCORE_MODEL
  const claimShare = claims.reduce((t, c) => t + m.claimCredit[c.status], 0) / claims.length
  const counted = checks.filter((c) => c.status in m.checkCredit)
  const checkShare = counted.reduce((t, c) => t + m.checkCredit[c.status], 0) / counted.length
  const claimPts = claimShare * m.claimWeight
  const checkPts = checkShare * m.checkWeight
  // When retrieval found nothing for any claim, passing checks prove little.
  const allNoSource = claims.every((c) => c.status === 'no-source')
  const cap = allNoSource ? m.noSourceCap : m.cap
  return {
    score: Math.min(cap, Math.round(claimPts + checkPts)),
    parts: { claimPts: Math.round(claimPts), checkPts: Math.round(checkPts), capped: claimPts + checkPts > cap, cap, counted: counted.length },
  }
}

/**
 * @param {string} scenarioId
 * @param {{ question?: string }} opts  question as the employee typed it
 */
export function assess(scenarioId, { question } = {}) {
  const sc = scenarioById(scenarioId)
  const v = sc.verification
  const paraphrased = question && sc.question && question.trim() !== sc.question
  const judge = Object.fromEntries(v.checks.map((c) => [c.id, c]))
  if (paraphrased && judge.intent) {
    // The prototype matched free text to a scripted question. Say so rather than
    // pretending the scripted intent verdict applies to what was actually asked.
    judge.intent = {
      id: 'intent',
      status: 'warning',
      summary: `Your question was matched to the scripted question “${sc.question}”. The answer may not address exactly what you asked.`,
      evidence: [{ kind: 'question' }],
    }
  }
  const rule = {
    citation: citationCheck(sc.answer, v.claims),
    freshness: freshnessCheck(sc.answer, v.claims),
    crossref: crossrefCheck(sc.answer, v.claims),
  }
  const checks = CHECKS.map((meta) => rule[meta.id] ?? judge[meta.id])
  const { score, parts } = scoreOf(v.claims, checks)
  return { ...v, checks, score, parts, band: bandFor(score), matchedQuestion: paraphrased ? sc.question : null }
}
