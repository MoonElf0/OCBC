/**
 * The data contract shared with the backend (contract/verification-result.schema.json).
 * Demo-mode output must satisfy it, and the JSON the backend reads must be
 * an up-to-date export of these fixtures.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import Ajv2020 from 'ajv/dist/2020'
import { SCENARIOS, FALLBACK, CORRECTIONS, EVAL_ANSWERS } from './index'
import { assess } from '../lib/assess'
import { buildFixtures, buildGolden } from '../../scripts/export-data'

const root = new URL('../../../', import.meta.url)
const schema = JSON.parse(readFileSync(new URL('contract/verification-result.schema.json', root), 'utf8'))
const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema)
const ALL = [...SCENARIOS, FALLBACK, ...Object.values(CORRECTIONS), ...EVAL_ANSWERS]

describe('verification result contract', () => {
  for (const s of ALL) {
    it(`${s.id}: assess() output matches the schema`, () => {
      const ok = validate(assess(s.id))
      expect(validate.errors ?? [], s.id).toEqual([])
      expect(ok).toBe(true)
    })
  }
  it('a paraphrased question still matches the schema', () => {
    expect(validate(assess('sme-limit', { question: 'sme transfer limit?' }))).toBe(true)
  })
  it('rejects a claim with no reason', () => {
    const r = structuredClone(assess('sme-limit'))
    delete r.claims[0].reason
    expect(validate(r)).toBe(false)
  })
})

describe('backend data export is up to date', () => {
  const read = (f) => readFileSync(new URL(`backend/data/${f}`, root), 'utf8')
  it('fixtures.json', () => expect(read('fixtures.json'), 'run: npm run export:fixtures').toBe(buildFixtures()))
  it('golden.json', () => expect(read('golden.json'), 'run: npm run export:fixtures').toBe(buildGolden()))
})
