import { useEffect, useRef, useState } from 'react'
import { X, Network, FileDown, LoaderCircle, BookOpen, ArrowLeft, Clock, CircleSlash, Bot, ScanSearch } from 'lucide-react'
import { useStore } from '../state/store'
import { documentById } from '../lib/library'
import { formatDate } from '../lib/freshness'
import { CLAIM_STATUS, TONES } from '../lib/status'
import { traceOfMessage, freshnessTrace, dependencyTrace, provenance, sectionOf, markFigures, FRESHNESS_KEY } from '../lib/trace'
import { Eyebrow, GhostButton, Pill, ScoreBadge, ClaimPill } from './ui'
import { SearchRecord } from './Evidence'
import { useTrustReport } from './TrustReport'

/** Claims in the order they appear in the answer, so "Claim 1" reads first. */
export const orderedClaims = (claims) => [...claims].sort((a, b) => a.start - b.start)

export function TrustChips({ m, claims }) {
  const { dispatch } = useStore()
  if (!claims.length) return null
  return (
    <div className="rise-in mt-3 flex flex-wrap items-center gap-1.5 text-caption text-smoke">
      <Network size={13} aria-hidden="true" /> Trust Map:
      {orderedClaims(claims).map((c, i) => {
        const s = CLAIM_STATUS[c.status] ?? CLAIM_STATUS.supported
        return (
          <button key={c.id} onClick={() => dispatch({ type: 'trust', id: m.id, claimId: c.id })} aria-label={`Claim ${i + 1}, ${s.label}. Open Trust Map.`} className="inline-flex items-center gap-1 rounded-full border border-frost px-2.5 py-0.5 font-medium text-carbon transition hover:-translate-y-px hover:border-ash hover:text-ink">
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
  const open = !!m?.result
  const dialog = useRef(null)
  const body = useRef(null)
  const [doc, setDoc] = useState(null) // { docId } while a source document is open
  const docOpen = useRef(false)
  docOpen.current = !!doc
  const [exporting, downloadReport] = useTrustReport()
  const close = () => dispatch({ type: 'trust', id: null })

  useEffect(() => setDoc(null), [t?.id, t?.claimId])

  // Modal behaviour: focus moves in, Tab stays in, Escape closes (or leaves the document), focus returns.
  useEffect(() => {
    if (!open) return
    const opener = document.activeElement
    const el = dialog.current
    el.querySelector('button')?.focus()
    const onKey = (e) => {
      if (e.key === 'Escape') docOpen.current ? setDoc(null) : close()
      if (e.key !== 'Tab') return
      const items = [...el.querySelectorAll('button:not([disabled]), [href], [tabindex="0"]')]
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      opener?.focus?.()
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!doc) body.current?.scrollTo({ top: 0 })
  }, [doc])

  if (!open) return null
  const a = traceOfMessage(m)
  const claims = orderedClaims(m.result.claims)
  const idx = Math.max(0, claims.findIndex((x) => x.id === t.claimId))
  const c = claims[idx]

  return (
    <div ref={dialog} className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true" aria-labelledby="trust-title">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={close} />
      <div className="rise-in relative flex h-full max-h-[880px] w-full max-w-[920px] flex-col overflow-hidden rounded-3xl border border-frost bg-porcelain shadow-xl">
        <header className="flex items-start justify-between gap-4 border-b border-frost px-6 py-5">
          <div className="min-w-0">
            <Eyebrow className="flex items-center gap-1.5">
              <Network size={13} aria-hidden="true" /> Trust Map · how this answer was verified
            </Eyebrow>
            <h2 id="trust-title" className="mt-2 text-subheading font-medium text-ink">
              “{a.question}”
            </h2>
            <div className="mt-2">
              <ScoreBadge score={m.result.score} />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <GhostButton onClick={() => downloadReport(a)} disabled={exporting}>
              {exporting ? <LoaderCircle size={16} className="spin" aria-hidden="true" /> : <FileDown size={16} aria-hidden="true" />}
              {exporting ? 'Preparing PDF…' : 'Download PDF'}
            </GhostButton>
            <button onClick={close} aria-label="Close Trust Map" className="grid size-9 place-items-center rounded-full border border-frost text-carbon hover:border-ash">
              <X size={16} />
            </button>
          </div>
        </header>

        <div className="flex gap-1.5 overflow-x-auto border-b border-frost px-6 py-3" role="group" aria-label="Claims">
          {claims.map((x, i) => {
            const s = CLAIM_STATUS[x.status]
            const on = x.id === c.id
            return (
              <button key={x.id} onClick={() => dispatch({ type: 'trust', id: m.id, claimId: x.id })} aria-pressed={on} className={`flex max-w-[260px] shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-caption font-medium transition-colors ${on ? 'border-carbon bg-bone text-ink' : 'border-frost text-carbon hover:border-ash hover:text-ink'}`}>
                <s.Icon size={14} strokeWidth={2.25} className={`shrink-0 ${TONES[s.tone].text}`} aria-hidden="true" />
                <span className="shrink-0">Claim {i + 1}</span>
                <span className="truncate font-normal text-smoke">· {a.text.slice(x.start, x.end)}</span>
                <span className="sr-only">, {s.label}</span>
              </button>
            )
          })}
        </div>

        <div ref={body} key={`${c.id}-${doc?.docId ?? ''}`} className="scroll-quiet min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {doc ? <DocumentView docId={doc.docId} c={c} n={idx + 1} onBack={() => setDoc(null)} onOpen={(docId) => setDoc({ docId })} /> : <ClaimTrace a={a} c={c} n={idx + 1} total={claims.length} onOpen={(docId) => setDoc({ docId })} />}
        </div>
      </div>
    </div>
  )
}

function ClaimTrace({ a, c, n, total, onOpen }) {
  const st = CLAIM_STATUS[c.status]
  const tone = TONES[st.tone]
  const dep = dependencyTrace(c, a)
  return (
    <div className="space-y-6">
      <section aria-label="Verdict" className={`rounded-2xl border p-5 ${tone.border} ${tone.surface}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <ClaimPill status={c.status} />
          <span className="text-caption text-smoke">
            Claim {n} of {total}
          </span>
        </div>
        <blockquote className="mt-3 text-body font-medium text-ink">“{a.text.slice(c.start, c.end)}”</blockquote>
        <p className="mt-2 max-w-[65ch] text-body-sm text-carbon">
          <span className="font-semibold text-ink">Why: </span>
          {c.reason}
        </p>
      </section>

      <section aria-labelledby="trace-title">
        <Eyebrow>
          <span id="trace-title">How Assessment AI traced it</span>
        </Eyebrow>
        <ol className="mt-3">
          {c.counter ? (
            <Step n={1} title="Where the claim comes from, and what contradicts it">
              <Compare c={c} a={a} onOpen={onOpen} />
            </Step>
          ) : (
            <Step n={1} title="Where the claim comes from" last={!c.source}>
              {c.source ? (
                <SourceBlock s={c.source} a={a} onOpen={onOpen} />
              ) : (
                <>
                  <div className="eyebrow mb-2 flex items-center gap-1.5 text-status-unknown">
                    <CircleSlash size={13} aria-hidden="true" /> No source found
                  </div>
                  <SearchRecord scenarioId={a.scenarioId} search={a.result.search} />
                </>
              )}
            </Step>
          )}
          {c.source && (
            <Step n={2} title="Is the source current?">
              <Freshness docId={c.source.docId} />
            </Step>
          )}
          {c.source && (
            <Step n={3} title="How much rests on it" last>
              <div className="flex flex-wrap items-center gap-2">
                <Pill Icon={dep.Icon} label={dep.label} tone={dep.tone} />
                <span className="text-body-sm text-carbon">{dep.text}</span>
              </div>
            </Step>
          )}
        </ol>
      </section>
    </div>
  )
}

function Step({ n, title, last, children }) {
  return (
    <li className="relative flex gap-4 pb-5 last:pb-0">
      {!last && <span className="absolute top-8 bottom-0 left-[13px] w-px bg-frost" aria-hidden="true" />}
      <span className="grid size-7 shrink-0 place-items-center rounded-full border border-frost bg-porcelain text-caption font-semibold text-carbon" aria-hidden="true">
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="mb-2 pt-0.5 text-body-sm font-semibold text-ink">{title}</h3>
        {children}
      </div>
    </li>
  )
}

function Provenance({ docId, a }) {
  const p = provenance(docId, a)
  const tags = [p.cited && { Icon: Bot, label: 'Cited by the agent' }, p.retrieved && { Icon: ScanSearch, label: 'Found by the verifier' }].filter(Boolean)
  if (!tags.length) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((x) => (
        <span key={x.label} className="inline-flex items-center gap-1 rounded-xl border border-frost bg-porcelain px-2 py-0.5 text-caption font-medium text-carbon">
          <x.Icon size={13} aria-hidden="true" /> {x.label}
        </span>
      ))}
    </div>
  )
}

function DocLine({ s }) {
  const d = documentById(s.docId)
  const sec = sectionOf(s.docId, s.section)
  return (
    <div>
      <div className="text-body-sm font-semibold text-ink">{d.title}</div>
      <div className="text-caption text-smoke">
        {s.docId} · {d.version} · Section {s.section}
        {sec ? ` · ${sec.heading}` : ''}
      </div>
    </div>
  )
}

function OpenButton({ s, onOpen }) {
  return (
    <GhostButton onClick={() => onOpen(s.docId)} className="!px-3 !py-1.5 text-caption">
      <BookOpen size={14} aria-hidden="true" /> Open document at {s.section}
    </GhostButton>
  )
}

function SourceBlock({ s, a, onOpen }) {
  return (
    <div className="rounded-2xl border border-frost p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <DocLine s={s} />
        <OpenButton s={s} onOpen={onOpen} />
      </div>
      <blockquote className="mt-3 rounded-2xl bg-bone px-4 py-3 text-body-sm text-ink">“{s.passage}”</blockquote>
      <div className="mt-3">
        <Provenance docId={s.docId} a={a} />
      </div>
    </div>
  )
}

function Marked({ parts }) {
  return parts.map((p, i) =>
    p.diff ? (
      <mark key={i} className="rounded-xl bg-frost px-1 font-semibold text-ink [box-decoration-break:clone]">
        {p.text}
      </mark>
    ) : (
      <span key={i}>{p.text}</span>
    ),
  )
}

function Compare({ c, a, onOpen }) {
  const claim = a.text.slice(c.start, c.end)
  const cols = [
    { label: 'The claim relies on', s: c.source, parts: markFigures(c.source.passage, claim, { contradicting: false }) },
    { label: 'This source says otherwise', s: c.counter, parts: markFigures(c.counter.passage, claim, { contradicting: true }) },
  ]
  const marked = cols.some((x) => x.parts.some((p) => p.diff))
  return (
    <div className="rounded-2xl border border-frost p-4">
      <div className="grid gap-4 md:grid-cols-2">
        {cols.map((x) => (
          <div key={x.label} className="flex flex-col gap-2">
            <Eyebrow>{x.label}</Eyebrow>
            <DocLine s={x.s} />
            <blockquote className="flex-1 rounded-2xl bg-bone px-4 py-3 text-body-sm text-ink">
              “<Marked parts={x.parts} />”
            </blockquote>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Provenance docId={x.s.docId} a={a} />
              <OpenButton s={x.s} onOpen={onOpen} />
            </div>
          </div>
        ))}
      </div>
      {marked && <p className="mt-3 text-caption text-smoke">Highlighted: the figure the claim repeats, and the figure that contradicts it.</p>}
    </div>
  )
}

function Freshness({ docId }) {
  const fr = freshnessTrace(docId)
  return (
    <div className="rounded-2xl border border-frost p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Pill Icon={fr.Icon} label={fr.label} tone={fr.tone} />
        <span className="text-body-sm text-carbon">
          Ratified {formatDate(fr.d.updated)} · {fr.f.note.replace('Last updated ', '')}
        </span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-frost" role="img" aria-label={`${fr.pct}% of the ${fr.d.reviewCycleMonths}-month review cycle used`}>
        <div className={`growx h-full rounded-full ${TONES[fr.tone].fill}`} style={{ width: `${fr.pct}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-caption text-smoke">
        <span>Ratified</span>
        <span>Review due after {fr.d.reviewCycleMonths} months</span>
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-caption text-carbon" aria-label="Freshness key">
        {FRESHNESS_KEY.map((k) => (
          <li key={k.tone} className="inline-flex items-center gap-1">
            <k.Icon size={13} className={TONES[k.tone].text} aria-hidden="true" /> {k.label}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** The whole source document, scrolled to the section the claim relied on. */
function DocumentView({ docId, c, n, onBack, onOpen }) {
  const d = documentById(docId)
  const fr = freshnessTrace(docId)
  const target = useRef(null)
  const st = CLAIM_STATUS[c.status]
  const marks = {}
  if (c.source?.docId === docId) marks[c.source.section] = { label: `Claim ${n} relies on this section`, Icon: st.Icon, cls: `${TONES[st.tone].border} ${TONES[st.tone].surface}`, text: TONES[st.tone].text }
  if (c.counter?.docId === docId) marks[c.counter.section] = { label: `This section contradicts claim ${n}`, Icon: BookOpen, cls: 'border-carbon bg-bone', text: 'text-carbon' }

  const first = d.sections.find((s) => marks[s.id])?.id
  useEffect(() => {
    target.current?.scrollIntoView({ block: 'center' })
  }, [])

  return (
    <article aria-labelledby="doc-title">
      <GhostButton onClick={onBack} className="!px-3 !py-1.5 text-caption">
        <ArrowLeft size={14} aria-hidden="true" /> Back to claim {n}
      </GhostButton>

      <header className="mt-4">
        <Eyebrow>Source document · synthetic policy</Eyebrow>
        <h3 id="doc-title" className="mt-1.5 text-heading-sm font-semibold text-ink">
          {d.title}
        </h3>
        <div className="mt-1 text-body-sm text-smoke">
          {d.id} · {d.version} · Owner: {d.owner} · Ratified {formatDate(d.updated)}
        </div>
        <div className="mt-3">
          <Pill Icon={fr.Icon} label={fr.label} tone={fr.tone} />
        </div>
      </header>

      {fr.f.supersededBy && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-status-caution bg-status-caution-surface p-4">
          <span className="flex items-center gap-2 text-body-sm text-ink">
            <Clock size={16} className="shrink-0 text-status-caution" aria-hidden="true" />
            Superseded by {fr.f.supersededBy.id} · {fr.f.supersededBy.title}
          </span>
          <GhostButton onClick={() => onOpen(fr.f.supersededBy.id)} className="!px-3 !py-1.5 bg-porcelain text-caption">
            <BookOpen size={14} aria-hidden="true" /> Open current version
          </GhostButton>
        </div>
      )}

      <div className="mt-5 space-y-3">
        {d.sections.map((s) => {
          const mk = marks[s.id]
          return (
            <section key={s.id} ref={s.id === first ? target : undefined} aria-label={`Section ${s.id}`} className={`scroll-mt-4 rounded-2xl border p-4 ${mk ? mk.cls : 'border-frost'}`}>
              {mk && (
                <div className={`eyebrow mb-2 flex items-center gap-1.5 ${mk.text}`}>
                  <mk.Icon size={13} aria-hidden="true" /> {mk.label}
                </div>
              )}
              <h4 className="text-body-sm font-semibold text-ink">
                {s.id} · {s.heading}
              </h4>
              <p className="mt-1 text-body text-ink">{s.text}</p>
            </section>
          )
        })}
      </div>
    </article>
  )
}
