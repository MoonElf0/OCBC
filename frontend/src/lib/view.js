import { scenarioById } from './pipeline'
import { CHECKS } from './status'

const GROUNDEDNESS = CHECKS.findIndex((c) => c.id === 'groundedness')

/** Claim flags appear once the groundedness check has resolved. */
export function visibleClaims(m) {
  if (!m) return []
  if (m.result) return m.result.claims
  if (m.claims) return m.claims // backend mode: sent with the groundedness check
  const g = m.checks[GROUNDEDNESS]
  if (g && g.status !== 'queued' && g.status !== 'running') return scenarioById(m.scenarioId).verification.claims
  return []
}

export function checksDone(m) {
  return m.checks.filter((c) => c.status !== 'queued' && c.status !== 'running').length
}

export function runningCheck(m) {
  const i = m.checks.findIndex((c) => c.status === 'running')
  return i >= 0 ? CHECKS[i] : null
}

export function moodFor(m) {
  if (!m) return 'idle'
  if (m.phase === 'thinking' || m.phase === 'streaming') return 'watching'
  if (m.phase === 'verifying') return 'thinking'
  return m.result?.band?.status ?? 'unknown'
}

export function flagged(claims) {
  return claims.filter((c) => c.status !== 'supported')
}

export function claimCounts(claims) {
  const counts = {}
  for (const c of claims) counts[c.status] = (counts[c.status] ?? 0) + 1
  return counts
}
