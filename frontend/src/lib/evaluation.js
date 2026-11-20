/**
 * Agent release check. The same verifier scores agent v1 and agent v2 on one
 * fixed test set (EVAL_SET); everything here is computed from those
 * verification results, never typed in.
 *
 * Python port: backend/app/evaluation.py (parity-tested against golden.json).
 * Backend mode runs the live verifier over the same answers and feeds its
 * results through the same comparison.
 */
import { AGENT_VERSIONS, EVAL_SET, TOPICS, DOCUMENTS } from '../fixtures'
import { assess, scenarioById } from './assess'
import { freshnessOf } from './freshness'

// How serious a flag is, for deciding whether an answer got better or worse.
export const SEVERITY = { supported: 0, stale: 1, 'off-intent': 1, unsupported: 2, 'no-source': 2, conflicting: 3 }

/** What the comparison needs from one verification result. */
export function summarise(result) {
  const flags = result.claims.filter((c) => c.status !== 'supported')
  return {
    score: result.score,
    band: result.band.id,
    claims: result.claims.length,
    flags: flags.map((c) => ({ id: c.id, status: c.status, short: c.short ?? null, docId: c.source?.docId ?? null })),
    declined: result.claims.length === 0,
    worst: flags.reduce((w, c) => Math.max(w, SEVERITY[c.status]), 0),
  }
}

/** Claim and answer counts for a set of answers, with rates computed from them. */
export function tally(answers) {
  const n = (status) => answers.reduce((t, a) => t + a.flags.filter((f) => f.status === status).length, 0)
  const claims = answers.reduce((t, a) => t + a.claims, 0)
  const c = {
    answers: answers.length,
    claims,
    flagged: answers.reduce((t, a) => t + a.flags.length, 0),
    unsupported: n('unsupported'),
    conflicting: n('conflicting'),
    stale: n('stale'),
    offIntent: n('off-intent'),
    noSource: n('no-source'),
    declined: answers.filter((a) => a.declined).length,
    high: answers.filter((a) => a.band === 'high').length,
    withoutSource: answers.filter((a) => a.flags.some((f) => f.status === 'no-source')).length,
  }
  // Rates are per claim; a version that declines makes no claims, so they can be null.
  const rate = (x) => (claims ? x / claims : null)
  return { ...c, flagRate: rate(c.flagged), failureRate: rate(c.unsupported + c.conflicting + c.noSource), staleRate: rate(c.stale) }
}

/** Did the candidate's answer get better or worse than the baseline's? */
export function changeOf(base, cand) {
  if (cand.flags.length > base.flags.length || cand.worst > base.worst) return 'regressed'
  if (base.flags.length && !cand.flags.length) return 'fixed'
  if (cand.flags.length < base.flags.length || cand.worst < base.worst) return 'improved'
  return 'unchanged'
}

function topicVerdict(changes) {
  if (changes.includes('regressed')) return 'regressed'
  if (changes.some((c) => c === 'fixed' || c === 'improved')) return 'improved'
  return 'unchanged'
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/**
 * @param {(scenarioId: string) => object} resultOf  verification result per answer
 * @param {(docId: string) => object} freshness      freshness of a document
 */
export function compareVersions(resultOf = assess, freshness = freshnessOf) {
  const [base, cand] = AGENT_VERSIONS
  const questions = EVAL_SET.map((q) => {
    const b = summarise(resultOf(q.answers[base.id]))
    const c = summarise(resultOf(q.answers[cand.id]))
    return { id: q.id, topic: q.topic, question: q.question, baseId: q.answers[base.id], candidateId: q.answers[cand.id], base: b, candidate: c, change: changeOf(b, c) }
  })

  const topics = Object.values(TOPICS).map((t) => {
    const qs = questions.filter((q) => q.topic === t.id)
    return { id: t.id, name: t.name, questions: qs.length, base: tally(qs.map((q) => q.base)), candidate: tally(qs.map((q) => q.candidate)), verdict: topicVerdict(qs.map((q) => q.change)) }
  })

  const counts = Object.fromEntries(['fixed', 'improved', 'unchanged', 'regressed'].map((k) => [k, questions.filter((q) => q.change === k).length]))
  const better = counts.fixed + counts.improved
  const regressed = questions.filter((q) => q.change === 'regressed')
  const release = regressed.length
    ? {
        id: 'hold',
        title: `Hold ${cand.label}: it improves ${better} of ${questions.length} questions but regresses ${regressed.length}`,
        detail: regressed.map((q) => {
          const worst = q.candidate.flags.find((f) => SEVERITY[f.status] === q.candidate.worst)
          return `${TOPICS[q.topic].name}: ${worst.short}${q.base.flags.length ? '' : ` (${base.label} answered this correctly)`}`
        }),
      }
    : { id: 'ready', title: `${cand.label} improves ${better} of ${questions.length} questions with no regressions`, detail: [] }

  // What no agent release can fix, and what the candidate now declines.
  const notes = []
  const staleDocs = [...new Set(questions.flatMap((q) => q.candidate.flags.filter((f) => f.status === 'stale').map((f) => f.docId)))]
  for (const docId of staleDocs) {
    const n = questions.reduce((t, q) => t + q.candidate.flags.filter((f) => f.status === 'stale' && f.docId === docId).length, 0)
    const f = freshness(docId)
    const doc = DOCUMENTS[docId]
    notes.push({
      kind: 'stale-document',
      docId,
      text: `${plural(n, 'claim')} in ${cand.label} still rest on ${docId}, which ${f.state === 'superseded' ? 'has been superseded' : `is ${f.months} months old and past its review cycle`}. No agent release fixes this: ${doc.owner} needs to review the document.`,
    })
  }
  const declined = questions.filter((q) => q.candidate.declined && q.base.flags.some((f) => f.status === 'no-source'))
  if (declined.length) {
    notes.push({
      kind: 'declined',
      text: `${cand.label} declines ${plural(declined.length, 'question')} that ${base.label} answered with no source. Counted as fixed: no approved policy covers ${declined.length === 1 ? 'it' : 'them'}, so saying so is the correct answer.`,
    })
  }

  return {
    versions: AGENT_VERSIONS,
    questions,
    topics,
    overall: { base: tally(questions.map((q) => q.base)), candidate: tally(questions.map((q) => q.candidate)) },
    counts,
    release,
    notes,
  }
}

/** Everything the release-check page reads: the comparison plus each answer to show. */
export function evaluationPayload() {
  const ids = EVAL_SET.flatMap((q) => Object.values(q.answers))
  return {
    ...compareVersions(),
    answers: Object.fromEntries(ids.map((id) => [id, { text: scenarioById(id).answer.text, result: assess(id) }])),
  }
}
