import { describe, it, expect } from 'vitest'
import { SCENARIOS, FALLBACK, CORRECTIONS, DOCUMENTS, REVIEW_QUEUE_SEED, REVIEW_HINTS, REVIEW_OUTCOMES, WEEKLY, WINDOW_WEEKS, EVAL_ANSWERS, EVAL_SET, AGENT_VERSIONS, TOPICS } from './index'
import { CHECKS, CLAIM_STATUS } from '../lib/status'
import { freshnessOf } from '../lib/freshness'
import { assess } from '../lib/assess'
import { figures } from '../lib/rules'
import { topicStats, recommendations } from '../lib/metrics'
import { matchScenario } from '../lib/agent'
import { compareVersions, changeOf, summarise } from '../lib/evaluation'

const JUDGE = new Set(CHECKS.filter((c) => c.method === 'judge').map((c) => c.id))
const ALL = [...SCENARIOS, FALLBACK, ...Object.values(CORRECTIONS), ...EVAL_ANSWERS]

describe('fixtures are shaped like real pipeline output', () => {
  for (const s of ALL) {
    const v = s.verification
    it(`${s.id}: claims are valid, non-overlapping offsets into the answer`, () => {
      const sorted = [...v.claims].sort((a, b) => a.start - b.start)
      let last = -1
      for (const c of sorted) {
        expect(c.start).toBeGreaterThan(last)
        expect(c.end).toBeLessThanOrEqual(s.answer.text.length)
        expect(CLAIM_STATUS[c.status], c.status).toBeTruthy()
        last = c.end
      }
    })

    it(`${s.id}: every passage exists verbatim in its document`, () => {
      const refs = [...v.claims.flatMap((c) => [c.source, c.counter]), ...v.checks.flatMap((c) => c.evidence)].filter((e) => e && e.docId)
      for (const r of refs) expect(DOCUMENTS[r.docId].sections.find((x) => x.id === r.section).text).toContain(r.passage)
      for (const id of [...s.answer.citations, ...v.retrieved]) expect(DOCUMENTS[id]).toBeTruthy()
    })

    it(`${s.id}: judge verdicts always cite a passage unless retrieval found none`, () => {
      for (const c of v.claims) {
        if (JUDGE.has(c.check) && !v.noSource) expect(c.source?.passage, c.id).toBeTruthy()
        if (!c.source) expect(v.noSource).toBe(true)
      }
    })

    it(`${s.id}: fixtures carry only judge checks; assess() yields all six`, () => {
      expect(v.checks.every((c) => JUDGE.has(c.id))).toBe(true)
      expect(assess(s.id).checks.map((c) => c.id)).toEqual(CHECKS.map((c) => c.id))
    })

    it(`${s.id}: carries the short labels the panel shows at a glance`, () => {
      expect(v.headline?.length, 'headline').toBeGreaterThan(0)
      for (const c of v.claims) if (c.status !== 'supported') expect(c.short?.length, c.id).toBeGreaterThan(0)
      for (const c of assess(s.id).checks) expect(c.short?.length, c.id).toBeGreaterThan(0)
    })
  }
})

describe('rule-based checks are computed, and land where the story needs them', () => {
  const status = (id, check) => assess(id).checks.find((c) => c.id === check).status
  it('citation verification', () => {
    expect(status('sme-limit', 'citation')).toBe('pass')
    expect(status('fx-override', 'citation')).toBe('fail') // cites FX-019 for 50 bps; it says 10
    expect(status('collateral-crypto', 'citation')).toBe('fail') // cites nothing
    expect(status('fallback', 'citation')).toBe('na')
  })
  it('freshness', () => {
    expect(status('sme-limit', 'freshness')).toBe('fail') // superseded circular
    expect(status('fees-waiver', 'freshness')).toBe('warning') // overdue review
    expect(status('kyc-ubo', 'freshness')).toBe('pass')
    expect(status('collateral-crypto', 'freshness')).toBe('na')
  })
  it('cross-referencing', () => {
    expect(status('sme-limit', 'crossref')).toBe('warning') // 250,000 vs 200,000
    expect(status('fx-override', 'crossref')).toBe('fail')
    expect(status('kyc-ubo', 'crossref')).toBe('pass')
  })
  it('figure extraction normalises amounts and times', () => {
    expect(figures('up to SGD 250,000 before 2:30 pm, 25%')).toEqual(['250000', '2:30', '25'])
  })
  it('document ages match the freshness calculation', () => {
    expect(freshnessOf('DOC-SME-087')).toMatchObject({ months: 14, state: 'superseded' })
    expect(freshnessOf('DOC-OPS-045')).toMatchObject({ months: 22, state: 'overdue' })
  })
})

describe('scores are computed, never typed in', () => {
  it('lands each scenario in its intended band', () => {
    expect(assess('sme-limit').band.id).toBe('medium')
    expect(assess('kyc-ubo').band.id).toBe('high')
    expect(assess('fx-override').band.id).toBe('low')
    expect(assess('fees-waiver').band.id).toBe('medium')
    expect(assess('collateral-crypto').band.id).toBe('low')
    expect(assess('fallback').score).toBeNull()
  })
  it('never exceeds the cap', () => expect(assess('kyc-ubo').score).toBe(95))
  it('a paraphrased question drops intent to warning and lowers the score', () => {
    const exact = assess('sme-limit', { question: SCENARIOS[0].question })
    const para = assess('sme-limit', { question: 'sme transfer approval limit?' })
    expect(para.checks.find((c) => c.id === 'intent').status).toBe('warning')
    expect(para.score).toBeLessThan(exact.score)
    expect(para.matchedQuestion).toBe(SCENARIOS[0].question)
  })
  it('re-verified corrections score higher than the answers they replace', () => {
    for (const [id, corr] of Object.entries(CORRECTIONS)) {
      const before = assess(id).score
      const after = assess(corr.id).score
      if (after != null) expect(after).toBeGreaterThan(before)
    }
  })
})

describe('dashboard numbers reconcile with the demo and the queue', () => {
  it('SME unsupported-claim rate matches the demo SME answer (≈1 in 3 claims)', () => {
    const sme = SCENARIOS.find((s) => s.id === 'sme-limit')
    const demoRate = sme.verification.claims.filter((c) => c.status === 'unsupported').length / sme.verification.claims.length
    const rate = topicStats('sme').unsupportedRate
    expect(Math.round(rate * 100)).toBe(32)
    expect(Math.abs(rate - demoRate)).toBeLessThan(0.03)
  })
  it('tagged reviewer outcomes add up to each topic’s review volume', () => {
    for (const topic of Object.keys(WEEKLY)) {
      const tagged = REVIEW_OUTCOMES.filter((r) => r.topic === topic).reduce((t, r) => t + r.count, 0)
      const reviews = WEEKLY[topic].reviews.slice(-WINDOW_WEEKS).reduce((a, b) => a + b, 0)
      expect(tagged, topic).toBe(reviews)
    }
  })
  it('the no-source demo topic has the highest no-source rate', () => {
    const rates = Object.keys(WEEKLY).map((t) => [t, topicStats(t).noSourceRate])
    expect(rates.sort((a, b) => b[1] - a[1])[0][0]).toBe('collateral')
  })
  it('the stale SME circular is the top recommendation, and today’s correction feeds it', () => {
    const recs = recommendations()
    expect(recs[0].docId).toBe('DOC-SME-087')
    const after = recommendations([{ id: 'x', topic: 'sme', docId: 'DOC-SME-087', decision: 'corrected', category: 'stale-source' }])
    expect(after[0].today).toBe(1)
  })
  it('every queued item points at a real scenario with review hints', () => {
    for (const q of REVIEW_QUEUE_SEED) {
      expect(SCENARIOS.find((s) => s.id === q.scenarioId)).toBeTruthy()
      expect(REVIEW_HINTS[q.scenarioId]).toBeTruthy()
    }
  })
})

describe('answering agent matching', () => {
  it('matches suggested prompts exactly and specific free text by keyword', () => {
    for (const s of SCENARIOS) expect(matchScenario(s.question).id).toBe(s.id)
    expect(matchScenario('what is the sme transfer approval limit?').id).toBe('sme-limit')
    expect(matchScenario('can we take bitcoin as collateral').id).toBe('collateral-crypto')
  })
  it('falls back on weak or unrelated questions instead of guessing', () => {
    expect(matchScenario("What is today's FX rate for USD to SGD?").id).toBe('fallback')
    expect(matchScenario('what is the canteen menu today').id).toBe('fallback')
  })
  it('matches whole words only and respects out-of-scope products', () => {
    expect(matchScenario('Can you check whether my home loan application went through?').id).toBe('fallback') // "whether" ≠ "ether"
    expect(matchScenario('What is the approval limit for a personal mortgage?').id).toBe('fallback')
    expect(matchScenario('How much can a relationship manager approve for an SME overseas transfer?').id).toBe('sme-limit')
  })
})

describe('no source found is Unknown, not merely unsupported', () => {
  it('scores at most 10 and labels every claim no-source', () => {
    const r = assess('collateral-crypto')
    expect(r.claims.every((c) => c.status === 'no-source')).toBe(true)
    expect(r.score).toBeLessThanOrEqual(10)
  })
})

describe('agent release check: v1 vs v2 on one test set', () => {
  const ids = new Set(ALL.map((s) => s.id))
  const r = compareVersions()

  it('every test question has a scored answer from each version, on its own topic', () => {
    expect(AGENT_VERSIONS.map((v) => v.id)).toEqual(['v1', 'v2'])
    for (const q of EVAL_SET) {
      for (const v of AGENT_VERSIONS) {
        expect(ids.has(q.answers[v.id]), `${q.id} ${v.id}`).toBe(true)
        expect(assess(q.answers[v.id]).checks).toHaveLength(6)
      }
      const v1 = ALL.find((s) => s.id === q.answers.v1)
      expect(v1.topic).toBe(q.topic)
      expect(v1.question).toBe(q.question)
    }
    for (const t of Object.keys(TOPICS)) expect(EVAL_SET.filter((q) => q.topic === t).length, t).toBe(2)
  })

  it("v1's answers to the demo questions are the workspace answers, unchanged", () => {
    for (const s of SCENARIOS) expect(EVAL_SET.find((q) => q.answers.v1 === s.id), s.id).toBeTruthy()
  })

  it('the workspace agent can never return a v2 answer', () => {
    for (const s of EVAL_ANSWERS) expect(matchScenario(s.question).id).not.toBe(s.id)
  })

  it('v2 fixes the stale, authority and no-source cases, and the verifier catches its KYC regression', () => {
    const change = Object.fromEntries(r.questions.map((q) => [q.id, q.change]))
    expect(change).toEqual({
      'q-sme-limit': 'fixed',
      'q-sme-cutoff': 'fixed',
      'q-kyc-ubo': 'regressed',
      'q-kyc-address': 'unchanged',
      'q-fx-override': 'fixed',
      'q-fx-approver': 'fixed',
      'q-fees-waiver': 'improved',
      'q-fees-cards': 'unchanged',
      'q-collateral-crypto': 'fixed',
      'q-collateral-gold': 'fixed',
    })
    expect(r.release.id).toBe('hold')
    expect(r.release.detail[0]).toContain('KYC & Onboarding')
    expect(r.topics.find((t) => t.id === 'kyc').verdict).toBe('regressed')
  })

  it('the stale fee matrix survives the agent change, and the check says so', () => {
    expect(r.overall.candidate.stale).toBe(2)
    expect(r.notes.find((n) => n.kind === 'stale-document').docId).toBe('DOC-OPS-045')
  })

  it('declining with no approved source is counted as fixed, not as a missing score', () => {
    expect(r.overall.base.withoutSource).toBe(2)
    expect(r.overall.candidate.withoutSource).toBe(0)
    expect(r.overall.candidate.declined).toBe(2)
    expect(r.topics.find((t) => t.id === 'collateral').candidate.flagRate).toBeNull()
  })

  it('rates are computed from claim counts', () => {
    const o = r.overall.base
    expect(o.flagRate).toBeCloseTo(o.flagged / o.claims)
    expect(o.flagged).toBe(r.questions.reduce((t, q) => t + q.base.flags.length, 0))
    expect(r.overall.candidate.flagRate).toBeLessThan(o.flagRate)
  })

  it('a new or worse flag is a regression even when the flag count drops', () => {
    const a = summarise({ score: 70, band: { id: 'medium' }, claims: [{ status: 'stale' }, { status: 'stale' }] })
    const b = summarise({ score: 60, band: { id: 'medium' }, claims: [{ status: 'conflicting' }, { status: 'supported' }] })
    expect(changeOf(a, b)).toBe('regressed')
  })
})

describe('reviewer approvals never count as corrections', () => {
  it('an approval with a root-cause tag does not feed prompt recommendations', () => {
    const base = recommendations().find((r) => r.id === 'prompt-overstated-authority-fx')
    const after = recommendations([{ id: 'x', topic: 'fx', docId: 'DOC-FX-019', decision: 'approved', category: 'overstated-authority' }]).find((r) => r.id === 'prompt-overstated-authority-fx')
    expect(after.evidence[0]).toBe(base.evidence[0].replace('of 74', 'of 75'))
    expect(after.today).toBe(0)
  })
})
