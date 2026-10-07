/**
 * Dashboard figures — all computed from the weekly counts and reviewer
 * history in src/fixtures, so every rate on screen traces back to one place.
 */
import { WEEKLY, WEEKS, WINDOW_WEEKS, TOPICS, DOCUMENTS, REVIEW_OUTCOMES } from '../fixtures'
import { freshnessOf } from './freshness'

const METRICS = ['answers', 'claims', 'unsupported', 'conflicting', 'stale', 'noSource', 'reviews']
const n = WEEKS.length

const sum = (arr, from, to) => arr.slice(from, to).reduce((a, b) => a + b, 0)

function windowRange(which) {
  return which === 'prev' ? [n - 2 * WINDOW_WEEKS, n - WINDOW_WEEKS] : [n - WINDOW_WEEKS, n]
}

function withRates(c) {
  return {
    ...c,
    accuracy: 1 - (c.unsupported + c.conflicting) / c.claims,
    unsupportedRate: c.unsupported / c.claims,
    conflictingRate: c.conflicting / c.claims,
    staleRate: c.stale / c.claims,
    failureRate: (c.unsupported + c.conflicting) / c.claims,
    noSourceRate: c.noSource / c.answers,
  }
}

export function topicStats(topicId, which = 'last') {
  const [from, to] = windowRange(which)
  const w = WEEKLY[topicId]
  const c = Object.fromEntries(METRICS.map((m) => [m, sum(w[m], from, to)]))
  return withRates(c)
}

export function overallStats(which = 'last') {
  const [from, to] = windowRange(which)
  const c = Object.fromEntries(
    METRICS.map((m) => [m, Object.values(WEEKLY).reduce((t, w) => t + sum(w[m], from, to), 0)]),
  )
  return withRates(c)
}

/** Week-by-week series across all topics, or for one topic. */
export function weeklySeries(topicId) {
  return WEEKS.map((label, i) => {
    const sources = topicId ? [WEEKLY[topicId]] : Object.values(WEEKLY)
    const c = Object.fromEntries(METRICS.map((m) => [m, sources.reduce((t, w) => t + w[m][i], 0)]))
    return { label, ...withRates(c) }
  })
}

/** Direction of change between the previous and the last window. Lower is better. */
export function direction(prevRate, lastRate, threshold = 0.01) {
  const delta = lastRate - prevRate
  if (delta <= -threshold) return { id: 'improving', delta }
  if (delta >= threshold) return { id: 'worsening', delta }
  return { id: 'flat', delta }
}

export function topicTable() {
  return Object.values(TOPICS)
    .map((t) => {
      const last = topicStats(t.id, 'last')
      const prev = topicStats(t.id, 'prev')
      return {
        ...t,
        last,
        prev,
        trend: direction(prev.failureRate + prev.staleRate, last.failureRate + last.staleRate),
        series: weeklySeries(t.id).map((w) => w.failureRate + w.staleRate),
      }
    })
    .sort((a, b) => b.last.failureRate + b.last.staleRate - (a.last.failureRate + a.last.staleRate))
}

const pct = (x) => `${Math.round(x * 100)}%`

/** Reviewer outcomes for the last 4 weeks, plus decisions made in this session. */
export function reviewCounts(liveDecisions = []) {
  const rows = [...REVIEW_OUTCOMES, ...liveDecisions.map((d) => ({ ...d, count: 1, live: true }))]
  const count = (pred) => rows.filter(pred).reduce((t, r) => t + r.count, 0)
  const live = (pred) => rows.filter((r) => r.live && pred(r)).length
  return { rows, count, live }
}

/**
 * System-generated recommendations. Each rule reads the trend data, the
 * document library and tagged reviewer outcomes (fixture counts + any
 * decisions made in this session) and states the evidence it used. Ranked by
 * how many claims or answers in the last 4 weeks the problem touched.
 */
export function recommendations(liveDecisions = []) {
  const { count, live } = reviewCounts(liveDecisions)
  const recs = []

  // Rule 1 — stale documents still being retrieved.
  for (const doc of Object.values(DOCUMENTS)) {
    const f = freshnessOf(doc.id)
    if (!f.stale) continue
    const t = topicStats(doc.topic)
    const pred = (r) => r.docId === doc.id && r.decision !== 'approved' && r.category === 'stale-source'
    const corrected = count(pred)
    const today = live(pred)
    const superseded = f.state === 'superseded'
    recs.push({
      id: `doc-${doc.id}`,
      kind: superseded ? 'retire-document' : 'review-document',
      topic: doc.topic,
      docId: doc.id,
      affected: t.stale,
      unit: 'claims',
      title: superseded ? `Retire ${doc.id} from the retrieval index` : `Schedule a review of ${doc.id}`,
      detail: superseded
        ? `${doc.title} was superseded by ${f.supersededBy.id} but is still being retrieved, so the agent keeps quoting its old figures. Redirect it to ${f.supersededBy.title}.`
        : `${doc.title} is ${f.months} months old and past its ${doc.reviewCycleMonths}-month review cycle. Ask ${doc.owner} to confirm or update it.`,
      evidence: [
        `${TOPICS[doc.topic].name} stale-source rate ${pct(t.staleRate)} (${t.stale.toLocaleString()} of ${t.claims.toLocaleString()} claims)`,
        `${corrected} of ${(t.reviews + live((r) => r.topic === doc.topic)).toLocaleString()} ${TOPICS[doc.topic].name} reviews corrected an answer resting on it${today ? ` · ${today} today` : ''}`,
      ],
      today,
    })
  }

  // Rule 2 — topics where retrieval often finds nothing.
  for (const topic of Object.values(TOPICS)) {
    const t = topicStats(topic.id)
    if (t.noSourceRate < 0.1) continue
    const pred = (r) => r.topic === topic.id && r.category === 'no-source' && r.decision !== 'approved'
    recs.push({
      id: `gap-${topic.id}`,
      kind: 'add-source',
      topic: topic.id,
      affected: t.unsupported,
      unit: 'claims',
      title: `Publish an approved policy on digital-asset collateral`,
      detail: `Questions about crypto and digital-asset collateral find no approved document, and the agent answers anyway. Publish a policy, or instruct the agent to decline these questions.`,
      evidence: [
        `${t.noSource} of ${t.answers} ${topic.name} answers had no source found (${pct(t.noSourceRate)})`,
        `${count(pred)} of ${t.reviews + live((r) => r.topic === topic.id)} ${topic.name} reviews rejected for a missing source${live(pred) ? ` · ${live(pred)} today` : ''}`,
      ],
      today: live(pred),
    })
  }

  // Rule 3 — a recurring root cause in reviewer corrections → prompt fix.
  const PROMPT_FIXES = {
    'overstated-authority': {
      title: 'Tighten the agent prompt on approval authority',
      detail: 'Reviewers keep correcting answers that overstate how much a role can approve. Require the agent to quote numeric limits verbatim from the source, and to say when approval is needed.',
      metric: (t) => ({ affected: t.conflicting, unit: 'claims', line: `Conflicting-claim rate ${pct(t.conflictingRate)} (${t.conflicting} claims)` }),
    },
    'off-intent': {
      title: 'Keep answers to the product the employee asked about',
      detail: 'Answers drift into nearby products — for example retail cards when the question is about SME accounts. Instruct the agent to answer only for the product named in the question.',
      metric: (t, n) => ({ affected: n, unit: 'answers', line: `${n} answers corrected for answering a different question` }),
    },
  }
  for (const [category, fix] of Object.entries(PROMPT_FIXES)) {
    for (const topic of Object.values(TOPICS)) {
      const pred = (r) => r.topic === topic.id && r.category === category && r.decision === 'corrected'
      const n = count(pred)
      if (n < 5) continue
      const t = topicStats(topic.id)
      const m = fix.metric(t, n)
      recs.push({
        id: `prompt-${category}-${topic.id}`,
        kind: 'tighten-prompt',
        topic: topic.id,
        affected: m.affected,
        unit: m.unit,
        title: fix.title,
        detail: fix.detail,
        evidence: [`${n} of ${t.reviews + live((r) => r.topic === topic.id)} ${topic.name} reviews corrected for this reason${live(pred) ? ` · ${live(pred)} today` : ''}`, m.line],
        today: live(pred),
      })
    }
  }

  return recs.sort((a, b) => b.affected - a.affected).map((r, i) => ({ ...r, priority: i < 2 ? 'High' : i < 4 ? 'Medium' : 'Low' }))
}

export { pct }
