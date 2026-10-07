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

export { scenarioById } from './assess'

/**
 * @param {string} scenarioId
 * @param {{ question?: string, onCheckStart(i), onCheckDone(i, check), onComplete(result) }} handlers
 * @returns {() => void} cancel
 */
export function verify(scenarioId, { question, onCheckStart, onCheckDone, onComplete }) {
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
