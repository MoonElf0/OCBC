import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, ChevronDown, ThumbsUp, ThumbsDown, Inbox, Clock, CircleSlash, Sparkles, Flag, BookOpen, ListChecks, Maximize2, MessageSquare, Lightbulb, CircleCheck, Search, LoaderCircle, CircleDashed, RefreshCw, History } from 'lucide-react'
import { useStore, useActiveAnswer } from '../state/store'
import { CHECKS, CHECK_STATUS, CHECK_ICON, CLAIM_STATUS, CLAIM_COUNT_LABEL, TONES, BAND_ICON, bandFor, METHOD_LABEL, topicIcon, ANSWER_STATES } from '../lib/status'
import { BACKEND, api } from '../lib/backend'
import { freshnessOf, formatDate } from '../lib/freshness'
import { display } from '../lib/rules'
import { scenarioById } from '../lib/pipeline'
import { visibleClaims, moodFor, flagged, runningCheck, claimCounts } from '../lib/view'
import Character from './Character'
import { PrimaryButton, GhostButton, SourceChip, ScoreBadge, SectionHeader, IconTile, CheckPill } from './ui'
import { SearchRecord } from './Evidence'
import { OUTCOME_META } from './Thread'

export default function CharacterPanel() {
  const { state, dispatch } = useStore()
  const m = useActiveAnswer()
  const answers = state.messages.filter((x) => x.kind === 'answer')
  const claimMode = state.panel.mode === 'claim' && m
  const scroller = useRef(null)

  // Each view starts at the top: opening a claim never lands mid-page.
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 0
  }, [state.activeId, state.panel.mode, state.panel.claimId])

  return (
    <aside aria-labelledby="panel-title" className="flex min-h-0 flex-col overflow-hidden rounded-3xl bg-bone shadow-xl">
      <h2 id="panel-title" className="sr-only">
        Assessment AI panel
      </h2>
      {state.offerId && <OfferBanner />}
      {m && !claimMode && <QuestionSwitcher answers={answers} m={m} onPick={(id) => dispatch({ type: 'select', id })} />}
      {claimMode && <ClaimNav m={m} claimId={state.panel.claimId} />}
      <div ref={scroller} className="scroll-quiet min-h-0 flex-1 overflow-y-auto">
        {!m ? <EmptyState /> : claimMode ? <ClaimDetail m={m} claimId={state.panel.claimId} /> : <Overall m={m} />}
      </div>
      {m && <Actions m={m} />}
    </aside>
  )
}

function claimList(m) {
  const claims = visibleClaims(m)
  return [...flagged(claims), ...claims.filter((c) => c.status === 'supported')]
}

/** Numbered tabs, one per answer, each carrying its verdict icon; the active question underneath. */
function QuestionSwitcher({ answers, m, onPick }) {
  const idx = answers.findIndex((a) => a.id === m.id)
  const prev = answers[idx - 1]
  const next = answers[idx + 1]
  const topic = scenarioById(m.scenarioId).topic
  const TopicIcon = topicIcon(topic)
  return (
    <nav aria-label="Switch question" className="shrink-0 border-b border-frost bg-porcelain px-4 pt-3 pb-3">
      <div className="flex items-center gap-2">
        <ArrowButton Icon={ChevronLeft} label="Previous question" onClick={() => prev && onPick(prev.id)} disabled={!prev} />
        <div className="scroll-quiet flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto" role="tablist">
          {answers.map((a, i) => {
            const active = a.id === m.id
            const done = !!a.result
            const band = done ? bandFor(a.result.score) : null
            const Icon = done ? BAND_ICON[band.status] : LoaderCircle
            return (
              <button
                key={a.id}
                role="tab"
                aria-selected={active}
                aria-label={`Question ${i + 1}${band ? `, ${band.label}` : ', checking'}: ${a.question}`}
                title={a.question}
                onClick={() => onPick(a.id)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-body-sm font-semibold transition-colors ${active ? 'border-carbon bg-carbon text-white' : 'border-frost bg-porcelain text-carbon hover:border-ash'}`}
              >
                <Icon size={15} strokeWidth={2.25} className={`${done ? (active ? 'text-white' : TONES[band.status].text) : 'spin'}`} aria-hidden="true" />Q{i + 1}
              </button>
            )
          })}
        </div>
        <ArrowButton Icon={ChevronRight} label="Next question" onClick={() => next && onPick(next.id)} disabled={!next} />
      </div>
      <p className="mt-2.5 flex items-center gap-2 text-body-sm font-medium text-ink" title={m.question}>
        <TopicIcon size={17} className="shrink-0 text-carbon" aria-hidden="true" />
        <span className="truncate">{m.question}</span>
      </p>
    </nav>
  )
}

function ArrowButton({ Icon, label, onClick, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} aria-label={label} className="grid size-9 shrink-0 place-items-center rounded-full border border-frost bg-porcelain text-ink transition-colors hover:border-carbon disabled:cursor-default disabled:text-ash disabled:hover:border-frost">
      <Icon size={18} />
    </button>
  )
}

function ClaimNav({ m, claimId }) {
  const { dispatch } = useStore()
  const list = claimList(m)
  const idx = list.findIndex((c) => c.id === claimId)
  const go = (k) => list[k] && dispatch({ type: 'select', id: m.id, claimId: list[k].id })
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-frost bg-porcelain px-4 py-3">
      <GhostButton onClick={() => dispatch({ type: 'overall' })} className="py-1.5">
        <ArrowLeft size={16} /> All results
      </GhostButton>
      <span className="ml-auto text-body-sm font-medium text-carbon">
        Claim {idx + 1} of {list.length}
      </span>
      <ArrowButton Icon={ChevronLeft} label="Previous claim" onClick={() => go(idx - 1)} disabled={idx <= 0} />
      <ArrowButton Icon={ChevronRight} label="Next claim" onClick={() => go(idx + 1)} disabled={idx >= list.length - 1} />
    </div>
  )
}

function OfferBanner() {
  const { state, dispatch } = useStore()
  return (
    <div className="rise-in flex shrink-0 items-center justify-between gap-3 border-b border-frost bg-porcelain px-5 py-3">
      <span className="inline-flex items-center gap-2 text-body-sm font-medium text-ink">
        <Sparkles size={16} className="text-carbon" aria-hidden="true" /> A newer answer is ready
      </span>
      <GhostButton onClick={() => dispatch({ type: 'select', id: state.offerId })} className="py-1.5">
        View it <ChevronRight size={14} />
      </GhostButton>
    </div>
  )
}

/** Character stage: fills the top of the panel edge to edge. Shrinks once the verdict is in. */
function Stage({ mood, m, line, settled }) {
  const { dispatch } = useStore()
  return (
    <div
      className={`relative shrink-0 overflow-hidden transition-[height] duration-500 ${settled ? 'h-36' : m ? 'h-44' : 'h-[clamp(200px,28vh,256px)]'}`}
      style={{ background: m ? 'radial-gradient(80% 90% at 60% 40%, #ffffff 0%, #f5f5f7 70%)' : 'var(--gradient-slate-wash)' }}
    >
      <button
        onClick={() => m && dispatch({ type: 'checks', open: true })}
        disabled={!m}
        className={`group absolute inset-0 flex items-end pb-2 disabled:cursor-default ${line ? 'justify-end pr-10' : 'justify-center'}`}
        aria-label={m ? 'Open all six checks' : 'Assessment AI character'}
      >
        <Character mood={mood} className="h-[92%] w-auto drop-shadow-[0_18px_18px_rgba(0,0,0,0.12)] transition-transform group-hover:scale-[1.02]" />
      </button>
      {line && (
        <div key={line} className="rise-in pointer-events-none absolute left-5 top-1/2 max-w-[52%] -translate-y-1/2 rounded-2xl border border-frost bg-porcelain px-4 py-3 text-body-sm font-medium text-ink shadow-md" aria-live="polite">
          {line}
        </div>
      )}
    </div>
  )
}

const LEGEND = ['supported', 'unsupported', 'conflicting', 'stale', 'off-intent', 'insufficient', 'unassessed']

function EmptyState() {
  return (
    <div>
      <Stage mood="idle" />
      <div className="space-y-6 p-6">
        <div>
          <h3 className="text-heading-sm font-semibold text-ink">Nothing to check yet</h3>
          <p className="mt-2 max-w-[40ch] text-body-sm text-carbon">
            Ask a question on the right, or paste in an AI answer to verify. I’ll give it a <b className="font-semibold text-ink">reliability index</b>, <b className="font-semibold text-ink">flag</b> weak claims and <b className="font-semibold text-ink">show the source</b>.
          </p>
        </div>
        <div>
          <SectionHeader Icon={Flag} title="What the flags mean" />
          <ul className="grid grid-cols-2 gap-2">
            {LEGEND.map((k) => {
              const s = CLAIM_STATUS[k]
              return (
                <li key={k} className="flex items-center gap-2 rounded-2xl border border-frost bg-porcelain px-3 py-2 text-body-sm font-medium text-ink">
                  <IconTile Icon={s.Icon} tone={s.tone} size="sm" />
                  {s.label}
                </li>
              )
            })}
          </ul>
        </div>
        <div>
          <SectionHeader Icon={ListChecks} title="Six checks on every answer" />
          <ul className="grid grid-cols-2 gap-2">
            {CHECKS.map((c) => {
              const Icon = CHECK_ICON[c.id]
              return (
                <li key={c.id} className="flex items-center gap-2 text-body-sm font-medium text-carbon">
                  <Icon size={16} className="shrink-0" aria-hidden="true" /> {c.name}
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </div>
  )
}

const counted = new Set()

function useCountUp(target, run) {
  const [v, setV] = useState(run ? 0 : target)
  useEffect(() => {
    if (target == null) return
    if (!run) return setV(target)
    let raf
    const t0 = performance.now()
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / 650)
      setV(Math.round(target * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, run])
  return v
}

// Working states only — once scored, the verdict speaks for itself.
const MOOD_LINE = {
  watching: 'Reading the answer…',
  thinking: 'Checking the sources…',
}

function Overall({ m }) {
  const mood = moodFor(m)
  const sc = scenarioById(m.scenarioId)
  return (
    <div>
      <Stage mood={mood} m={m} line={MOOD_LINE[mood]} settled={!!m.result} />
      <div className="space-y-7 p-6">
        <ScoreCard m={m} />
        {m.phase === 'done' && <StateCard m={m} />}
        <FlaggedClaims m={m} />
        {m.phase === 'done' && <Sources m={m} sc={sc} />}
        <CheckList m={m} />
        {BACKEND && m.serverId && m.phase === 'done' && <AssessmentHistory m={m} />}
      </div>
    </div>
  )
}

function ScoreCard({ m }) {
  const { dispatch } = useStore()
  const result = m.result
  const score = result?.score
  const band = result ? bandFor(score) : null
  const first = result && !counted.has(m.id)
  const shown = useCountUp(score, !!first)
  const [why, setWhy] = useState(false)
  useEffect(() => {
    if (result) counted.add(m.id)
  }, [result, m.id])

  if (!result) {
    const running = runningCheck(m)
    return (
      <div className="rounded-3xl border border-frost bg-porcelain p-5" aria-live="polite">
        <div className="flex items-baseline gap-2">
          <span className="text-display font-semibold text-ash tabular-nums animate-pulse">––</span>
          <span className="text-body text-smoke">/ 100</span>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-frost">
          <div className="h-full w-1/3 animate-pulse rounded-full bg-ash" />
        </div>
        <div className="mt-4 inline-flex items-center gap-2 text-body-sm font-medium text-carbon">
          <LoaderCircle size={16} className="spin" aria-hidden="true" />
          {m.phase === 'verifying' ? `Checking ${running ? running.name.toLowerCase() : '…'}` : 'Waiting for the answer'}
        </div>
      </div>
    )
  }
  const t = TONES[band.status]
  const Icon = BAND_ICON[band.status]
  const flags = flagged(result.claims)
  const counts = claimCounts(result.claims)
  return (
    <div className="rise-in rounded-3xl border border-frost bg-porcelain p-5" aria-live="polite">
      <p className="text-heading-sm font-semibold text-ink">{result.headline}</p>
      <div className="mt-3 flex items-center justify-between gap-4">
        {score == null ? (
          <div className="text-heading font-semibold text-carbon">Not scored</div>
        ) : (
          <div className="flex items-baseline gap-2">
            <span className="text-display font-semibold text-ink tabular-nums">{shown}</span>
            <span className="text-body text-smoke">/ 100</span>
          </div>
        )}
        <span className={`inline-flex items-center gap-2 rounded-2xl px-3 py-2 ${t.surface} ${t.text}`}>
          <Icon size={22} strokeWidth={2.25} aria-hidden="true" />
          <span className="leading-tight">
            <span className="block text-body font-semibold">{score == null ? 'No claims' : band.label}</span>
            <span className="block text-caption font-medium text-carbon">reliability index</span>
          </span>
        </span>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-frost" role="presentation">
        <div className={`h-full rounded-full ${t.fill} transition-[width] duration-700 ease-out`} style={{ width: `${score ?? 0}%` }} />
      </div>

      {result.claims.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {Object.entries(CLAIM_STATUS)
            .filter(([k]) => counts[k])
            .map(([k, s]) => {
              const target = result.claims.find((c) => c.status === k)
              return (
                <button
                  key={k}
                  onClick={() => dispatch({ type: 'select', id: m.id, claimId: target.id })}
                  className={`inline-flex items-center gap-1.5 rounded-full border border-frost px-3 py-1.5 text-body-sm font-semibold transition-colors hover:border-carbon ${TONES[s.tone].text}`}
                >
                  <s.Icon size={16} strokeWidth={2.25} aria-hidden="true" />
                  <span className="text-ink">
                    {counts[k]} {CLAIM_COUNT_LABEL[k]}
                  </span>
                </button>
              )
            })}
        </div>
      )}

      {result.assessment?.partial && <PartialNotice assessment={result.assessment} />}

      <button onClick={() => setWhy((w) => !w)} aria-expanded={why} className="mt-4 inline-flex items-center gap-1 text-body-sm font-medium text-carbon underline-offset-4 hover:text-ink hover:underline">
        How is the reliability index worked out? <ChevronDown size={16} className={`transition-transform ${why ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {why && (
        <div className="rise-in mt-2 space-y-2 rounded-2xl bg-bone p-4 text-body-sm text-carbon">
          <p>{result.explanation}</p>
          {result.parts && (
            <p className="text-caption text-smoke">
              Claims {result.parts.claimPts}/60 + checks {result.parts.checkPts}/40{result.parts.capped ? ` · capped at ${result.parts.cap}${result.parts.capReason ? ` (${result.parts.capReason.replace(/\.$/, '').toLowerCase()})` : result.parts.cap < 95 ? ' (no source found)' : ''}` : ''}
            </p>
          )}
          <p className="text-caption text-smoke">An evidence-based index of how well approved policy backs this answer. It is not the probability that the answer is correct, and not permission to act. Full method under “Open full evidence”.</p>
        </div>
      )}
      {flags.length === 0 && result.claims.length > 0 && <span className="sr-only">No flagged claims.</span>}
    </div>
  )
}

function FlaggedClaims({ m }) {
  const { dispatch } = useStore()
  const flags = flagged(visibleClaims(m))
  if (!flags.length) return null
  return (
    <section aria-labelledby="flags-title">
      <SectionHeader Icon={Flag} title="Flagged claims" count={flags.length} id="flags-title" />
      <ul className="space-y-2.5">
        {flags.map((c) => {
          const s = CLAIM_STATUS[c.status]
          const t = TONES[s.tone]
          return (
            <li key={c.id}>
              <button
                onClick={() => dispatch({ type: 'select', id: m.id, claimId: c.id })}
                className={`rise-in group flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left transition-shadow hover:shadow-md ${t.surface}`}
                style={{ borderColor: 'color-mix(in srgb, var(--tone) 35%, transparent)', '--tone': `var(--color-status-${s.tone})` }}
              >
                <span className={`grid size-10 shrink-0 place-items-center rounded-full bg-porcelain ${t.text}`} aria-hidden="true">
                  <s.Icon size={20} strokeWidth={2.25} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`eyebrow font-semibold ${t.text}`}>{s.label}</span>
                  <span className="mt-0.5 block text-body font-semibold leading-snug text-ink">{c.short ?? m.text.slice(c.start, c.end)}</span>
                </span>
                <span className="inline-flex shrink-0 items-center gap-0.5 text-body-sm font-medium text-carbon group-hover:text-ink">
                  Details <ChevronRight size={16} aria-hidden="true" />
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** The passage object the result carries for a document: its exact version, as assessed. */
function metaFor(m, docId) {
  const r = m.result
  if (!r) return null
  for (const c of r.claims) for (const p of [c.source, c.counter]) if (p?.docId === docId && p.version) return p
  for (const k of r.checks) for (const p of k.evidence) if (p.docId === docId && p.version) return p
  return null
}

function Sources({ m, sc }) {
  const retrieved = m.result?.retrieved ?? sc.verification.retrieved
  const cited = [...new Set(m.citations.map((c) => c.toUpperCase().match(/DOC-[A-Z]+-\d+/)?.[0]).filter(Boolean))]
  const ids = [...cited, ...retrieved.filter((d) => !cited.includes(d))]
  return (
    <section className="rise-in" aria-labelledby="sources-title">
      <SectionHeader Icon={BookOpen} title="Sources" count={ids.length} id="sources-title" />
      {ids.length === 0 ? (
        <div className="flex items-center gap-3 rounded-2xl border border-frost bg-porcelain p-3.5">
          <IconTile Icon={CircleSlash} tone="unknown" />
          <span>
            <span className="block text-body-sm font-semibold text-ink">No source found</span>
            <span className="text-caption text-smoke">No approved document covers this</span>
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {ids.map((id) => (
            <SourceChip key={id} docId={id} meta={metaFor(m, id)} tag={cited.includes(id) ? null : 'Found by checker'} className="bg-porcelain" />
          ))}
        </div>
      )}
    </section>
  )
}

const CHECK_ORDER = { fail: 0, warning: 1, unavailable: 2, pass: 3, na: 4 }

function CheckList({ m }) {
  const { dispatch } = useStore()
  const [open, setOpen] = useState(null)
  // Pipeline order while checks resolve; worst first once the verdict is in.
  const rows = CHECKS.map((meta, i) => ({ meta, check: m.checks[i] }))
  if (m.result) rows.sort((a, b) => CHECK_ORDER[a.check.status] - CHECK_ORDER[b.check.status])
  return (
    <section aria-labelledby="checks-title-panel">
      <SectionHeader Icon={ListChecks} title="Six checks" id="checks-title-panel">
        {m.result &&
          ['fail', 'warning', 'unavailable'].map((k) => {
            const n = m.checks.filter((x) => x.status === k).length
            if (!n) return null
            const s = CHECK_STATUS[k]
            return (
              <span key={k} className={`inline-flex items-center gap-1 text-body-sm font-semibold ${TONES[s.tone].text}`}>
                <s.Icon size={16} strokeWidth={2.25} aria-hidden="true" />
                <span className="text-ink">
                  {n} {k === 'fail' ? 'failed' : k === 'unavailable' ? 'not run' : n === 1 ? 'warning' : 'warnings'}
                </span>
              </span>
            )
          })}
        {m.result && m.checks.every((x) => x.status === 'pass' || x.status === 'na') && (
          <span className="inline-flex items-center gap-1 text-body-sm font-semibold text-status-verified">
            <CircleCheck size={16} strokeWidth={2.25} aria-hidden="true" />
            <span className="text-ink">All passed</span>
          </span>
        )}
      </SectionHeader>
      <ul className="divide-y divide-frost overflow-hidden rounded-2xl border border-frost bg-porcelain">
        {rows.map(({ meta: c, check }) => {
          const settled = check.status !== 'queued' && check.status !== 'running'
          const isOpen = open === c.id && settled
          const TypeIcon = CHECK_ICON[c.id]
          return (
            <li key={c.id}>
              <button
                onClick={() => setOpen(isOpen ? null : c.id)}
                disabled={!settled}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-bone disabled:cursor-default disabled:hover:bg-transparent"
              >
                <TypeIcon size={18} className="shrink-0 text-carbon" aria-hidden="true" />
                <span className="min-w-0 flex-1 text-body-sm font-semibold text-ink">{c.name}</span>
                <CheckPill status={check.status} />
                <ChevronDown size={18} className={`shrink-0 text-carbon transition-transform ${isOpen ? 'rotate-180' : ''} ${settled ? '' : 'opacity-0'}`} aria-hidden="true" />
              </button>
              {isOpen && (
                <div className="rise-in flex items-center gap-2 px-4 pb-3.5 pl-[46px]">
                  <ArrowRight size={15} className="shrink-0 text-carbon" aria-hidden="true" />
                  <span className="text-body-sm font-medium text-ink">{check.short ?? check.summary}</span>
                  <span className="ml-auto shrink-0 rounded-xl bg-bone px-2 py-0.5 text-caption text-smoke">{c.method === 'rule' ? 'Rule' : check.status === 'unavailable' ? 'AI judge · not run' : 'AI judge'}</span>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      <GhostButton onClick={() => dispatch({ type: 'checks', open: true })} className="mt-3 w-full bg-porcelain">
        <Maximize2 size={16} /> Open full evidence
      </GhostButton>
    </section>
  )
}

const short = (f) => f.replace(/\s?basis points/, ' bps')

/** The figure the answer stated vs the one current policy states, when they differ. */
function figureSwap(m, c) {
  if (!c.counter) return null
  const said = display(m.text.slice(c.start, c.end))
  const policy = display(c.counter.passage)
  return said && policy && said !== policy ? { said: short(said), policy: short(policy), raw: display(c.counter.passage) } : null
}

/** Policy passages for a claim, in one card: current rule first, then the source the claim leaned on. */
function policyPassages(c) {
  // The backend's passage carries the state of the exact version it used; demo mode reads the fixtures.
  const f = c.source?.version
    ? { state: c.source.state, superseded: c.source.supersededBy, reviewDate: c.source.reviewDate }
    : c.source && freshnessOf(c.source.docId)
  const out = []
  if (c.counter) out.push({ ...c.counter, tag: { label: c.status === 'conflicting' ? 'The rule' : 'Current policy', tone: null, Icon: BookOpen } })
  // The backend may name one passage as both: it is the rule, and it contradicts the answer. Show it once.
  const same = c.counter && c.source && c.counter.docId === c.source.docId && c.counter.section === c.source.section && c.counter.version === c.source.version
  if (same) out[0].tag = { label: 'The rule — contradicts the answer', tone: 'unsupported', Icon: CLAIM_STATUS.conflicting.Icon }
  if (c.source && !same) {
    let tag = null
    let edge = null
    if (c.nearest) tag = { label: c.status === 'unassessed' ? 'Closest match — not checked by the model' : 'Closest match — doesn’t mention this', tone: 'unknown', Icon: Search }
    else if (c.status === 'conflicting') {
      tag = { label: 'Contradicts the answer', tone: 'unsupported', Icon: CLAIM_STATUS.conflicting.Icon }
      edge = 'unsupported'
    } else if (f?.state === 'superseded') {
      tag = { label: f.supersededBy ? `Replaced by ${f.supersededBy.id} on ${formatDate(f.supersededBy.updated)}` : `${c.source.version} replaced by ${String(f.superseded ?? 'a newer version').replace('@', ' ')}`, tone: 'caution', Icon: Clock }
      edge = 'caution'
    } else if (f?.state === 'overdue') {
      tag = { label: f.reviewDate ? `Review was due ${formatDate(f.reviewDate)} — overdue` : `${f.months} months old — review overdue`, tone: 'caution', Icon: Clock }
      edge = 'caution'
    }
    out.push({ ...c.source, tag, edge })
  }
  return out
}

function Bolded({ text, figure }) {
  const i = figure ? text.indexOf(figure) : -1
  if (i < 0) return text
  return (
    <>
      {text.slice(0, i)}
      <b className="font-semibold">{figure}</b>
      {text.slice(i + figure.length)}
    </>
  )
}

function ClaimDetail({ m, claimId }) {
  const list = claimList(m)
  const c = list.find((x) => x.id === claimId)
  if (!c) return null
  const s = CLAIM_STATUS[c.status]
  const t = TONES[s.tone]
  const checkMeta = CHECKS.find((k) => k.id === c.check)
  const passages = policyPassages(c)
  const docs = [...new Set(passages.map((p) => p.docId))]
  const swap = figureSwap(m, c)

  return (
    <div className="space-y-5 p-6" key={c.id}>
      <div className="rise-in flex items-center gap-3">
        <span className={`grid size-12 shrink-0 place-items-center rounded-full ${t.surface} ${t.text}`} aria-hidden="true">
          <s.Icon size={24} strokeWidth={2.25} />
        </span>
        <div className="min-w-0">
          <div className={`eyebrow font-semibold ${t.text}`}>{s.label} claim</div>
          <div className="text-heading-sm font-semibold text-ink">{c.short ?? c.reason}</div>
        </div>
      </div>

      {swap ? (
        <div className="rise-in grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-3xl border border-frost bg-porcelain p-5">
          <div>
            <div className={`mb-1 inline-flex items-center gap-1.5 text-body-sm font-semibold ${t.text}`}>
              <s.Icon size={16} strokeWidth={2.25} aria-hidden="true" />
              <span className="text-carbon">Answer said</span>
            </div>
            <div className={`${swap.said.length > 8 ? 'text-heading-sm' : 'text-heading'} whitespace-nowrap font-semibold text-smoke line-through decoration-2`}>{swap.said}</div>
          </div>
          <ArrowRight size={24} className="text-carbon" aria-hidden="true" />
          <div>
            <div className="mb-1 inline-flex items-center gap-1.5 text-body-sm font-semibold text-carbon">
              <BookOpen size={16} aria-hidden="true" />
              Policy says
            </div>
            <div className={`${swap.policy.length > 8 ? 'text-heading-sm' : 'text-heading'} whitespace-nowrap font-semibold text-ink`}>{swap.policy}</div>
          </div>
        </div>
      ) : (
        <div className="rounded-3xl border border-frost bg-porcelain p-4">
          <div className="mb-2 flex items-center gap-2 text-body-sm font-semibold text-ink">
            <MessageSquare size={17} className="text-carbon" aria-hidden="true" /> The answer said
          </div>
          <p className={`rounded-2xl border px-4 py-3 text-body text-ink ${t.surface}`} style={{ borderColor: 'color-mix(in srgb, var(--tone) 30%, transparent)', '--tone': `var(--color-status-${s.tone})` }}>
            “{m.text.slice(c.start, c.end)}”
          </p>
        </div>
      )}

      <div className="rounded-3xl border border-frost bg-porcelain p-4">
        <div className="mb-3 flex items-center gap-2 text-body-sm font-semibold text-ink">
          <BookOpen size={17} className="text-carbon" aria-hidden="true" /> What the policy says
        </div>
        {passages.length ? (
          <div className="space-y-3">
            {docs.map((docId) => (
              <div key={docId} className="space-y-2">
                {passages
                  .filter((p) => p.docId === docId)
                  .map((p) => (
                    <div
                      key={p.section}
                      className={`rounded-2xl px-4 py-3 ${p.edge ? `border ${TONES[p.edge].surface}` : 'bg-bone'}`}
                      style={p.edge ? { borderColor: `color-mix(in srgb, var(--color-status-${p.edge}) 40%, transparent)` } : undefined}
                    >
                      {p.tag && (
                        <span className={`mb-1.5 flex items-center gap-1.5 text-body-sm font-semibold ${p.tag.tone ? TONES[p.tag.tone].text : 'text-carbon'}`}>
                          <p.tag.Icon size={15} strokeWidth={2.25} aria-hidden="true" />
                          <span className="text-ink">{p.tag.label}</span>
                        </span>
                      )}
                      <p className="text-body text-ink">
                        <span className="mr-2 rounded-xl bg-porcelain px-1.5 py-0.5 text-caption font-semibold text-carbon">{p.section}</span>“<Bolded text={p.passage} figure={swap?.raw} />”
                      </p>
                    </div>
                  ))}
                <SourceChip docId={docId} meta={passages.find((p) => p.docId === docId)} className="bg-porcelain" />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-body-sm font-semibold text-ink">
              <CircleSlash size={18} className="text-status-unknown" aria-hidden="true" /> No source found
            </div>
            <SearchRecord scenarioId={m.scenarioId} search={m.result?.search} />
          </div>
        )}
      </div>

      <Reasoning reason={c.reason} method={`${checkMeta.name} · ${METHOD_LABEL[checkMeta.method]}`} />
    </div>
  )
}

function Reasoning({ reason, method }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="px-1">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="inline-flex items-center gap-1.5 text-body-sm font-medium text-carbon underline-offset-4 hover:text-ink hover:underline">
        <Lightbulb size={17} aria-hidden="true" /> Full reasoning <ChevronDown size={16} className={`transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div className="rise-in mt-2 rounded-2xl bg-porcelain p-4">
          <p className="text-body-sm text-carbon">{reason}</p>
          <p className="mt-1 text-caption text-smoke">{method}</p>
        </div>
      )}
    </div>
  )
}

function Actions({ m }) {
  const { escalate, feedback, reverify } = useStore()
  const [composing, setComposing] = useState(false)
  const [note, setNote] = useState('')
  const done = m.phase === 'done'
  useEffect(() => {
    setComposing(false)
    setNote('')
  }, [m.id])

  return (
    <div className="shrink-0 border-t border-frost bg-porcelain px-6 py-4">
      {m.outcome && m.state !== 'reverify-required' ? (
        <OutcomeLine outcome={m.outcome} />
      ) : m.state === 'reverify-required' ? (
        <PrimaryButton onClick={() => reverify(m.id)} className="w-full">
          <RefreshCw size={16} /> Re-verify against current policy
        </PrimaryButton>
      ) : m.routed ? (
        <div className="flex items-center gap-3">
          <IconTile Icon={Inbox} />
          <span className="text-body-sm text-carbon">
            <span className="block font-semibold text-ink">With a reviewer</span>
            The outcome will appear on this answer.
          </span>
        </div>
      ) : composing ? (
        <form
          className="rise-in space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            escalate(m.id, note)
            setComposing(false)
          }}
        >
          <label htmlFor="esc-note" className="text-body-sm font-semibold text-ink">
            Note for the reviewer <span className="font-normal text-smoke">(optional)</span>
          </label>
          <textarea id="esc-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Client is waiting on this limit today." className="w-full resize-none rounded-2xl border border-frost bg-porcelain px-3 py-2 text-body-sm text-ink placeholder:text-smoke focus:border-ash focus:outline-none" />
          <div className="flex gap-2">
            <PrimaryButton type="submit" className="flex-1">
              <Inbox size={16} /> Send to reviewer
            </PrimaryButton>
            <GhostButton type="button" onClick={() => setComposing(false)}>
              Cancel
            </GhostButton>
          </div>
        </form>
      ) : (
        <div className="flex gap-2">
          <PrimaryButton onClick={() => setComposing(true)} disabled={!done} className="flex-1 whitespace-nowrap">
            <Inbox size={16} /> Send for human review
          </PrimaryButton>
          <GhostButton onClick={() => feedback(m.id, 'helpful')} pressed={m.feedback === 'helpful'} disabled={!done} aria-label="Helpful" title="Helpful" className="px-3">
            <ThumbsUp size={17} />
          </GhostButton>
          <GhostButton onClick={() => feedback(m.id, 'wrong')} pressed={m.feedback === 'wrong'} disabled={!done} aria-label="Wrong" title="Wrong" className="px-3">
            <ThumbsDown size={17} />
          </GhostButton>
        </div>
      )}
      {m.feedback && !m.routed && !composing && (
        <p className="mt-2 flex items-center gap-1.5 text-caption text-smoke">
          {m.feedback === 'helpful' ? <ThumbsUp size={13} aria-hidden="true" /> : <ThumbsDown size={13} aria-hidden="true" />} Marked {m.feedback} · this session only
        </p>
      )}
    </div>
  )
}

function OutcomeLine({ outcome }) {
  const o = OUTCOME_META[outcome.decision]
  return (
    <div className="flex items-start gap-3">
      <IconTile Icon={o.Icon} tone={o.tone} />
      <span className="min-w-0 text-body-sm text-carbon">
        <span className="flex flex-wrap items-center gap-2 font-semibold text-ink">
          {o.label}
          {outcome.recheck && <ScoreBadge score={outcome.recheck.result.score} />}
        </span>
        <span className="mt-0.5 block">{outcome.note}</span>
      </span>
    </div>
  )
}

const STEP_LABEL = {
  claims: 'Claim extraction — split by sentence instead',
  judge: 'Whether each passage supports its claim',
  review: 'Intent and consistency checks',
}

/** What could not run, said plainly. A partial result is never presented as fully verified. */
function PartialNotice({ assessment }) {
  // Each step carries the provider's reason; say each distinct reason once.
  const reasons = [...new Set(assessment.unavailable.map((u) => u.reason.replace(/^Claims were split by sentence instead of by the model\. /, '')))]
  return (
    <div className="mt-4 flex gap-3 rounded-2xl border border-frost bg-bone p-3.5">
      <CircleDashed size={18} className="mt-0.5 shrink-0 text-status-unknown" aria-hidden="true" />
      <div className="min-w-0 text-body-sm text-carbon">
        <div className="font-semibold text-ink">Partial assessment · not fully verified</div>
        <p className="mt-0.5">Not run by the model:</p>
        <ul className="ml-4 list-disc">
          {assessment.unavailable.map((u) => (
            <li key={u.step}>{STEP_LABEL[u.step] ?? u.step}</li>
          ))}
        </ul>
        <p className="mt-1 text-caption text-smoke">
          {reasons.join(' ')} The reliability index is capped below High and a reviewer must look at it.
        </p>
      </div>
    </div>
  )
}

/** Where the answer is in its life, and the next required action. */
function StateCard({ m }) {
  const st = ANSWER_STATES[m.state]
  if (!st || m.state === 'verifying') return null
  const t = TONES[st.tone]
  const ch = m.evidenceChanged
  return (
    <section aria-label="Answer status" className="rise-in flex items-start gap-3 rounded-3xl border border-frost bg-porcelain p-4">
      <IconTile Icon={st.Icon} tone={st.tone} />
      <div className="min-w-0">
        <div className={`eyebrow font-semibold ${t.text}`}>{st.label}</div>
        <p className="mt-0.5 text-body-sm text-ink">{st.next}</p>
        {ch && (
          <p className="mt-1 text-caption text-carbon">
            {ch.usedVersions?.length ? `Assessed against ${ch.usedVersions.join(', ')}. ` : ''}A newer approved version now applies. The original assessment is kept for comparison.
          </p>
        )}
        {m.source === 'submitted' && <p className="mt-1 text-caption text-smoke">Submitted for verification · not written by the Policy Assistant</p>}
      </div>
    </section>
  )
}

const TRIGGER_LABEL = { initial: 'First assessment', reverify: 'Re-verification', correction: 'Correction check' }

function formatTime(iso) {
  if (!iso || !iso.includes('T')) return iso ?? ''
  return new Date(iso).toLocaleString('en-SG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

/** Every assessment of this answer, oldest first, the latest compared with the one before it. */
function AssessmentHistory({ m }) {
  const [h, setH] = useState(null)
  const [trail, setTrail] = useState(false)
  useEffect(() => {
    let live = true
    api.history(m.serverId).then((x) => live && setH(x), () => live && setH({ failed: true }))
    return () => {
      live = false
    }
  }, [m.serverId, m.history, m.state, m.outcome])
  if (!h) return null
  if (h.failed) return <p className="text-caption text-smoke">Could not load the assessment history.</p>
  const list = h.assessments
  const prev = list.length > 1 ? list[list.length - 2] : null
  const latest = list[list.length - 1]
  const text = h.answer.text
  return (
    <section aria-labelledby="hist-title">
      <SectionHeader Icon={History} title="Assessment history" count={list.length} id="hist-title" />
      <ol className="divide-y divide-frost overflow-hidden rounded-2xl border border-frost bg-porcelain">
        {list.map((a, i) => (
          <li key={a.id} className="px-4 py-3">
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
                <RefreshCw size={12} aria-hidden="true" /> <span className="text-carbon">Evidence changed: {a.evidenceChanged.docId} {a.evidenceChanged.newVersion} approved</span>
              </div>
            )}
          </li>
        ))}
      </ol>
      {prev && <Comparison before={prev} after={latest} text={text} />}
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
    <div className="mt-3 rounded-2xl border border-frost bg-porcelain p-4">
      <div className="eyebrow text-smoke">Before → after re-verification</div>
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
                    {was.source?.version && <span className="text-smoke">({was.source.docId} {was.source.version})</span>}
                  </span>
                ) : (
                  <span className="text-smoke">not a claim before</span>
                )}
                <ArrowRight size={12} className="text-carbon" aria-hidden="true" />
                <span className={`inline-flex items-center gap-1 font-medium ${TONES[b.tone].text}`}>
                  <b.Icon size={12} aria-hidden="true" /> <span className="text-carbon">{b.label}</span>
                  {(c.counter ?? c.source)?.version && <span className="text-smoke">({(c.counter ?? c.source).docId} {(c.counter ?? c.source).version})</span>}
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
    <ol className="rise-in mt-2 space-y-1.5 rounded-2xl bg-porcelain p-3 text-caption text-carbon">
      {events.map((e) => (
        <li key={e.id} className="flex flex-wrap gap-x-2">
          <span className="tabular-nums text-smoke">{formatTime(e.at)}</span>
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
