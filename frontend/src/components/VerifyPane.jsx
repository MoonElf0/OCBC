import { useEffect, useRef, useState } from 'react'
import { CircleCheck, CircleX, TriangleAlert, X, RotateCw, ShieldCheck, ShieldAlert, ShieldX, Inbox, Clock, CalendarCheck, ScanSearch, SearchX, LoaderCircle, ArrowRight, BookOpen, ChevronDown, Send, RefreshCw, FileQuestion, ListChecks, Calculator, Library, GitCompareArrows, CircleDashed } from 'lucide-react'
import { useStore, usePaneAnswer } from '../state/store'
import { CHECKS, CHECK_ICON, CHECK_STATUS, CLAIM_STATUS, TONES, VERDICT, SEVERITY, CHECK_DISPLAY_ORDER, severityOf, severityFor, bandFor } from '../lib/status'
import { scenarioById } from '../lib/pipeline'
import { visibleClaims, runningCheck } from '../lib/view'
import { freshnessOf, formatDate } from '../lib/freshness'
import { display } from '../lib/rules'
import { DOCUMENTS } from '../fixtures'
import { BACKEND } from '../lib/backend'
import { ScoreRing, CompositionBar, TONE_HEX, useCountUp } from './charts'
import { docInfo } from './ui'
import { StateCard, PartialNotice, AssessmentHistory } from './lifecycle'

/**
 * Freshness of a passage. Backend passages carry the state of the exact
 * version assessed; demo passages read the fixture library. Documents outside
 * the library (a submitted answer can cite anything) have none.
 */
function passageFreshness(p) {
  if (p?.version && p.state) return { state: p.state, stale: p.state !== 'current', superseded: p.supersededBy, reviewDate: p.reviewDate }
  if (!p?.docId || !DOCUMENTS[p.docId]) return null
  return freshnessOf(p.docId)
}

/** Citations as written ("DOC-FX-019 §2.1") reduced to document ids. */
const citedIds = (citations) => [...new Set(citations.map((c) => c.toUpperCase().match(/DOC-[A-Z]+-\d+/)?.[0]).filter(Boolean))]

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
      <button aria-label="Close verification" onClick={() => dispatch({ type: 'closePane' })} className="fixed inset-0 z-30 bg-inverse/25 backdrop-blur-[3px] lg:hidden" />
      <aside
        aria-labelledby="pane-title"
        className="pane-in glass-strong fixed inset-x-0 bottom-0 z-40 flex max-h-[85dvh] min-h-0 flex-col overflow-hidden rounded-t-[28px] lg:static lg:max-h-none lg:w-[468px] lg:shrink-0 lg:rounded-[28px] xl:w-[508px]"
      >
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-line/15 lg:hidden" aria-hidden="true" />
        <header className="flex shrink-0 items-center gap-3 px-5 pt-3 pb-3 lg:pt-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-inverse text-white shadow-md">
            <ShieldCheck size={19} strokeWidth={2} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="pane-title" className="text-body font-semibold tracking-[-0.2px] text-ink">
              Verification
            </h2>
            <p className="truncate text-caption text-smoke">Independent check of this answer</p>
          </div>
          <button
            onClick={() => verifyAnswer(m)}
            disabled={!done}
            title="Run the checks again against the latest policy library"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-line/[0.04] px-3 py-1.5 text-caption font-medium text-carbon transition-colors hover:bg-line/[0.08] hover:text-ink disabled:opacity-50"
          >
            <RotateCw size={14} className={m.phase === 'verifying' ? 'spin' : ''} aria-hidden="true" /> Re-verify
          </button>
          <button onClick={() => dispatch({ type: 'closePane' })} aria-label="Close verification" className="grid size-9 shrink-0 place-items-center rounded-full text-carbon transition-colors hover:bg-line/[0.06] hover:text-ink">
            <X size={18} />
          </button>
        </header>

        <div ref={body} className="scroll-quiet min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-4">
          <Score m={m} sc={sc} key={`score-${m.id}-${m.runs}`} />
          <SecondVerifier m={m} />
          <Card id="sec-claims">
            <Claims m={m} />
          </Card>
          {done && (
            <Card id="sec-sources">
              <Sources m={m} sc={sc} />
            </Card>
          )}
          <Calculation m={m} />
          {done && (
            <>
              {(m.source === 'submitted' || m.state === 'reverify-required') && <StateCard m={m} />}
              <AssessmentHistoryBlock m={m} />
            </>
          )}
        </div>

        <Footer m={m} />
      </aside>
    </>
  )
}

/** A section of the pane: one glass layer above the panel. */
const Card = ({ children, id, className = '' }) => (
  <div id={id} className={`pane-card rise-in scroll-mt-3 rounded-[22px] p-4 ${className}`}>
    {children}
  </div>
)

function SectionTitle({ children, aside, icon: Icon }) {
  return (
    <div className="mb-3.5 flex items-center gap-2.5">
      {Icon && (
        <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-line/[0.05] text-carbon" aria-hidden="true">
          <Icon size={16} strokeWidth={2} />
        </span>
      )}
      <h3 className="text-[15px] font-semibold tracking-[-0.2px] text-ink">{children}</h3>
      {aside && <span className="ml-auto text-caption text-smoke">{aside}</span>}
    </div>
  )
}

/* ─── Overall score ──────────────────────────────────────────────────────── */

function Score({ m, sc }) {
  const r = m.result
  const band = r ? bandFor(r.score) : null
  const shown = useCountUp(r?.score ?? null)

  if (!r) {
    const running = runningCheck(m)
    const doneN = m.checks.filter((k) => k.status !== 'queued' && k.status !== 'running').length
    return (
      <div className="hero-card rise-in relative overflow-hidden rounded-[24px] p-5" aria-live="polite">
        <div className="flex items-center gap-5">
          <ScoreRing checks={m.checks} size={148} stroke={10}>
            <span className="flex flex-col items-center">
              <LoaderCircle size={20} className="spin text-smoke" aria-hidden="true" />
              <span className="mt-1 text-[11px] font-medium text-smoke tabular-nums">
                {doneN}/{CHECKS.length}
              </span>
            </span>
          </ScoreRing>
          <div className="min-w-0 flex-1">
            <div className="eyebrow font-semibold text-smoke">Verifying</div>
            <div className="mt-1.5 text-subheading font-semibold text-ink">{running ? `Checking ${running.name.toLowerCase()}` : 'Starting checks'}</div>
            <div className="mt-3 space-y-2">
              <div className="shimmer h-2 w-4/5 rounded-full" />
              <div className="shimmer h-2 w-3/5 rounded-full" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  const v = VERDICT[band.id]
  const t = TONES[band.status]
  const Shield = BAND_SHIELD[band.status]
  return (
    <>
      <div className="hero-card rise-in relative overflow-hidden rounded-[24px] p-5" style={{ '--ring-tone': TONE_HEX[band.status] }} aria-live="polite">
        <div className="hero-sheen" aria-hidden="true" />
        <div className="relative flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 text-body-sm font-semibold ${t.text}`}>
            <Shield size={16} strokeWidth={2.25} aria-hidden="true" />
            {v.tag}
          </span>
          <span className="ml-auto text-caption text-smoke">Reliability index</span>
        </div>
        <div className="relative mt-3 flex items-center gap-4">
          <ScoreRing score={r.score} tone={band.status} size={116} stroke={8}>
            {r.score == null ? (
              <span className="text-caption font-medium text-smoke">No score</span>
            ) : (
              <span className="flex flex-col items-center" aria-label={`${r.score} out of 100, ${band.label}`}>
                <span className="flex items-baseline">
                  <span className="text-[32px] leading-none font-semibold tracking-[-1.5px] text-ink tabular-nums">{shown}</span>
                  <span className="ml-0.5 text-[11px] font-medium text-smoke">/100</span>
                </span>
                <span className={`mt-0.5 text-[10px] font-semibold tracking-[0.08em] uppercase ${t.text}`}>{band.label}</span>
              </span>
            )}
          </ScoreRing>
          <div className="min-w-0 flex-1">
            {r.guidance && <div className="text-caption font-medium text-smoke">{r.headline}</div>}
            <p className="mt-0.5 text-[19px] leading-[1.3] font-semibold tracking-[-0.4px] text-ink">{r.guidance ?? r.headline}</p>
            {m.rerun && (
              <p className="mt-1.5 inline-flex items-center gap-1 text-caption text-carbon">
                <RotateCw size={12} aria-hidden="true" /> Re-checked just now. {m.rerun.same ? 'No change.' : `Was ${m.rerun.from}.`}
              </p>
            )}
          </div>
        </div>
        <AtAGlance m={m} sc={sc} />
      </div>
      {r.assessment?.partial && <PartialNotice assessment={r.assessment} />}
    </>
  )
}

/** Three tiles under the score that jump to their section. Each with an icon and words, never colour alone. */
function AtAGlance({ m, sc }) {
  const claims = visibleClaims(m)
  const flagged = claims.filter((c) => c.status !== 'supported').length
  const checks = m.checks.map((k) => k.status)
  const pass = checks.filter((x) => x === 'pass').length
  const fails = checks.filter((x) => x === 'fail').length
  const warns = checks.filter((x) => x === 'warning').length
  const rows = sourceRows(m, sc)
  const stale = rows.filter((x) => x.st.tone === 'caution').length
  const tiles = [
    { id: 'sec-claims', label: 'Claims', value: claims.length ? (flagged ? `${flagged} of ${claims.length} wrong` : `All ${claims.length} match`) : 'None made', tone: flagged ? 'unsupported' : 'verified', Icon: flagged ? CircleX : CircleCheck },
    { id: 'sec-sources', label: 'Sources', value: !rows.length ? 'None found' : stale ? `${stale} out of date` : 'All current', tone: !rows.length ? 'unsupported' : stale ? 'caution' : 'verified', Icon: !rows.length ? SearchX : stale ? Clock : CalendarCheck },
    { id: 'sec-checks', label: 'Checks', value: `${pass} of ${checks.length} passed`, tone: fails ? 'unsupported' : warns ? 'caution' : 'verified', Icon: fails ? CircleX : warns ? TriangleAlert : CircleCheck },
  ]
  const jump = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  return (
    <div className="relative mt-4 grid grid-cols-3 gap-2">
      {tiles.map((x) => (
        <button key={x.label} onClick={() => jump(x.id)} className="glance-tile group rounded-2xl px-3 py-2.5 text-left">
          <span className="flex items-center text-[11px] font-medium tracking-[0.04em] text-smoke uppercase">
            {x.label}
            <ChevronDown size={12} className="ml-auto opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
          </span>
          <span className="mt-1 flex items-start gap-1.5 text-caption leading-tight font-semibold text-ink">
            <x.Icon size={14} strokeWidth={2.25} className={`mt-px shrink-0 ${TONES[x.tone].text}`} aria-hidden="true" />
            {x.value}
          </span>
        </button>
      ))}
    </div>
  )
}

/* ─── Second verifier ────────────────────────────────────────────────────── */

const overlaps = (a, b) => a.start < b.end && b.start < a.end

/** "72/100 · Medium" — the index is never shown bare. */
const indexLabel = (r) => (r.score != null ? `${r.score}/100 · ${bandFor(r.score).label}` : bandFor(r.score).label)

/**
 * The same answer, assessed independently by a second model (SECOND_VERIFIER_MODEL),
 * set beside the main verifier so the employee can see where the two disagree.
 * Advisory: it is not the answer's assessment and never clears or routes a review.
 */
function SecondVerifier({ m }) {
  const { state } = useStore()
  const [showAll, setShowAll] = useState(false)
  if (m.source === 'submitted' || m.origin === 'classic') return null
  const s = m.second
  const name = s?.verifier?.model ?? state.health?.secondVerifier?.model ?? 'Second verifier'
  const mainModel = state.health?.model
  const mainName = m.scenarioId ? 'Scripted verdicts' : mainModel?.available ? mainModel.model : 'No model'

  let body
  if (!BACKEND) {
    body = <NotRun text="Not run. The second verifier needs backend mode with SECOND_VERIFIER_PROVIDER set on the server." />
  } else if (!s) {
    body = <NotRun text="Runs when you press Verify." />
  } else if (s.phase === 'not-run' || s.phase === 'error') {
    body = <NotRun text={`Not run. ${s.phase === 'error' ? s.error : s.verifier?.reason ?? 'No second verifier is configured on the server.'}`} />
  } else if (s.phase === 'running' || !m.result) {
    body = (
      <div aria-live="polite">
        <div className="grid grid-cols-2 gap-2">
          <VerifierTile label="Main verifier" model={mainName} r={m.result} />
          <VerifierTile label="Second verifier" model={name} r={s.phase === 'done' ? s.result : null} />
        </div>
        <p className="mt-2.5 inline-flex items-center gap-1.5 text-caption text-carbon">
          <LoaderCircle size={13} className="spin" aria-hidden="true" /> {s.phase === 'running' ? `${name} is checking the same answer` : 'Waiting for the main verifier'}
        </p>
      </div>
    )
  } else {
    const a = m.result
    const b = s.result
    const same = bandFor(a.score).id === bandFor(b.score).id
    const mainClaims = visibleClaims(m)
    // Each verifier splits the answer itself; pair claims by where they sit in the answer.
    const rows = b.claims.map((c2) => {
      const c1 = mainClaims.find((c) => overlaps(c, c2)) ?? null
      return { c1, c2, differs: !c1 || severityFor(c1.status)?.id !== severityFor(c2.status)?.id }
    })
    const differ = rows.filter((x) => x.differs)
    const shown = showAll ? rows : differ
    body = (
      <div aria-live="polite">
        <div className="grid grid-cols-2 gap-2">
          <VerifierTile label="Main verifier" model={mainName} r={a} claims={mainClaims} />
          <VerifierTile label="Second verifier" model={name} r={b} claims={b.claims} />
        </div>
        <p className={`mt-3 flex items-start gap-1.5 text-body-sm font-semibold ${same ? TONES.verified.text : TONES.caution.text}`}>
          {same ? <CircleCheck size={16} className="mt-0.5 shrink-0" aria-hidden="true" /> : <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />}
          <span className="text-ink">
            {same ? `Both verifiers rate it ${bandFor(a.score).label}.` : `The verifiers disagree: ${bandFor(a.score).label} vs ${bandFor(b.score).label}. Check the sources before acting.`}
          </span>
        </p>
        {b.assessment?.partial && (
          <p className="mt-1.5 flex items-start gap-1.5 text-caption text-carbon">
            <CircleDashed size={13} className="mt-0.5 shrink-0 text-status-unknown" aria-hidden="true" />
            <span>
              Partial: some of its model steps did not run, so its index is capped below High.
              {b.assessment.unavailable?.length > 0 && ` ${[...new Set(b.assessment.unavailable.map((u) => u.reason))].join(' ')}`}
            </span>
          </p>
        )}
        {rows.length > 0 && (
          <>
            <div className="mt-3.5 flex items-center gap-2">
              <span className="text-caption font-semibold text-ink">{differ.length ? `${differ.length} of ${rows.length} claims judged differently` : `All ${rows.length} claims judged the same way`}</span>
              {differ.length < rows.length && (
                <button onClick={() => setShowAll((x) => !x)} className="ml-auto rounded-full px-2 py-0.5 text-caption font-medium text-carbon hover:bg-line/[0.05] hover:text-ink">
                  {showAll ? 'Show differences' : 'Show all'}
                </button>
              )}
            </div>
            <ul className="mt-2 space-y-2">
              {shown.map(({ c1, c2 }) => (
                <CompareRow key={c2.id} m={m} c1={c1} c2={c2} mainName={mainName} name={name} />
              ))}
            </ul>
          </>
        )}
      </div>
    )
  }

  return (
    <Card id="sec-compare">
      <SectionTitle icon={GitCompareArrows} aside="Advisory">
        Second verifier
      </SectionTitle>
      {body}
      <p className="mt-3 text-[12px] text-smoke">Only a reviewer’s decision clears a review. The second verifier cannot, and does not change routing.</p>
    </Card>
  )
}

function NotRun({ text }) {
  return (
    <p className="flex items-start gap-2 text-body-sm text-carbon">
      <CircleDashed size={16} className="mt-0.5 shrink-0 text-smoke" aria-hidden="true" />
      {text}
    </p>
  )
}

function VerifierTile({ label, model, r, claims }) {
  const band = r ? bandFor(r.score) : null
  const flagged = claims?.filter((c) => c.status !== 'supported').length
  const Shield = band ? BAND_SHIELD[band.status] : LoaderCircle
  return (
    <div className="pane-item rounded-2xl px-3 py-2.5">
      <div className="text-[11px] font-medium tracking-[0.04em] text-smoke uppercase">{label}</div>
      <div className="truncate text-caption text-carbon" title={model}>
        {model}
      </div>
      {r ? (
        <>
          <div className={`mt-1.5 inline-flex items-center gap-1.5 text-body-sm font-semibold ${TONES[band.status].text}`}>
            <Shield size={15} strokeWidth={2.25} aria-hidden="true" />
            <span className="text-ink tabular-nums">{indexLabel(r)}</span>
          </div>
          <div className="mt-0.5 text-[12px] text-carbon">
            {VERDICT[band.id].tag}
            {claims ? ` · ${claims.length ? `${flagged} of ${claims.length} flagged` : 'no claims'}` : ''}
          </div>
        </>
      ) : (
        <div className="mt-2 space-y-1.5">
          <div className="shimmer h-2 w-4/5 rounded-full" />
          <div className="shimmer h-2 w-3/5 rounded-full" />
        </div>
      )}
    </div>
  )
}

function Verdict({ who, c }) {
  if (!c) return <span className="inline-flex items-center gap-1 text-[12px] text-smoke"><CircleDashed size={12} aria-hidden="true" />{who}: not split out</span>
  const sev = severityFor(c.status)
  return (
    <span className={`inline-flex min-w-0 items-center gap-1 text-[12px] font-semibold ${TONES[sev.tone].text}`}>
      <sev.Icon size={12} strokeWidth={2.5} className="shrink-0" aria-hidden="true" />
      <span className="truncate text-carbon">{who}:</span> {sev.label}
    </span>
  )
}

/** One claim as the two verifiers saw it, with the second verifier's passage and reason. */
function CompareRow({ m, c1, c2, mainName, name }) {
  const [open, setOpen] = useState(false)
  const p = c2.counter ?? c2.source
  return (
    <li className="pane-item overflow-hidden rounded-2xl">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full gap-2 p-3 text-left transition-colors hover:bg-surface">
        <span className="min-w-0 flex-1">
          <span className={`text-body-sm text-ink ${open ? '' : 'line-clamp-2'}`}>“{m.text.slice(c2.start, c2.end)}”</span>
          <span className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
            <Verdict who={mainName} c={c1} />
            <Verdict who={name} c={c2} />
          </span>
        </span>
        <ChevronDown size={16} className={`mt-1 shrink-0 text-smoke transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div className="rise-in space-y-2.5 border-t border-line/5 bg-bone/60 p-3">
          <p className="text-caption text-carbon">
            <span className="font-semibold text-ink">{name}: </span>
            {c2.reason}
          </p>
          {p ? (
            <PassageBox p={p} label={c2.counter ? 'Current policy' : c2.nearest ? 'Closest passage found (does not mention this)' : 'Source'} />
          ) : (
            <div className="flex items-center gap-2 rounded-xl bg-surface p-3 text-body-sm text-carbon">
              <SearchX size={16} className="shrink-0 text-status-unsupported" aria-hidden="true" />
              No approved document mentions this.
            </div>
          )}
          {c1 && (
            <p className="text-caption text-carbon">
              <span className="font-semibold text-ink">{mainName}: </span>
              {c1.short ?? c1.reason}
            </p>
          )}
        </div>
      )}
    </li>
  )
}

/* ─── Claims ─────────────────────────────────────────────────────────────── */

function Claims({ m }) {
  const { state, dispatch } = useStore()
  const claims = [...visibleClaims(m)].sort((a, b) => severityOf(a.status) - severityOf(b.status) || a.start - b.start)

  if (!m.result && !claims.length) {
    return (
      <section>
        <SectionTitle icon={ListChecks}>Claims</SectionTitle>
        <div className="shimmer h-2.5 rounded-full" />
        <p className="mt-2 text-caption text-carbon">Matching each sentence to policy</p>
      </section>
    )
  }
  if (!claims.length) {
    return (
      <section>
        <SectionTitle icon={ListChecks}>Claims</SectionTitle>
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
      <SectionTitle icon={ListChecks} aside={`${claims.length} checked`}>Claims</SectionTitle>
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
        className={`pane-item overflow-hidden rounded-2xl border transition-shadow ${open ? 'shadow-md' : ''} ${c.status === 'no-source' ? 'border-dashed' : ''}`}
        style={{ borderColor: open || sev.id !== 'correct' ? `color-mix(in srgb, ${TONE_HEX[sev.tone]} ${open ? 70 : 30}%, transparent)` : 'rgb(0 0 0 / 0.06)' }}
      >
        <button onClick={onToggle} aria-expanded={open} className="flex w-full gap-3 p-3 text-left transition-colors hover:bg-surface">
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
  const f = passageFreshness(c.source)
  // The backend may name one passage as both the rule and the contradiction: show it once.
  const same = c.counter && c.source && c.counter.docId === c.source.docId && c.counter.section === c.source.section && c.counter.version === c.source.version
  return (
    <div className="rise-in space-y-2.5 border-t border-line/5 bg-bone/60 p-3">
      {swap && (
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-xl bg-surface p-3">
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
      {c.source && !same && (
        <PassageBox
          p={c.source}
          label={c.nearest ? (c.status === 'unassessed' ? 'Closest passage found (not checked by a model)' : 'Closest passage found (does not mention this)') : c.counter ? 'Source the answer used' : 'Source'}
          warn={
            f?.state === 'superseded'
              ? f.supersededBy
                ? `Replaced on ${formatDate(f.supersededBy.updated)}`
                : `Replaced by ${String(f.superseded ?? 'a newer version').replace('@', ' ')}`
              : f?.state === 'overdue'
                ? f.months != null
                  ? `${f.months} months old, review overdue`
                  : f.reviewDate
                    ? `Review was due ${formatDate(f.reviewDate)}`
                    : 'Review overdue'
                : null
          }
        />
      )}
      {!c.source && (
        <div className="flex items-center gap-2 rounded-xl bg-surface p-3 text-body-sm text-carbon">
          <SearchX size={16} className="shrink-0 text-status-unsupported" aria-hidden="true" />
          No approved document mentions this. {c.reason?.replace('No source found. ', '')}
        </div>
      )}
    </div>
  )
}

function PassageBox({ p, label, warn }) {
  const doc = docInfo(p.docId, p)
  return (
    <figure className="border-l-2 border-line/10 py-0.5 pl-3">
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
      {p.screened && <p className="mt-1.5 text-[12px] text-carbon">Instruction-like text in this document was removed and never used as evidence.</p>}
      <div className="mt-1.5 text-[12px] text-smoke">
        {doc.title} · {p.section}
        {p.version ? ` · ${p.version}` : ''}
      </div>
    </figure>
  )
}

/* ─── How the score is calculated ────────────────────────────────────────── */

function Calculation({ m }) {
  const [userOpen, setUserOpen] = useState(null)
  const items = CHECK_DISPLAY_ORDER.map((id) => {
    const i = CHECKS.findIndex((c) => c.id === id)
    return { ...CHECKS[i], ...m.checks[i], id }
  })
  const parts = m.result?.parts
  const capNote = parts?.capped ? (parts.cap < 95 ? 'no source found' : 'no answer is treated as certain') : null
  const open = userOpen ?? !m.result
  const counts = ['pass', 'warning', 'fail', 'unavailable'].map((k) => ({ k, n: items.filter((it) => it.status === k).length, ...CHECK_STATUS[k] })).filter((x) => x.n)

  return (
    <section id="sec-checks" className="pane-card rise-in scroll-mt-3 rounded-[22px]">
      <button onClick={() => setUserOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-2.5 rounded-[22px] p-4 text-left">
        <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-line/[0.05] text-carbon" aria-hidden="true">
          <Calculator size={16} strokeWidth={2} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold tracking-[-0.2px] text-ink">How it’s calculated</span>
          <span className="mt-0.5 flex flex-wrap gap-x-2.5 text-caption text-smoke">
            {m.result
              ? counts.map((x) => (
                  <span key={x.k} className="inline-flex items-center gap-1">
                    <x.Icon size={12} strokeWidth={2.5} className={TONES[x.tone].text} aria-hidden="true" />
                    {x.n} {x.label.toLowerCase()}
                  </span>
                ))
              : '6 checks against the policy library'}
          </span>
        </span>
        <ChevronDown size={18} className={`shrink-0 text-smoke transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div className="rise-in px-4 pb-4">
          {parts ? <CompositionBar claimPts={parts.claimPts} checkPts={parts.checkPts} score={m.result.score} capNote={capNote} /> : m.result ? null : <div className="shimmer h-2.5 rounded-full" />}
          <ul className="mt-3.5 space-y-1.5">
            {items.map((it) => (
              <CheckBox key={it.id} it={it} />
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

function CheckBox({ it }) {
  const s = CHECK_STATUS[it.status]
  const t = TONES[s.tone]
  const Icon = CHECK_ICON[it.id]
  const settled = it.status !== 'queued' && it.status !== 'running'
  return (
    <li className={`pane-item flex items-center gap-3 rounded-2xl px-3 py-2.5 ${it.status === 'queued' ? 'opacity-55' : ''}`} title={it.question}>
      <span className={`grid size-8 shrink-0 place-items-center rounded-xl ${settled ? `${t.surface} ${t.text}` : 'bg-line/5 text-smoke'}`} aria-hidden="true">
        <Icon size={15} strokeWidth={2} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-caption font-semibold text-ink">{it.name}</span>
        {settled ? <span className="block text-[12px] leading-snug text-carbon">{it.short ?? it.summary}</span> : it.status === 'running' ? <span className="shimmer mt-1 block h-2 w-3/5 rounded-full" /> : <span className="block text-[12px] text-smoke">Waiting</span>}
      </span>
      <span className={`inline-flex shrink-0 items-center gap-1 text-[12px] font-semibold ${settled ? t.text : 'text-smoke'}`}>
        <s.Icon size={13} strokeWidth={2.5} className={it.status === 'running' ? 'spin' : ''} aria-hidden="true" />
        {s.label}
      </span>
    </li>
  )
}

/* ─── Sources ────────────────────────────────────────────────────────────── */

/** Every document behind the answer, cited first, with its freshness. */
function sourceRows(m, sc) {
  if (!m.result) return []
  // Backend mode: retrieval and the search record come from the server's result.
  const retrieved = m.result?.retrieved ?? sc.verification.retrieved
  const cited = citedIds(m.citations)
  const ids = [...cited, ...retrieved.filter((d) => !cited.includes(d))]
  return ids.map((id) => {
    const f = passageFreshness(versionOf(m, id) ?? { docId: id })
    const st = !f
      ? { label: 'Not in library', tone: 'unknown', Icon: FileQuestion }
      : f.state === 'superseded'
        ? { label: f.supersededBy?.updated ? `Replaced ${formatDate(f.supersededBy.updated)}` : 'Replaced', tone: 'caution', Icon: Clock }
        : f.state === 'overdue'
          ? { label: f.months != null ? `Overdue · ${f.months} months old` : 'Overdue', tone: 'caution', Icon: Clock }
          : { label: 'Current', tone: 'verified', Icon: CalendarCheck }
    return { id, doc: docInfo(id, versionOf(m, id)), f, st, found: !cited.includes(id) }
  })
}

function Sources({ m, sc }) {
  const rows = sourceRows(m, sc)
  if (!rows.length) {
    const s = m.result?.search ?? sc.verification.search
    return (
      <section>
        <SectionTitle icon={Library}>Sources</SectionTitle>
        <div className="flex items-center gap-2 text-body-sm font-semibold text-ink">
          <SearchX size={17} className="text-status-unsupported" aria-hidden="true" />
          No approved source found
        </div>
        {s && (
          <div className="mt-3">
            <div className="relative h-2.5 rounded-full bg-line/5">
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
    <section>
      <SectionTitle icon={Library} aside={`${rows.length} ${rows.length === 1 ? 'document' : 'documents'}`}>
        Sources
      </SectionTitle>
      <ul className="space-y-1.5">
        {rows.map(({ id, doc, f, st, found }) => {
          const t = TONES[st.tone]
          return (
            <li key={id} className="pane-item flex items-center gap-3 rounded-2xl px-3 py-2.5">
              <span className={`grid size-8 shrink-0 place-items-center rounded-xl ${t.surface} ${t.text}`} aria-hidden="true">
                <st.Icon size={15} strokeWidth={2} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-body-sm font-medium text-ink" title={doc.title}>
                  {doc.title}
                </div>
                {found ? (
                  <div className="inline-flex items-center gap-1 text-[12px] text-smoke">
                    <ScanSearch size={11} aria-hidden="true" /> Found by the verifier, not cited
                  </div>
                ) : (
                  <div className="text-[12px] text-smoke">Cited by the assistant{doc.version ? ` · ${doc.version}` : ''}</div>
                )}
              </div>
              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[12px] font-semibold ${t.surface} ${t.text}`} style={{ borderColor: `color-mix(in srgb, ${TONE_HEX[st.tone]} 30%, transparent)` }}>
                {st.label}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** The passage the result carries for a document: its exact version, as assessed (backend mode). */
function versionOf(m, docId) {
  const r = m.result
  if (!r) return null
  for (const c of r.claims) for (const p of [c.source, c.counter]) if (p?.docId === docId && p.version) return p
  for (const k of r.checks) for (const p of k.evidence ?? []) if (p.docId === docId && p.version) return p
  return null
}

function AssessmentHistoryBlock({ m }) {
  if (!m.serverId) return null
  return (
    <AssessmentHistory m={m} />
  )
}

/* ─── Footer actions ─────────────────────────────────────────────────────── */

function Footer({ m }) {
  const { escalate, reverify } = useStore()
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
        className="rise-in pane-footer shrink-0 space-y-2 px-4 py-3"
        onSubmit={(e) => {
          e.preventDefault()
          escalate(m.id, note.trim())
          setComposing(false)
        }}
      >
        <label htmlFor="esc-note" className="text-caption font-medium text-carbon">
          Note for the reviewer (optional)
        </label>
        <textarea id="esc-note" rows={2} autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Client is waiting on a SGD 230k transfer today." className="w-full resize-none rounded-2xl border border-line/10 bg-surface/80 px-3 py-2 text-body-sm text-ink placeholder:text-smoke focus:border-ocbc-red/40 focus:outline-none" />
        <div className="flex gap-2">
          <button type="button" onClick={() => setComposing(false)} className="rounded-full px-4 py-2.5 text-body-sm font-medium text-carbon hover:bg-line/5">
            Cancel
          </button>
          <button type="submit" className="ml-auto inline-flex items-center gap-2 rounded-full bg-ocbc-red px-5 py-2.5 text-body-sm font-medium text-white shadow-md transition-all hover:bg-ocbc-red-deep active:scale-[0.98]">
            <Send size={15} aria-hidden="true" /> Send
          </button>
        </div>
      </form>
    )
  }

  if (m.state === 'reverify-required') {
    return (
      <div className="pane-footer flex shrink-0 items-center gap-2 px-4 py-3">
        <span className="text-caption text-carbon">A policy this answer used has a new version.</span>
        <button onClick={() => reverify(m.id)} className="ml-auto inline-flex items-center gap-2 rounded-full bg-ocbc-red px-5 py-2.5 text-body-sm font-medium whitespace-nowrap text-white shadow-md transition-all hover:bg-ocbc-red-deep active:scale-[0.98]">
          <RefreshCw size={16} aria-hidden="true" /> Re-verify against current policy
        </button>
      </div>
    )
  }

  return (
    <div className="pane-footer flex shrink-0 items-center gap-2 px-4 py-3">
      {m.routed ? (
        <span className="inline-flex min-w-0 items-center gap-2 py-1.5 text-body-sm font-medium text-ink">
          <Inbox size={16} className="shrink-0 text-carbon" aria-hidden="true" />
          With a reviewer
          <span className="truncate text-caption font-normal text-smoke">{m.routed.by === 'auto' ? 'sent automatically' : 'sent by you'}</span>
        </span>
      ) : (
        <span className="text-caption text-smoke">{done ? 'Unsure? Ask a human to check it.' : `Verifying · ${m.checks.filter((k) => k.status !== 'queued' && k.status !== 'running').length} of ${CHECKS.length} checks`}</span>
      )}
      {!m.routed && (
        <button
          onClick={() => setComposing(true)}
          disabled={!done}
          className={`ml-auto inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-body-sm font-medium whitespace-nowrap transition-all active:scale-[0.98] disabled:border disabled:border-line/15 disabled:bg-transparent disabled:text-smoke disabled:opacity-60 disabled:shadow-none ${m.result?.band?.id === 'high' ? 'border border-line/10 text-ink hover:bg-line/[0.05]' : 'bg-ocbc-red text-white shadow-md hover:bg-ocbc-red-deep'}`}
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
      <button onClick={() => setOpen((o) => !o)} aria-expanded={show} className="pane-item flex w-full items-center gap-3 rounded-2xl p-3 text-left transition-colors">
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
