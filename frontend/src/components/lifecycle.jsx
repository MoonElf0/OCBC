import { useEffect, useState } from 'react'
import { ArrowRight, ChevronDown, CircleDashed, History, RefreshCw } from 'lucide-react'
import { ANSWER_STATES, CLAIM_STATUS, TONES } from '../lib/status'
import { BACKEND, api } from '../lib/backend'
import { ScoreBadge } from './ui'

/*
 * The answer's life after it is first scored: its state, what could not run,
 * every assessment of it and the audit trail. Most of this needs backend mode,
 * where answers, assessments and decisions are stored.
 */

export function formatWhen(iso) {
  if (!iso) return ''
  if (!iso.includes('T')) return iso
  return new Date(iso).toLocaleString('en-SG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatTime(iso) {
  if (!iso || !iso.includes('T')) return iso ?? ''
  return new Date(iso).toLocaleString('en-SG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

/** The answer's state: icon, colour and label together, never colour alone. */
export function StateChip({ state, className = '' }) {
  const st = ANSWER_STATES[state]
  if (!st || state === 'verifying') return null
  return (
    <span className={`inline-flex items-center gap-1.5 text-caption font-medium ${TONES[st.tone].text} ${className}`}>
      <st.Icon size={14} aria-hidden="true" /> <span className="text-carbon">{st.label}</span>
    </span>
  )
}

/** Where the answer is in its life, and the next required action. */
export function StateCard({ m }) {
  const st = ANSWER_STATES[m.state]
  if (!st || m.state === 'verifying') return null
  const t = TONES[st.tone]
  const ch = m.evidenceChanged
  return (
    <section aria-label="Answer status" className="rise-in flex items-start gap-3 rounded-2xl border border-line/[0.06] bg-surface/70 p-3.5">
      <span className={`grid size-8 shrink-0 place-items-center rounded-xl ${t.surface} ${t.text}`} aria-hidden="true">
        <st.Icon size={16} strokeWidth={2.25} />
      </span>
      <div className="min-w-0">
        <div className={`text-caption font-semibold ${t.text}`}>{st.label}</div>
        <p className="mt-0.5 text-body-sm text-ink">{st.next}</p>
        {ch && (
          <p className="mt-1 text-caption text-carbon">
            {ch.usedVersions?.length ? `Assessed against ${ch.usedVersions.join(', ')}. ` : ''}A newer approved version now applies. The original assessment is kept for comparison.
          </p>
        )}
      </div>
    </section>
  )
}

const STEP_LABEL = {
  claims: 'Claim extraction (split by sentence instead)',
  judge: 'Whether each passage supports its claim',
  review: 'Intent and consistency checks',
}

/** What could not run, said plainly. A partial result is never presented as fully verified. */
export function PartialNotice({ assessment }) {
  if (!assessment?.partial) return null
  const reasons = [...new Set(assessment.unavailable.map((u) => u.reason.replace(/^Claims were split by sentence instead of by the model\. /, '')))]
  return (
    <div className="rise-in flex gap-3 rounded-2xl border border-dashed border-line/15 bg-bone/70 p-3.5">
      <CircleDashed size={18} className="mt-0.5 shrink-0 text-status-unknown" aria-hidden="true" />
      <div className="min-w-0 text-body-sm text-carbon">
        <div className="font-semibold text-ink">Partial assessment · not fully verified</div>
        <p className="mt-0.5">Not run by the model:</p>
        <ul className="ml-4 list-disc">
          {assessment.unavailable.map((u) => (
            <li key={u.step}>{STEP_LABEL[u.step] ?? u.step}</li>
          ))}
        </ul>
        <p className="mt-1 text-caption text-smoke">{reasons.join(' ')} The reliability index is capped below High and a reviewer must look at it.</p>
      </div>
    </div>
  )
}

const TRIGGER_LABEL = { initial: 'First assessment', reverify: 'Re-verification', correction: 'Correction check' }

/** Every assessment of this answer, oldest first, the latest compared with the one before it. Backend mode only. */
export function AssessmentHistory({ m }) {
  const [h, setH] = useState(null)
  const [trail, setTrail] = useState(false)
  useEffect(() => {
    if (!BACKEND || !m.serverId) return
    let live = true
    api.history(m.serverId).then(
      (x) => live && setH(x),
      () => live && setH({ failed: true }),
    )
    return () => {
      live = false
    }
  }, [m.serverId, m.history, m.state, m.outcome])
  if (!BACKEND || !m.serverId || !h) return null
  if (h.failed) return <p className="text-caption text-smoke">Could not load the assessment history.</p>
  const list = h.assessments
  const prev = list.length > 1 ? list[list.length - 2] : null
  const latest = list[list.length - 1]
  return (
    <section aria-labelledby={`hist-${m.id}`}>
      <div className="mb-3 flex items-baseline gap-2">
        <h3 id={`hist-${m.id}`} className="inline-flex items-center gap-1.5 text-body-sm font-semibold text-ink">
          <History size={14} aria-hidden="true" /> Assessment history
        </h3>
        <span className="ml-auto text-caption text-carbon">{list.length}</span>
      </div>
      <ol className="divide-y divide-line/[0.06] overflow-hidden rounded-2xl border border-line/[0.06] bg-surface/70">
        {list.map((a, i) => (
          <li key={a.id} className="px-3.5 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-body-sm font-semibold text-ink">
                {i + 1}. {TRIGGER_LABEL[a.trigger] ?? a.trigger}
              </span>
              <ScoreBadge score={a.result.score} />
              {a.result.assessment?.partial && <span className="text-caption text-smoke">partial</span>}
              <span className="ml-auto text-caption text-smoke">{formatTime(a.createdAt)}</span>
            </div>
            <div className="mt-1 text-caption text-smoke">
              Policy versions: {a.policyVersions.length ? a.policyVersions.map((v) => `${v.docId} ${v.version}`).join(', ') : 'none used'}
              {a.result.provenance ? ` · claims ${a.result.provenance.claims}, judge ${a.result.provenance.judgeChecks}` : ''}
            </div>
            {a.evidenceChanged && (
              <div className="mt-1 inline-flex items-center gap-1 text-caption font-medium text-status-caution">
                <RefreshCw size={12} aria-hidden="true" />
                <span className="text-carbon">
                  Evidence changed: {a.evidenceChanged.docId} {a.evidenceChanged.newVersion} approved
                </span>
              </div>
            )}
          </li>
        ))}
      </ol>
      {prev && <Comparison before={prev} after={latest} text={h.answer.text} />}
      {h.events.length > 0 && (
        <div className="mt-3">
          <button onClick={() => setTrail((o) => !o)} aria-expanded={trail} className="inline-flex items-center gap-1 text-body-sm font-medium text-carbon underline-offset-4 hover:text-ink hover:underline">
            Audit trail ({h.events.length}) <ChevronDown size={16} className={`transition-transform ${trail ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
          {trail && <AuditTrail events={h.events} />}
        </div>
      )}
    </section>
  )
}

function Comparison({ before, after, text }) {
  const key = (c) => `${c.start}:${c.end}`
  const old = Object.fromEntries(before.result.claims.map((c) => [key(c), c]))
  const rows = after.result.claims.map((c) => ({ c, was: old[key(c)] }))
  return (
    <div className="mt-3 rounded-2xl border border-line/[0.06] bg-surface/70 p-3.5">
      <div className="text-caption font-semibold text-smoke">Before → after re-verification</div>
      <ul className="mt-2 space-y-2">
        {rows.map(({ c, was }) => {
          const a = was && CLAIM_STATUS[was.status]
          const b = CLAIM_STATUS[c.status]
          return (
            <li key={c.id} className="text-body-sm">
              <p className="text-ink">“{text.slice(c.start, c.end)}”</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-caption">
                {a ? (
                  <span className={`inline-flex items-center gap-1 font-medium ${TONES[a.tone].text}`}>
                    <a.Icon size={12} aria-hidden="true" /> <span className="text-carbon">{a.label}</span>
                    {was.source?.version && (
                      <span className="text-smoke">
                        ({was.source.docId} {was.source.version})
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="text-smoke">not a claim before</span>
                )}
                <ArrowRight size={12} className="text-carbon" aria-hidden="true" />
                <span className={`inline-flex items-center gap-1 font-medium ${TONES[b.tone].text}`}>
                  <b.Icon size={12} aria-hidden="true" /> <span className="text-carbon">{b.label}</span>
                  {(c.counter ?? c.source)?.version && (
                    <span className="text-smoke">
                      ({(c.counter ?? c.source).docId} {(c.counter ?? c.source).version})
                    </span>
                  )}
                </span>
              </p>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function AuditTrail({ events }) {
  return (
    <ol className="rise-in mt-2 space-y-1.5 rounded-2xl bg-line/[0.03] p-3 text-caption text-carbon">
      {events.map((e) => (
        <li key={e.id} className="flex flex-wrap gap-x-2">
          <span className="text-smoke tabular-nums">{formatTime(e.at)}</span>
          <span className="font-medium text-ink">{e.action}</span>
          <span>
            by {e.actor}
            {e.simulated ? ' · simulated identity' : ''}
          </span>
          {e.detail?.note && <span className="text-smoke">“{e.detail.note}”</span>}
        </li>
      ))}
    </ol>
  )
}
