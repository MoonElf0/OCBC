/**
 * Assessment AI verification pipeline — DEMO PLAYBACK.
 *
 * The result itself is assembled for real in assess.js: rule-based checks
 * and the score are computed; the judge verdicts come from fixtures. What is
 * staged here is only the timing — each check shows a short working state,
 * then settles, in the order a real pipeline would finish them. The callback
 * shape is what a live pipeline would emit, so this file can be replaced
 * without UI changes.
 */
import { CHECKS } from './status'
import { assess } from './assess'
import { BACKEND, api } from './backend'

export { scenarioById } from './assess'

/**
 * In backend mode the same callbacks are driven by the server's event stream
 * (GET /api/answers/:id/verify); onCheckDone may also carry the claims, and
 * onComplete the routing decision the server made.
 *
 * @param {string} scenarioId
 * @param {{ answerId?: string, question?: string, onCheckStart(i), onCheckDone(i, check, claims?), onComplete(result, routed?), onError?() }} handlers
 * @returns {() => void} cancel
 */
export function verify(scenarioId, { answerId, question, onCheckStart, onCheckDone, onComplete, onError }) {
  if (BACKEND) return api.verify(answerId, { onCheckStart, onCheckDone, onComplete, onError })
  const result = assess(scenarioId, { question })
  const timers = []
  let at = 100
  CHECKS.forEach((meta, i) => {
    timers.push(setTimeout(() => onCheckStart(i), at))
    // Small jitter so takes never look identical.
    at += meta.ms + Math.round(Math.random() * 50)
    timers.push(setTimeout(() => onCheckDone(i, result.checks[i]), at))
  })
  timers.push(setTimeout(() => onComplete(result), at + 120))
  return () => timers.forEach(clearTimeout)
}
