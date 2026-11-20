import { useEffect, useRef, useState } from 'react'
import { CircleCheck, X, RotateCw, ShieldCheck, ShieldAlert, ShieldX, Inbox, Clock, CalendarCheck, ScanSearch, SearchX, FileBarChart, LoaderCircle, ArrowRight, BookOpen, ChevronDown, Compass, Send } from 'lucide-react'
import { useStore, usePaneAnswer } from '../state/store'
import { CHECKS, CHECK_ICON, CHECK_STATUS, CLAIM_STATUS, TONES, VERDICT, SEVERITY, CHECK_DISPLAY_ORDER, severityOf, severityFor, bandFor } from '../lib/status'
import { scenarioById } from '../lib/pipeline'
import { visibleClaims, runningCheck } from '../lib/view'
import { freshnessOf, formatDate } from '../lib/freshness'
import { display } from '../lib/rules'
import { DOCUMENTS } from '../fixtures'
import { ScoreRing, CompositionBar, TONE_HEX, useCountUp } from './charts'

const BAND_SHIELD = { verified: ShieldCheck, caution: ShieldAlert, unsupported: ShieldX, unknown: ShieldAlert }

export default function VerifyPane() {
  const { state, dispatch, verifyAnswer } = useStore()
  const m = usePaneAnswer()
  const body = useRef(null)

  // Keep the chat and the pane pointing at the same claim.
  useEffect(() => {
    if (!state.focusClaimId) return
    const t = setTimeout(() => {
      document.getElementById(`pane-${state.focusClaimId}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      document.getElementById(`chat-${state.focusClaimId}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 60)
    return () => clearTimeout(t)
  }, [state.focusClaimId, state.focusNonce])

  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && dispatch({ type: 'closePane' })
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [dispatch])

  useEffect(() => {
    if (body.current) body.current.scrollTop = 0
  }, [m?.id, m?.runs])

  if (!m) return null
  const done = m.phase === 'done' && m.result
  const sc = scenarioById(m.scenarioId)

  return (
    <>
      {/* Phone: dim the chat behind the sheet; tap to close. */}
      <button aria-label="Close verification" onClick={() => dispatch({ type: 'closePane' })} className="fixed inset-0 z-30 bg-ink/20 backdrop-blur-[2px] lg:hidden" />
      <aside
        aria-labelledby="pane-title"
        className="pane-in glass fixed inset-x-0 bottom-0 z-40 flex max-h-[82dvh] min-h-0 flex-col overflow-hidden rounded-t-[28px] lg:static lg:max-h-none lg:w-[440px] lg:shrink-0 lg:rounded-3xl"
      >
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-black/15 lg:hidden" aria-hidden="true" />
        <header className="flex shrink-0 items-center gap-3 px-5 pt-3 pb-3 lg:pt-4">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-ink text-white">
            <ShieldCheck size={18} strokeWidth={2} />
          </span>
          <h2 id="pane-title" className="flex-1 text-body font-semibold text-ink">
            Verification
          </h2>
          <button
            onClick={() => verifyAnswer(m)}
            disabled={!done}
            title="Run the checks again against the latest policy library"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-caption font-medium text-carbon transition-colors hover:bg-black/5 disabled:opacity-50"
          >
            <RotateCw size={14} className={m.phase === 'verifying' ? 'spin' : ''} aria-hidden="true" /> Re-verify
          </button>
          <button onClick={() => dispatch({ type: 'closePane' })} aria-label="Close verification" className="grid size-9 shrink-0 place-items-center rounded-full text-carbon transition-colors hover:bg-black/5">
            <X size={18} />
          </button>
        </header>

        <div ref={body} className="scroll-quiet min-h-0 flex-1 overflow-y-auto px-5 pb-5">
          <Score m={m} key={`score-${m.id}-${m.runs}`} />
          <Divider />
          <Claims m={m} />
          <Divider />
          <Calculation m={m} />
          {done && (
            <>
              <Divider />
              <Sources m={m} sc={sc} />
              <ReportLink />
            </>
          )}
        </div>

        <Footer m={m} />
      </aside>
    </>
  )
}

const Divider = () => <div className="my-5 h-px bg-black/[0.07]" />

function SectionTitle({ children, aside }) {
  return (
    <div className="mb-3 flex items-baseline gap-2">
      <h3 className="text-body-sm font-semibold text-ink">{children}</h3>
      {aside && <span className="ml-auto text-caption text-carbon">{aside}</span>}
    </div>
  )
}

/* ─── Overall score ──────────────────────────────────────────────────────── */

function Score({ m }) {
  const r = m.result
  const band = r ? bandFor(r.score) : null
  const shown = useCountUp(r?.score ?? null)

  if (!r) {
    const running = runningCheck(m)
    return (
      <div className="rise-in flex items-center gap-5 pt-1" aria-live="polite">
        <ScoreRing checks={m.checks} size={132} stroke={11}>
          <LoaderCircle size={22} className="spin text-smoke" aria-hidden="true" />
        </ScoreRing>
        <div className="min-w-0 flex-1 space-y-2.5">
          <div className="text-body-sm font-medium text-ink">{running ? `Checking ${running.name.toLowerCase()}` : 'Starting checks'}</div>
          <div className="shimmer h-2.5 w-4/5 rounded-full" />
          <div className="shimmer h-2.5 w-3/5 rounded-full" />
        </div>
      </div>
    )
  }

  const v = VERDICT[band.id]
  const t = TONES[band.status]
  const Shield = BAND_SHIELD[band.status]
  return (
    <div className="rise-in" aria-live="polite">
      <div className="flex items-center gap-5 pt-1">
        <ScoreRing score={r.score} tone={band.status} size={132} stroke={11}>
          {r.score == null ? (
            <span className="text-body-sm font-medium text-smoke">No score</span>
          ) : (
            <span className="flex items-baseline">
              <span className="text-[40px] leading-none font-semibold tracking-[-1.5px] text-ink tabular-nums">{shown}</span>
              <span className="ml-0.5 text-caption text-smoke">/100</span>
            </span>
          )}
        </ScoreRing>
        <div className="min-w-0 flex-1">
          <div className={`eyebrow flex items-center gap-1.5 font-semibold ${t.text}`}>
            <Shield size={15} strokeWidth={2.25} aria-hidden="true" />
            {v.tag}
          </div>
          <p className="mt-1.5 text-subheading font-semibold text-ink">{r.headline}</p>
          {m.rerun && (
            <p className="mt-1 inline-flex items-center gap-1 text-caption text-carbon">
              <RotateCw size={12} aria-hidden="true" /> Re-checked just now. {m.rerun.same ? 'No change.' : `Was ${m.rerun.from}.`}
            </p>
          )}
        </div>
      </div>
      {r.guidance && (
        <div className="mt-4 flex gap-3 rounded-2xl border border-l-4 border-black/[0.06] bg-white/90 p-3.5" style={{ borderLeftColor: TONE_HEX[band.status] }}>
          <Compass size={18} className={`mt-0.5 shrink-0 ${t.text}`} aria-hidden="true" />
          <div>
            <div className="text-caption font-semibold text-carbon">What to do</div>
            <p className="text-body-sm font-medium text-ink">{r.guidance}</p>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── Claims ─────────────────────────────────────────────────────────────── */

function Claims({ m }) {
  const { state, dispatch } = useStore()
  const claims = [...visibleClaims(m)].sort((a, b) => severityOf(a.status) - severityOf(b.status) || a.start - b.start)

  if (!m.result && !claims.length) {
    return (
      <section>
        <SectionTitle>Claims</SectionTitle>
        <div className="shimmer h-2.5 rounded-full" />
        <p className="mt-2 text-caption text-carbon">Matching each sentence to policy</p>
      </section>
    )
  }
  if (!claims.length) {
    return (
      <section>
        <SectionTitle>Claims</SectionTitle>
        <p className="text-body-sm text-carbon">This reply makes no policy claims, so there is nothing to score.</p>
      </section>
    )
  }

  const flaggedClaims = claims.filter((c) => c.status !== 'supported')
  const okClaims = claims.filter((c) => c.status === 'supported')
  const groups = SEVERITY.map((s) => ({ ...s, n: claims.filter((c) => s.statuses.includes(c.status)).length })).filter((s) => s.n)
  const toggle = (c) => dispatch({ type: 'focusClaim', claimId: state.focusClaimId === c.id ? null : c.id })

  return (
    <section className="rise-in">
      <SectionTitle aside={`${claims.length} checked`}>Claims</SectionTitle>
      {/* Proportion of claims by severity, with its legend. */}
      <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={groups.map((g) => `${g.n} ${g.label}`).join(', ')}>
        {groups.map((g) => (
          <span key={g.id} className="h-full first:rounded-l-full last:rounded-r-full" style={{ flex: g.n, background: TONE_HEX[g.tone], opacity: g.id === 'nosource' ? 0.7 : 1 }} />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3.5 gap-y-1">
        {groups.map((g) => (
          <span key={g.id} className={`inline-flex items-center gap-1 text-caption font-medium ${TONES[g.tone].text}`}>
            <g.Icon size={13} strokeWidth={2.5} aria-hidden="true" />
            <span className="text-carbon">
              {g.label} <span className="tabular-nums">{g.n}</span>
            </span>
          </span>
        ))}
      </div>

      <ul className="mt-3.5 space-y-2">
        {flaggedClaims.map((c) => (
          <ClaimCard key={c.id} m={m} c={c} open={state.focusClaimId === c.id} onToggle={() => toggle(c)} />
        ))}
      </ul>
      {okClaims.length > 0 && <CorrectGroup m={m} claims={okClaims} focusId={state.focusClaimId} toggle={toggle} />}
    </section>
  )
}

function ClaimCard({ m, c, open, onToggle }) {
  const sev = severityFor(c.status)
  const t = TONES[sev.tone]
  const said = m.text.slice(c.start, c.end)
  return (
    <li id={`pane-${c.id}`}>
      <div
        className={`overflow-hidden rounded-2xl border bg-white/70 transition-shadow ${open ? 'shadow-md' : ''} ${c.status === 'no-source' ? 'border-dashed' : ''}`}
        style={{ borderColor: open || sev.id !== 'correct' ? `color-mix(in srgb, ${TONE_HEX[sev.tone]} ${open ? 70 : 30}%, transparent)` : 'rgb(0 0 0 / 0.06)' }}
      >
        <button onClick={onToggle} aria-expanded={open} className="flex w-full gap-3 p-3 text-left transition-colors hover:bg-white">
          <span className={`grid size-8 shrink-0 place-items-center rounded-xl ${t.surface} ${t.text}`} aria-hidden="true">
            <sev.Icon size={16} strokeWidth={2.25} />
          </span>
          <span className="min-w-0 flex-1">
            <span className={`text-body-sm text-ink ${open ? '' : 'line-clamp-2'}`}>“{said}”</span>
            <span className="mt-1 flex items-start gap-1.5 text-caption">
              <span className={`shrink-0 font-semibold ${t.text}`}>{sev.label}</span>
              {!open && <span className="text-carbon">{c.short ?? c.reason}</span>}
            </span>
          </span>
          <ChevronDown size={16} className={`mt-1.5 shrink-0 text-smoke transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
        {open && <Evidence m={m} c={c} />}
      </div>
    </li>
  )
}

/** The passage behind a verdict. Every flag cites one, or says why none exists. */
function Evidence({ m, c }) {
  const said = display(m.text.slice(c.start, c.end))
  const policy = c.counter ? display(c.counter.passage) : ''
  const swap = said && policy && said !== policy
  const f = c.source ? freshnessOf(c.source.docId) : null
  return (
    <div className="rise-in space-y-2.5 border-t border-black/5 bg-bone/60 p-3">
      {swap && (
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-xl bg-white p-3">
          <div>
            <div className="text-[12px] font-medium text-smoke">Answer says</div>
            <div className="text-body font-semibold whitespace-nowrap text-smoke line-through decoration-status-unsupported decoration-2 sm:text-subheading">{said}</div>
          </div>
          <ArrowRight size={18} className="text-carbon" aria-hidden="true" />
          <div>
            <div className="text-[12px] font-medium text-smoke">Policy says</div>
            <div className="text-body font-semibold whitespace-nowrap text-ink sm:text-subheading">{policy}</div>
          </div>
        </div>
      )}
      {c.counter && <PassageBox p={c.counter} label="Current policy" />}
      {c.source && (
        <PassageBox
          p={c.source}
          label={c.nearest ? 'Closest passage found (does not mention this)' : c.counter ? 'Source the answer used' : 'Source'}
          warn={f?.state === 'superseded' ? `Replaced on ${formatDate(f.supersededBy.updated)}` : f?.state === 'overdue' ? `${f.months} months old, review overdue` : null}
        />
      )}
      {!c.source && (
        <div className="flex items-center gap-2 rounded-xl bg-white p-3 text-body-sm text-carbon">
          <SearchX size={16} className="shrink-0 text-status-unsupported" aria-hidden="true" />
          No approved document mentions this. {c.reason.replace('No source found. ', '')}
        </div>
      )}
    </div>
  )
}

function PassageBox({ p, label, warn }) {
  const doc = DOCUMENTS[p.docId]
  return (
    <figure className="rounded-xl bg-white p-3">
      <figcaption className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] font-medium text-smoke">
        <BookOpen size={12} aria-hidden="true" />
        {label}
        {warn && (
          <span className="inline-flex items-center gap-1 rounded-full bg-status-caution-surface px-1.5 py-0.5 font-semibold text-status-caution">
            <Clock size={11} aria-hidden="true" />
            {warn}
          </span>
        )}
      </figcaption>
      <blockquote className="text-body-sm text-ink">“{p.passage}”</blockquote>
      <div className="mt-1.5 text-[12px] text-smoke">
        {doc.title} · {p.section}
      </div>
    </figure>
  )
}

/* ─── How the score is calculated ────────────────────────────────────────── */

function Calculation({ m }) {
  const items = CHECK_DISPLAY_ORDER.map((id) => {
    const i = CHECKS.findIndex((c) => c.id === id)
    return { ...CHECKS[i], ...m.checks[i], id }
  })
  const parts = m.result?.parts
  const capNote = parts?.capped ? (parts.cap < 95 ? 'no source found' : 'no answer is treated as certain') : null

  return (
    <section>
      <SectionTitle aside="6 checks against the policy library">How it's calculated</SectionTitle>
      {parts ? <CompositionBar claimPts={parts.claimPts} checkPts={parts.checkPts} score={m.result.score} capNote={capNote} /> : m.result ? null : <div className="shimmer h-2.5 rounded-full" />}
      <div className="mt-3.5 grid auto-rows-fr grid-cols-1 gap-2 sm:grid-cols-2">
        {items.map((it) => (
          <CheckBox key={it.id} it={it} />
        ))}
      </div>
    </section>
  )
}

function CheckBox({ it }) {
  const s = CHECK_STATUS[it.status]
  const t = TONES[s.tone]
  const Icon = CHECK_ICON[it.id]
  const settled = it.status !== 'queued' && it.status !== 'running'
  return (
    <div className="rounded-2xl border border-black/[0.06] bg-white/70 p-3" title={it.question}>
      <div className="flex items-center gap-2">
        <span className={`grid size-7 shrink-0 place-items-center rounded-lg ${settled ? `${t.surface} ${t.text}` : 'bg-black/5 text-smoke'}`} aria-hidden="true">
          <Icon size={15} strokeWidth={2} />
        </span>
        <span className="min-w-0 flex-1 truncate text-caption font-semibold text-ink">{it.name}</span>
      </div>
      <div className={`mt-2 inline-flex items-center gap-1 text-[12px] font-semibold ${settled ? t.text : 'text-smoke'}`}>
        <s.Icon size={13} strokeWidth={2.5} className={it.status === 'running' ? 'spin' : ''} aria-hidden="true" />
        {s.label}
      </div>
      {settled ? <p className="mt-0.5 text-caption leading-snug text-carbon">{it.short ?? it.summary}</p> : <div className="shimmer mt-1.5 h-2 w-4/5 rounded-full" />}
    </div>
  )
}

/* ─── Sources ────────────────────────────────────────────────────────────── */

function Sources({ m, sc }) {
  // Backend mode: retrieval and the search record come from the server's result.
  const retrieved = m.result?.retrieved ?? sc.verification.retrieved
  const ids = [...m.citations, ...retrieved.filter((d) => !m.citations.includes(d))]
  if (!ids.length) {
    const s = m.result?.search ?? sc.verification.search
    return (
      <section className="rise-in">
        <SectionTitle>Sources</SectionTitle>
        <div className="flex items-center gap-2 text-body-sm font-semibold text-ink">
          <SearchX size={17} className="text-status-unsupported" aria-hidden="true" />
          No approved source found
        </div>
        {s && (
          <div className="mt-3">
            <div className="relative h-2.5 rounded-full bg-black/5">
              <div className="h-full rounded-full bg-status-unsupported" style={{ width: `${s.topMatch * 100}%` }} />
              <span className="absolute -top-1 h-[18px] w-0.5 rounded-full bg-ink" style={{ left: `${s.threshold * 100}%` }} aria-hidden="true" />
            </div>
            <p className="mt-2 text-caption text-carbon">
              Searched {s.documentsSearched} approved documents. The closest one is only a {Math.round(s.topMatch * 100)}% match; a source needs {Math.round(s.threshold * 100)}%.
            </p>
          </div>
        )}
      </section>
    )
  }
  return (
    <section className="rise-in">
      <SectionTitle aside={`${ids.length} ${ids.length === 1 ? 'document' : 'documents'}`}>Sources</SectionTitle>
      <ul className="space-y-1.5">
        {ids.map((id) => {
          const doc = DOCUMENTS[id]
          const f = freshnessOf(id)
          const found = !m.citations.includes(id)
          const st = f.state === 'superseded' ? { label: 'Replaced', tone: 'unsupported', Icon: Clock } : f.state === 'overdue' ? { label: 'Overdue', tone: 'caution', Icon: Clock } : { label: 'Current', tone: 'verified', Icon: CalendarCheck }
          const t = TONES[st.tone]
          return (
            <li key={id} className="flex items-center gap-3 rounded-xl px-1 py-1.5">
              <st.Icon size={16} strokeWidth={2} className={`shrink-0 ${t.text}`} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-body-sm font-medium text-ink" title={doc.title}>
                  {doc.title}
                </div>
                {found && (
                  <div className="inline-flex items-center gap-1 text-[12px] text-smoke">
                    <ScanSearch size={11} aria-hidden="true" /> Not cited by the assistant; found by the verifier
                  </div>
                )}
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[12px] font-semibold ${t.surface} ${t.text}`}>
                {st.label} · {f.months}mo
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/* ─── Footer actions ─────────────────────────────────────────────────────── */

function Footer({ m }) {
  const { escalate } = useStore()
  const [composing, setComposing] = useState(false)
  const [note, setNote] = useState('')
  const done = m.phase === 'done'
  useEffect(() => {
    setComposing(false)
    setNote('')
  }, [m.id])

  if (composing && !m.routed) {
    return (
      <form
        className="rise-in shrink-0 space-y-2 border-t border-black/5 px-4 py-3"
        onSubmit={(e) => {
          e.preventDefault()
          escalate(m.id, note.trim())
          setComposing(false)
        }}
      >
        <label htmlFor="esc-note" className="text-caption font-medium text-carbon">
          Note for the reviewer (optional)
        </label>
        <textarea id="esc-note" rows={2} autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Client is waiting on a SGD 230k transfer today." className="w-full resize-none rounded-2xl border border-black/10 bg-white/80 px-3 py-2 text-body-sm text-ink placeholder:text-smoke focus:border-ocbc-red/40 focus:outline-none" />
        <div className="flex gap-2">
          <button type="button" onClick={() => setComposing(false)} className="rounded-full px-4 py-2.5 text-body-sm font-medium text-carbon hover:bg-black/5">
            Cancel
          </button>
          <button type="submit" className="ml-auto inline-flex items-center gap-2 rounded-full bg-ocbc-red px-5 py-2.5 text-body-sm font-medium text-white shadow-md transition-all hover:bg-ocbc-red-deep active:scale-[0.98]">
            <Send size={15} aria-hidden="true" /> Send
          </button>
        </div>
      </form>
    )
  }

  return (
    <div className="flex shrink-0 items-center gap-2 border-t border-black/5 px-4 py-3">
      {m.routed ? (
        <span className="inline-flex min-w-0 items-center gap-2 py-1.5 text-body-sm font-medium text-ink">
          <Inbox size={16} className="shrink-0 text-carbon" aria-hidden="true" />
          With a reviewer
          <span className="truncate text-caption font-normal text-smoke">{m.routed.by === 'auto' ? 'sent automatically' : 'sent by you'}</span>
        </span>
      ) : (
        <span className="text-caption text-smoke">{done ? 'Unsure? Ask a human to check it.' : 'Checking'}</span>
      )}
      {!m.routed && (
        <button
          onClick={() => setComposing(true)}
          disabled={!done}
          className={`ml-auto inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-body-sm font-medium whitespace-nowrap transition-all active:scale-[0.98] disabled:bg-black/15 disabled:text-white disabled:shadow-none ${m.result?.band?.id === 'high' ? 'border border-black/10 text-ink hover:bg-white' : 'bg-ocbc-red text-white shadow-md hover:bg-ocbc-red-deep'}`}
        >
          <Inbox size={16} aria-hidden="true" /> Send for review
        </button>
      )}
    </div>
  )
}

/** Correct claims fold into one row so the flags carry the pane. */
function CorrectGroup({ m, claims, focusId, toggle }) {
  const [open, setOpen] = useState(false)
  const show = open || claims.some((c) => c.id === focusId)
  return (
    <div className="mt-2">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={show} className="flex w-full items-center gap-3 rounded-2xl border border-black/[0.06] bg-white/70 p-3 text-left transition-colors hover:bg-white">
        <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-status-verified-surface text-status-verified" aria-hidden="true">
          <CircleCheck size={16} strokeWidth={2.25} />
        </span>
        <span className="flex-1 text-body-sm font-medium text-ink">
          {claims.length} {claims.length === 1 ? 'claim matches' : 'claims match'} policy
        </span>
        <ChevronDown size={16} className={`shrink-0 text-smoke transition-transform ${show ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {show && (
        <ul className="rise-in mt-2 space-y-2">
          {claims.map((c) => (
            <ClaimCard key={c.id} m={m} c={c} open={focusId === c.id} onToggle={() => toggle(c)} />
          ))}
        </ul>
      )}
    </div>
  )
}

/** The full evidence report is planned, not built. Say so plainly. */
function ReportLink() {
  return (
    <div className="mt-5 flex items-center gap-2 rounded-2xl border border-dashed border-black/10 px-3 py-2.5 text-caption text-smoke">
      <FileBarChart size={15} aria-hidden="true" />
      Detailed report with every passage
      <span className="ml-auto rounded-full bg-black/5 px-2 py-0.5 text-[12px] font-medium">Coming soon</span>
    </div>
  )
}
