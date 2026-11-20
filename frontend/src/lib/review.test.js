/**
 * Review rules and status vocabulary for the new verification states.
 * Mirrors backend/tests/test_workflow.py for demo mode.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { reviewReasons } from '../state/store'
import { clarification, CHALLENGES } from './challenger'
import { CLAIM_STATUS, CHECK_STATUS, REASONS, ANSWER_STATES } from './status'
import { assess } from './assess'

const schema = JSON.parse(readFileSync(new URL('../../../contract/verification-result.schema.json', import.meta.url), 'utf8'))

describe('mandatory review', () => {
  it('a high reliability index does not bypass review on a high-risk topic', () => {
    const r = assess('kyc-ubo') // High, every claim supported
    expect(r.band.id).toBe('high')
    expect(reviewReasons(r, false)).toEqual([])
    expect(reviewReasons(r, true)).toEqual(['high-stakes'])
  })
  it('a partial assessment always needs review', () => {
    const r = { ...assess('kyc-ubo'), assessment: { partial: true, unavailable: [{ step: 'judge', reason: 'No model.' }] } }
    expect(reviewReasons(r, false)).toEqual(['partial'])
  })
  it('conflicting and missing evidence need review', () => {
    expect(reviewReasons(assess('fx-override'), true)).toEqual(['low-confidence', 'conflicting', 'high-stakes'])
    expect(reviewReasons(assess('collateral-crypto'), true)).toEqual(['low-confidence', 'no-source', 'high-stakes'])
  })
  it('the Challenger never says review is skipped when review is required', () => {
    for (const ch of Object.values(CHALLENGES)) {
      for (const o of ch.options ?? []) {
        const w = clarification(o, true)
        expect(`${w.title} ${w.footer}`).not.toMatch(/no reviewer needed|does not join the reviewer queue/i)
        expect(w.title).toMatch(/reviewer still required/)
      }
    }
  })
})

describe('every status the contract allows has an icon and a label', () => {
  it('claims', () => {
    for (const s of schema.$defs.claim.properties.status.enum) {
      expect(CLAIM_STATUS[s]?.Icon, s).toBeTruthy()
      expect(CLAIM_STATUS[s].label, s).toBeTruthy()
    }
  })
  it('checks', () => {
    for (const s of schema.$defs.check.properties.status.enum) expect(CHECK_STATUS[s]?.label, s).toBeTruthy()
  })
  it('review reasons and answer states', () => {
    for (const r of ['low-confidence', 'conflicting', 'no-source', 'partial', 'high-stakes', 'evidence-changed', 'employee']) expect(REASONS[r]?.Icon, r).toBeTruthy()
    for (const st of ['verifying', 'review-required', 'approved', 'corrected', 'rejected', 'reverify-required']) {
      expect(ANSWER_STATES[st]?.label, st).toBeTruthy()
      expect(ANSWER_STATES[st].next, st).toBeTruthy()
    }
  })
})
