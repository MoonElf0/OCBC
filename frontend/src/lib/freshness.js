// Deterministic freshness check. Plain code, no model.
import { DEMO_TODAY } from '../fixtures'
import { documentById } from './library'

export function monthsBetween(fromIso, toIso = DEMO_TODAY) {
  const a = new Date(fromIso + 'T00:00:00')
  const b = new Date(toIso + 'T00:00:00')
  let months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth())
  if (b.getDate() < a.getDate()) months -= 1
  return Math.max(0, months)
}

export function ageLabel(months) {
  if (months < 1) return 'this month'
  if (months === 1) return '1 month ago'
  return `${months} months ago`
}

export function formatDate(iso) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** @returns {{ state: 'current'|'superseded'|'overdue', stale: boolean, months: number, note: string, supersededBy?: object }} */
export function freshnessOf(docId) {
  const doc = documentById(docId)
  const months = monthsBetween(doc.updated)
  const updated = `Last updated ${ageLabel(months)}`
  if (doc.supersededBy) {
    const by = documentById(doc.supersededBy)
    return { state: 'superseded', stale: true, months, note: `${updated} · superseded`, supersededBy: by }
  }
  if (months > doc.reviewCycleMonths) {
    return { state: 'overdue', stale: true, months, note: `${updated} · review overdue` }
  }
  return { state: 'current', stale: false, months, note: updated }
}
