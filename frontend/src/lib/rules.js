/**
 * Rule-based checks. Plain code over the retrieved passages — no model.
 *
 *   citation     — cited documents exist, and each claim's figures appear in
 *                  the passage it cites (passage-match on amounts, %, times)
 *   freshness    — every source is current: not superseded, not past review
 *   crossref     — figures in each claim agree with the current approved
 *                  passage retrieved for the same point
 */
import { DOCUMENTS } from '../fixtures'
import { freshnessOf, ageLabel, formatDate } from './freshness'

// "SGD 250,000" → "250000", "2:30 pm" → "2:30", "25%" → "25"
export function figures(text) {
  return (text.match(/\d+(?:[.,:]\d+)*/g) ?? []).map((f) => f.replace(/,/g, ''))
}

export const display = (text) => (text.match(/(?:SGD\s)?\d+(?:[.,:]\d+)*(?:%|\s(?:basis points|bps|pm|am))?/) ?? [''])[0]

function passageRef(r) {
  return { docId: r.docId, section: r.section, passage: r.passage }
}

export function citationCheck(answer, claims) {
  const cited = answer.citations
  if (!cited.length) {
    return claims.length
      ? { id: 'citation', status: 'fail', short: 'Cites no documents', summary: 'The answer cites no documents.', evidence: [{ kind: 'search' }] }
      : { id: 'citation', status: 'na', short: 'Nothing cited, nothing claimed', summary: 'No documents cited and no claims made.', evidence: [{ kind: 'search' }] }
  }
  const missing = cited.filter((id) => !DOCUMENTS[id])
  if (missing.length) return { id: 'citation', status: 'fail', short: 'A cited document doesn’t exist', summary: `Cited ${missing.join(', ')} does not exist in the approved library.`, evidence: [] }

  const checked = claims.filter((c) => c.source && cited.includes(c.source.docId))
  const mismatched = checked.filter((c) => {
    const claimed = figures(answer.text.slice(c.start, c.end))
    const inPassage = new Set(figures(c.source.passage))
    return claimed.some((f) => !inPassage.has(f))
  })
  if (mismatched.length) {
    const c = mismatched[0]
    const said = display(answer.text.slice(c.start, c.end))
    return {
      id: 'citation',
      status: 'fail',
      short: `Cited source says ${display(c.source.passage)}, not ${said}`,
      summary: `${c.source.docId} exists, but the answer cites it for ${said} and the passage says ${display(c.source.passage)}.`,
      evidence: mismatched.map((m) => passageRef(m.source)),
    }
  }
  return {
    id: 'citation',
    status: 'pass',
    short: 'Cited documents exist and match',
    summary: `${cited.length === 1 ? 'The cited document exists' : cited.length === 2 ? 'Both cited documents exist' : `All ${cited.length} cited documents exist`} in the approved library, and every figure in the ${checked.length} cited claim${checked.length === 1 ? '' : 's'} appears in its passage.`,
    evidence: checked.map((c) => passageRef(c.source)),
  }
}

export function freshnessCheck(answer, claims) {
  const ids = [...new Set([...answer.citations, ...claims.map((c) => c.source?.docId).filter(Boolean)])].filter((id) => DOCUMENTS[id])
  if (!ids.length) return { id: 'freshness', status: 'na', short: 'No source to check', summary: 'No source to check.', evidence: [{ kind: 'search' }] }
  const results = ids.map((id) => ({ id, ...freshnessOf(id) }))
  const superseded = results.filter((r) => r.state === 'superseded')
  const overdue = results.filter((r) => r.state === 'overdue')
  if (superseded.length) {
    const r = superseded[0]
    const by = r.supersededBy
    const pointer = by.sections.find((s) => s.text.includes(r.id)) ?? by.sections[0]
    return {
      id: 'freshness',
      status: 'fail',
      short: `Cited source was replaced on ${formatDate(by.updated)}`,
      summary: `${r.id} was last updated ${ageLabel(r.months)} and has been superseded by ${by.id}.`,
      evidence: [{ docId: by.id, section: pointer.id, passage: pointer.text }],
    }
  }
  if (overdue.length) {
    const r = overdue[0]
    const doc = DOCUMENTS[r.id]
    const used = claims.find((c) => c.source?.docId === r.id)?.source
    return {
      id: 'freshness',
      status: 'warning',
      short: `Source is ${r.months} months old and overdue for review`,
      summary: `${r.id} was last updated ${ageLabel(r.months)}, past its ${doc.reviewCycleMonths}-month review cycle. It has not been superseded.`,
      evidence: used ? [passageRef(used)] : [],
    }
  }
  const oldest = results.reduce((a, b) => (b.months > a.months ? b : a))
  return {
    id: 'freshness',
    status: 'pass',
    short: 'All sources up to date',
    summary: `${results.length === 1 ? `${oldest.id} was updated within its` : `All ${results.length} sources were updated within their`} 12-month review cycle (oldest: ${oldest.id}, ${ageLabel(oldest.months)}).`,
    evidence: claims.filter((c) => c.source?.docId === oldest.id).slice(0, 1).map((c) => passageRef(c.source)),
  }
}

export function crossrefCheck(answer, claims) {
  const sourced = claims.filter((c) => c.source)
  if (!sourced.length) return { id: 'crossref', status: 'na', short: 'Nothing to compare against', summary: 'No approved source to compare against.', evidence: [{ kind: 'search' }] }
  const diffs = claims
    .filter((c) => c.counter)
    .map((c) => ({ c, claimed: figures(answer.text.slice(c.start, c.end))[0], current: figures(c.counter.passage)[0] }))
    .filter((d) => d.claimed && d.current && d.claimed !== d.current)
  if (!diffs.length) {
    return { id: 'crossref', status: 'pass', short: 'Figures match current policy', summary: 'Every figure agrees with the approved sources retrieved for the same point.', evidence: sourced.slice(0, 1).map((c) => passageRef(c.source)) }
  }
  const d = diffs[0]
  const conflict = diffs.some((x) => x.c.status === 'conflicting')
  return {
    id: 'crossref',
    status: conflict ? 'fail' : 'warning',
    short: `Current policy says ${display(d.c.counter.passage)}`,
    summary: `The answer states ${display(answer.text.slice(d.c.start, d.c.end))}; the current approved source (${d.c.counter.docId} ${d.c.counter.section}) states ${display(d.c.counter.passage)}.`,
    evidence: diffs.map((x) => passageRef(x.c.counter)),
  }
}
