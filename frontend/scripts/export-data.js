/**
 * Exports the scripted fixtures, and the results the JS code computes from
 * them, as JSON for the Python backend.
 *
 *   backend/data/fixtures.json  — the data itself (single source of truth
 *                                 stays src/fixtures/index.js)
 *   backend/data/golden.json    — what assess() and metrics.js produce today;
 *                                 the backend's parity tests compare against it
 *
 * Built by scripts/export-fixtures.mjs (npm run export:fixtures). A vitest
 * test fails if the committed files are stale.
 */
import * as F from '../src/fixtures/index.js'
import { assess, SCORE_MODEL } from '../src/lib/assess.js'
import { CHECKS } from '../src/lib/status.js'
import { overallStats, weeklySeries, topicTable, recommendations } from '../src/lib/metrics.js'
import { compareVersions } from '../src/lib/evaluation.js'

// A paraphrase per scenario, so the free-text path is covered too.
const PARAPHRASE = 'free text question that is not the scripted one'

// One reviewer decision per kind, so the "· N today" path is covered.
export const SAMPLE_LIVE_DECISIONS = [
  { id: 'RQ-9001', topic: 'sme', docId: 'DOC-SME-087', decision: 'corrected', category: 'stale-source' },
  { id: 'RQ-9002', topic: 'collateral', docId: null, decision: 'rejected', category: 'no-source' },
  { id: 'RQ-9003', topic: 'fx', docId: 'DOC-FX-019', decision: 'corrected', category: 'overstated-authority' },
]

const json = (x) => JSON.stringify(x, null, 2) + '\n'

export function buildFixtures() {
  return json({
    DEMO_TODAY: F.DEMO_TODAY,
    DOCUMENTS: F.DOCUMENTS,
    TOPICS: F.TOPICS,
    BANDS: F.BANDS,
    SCENARIOS: F.SCENARIOS,
    FALLBACK: F.FALLBACK,
    CORRECTIONS: F.CORRECTIONS,
    REVIEW_QUEUE_SEED: F.REVIEW_QUEUE_SEED,
    REVIEW_HINTS: F.REVIEW_HINTS,
    REVIEW_OUTCOMES: F.REVIEW_OUTCOMES,
    WEEKS: F.WEEKS,
    WINDOW_WEEKS: F.WINDOW_WEEKS,
    WEEKLY: F.WEEKLY,
    PEOPLE: F.PEOPLE,
    AGENT_VERSIONS: F.AGENT_VERSIONS,
    EVAL_ANSWERS: F.EVAL_ANSWERS,
    EVAL_SET: F.EVAL_SET,
    CHECKS: CHECKS.map(({ id, name, question, method, ms }) => ({ id, name, question, method, ms })),
    SCORE_MODEL,
  })
}

export function buildGolden() {
  const ids = [...F.SCENARIOS, F.FALLBACK, ...Object.values(F.CORRECTIONS), ...F.EVAL_ANSWERS].map((s) => s.id)
  return json({
    assess: Object.fromEntries(ids.map((id) => [id, assess(id)])),
    assessParaphrased: Object.fromEntries(F.SCENARIOS.map((s) => [s.id, assess(s.id, { question: PARAPHRASE })])),
    paraphrase: PARAPHRASE,
    metrics: {
      overall: { last: overallStats('last'), prev: overallStats('prev') },
      series: weeklySeries(),
      topics: topicTable(),
      recommendations: recommendations(),
      recommendationsWithLive: recommendations(SAMPLE_LIVE_DECISIONS),
      sampleLiveDecisions: SAMPLE_LIVE_DECISIONS,
    },
    evaluation: compareVersions(),
  })
}
