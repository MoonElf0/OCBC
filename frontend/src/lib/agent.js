/**
 * The answering agent — a separate system from Assessment AI.
 *
 * Deliberately minimal: it matches the employee's question against the
 * scripted fixture set and returns that scenario's answer. It is meant to be
 * wrong some of the time so the verifier has something to catch. A real
 * retrieval agent would replace `ask` behind the same return shape.
 */
import { SCENARIOS, FALLBACK } from '../fixtures'
import { BACKEND, api } from './backend'

const normalise = (s) => s.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9%' -]+/g, ' ')

// Whole words only, so "whether" never matches "ether".
const has = (text, term) => new RegExp(`(^|[^a-z0-9])${term.replace(/[-]/g, '\\-')}([^a-z0-9]|$)`).test(text)

export function matchScenario(input) {
  const text = normalise(input)
  // Exact question text (from a suggested prompt) always wins.
  const exact = SCENARIOS.find((s) => normalise(s.question).trim() === text.trim())
  if (exact) return exact
  // Free text needs a topic-specific term plus context. Weak matches fall
  // back rather than guess.
  let best = null
  let bestScore = 0
  for (const s of SCENARIOS) {
    if (s.excludes?.some((k) => has(text, k))) continue // a product this scenario doesn't cover
    const score = s.strong.reduce((sum, k) => (has(text, k) ? sum + 3 : sum), 0) + s.keywords.reduce((sum, k) => (has(text, k) ? sum + 1 : sum), 0)
    if (score > bestScore) {
      best = s
      bestScore = score
    }
  }
  return bestScore >= 4 ? best : FALLBACK
}

/**
 * In backend mode the server's agent answers and stores the answer (answerId).
 * @returns {Promise<{ answerId?: string, scenarioId: string, text: string, citations: string[] }>}
 */
export async function ask(question) {
  if (BACKEND) return api.ask(question)
  const s = matchScenario(question)
  return { scenarioId: s.id, text: s.answer.text, citations: s.answer.citations }
}

/**
 * Streams text in small, slightly irregular chunks so it reads as generated.
 * Returns a cancel function.
 */
export function streamText(text, onChunk, onDone) {
  let i = 0
  let timer
  const tick = () => {
    // Word-ish chunks of 5–9 chars, with a short pause after punctuation.
    const step = 5 + Math.floor(Math.random() * 5)
    i = Math.min(text.length, i + step)
    onChunk(i)
    if (i >= text.length) return onDone()
    const pause = /[.,]/.test(text[i - 1]) ? 50 : 10 + Math.random() * 8
    timer = setTimeout(tick, pause)
  }
  timer = setTimeout(tick, 60)
  return () => clearTimeout(timer)
}
