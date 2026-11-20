import { useEffect } from 'react'
import { X, FileText, CalendarClock, Layers, Quote, ArrowDownToLine, Network, CircleCheck, TriangleAlert, CircleX, GitCompareArrows } from 'lucide-react'
import { useStore } from '../state/store'
import { DOCUMENTS } from '../fixtures'
import { freshnessOf, formatDate, monthsBetween } from '../lib/freshness'
import { scenarioById } from '../lib/pipeline'
import { CLAIM_STATUS, TONES } from '../lib/status'

// Freshness: red = superseded/overdue, yellow = 6+ months since ratification (review pending), green = recent.
// `ref` is the passage the result carries. In backend mode it names the exact
// version assessed, so that is what the map shows; demo mode reads the fixtures.
function fresh(ref) {
  if (ref.version) {
    const months = monthsBetween(ref.effectiveFrom)
    const f = { stale: ref.state !== 'current', state: ref.state, months, note: ref.note }
    const d = { updated: ref.effectiveFrom, reviewCycleMonths: Math.max(1, monthsBetween(ref.effectiveFrom, ref.reviewDate)) }
    return grade(f, d)
  }
  return grade(freshnessOf(ref.docId), DOCUMENTS[ref.docId])
}

function grade(f, d) {
  const tone = f.stale ? 'unsupported' : f.months >= 6 ? 'caution' : 'verified'
  const label = f.state === 'superseded' ? 'Outdated · superseded' : f.state === 'overdue' ? 'Outdated · review overdue' : f.months >= 6 ? 'Pending review' : 'Recently ratified'
  const pct = Math.min(100, Math.round((f.months / d.reviewCycleMonths) * 100))
  return { f, d, tone, label, pct, Icon: tone === 'verified' ? CircleCheck : tone === 'caution' ? TriangleAlert : CircleX }
}

const titleOf = (ref) => ref.title ?? DOCUMENTS[ref.docId]?.title ?? ref.docId

function dependency(c, m) {
  const retrieved = m.result?.retrieved ?? scenarioById(m.scenarioId).verification.retrieved ?? []
  if (c.counter && c.counter.docId === c.source.docId && c.counter.version === c.source.version) return { tone: 'unsupported', label: 'Contradicted by its source', Icon: GitCompareArrows, text: `${titleOf(c.source)} ${c.source.version ?? ''} states a different figure.` }
  if (c.counter) return { tone: 'unsupported', label: 'Conflicting sources', Icon: GitCompareArrows, text: `${titleOf(c.source)}${c.source.version ? ` ${c.source.version}` : ''} and ${titleOf(c.counter)}${c.counter.version ? ` ${c.counter.version}` : ''} disagree.` }
  const both = m.citations.includes(c.source.docId) && retrieved.includes(c.source.docId)
  if (both) return { tone: 'verified', label: 'Cross-validated', Icon: Layers, text: 'The agent cited it and the verifier retrieved it independently.' }
  return { tone: 'caution', label: 'Single-source dependency', Icon: Layers, text: 'Only one document backs this claim. If it changes, the claim fails.' }
}

function Node({ i, tone, Icon, title, children }) {
  const t = TONES[tone ?? 'unknown']
  return (
    <div className="pop relative" style={{ animationDelay: `${i * 140}ms` }}>
      {i > 0 && (
        <div className="relative mx-auto h-7 w-px bg-frost" aria-hidden="true">
          <div className="grow absolute inset-0 bg-ash" style={{ animationDelay: `${i * 140}ms` }} />
          <span className="travel absolute -left-[3px] size-2 rounded-full bg-ocbc-red shadow-[0_0_10px_#e4002b]" style={{ animationDelay: `${i * 200}ms` }} />
        </div>
      )}
      <div className={`rounded-2xl border p-4 ${tone ? `${t.border} ${t.surface}` : 'border-frost bg-bone'}`}>
        <div className={`eyebrow flex items-center gap-1.5 ${tone ? t.text : 'text-smoke'}`}><Icon size={13} strokeWidth={2.25} aria-hidden="true" /> {title}</div>
        <div className="mt-1.5 text-body-sm text-ink">{children}</div>
      </div>
    </div>
  )
}

// The passage text and version shown are the ones on the result, never re-read from the fixtures.
const Passage = ({ s, label }) => {
  const d = DOCUMENTS[s.docId]
  const heading = !s.version ? d?.sections.find((x) => x.id === s.section)?.heading : null
  return (
    <div>
      {label && <div className="text-caption font-medium text-status-unsupported">{label}</div>}
      <div className="font-medium">{titleOf(s)} <span className="text-smoke">{s.version ?? d?.version} · {s.docId}</span></div>
      <div className="text-caption text-carbon">Section {s.section}{heading ? ` · ${heading}` : ''}{s.state && s.state !== 'current' ? ` · ${s.state === 'superseded' ? 'superseded version' : 'review overdue'}` : ''}</div>
      <p className="mt-1.5 rounded-xl bg-porcelain/70 px-3 py-2 text-caption text-carbon">“{s.passage}”</p>
    </div>
  )
}

export function TrustChips({ m, claims }) {
  const { dispatch } = useStore()
  const cs = claims.filter((c) => c.source)
  if (!cs.length) return null
  return (
    <div className="rise-in mt-3 flex flex-wrap items-center gap-1.5 text-caption text-smoke">
      <Network size={13} aria-hidden="true" /> Trust Map:
      {cs.map((c, i) => {
        const s = CLAIM_STATUS[c.status] ?? CLAIM_STATUS.supported
        return (
          <button key={c.id} onClick={() => dispatch({ type: 'trust', id: m.id, claimId: c.id })} className="inline-flex items-center gap-1 rounded-full border border-frost px-2.5 py-0.5 font-medium text-carbon transition hover:-translate-y-px hover:border-ash hover:text-ink">
            <s.Icon size={12} className={TONES[s.tone].text} aria-hidden="true" /> Claim {i + 1}
          </button>
        )
      })}
    </div>
  )
}

export default function TrustMap() {
  const { state, dispatch } = useStore()
  const t = state.trust
  const m = t && state.messages.find((x) => x.id === t.id)
  const close = () => dispatch({ type: 'trust', id: null })
  useEffect(() => {
    if (!t) return
    const k = (e) => e.key === 'Escape' && close()
    document.addEventListener('keydown', k)
    return () => document.removeEventListener('keydown', k)
  }, [t])
  if (!m?.result) return null
  const claims = m.result.claims.filter((c) => c.source)
  const c = claims.find((x) => x.id === t.claimId) ?? claims[0]
  const st = CLAIM_STATUS[c.status], fr = fresh(c.source), dep = dependency(c, m)

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label="Trust Map">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={close} />
      <div className="glass pop relative max-h-full w-full max-w-[640px] overflow-hidden rounded-3xl border border-frost shadow-xl">
        <div className="aurora pointer-events-none absolute -top-24 -right-16 size-64 rounded-full bg-ocbc-red/25" aria-hidden="true" />
        <div className="aurora pointer-events-none absolute -bottom-24 -left-16 size-64 rounded-full bg-[#7c5cff]/20" aria-hidden="true" />
        <div className="relative flex items-center justify-between border-b border-frost px-6 py-4">
          <div>
            <div className="eyebrow flex items-center gap-1.5 text-smoke"><Network size={13} aria-hidden="true" /> Proof-of-Trust · Trust Map</div>
            <div className="text-body-sm font-medium text-ink">How this claim was verified</div>
          </div>
          <button onClick={close} aria-label="Close Trust Map" className="grid size-9 place-items-center rounded-full border border-frost text-carbon hover:border-ash"><X size={16} /></button>
        </div>
        <div className="relative flex gap-1.5 overflow-x-auto px-6 pt-4">
          {claims.map((x, i) => (
            <button key={x.id} onClick={() => dispatch({ type: 'trust', id: m.id, claimId: x.id })} aria-pressed={x.id === c.id} className={`shrink-0 rounded-full border px-3 py-1 text-caption font-medium transition ${x.id === c.id ? 'border-carbon text-ink' : 'border-frost text-smoke hover:text-ink'}`}>Claim {i + 1}</button>
          ))}
        </div>
        <div key={c.id} className="scroll-quiet relative max-h-[68vh] overflow-y-auto px-6 pt-4 pb-6">
          <Node i={0} tone={st.tone} Icon={st.Icon} title={`Claim · ${st.label}`}>“{m.text.slice(c.start, c.end)}”</Node>
          <Node i={1} Icon={FileText} title="Document origin"><Passage s={c.source} /></Node>
          {c.counter && <Node i={2} tone="unsupported" Icon={GitCompareArrows} title="Counter-evidence found"><Passage s={c.counter} label="Current policy says otherwise" /></Node>}
          <Node i={c.counter ? 3 : 2} tone={fr.tone} Icon={CalendarClock} title={`Freshness · ${fr.label}`}>
            <div className="flex items-center gap-1.5"><fr.Icon size={14} className={TONES[fr.tone].text} aria-hidden="true" /> Ratified {formatDate(fr.d.updated)} · {fr.f.note.replace('Last updated ', '')}</div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-frost" role="img" aria-label={`${fr.pct}% of the review cycle used`}>
              <div className={`growx h-full rounded-full ${TONES[fr.tone].fill}`} style={{ width: `${fr.pct}%` }} />
            </div>
            <div className="mt-1 flex justify-between text-caption text-smoke"><span>Ratified</span><span>Review due after {fr.d.reviewCycleMonths} months</span></div>
            <div className="mt-2 flex flex-wrap gap-3 text-caption text-carbon">
              <span>Green: recent</span><span>Yellow: review pending (6+ months)</span><span>Red: outdated or superseded</span>
            </div>
          </Node>
          <Node i={c.counter ? 4 : 3} tone={dep.tone} Icon={dep.Icon} title={`Dependency risk · ${dep.label}`}>{dep.text}</Node>
          <Node i={c.counter ? 5 : 4} Icon={ArrowDownToLine} title="Why this verdict">{c.reason}</Node>
        </div>
      </div>
    </div>
  )
}

