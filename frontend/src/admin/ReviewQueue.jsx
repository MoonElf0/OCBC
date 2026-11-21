import { useEffect, useMemo, useState } from 'react'
import {
  ArrowUp,
  Ban,
  BookOpen,
  Bot,
  Check,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  Clock,
  FileStack,
  FileText,
  Flag,
  History,
  LoaderCircle,
  Hash,
  Inbox,
  ListChecks,
  MessageSquare,
  Pencil,
  Route,
  ScanSearch,
  Search,
  ShieldCheck,
  Sparkles,
  User,
  UserRound,
  Users,
  X,
} from 'lucide-react'
import { useStore, DEMO_REVIEWERS } from '../state/store'
import { BACKEND, api } from '../lib/backend'
import { REVIEW_HINTS, CORRECTIONS, TOPICS, DEMO_TODAY, DOCUMENTS } from '../fixtures'
import { assess } from '../lib/assess'
import { scenarioById } from '../lib/pipeline'
import { CHECKS, CHECK_ICON, CHECK_STATUS, REASONS, TONES, CLAIM_STATUS, OUTCOME_META, BAND_ICON, VERDICT, bandFor, severityOf, topicIcon } from '../lib/status'
import { freshnessOf, formatDate } from '../lib/freshness'
import { flagged } from '../lib/view'
import AnswerText from '../components/AnswerText'
import { SearchRecord } from '../components/Evidence'
import { ScoreBadge, ClaimPill, CheckPill, IconTile, SectionHeader, docInfo } from '../components/ui'
import { AuditTrail, PartialNotice, formatWhen } from '../components/lifecycle'

// Demo clock for "2m ago" labels. Fixed so relative times never drift between takes.
const DEMO_NOW = new Date(`${DEMO_TODAY}T09:14`)

const resultOf = (q) => q.result ?? assess(q.scenarioId)

/**
 * What the reviewer sees. Backend mode sends the stored answer and its
 * assessment (and submitted answers have no scenario); demo mode reads the fixture.
 */
function caseOf(q) {
  const sc = scenarioById(q.scenarioId)
  const topic = q.topic ?? sc.topic
  return {
    sc,
    topic,
    question: q.question ?? sc.question,
    text: q.answerText ?? sc.answer.text,
    topicName: TOPICS[topic]?.name ?? 'Topic not identified',
    submitted: q.kind === 'submitted',
  }
}

/** Freshness of a passage: the assessed version's own state when the backend sent it, the fixture library otherwise. */
function freshnessOfPassage(p) {
  if (p.version && p.state) return { state: p.state, stale: p.state !== 'current', supersededBy: p.supersededBy ? { id: String(p.supersededBy).replace('@', ' ') } : null }
  if (!DOCUMENTS[p.docId]) return { state: 'unknown', stale: false }
  return freshnessOf(p.docId)
}

function ago(askedAt) {
  if (askedAt === 'Just now') return 'Just now'
  const mins = Math.round((DEMO_NOW - new Date(askedAt)) / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`
  return `${Math.round(mins / 1440)}d ago`
}
const timeKey = (q) => (q.askedAt === 'Just now' ? Infinity : new Date(q.askedAt).getTime())
// Pending: riskiest first, so the reviewer starts where harm is likeliest. Resolved: newest first.
const ORDER = {
  pending: (a, b) => (resultOf(a).score ?? -1) - (resultOf(b).score ?? -1),
  resolved: (a, b) => timeKey(b) - timeKey(a),
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

/** Every document a set of claims leans on, with its freshness. */
function sourcesOf(claims) {
  const byId = new Map()
  for (const c of claims) {
    for (const p of [c.source, c.counter]) if (p?.docId && !byId.has(p.docId)) byId.set(p.docId, p)
  }
  return [...byId.entries()].map(([id, p]) => ({ id, ...freshnessOfPassage(p) }))
}

export default function ReviewQueue() {
  const { state } = useStore()
  const [tab, setTab] = useState('pending')
  const [query, setQuery] = useState('')

  const items = useMemo(() => {
    const q = query.trim().toLowerCase()
    return state.queue
      .filter((i) => i.status === tab)
      .filter((i) => {
        if (!q) return true
        const k = caseOf(i)
        return [k.question, i.id, k.topicName, i.askedBy].some((s) => s?.toLowerCase().includes(q))
      })
      .sort(ORDER[tab])
  }, [state.queue, tab, query])

  const [selectedId, setSelectedId] = useState(items[0]?.id)
  const selected = state.queue.find((q) => q.id === selectedId) ?? items[0]

  useEffect(() => {
    if (!items.find((i) => i.id === selectedId)) setSelectedId(items[0]?.id)
  }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps

  // After a decision, move straight on to the next case and confirm what was sent.
  const [done, setDone] = useState(null)
  const onDecided = (id, decision) => {
    const next = items.find((i) => i.id !== id)
    setDone({ id, decision, next: next?.id })
    if (next) setSelectedId(next.id)
    else setTab('resolved')
  }

  const select = (id) => {
    setSelectedId(id)
    setDone(null)
    // On narrow screens the case opens below the cards: bring it into view.
    if (window.innerWidth < 1024) requestAnimationFrame(() => document.getElementById('rq-case')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  const counts = {
    pending: state.queue.filter((q) => q.status === 'pending').length,
    resolved: state.queue.filter((q) => q.status === 'resolved').length,
  }

  return (
    <div className="scroll-quiet relative h-full overflow-y-auto">
      {/* Clipped so the oversized swooshes never create scrollable overflow. */}
      <div className="pointer-events-none absolute inset-0 overflow-clip" aria-hidden="true">
        <div className="rq-swoosh rq-swoosh-a" />
        <div className="rq-swoosh rq-swoosh-b" />
      </div>

      <div className="relative mx-auto max-w-[1440px] space-y-6 px-4 pt-6 pb-16 lg:px-8">
        <QueueHero queue={state.queue} />

        {/* Queue: status tabs, search, then one card per case */}
        <section aria-label="Cases">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <div className="rq-glass inline-flex items-center gap-1 rounded-full p-1" role="tablist" aria-label="Queue status">
              {[
                ['pending', 'Awaiting review', Inbox],
                ['resolved', 'Resolved', CircleCheck],
              ].map(([t, label, Icon]) => {
                const active = tab === t
                return (
                  <button
                    key={t}
                    role="tab"
                    aria-selected={active}
                    onClick={() => setTab(t)}
                    className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-body-sm font-semibold transition-colors ${active ? 'bg-inverse text-white shadow-md' : 'text-carbon hover:bg-surface/70'}`}
                  >
                    <Icon size={15} aria-hidden="true" />
                    {label}
                    <span className={`rounded-full px-2 py-px text-caption tabular-nums ${active ? 'bg-white/20 text-white' : 'bg-line/[0.06] text-carbon'}`}>{counts[t]}</span>
                  </button>
                )
              })}
            </div>
            <span className="text-caption text-smoke">{tab === 'pending' ? 'Lowest trust score first' : 'Most recent first'}</span>
            <label className="rq-field ml-auto flex w-full min-w-0 items-center gap-2 rounded-full px-4 sm:w-80">
              <Search size={16} className="shrink-0 text-smoke" aria-hidden="true" />
              <span className="sr-only">Search cases</span>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search question, case ID, topic…" className="min-w-0 flex-1 bg-transparent py-2.5 text-body-sm text-ink placeholder:text-smoke focus:outline-none" />
              {query && (
                <button onClick={() => setQuery('')} className="rounded-full p-0.5 text-smoke hover:text-ink" aria-label="Clear search">
                  <X size={14} />
                </button>
              )}
            </label>
          </div>

          {items.length === 0 ? (
            <div className="rq-glass flex items-center justify-center gap-2.5 rounded-3xl p-8 text-body-sm text-smoke">
              <Inbox size={20} aria-hidden="true" />
              {query ? 'No cases match that search.' : tab === 'pending' ? 'Queue is clear. Nothing waiting for review.' : 'No decisions yet this session.'}
            </div>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-label={tab === 'pending' ? 'Cases awaiting review' : 'Resolved cases'}>
              {items.map((q) => (
                <QueueCard key={q.id} item={q} selected={selected?.id === q.id} onSelect={() => select(q.id)} />
              ))}
            </ul>
          )}
        </section>

        {done && <DoneBanner done={done} onView={() => (setTab('resolved'), setSelectedId(done.id), setDone(null))} onClose={() => setDone(null)} />}

        {selected && items.some((i) => i.id === selected.id) && <ReviewDetail key={selected.id} item={selected} onDecided={onDecided} />}
      </div>
    </div>
  )
}

/* ─── Hero ─────────────────────────────────────────────────────────────── */

const DONE_VERB = { approved: 'approved', corrected: 'corrected', rejected: 'rejected' }

function DoneBanner({ done, onView, onClose }) {
  const o = OUTCOME_META[done.decision]
  return (
    <div role="status" className={`rq-glass rise-in flex flex-wrap items-center gap-3 rounded-2xl border-l-4 px-5 py-3 ${TONES[o.tone].border}`}>
      <o.Icon size={18} className={TONES[o.tone].text} aria-hidden="true" />
      <p className="min-w-0 flex-1 text-body-sm text-ink">
        <span className="font-semibold">{done.id} {DONE_VERB[done.decision]}</span> and sent back to the employee with your note.
        {done.next ? ` Next case opened: ${done.next}.` : ' That was the last case in the queue.'}
      </p>
      <button onClick={onView} className="rq-outline rounded-full px-3.5 py-1.5 text-caption font-semibold text-carbon">
        View in Resolved
      </button>
      <button onClick={onClose} className="rounded-full p-1 text-smoke hover:text-ink" aria-label="Dismiss">
        <X size={16} />
      </button>
    </div>
  )
}

function QueueHero({ queue }) {
  const pending = queue.filter((q) => q.status === 'pending')
  // Stale documents stay stale after a case is decided: count across every case, open or not.
  const stale = sourcesOf(queue.flatMap((q) => resultOf(q).claims)).filter((s) => s.stale).length
  const oldest = pending.reduce((o, q) => (!o || timeKey(q) < timeKey(o) ? q : o), null)
  const stats = [
    { Icon: Inbox, value: pending.length, label: 'Awaiting review' },
    { Icon: Clock, value: oldest ? ago(oldest.askedAt).replace(' ago', '') : '–', label: 'Oldest waiting' },
    { Icon: FileStack, value: stale, label: 'Stale documents' },
    { Icon: CircleCheck, value: queue.length - pending.length, label: 'Resolved' },
  ]
  return (
    <header className="rq-hero relative overflow-hidden rounded-3xl px-5 py-4 text-white lg:px-7">
      <div className="grid items-center gap-4 xl:grid-cols-[minmax(0,1fr)_auto]">
        <div className="flex min-w-0 items-center gap-4">
          <span className="hidden size-12 shrink-0 place-items-center rounded-2xl border border-white/15 bg-white/10 sm:grid" aria-hidden="true">
            <ShieldCheck size={24} />
          </span>
          <div className="min-w-0">
            <h1 className="text-heading-sm font-semibold sm:text-[30px] sm:tracking-[-0.03em]">Review Queue</h1>
            <p className="mt-0.5 text-body-sm text-white/75">Check flagged AI answers against their sources, then approve, correct or reject.</p>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="flex min-w-0 items-center gap-2.5 rounded-2xl border border-white/10 bg-white/[0.07] px-3 py-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-white/10 text-white/85" aria-hidden="true">
                <s.Icon size={16} />
              </span>
              <div className="flex min-w-0 flex-col-reverse pr-1">
                <dt className="text-caption leading-tight text-white/70 sm:truncate">{s.label}</dt>
                <dd className="text-[22px] leading-tight font-semibold tracking-[-0.02em] tabular-nums">{s.value}</dd>
              </div>
            </div>
          ))}
        </dl>
      </div>
    </header>
  )
}

/* ─── Queue cards ──────────────────────────────────────────────────────── */

function ScoreRing({ score, size = 56, stroke = 6, children }) {
  const band = bandFor(score)
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = score == null ? 0 : score / 100
  return (
    <span className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={`absolute inset-0 -rotate-90 ${TONES[band.status].text}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeOpacity="0.14" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${c * pct} ${c}`} className="rq-ring" />
      </svg>
      <span className="relative text-center">{children}</span>
    </span>
  )
}

function BandLabel({ score, className = '' }) {
  const band = bandFor(score)
  const Icon = BAND_ICON[band.status]
  return (
    <span className={`inline-flex items-center gap-1 font-semibold ${TONES[band.status].text} ${className}`}>
      <Icon size={13} strokeWidth={2.4} aria-hidden="true" />
      {band.label}
    </span>
  )
}

function ReasonChip({ id }) {
  const r = REASONS[id]
  const t = TONES[r.tone]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-caption font-medium ${t.surface} ${t.text}`} style={{ borderColor: 'color-mix(in srgb, currentColor 25%, transparent)' }}>
      <r.Icon size={12} strokeWidth={2.25} aria-hidden="true" />
      {r.label}
    </span>
  )
}

function QueueCard({ item, selected, onSelect }) {
  const k = caseOf(item)
  const v = resultOf(item)
  const TopicIcon = topicIcon(k.topic)
  const o = item.status === 'resolved' ? OUTCOME_META[item.outcome.decision] : null
  // The score already says "low confidence"; the chips say why.
  const reasons = item.reasons.filter((r) => r !== 'low-confidence')
  return (
    <li>
      <button onClick={onSelect} aria-current={selected ? 'true' : undefined} className={`rq-card flex h-full w-full items-start gap-4 rounded-3xl p-4 text-left ${selected ? 'rq-card-selected' : ''}`}>
        <span className="flex flex-col items-center gap-1.5">
          <ScoreRing score={v.score}>
            <span className="block text-[18px] leading-none font-semibold tabular-nums text-ink">{v.score ?? '–'}</span>
            <span className="block text-[10px] leading-tight text-smoke">/100</span>
          </ScoreRing>
          <BandLabel score={v.score} className="text-[11px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-caption text-smoke">
            <TopicIcon size={13} aria-hidden="true" />
            <span className="truncate">{k.submitted ? 'Submitted answer' : k.topicName}</span>
            <span aria-hidden="true">·</span>
            <span className="shrink-0">{ago(item.askedAt)}</span>
          </span>
          <span className="mt-1 line-clamp-3 text-body font-semibold leading-snug text-ink sm:line-clamp-2">{k.question}</span>
          {o ? (
            <span className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className={`inline-flex items-center gap-1.5 text-caption font-semibold ${TONES[o.tone].text}`}>
                <o.Icon size={13} aria-hidden="true" /> {o.label}
              </span>
              {item.outcome.recheck && (
                <span className="inline-flex items-center gap-1 text-caption text-carbon">
                  Re-checked <span className="font-semibold tabular-nums">{v.score} → {item.outcome.recheck.result.score}</span>
                </span>
              )}
            </span>
          ) : (
            <span className="mt-2.5 flex flex-wrap gap-1.5">
              {reasons.map((r) => (
                <ReasonChip key={r} id={r} />
              ))}
            </span>
          )}
        </span>
      </button>
    </li>
  )
}

/* ─── Case detail ──────────────────────────────────────────────────────── */

function ReviewDetail({ item, onDecided }) {
  const k = caseOf(item)
  const sc = k.sc
  const v = resultOf(item)
  const [focus, setFocus] = useState(null)
  const flags = [...flagged(v.claims)].sort((a, b) => severityOf(a.status) - severityOf(b.status))
  const numbers = Object.fromEntries(flags.map((c, i) => [c.id, i + 1]))
  const firstNoSource = flags.find((c) => !c.source)?.id

  const jump = (c) => {
    if (c.status === 'supported') return
    setFocus(c.id)
    document.getElementById(`flag-${c.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return (
    <div id="rq-case" className="rise-in grid scroll-mt-4 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <article className="min-w-0 space-y-6" aria-labelledby="rq-question">
        <CaseHeader item={item} k={k} />
        {/* Narrow screens: the score sits right under the question, not below every claim. */}
        <div className="lg:hidden">
          <ScoreCard v={v} flags={flags} />
        </div>
        <WhyFlagged item={item} v={v} />

        <section className="rq-glass rounded-3xl p-6" aria-labelledby="rq-answer">
          <SectionHeader Icon={Bot} title="What the AI answered" id="rq-answer">
            <StatusLegend claims={v.claims} />
          </SectionHeader>
          <div className="rq-inset rounded-2xl p-5">
            <AnswerText text={k.text} claims={v.claims} activeClaimId={focus} onClaim={jump} vocab="status" numbers={numbers} />
          </div>
          {flags.length > 0 && <p className="mt-2 text-caption text-smoke">Numbers match the flagged claims below. Select one to jump to its source.</p>}
          <div className="mt-4 flex gap-3 rounded-2xl bg-line/[0.03] p-4">
            <ScanSearch size={18} className="mt-0.5 shrink-0 text-carbon" aria-hidden="true" />
            <div>
              <div className="text-caption font-semibold text-ink">Assessment AI summary</div>
              <p className="mt-0.5 text-body-sm text-carbon">{v.explanation}</p>
              {item.assessment?.policyVersions?.length > 0 && (
                <p className="mt-1.5 text-caption text-smoke">
                  Assessed against {item.assessment.policyVersions.map((p) => `${p.docId} ${p.version}`).join(', ')}
                  {v.assessment?.asOf ? ` · policy date ${v.assessment.asOf}` : ''}
                </p>
              )}
            </div>
          </div>
          {v.assessment?.partial && (
            <div className="mt-3">
              <PartialNotice assessment={v.assessment} />
            </div>
          )}
        </section>

        <section aria-labelledby="rq-claims">
          <SectionHeader Icon={Flag} title="Flagged claims, side by side with the source" count={flags.length} id="rq-claims" />
          {flags.length === 0 ? (
            <p className="rq-glass rounded-3xl p-6 text-body-sm text-smoke">No claims were flagged. This answer was routed for the reasons listed above.</p>
          ) : (
            <div className="space-y-4">
              {flags.map((c, i) => (
                <ClaimCard key={c.id} n={i + 1} c={c} sc={sc} text={k.text} focused={focus === c.id} search={v.search} sameSearchAs={c.source || c.id === firstNoSource ? null : numbers[firstNoSource]} />
              ))}
            </div>
          )}
        </section>

        <ChecksGrid v={v} />
      </article>

      {/* The rail scrolls on its own so the note and send button never drop below the fold. */}
      <aside className="scroll-quiet space-y-4 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-6.5rem)] lg:overflow-y-auto lg:pb-1" aria-label="Score and decision">
        <div className="hidden lg:block">
          <ScoreCard v={v} flags={flags} />
        </div>
        <Decision item={item} sc={sc} k={k} v={v} flags={flags} onDecided={onDecided} />
      </aside>
    </div>
  )
}

function MetaItem({ Icon, children }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-body-sm text-carbon">
      <Icon size={15} className="text-smoke" aria-hidden="true" />
      {children}
    </span>
  )
}

function CaseHeader({ item, k }) {
  const pending = item.status === 'pending'
  const TopicIcon = topicIcon(k.topic)
  return (
    <header className="rq-glass rounded-3xl p-6 lg:p-7">
      <div className="flex flex-wrap items-center gap-2">
        {pending ? (
          <span className="inline-flex items-center gap-2 rounded-full bg-ocbc-red-tint px-3 py-1 text-caption font-semibold text-ocbc-red-deep">
            <span className="rq-dot size-2 rounded-full bg-ocbc-red" aria-hidden="true" /> Awaiting your review
          </span>
        ) : (
          <span className="inline-flex items-center gap-2 rounded-full bg-line/[0.06] px-3 py-1 text-caption font-semibold text-carbon">
            <Check size={13} aria-hidden="true" /> Resolved
          </span>
        )}
        <span className="inline-flex items-center gap-1 rounded-full bg-line/[0.05] px-2.5 py-1 text-caption font-semibold text-carbon tabular-nums">
          <Hash size={12} aria-hidden="true" />
          {item.id}
        </span>
        <span className="ml-auto inline-flex items-center gap-1.5 text-caption text-smoke">
          <Clock size={13} aria-hidden="true" /> Asked {ago(item.askedAt).toLowerCase()}
        </span>
      </div>
      <div className="mt-4 flex items-start gap-4">
        <IconTile Icon={TopicIcon} size="lg" className="hidden sm:grid" />
        <div className="min-w-0">
          <div className="text-caption font-semibold tracking-[0.06em] text-smoke uppercase">Question asked</div>
          <h2 id="rq-question" className="mt-1 text-[26px] leading-tight font-semibold tracking-[-0.02em] text-ink [text-wrap:pretty]">
            {k.question}
          </h2>
        </div>
      </div>
      {item.note && (
        <div className="mt-4 flex gap-3 rounded-2xl border border-line/[0.08] bg-surface/70 p-4">
          <MessageSquare size={18} className="mt-0.5 shrink-0 text-carbon" aria-hidden="true" />
          <div>
            <div className="text-caption font-semibold text-smoke">{item.routedBy === 'auto' ? 'Employee note' : 'Why the employee escalated'}</div>
            <p className="mt-0.5 text-body text-ink">“{item.note}”</p>
          </div>
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-line/[0.06] pt-4">
        <MetaItem Icon={User}>{item.askedBy}</MetaItem>
        <MetaItem Icon={TopicIcon}>{k.topicName}</MetaItem>
        {k.submitted && <MetaItem Icon={FileText}>Submitted for verification · not from the Policy Assistant</MetaItem>}
        <MetaItem Icon={Route}>{item.routedBy === 'auto' ? 'Sent here automatically by Assessment AI' : 'Escalated by the employee'}</MetaItem>
        {item.watchers?.length ? <MetaItem Icon={Users}>{1 + item.watchers.length} employees waiting</MetaItem> : null}
      </div>
    </header>
  )
}

/** Why the case is here: routing reasons, how the claims split, and source health. */
function WhyFlagged({ item, v }) {
  const total = v.claims.length
  const groups = statusCounts(v.claims)
  const sources = sourcesOf(v.claims)
  const stale = sources.filter((s) => s.stale)
  return (
    <section className="rq-glass rounded-3xl p-6" aria-labelledby="rq-why">
      <SectionHeader Icon={CircleAlert} title="Why it needs a human" id="rq-why" />
      <div className="grid gap-5 md:grid-cols-3">
        <div className="rq-inset rounded-2xl p-4">
          <div className="text-caption font-semibold text-smoke">Routing reasons</div>
          <ul className="mt-3 space-y-2">
            {item.reasons.map((id) => {
              const r = REASONS[id]
              return (
                <li key={id} className="flex items-center gap-2.5 text-body-sm font-medium text-ink">
                  <IconTile Icon={r.Icon} tone={r.tone} size="sm" />
                  {r.label}
                </li>
              )
            })}
          </ul>
        </div>

        <div className="rq-inset rounded-2xl p-4">
          <div className="flex items-baseline justify-between text-caption font-semibold text-smoke">
            Claims checked <span className="text-ink tabular-nums">{total}</span>
          </div>
          <div className="mt-3 flex h-3 gap-1 overflow-hidden rounded-full" role="img" aria-label={groups.map((g) => `${g.n} ${g.label}`).join(', ')}>
            {groups
              .filter((g) => g.n)
              .map((g) => (
                <span key={g.id} className={`h-full rounded-full ${TONES[g.tone].fill} rq-grow`} style={{ flexGrow: g.n }} />
              ))}
          </div>
          <ul className="mt-3 space-y-1.5">
            {groups.map((g) => (
              <li key={g.id} className={`flex items-center gap-1.5 text-caption font-medium ${TONES[g.tone].text}`}>
                <g.Icon size={13} strokeWidth={2.25} aria-hidden="true" />
                <span className="text-carbon">{g.label}</span>
                <span className="ml-auto font-semibold text-ink tabular-nums">{g.n}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rq-inset rounded-2xl p-4">
          <div className="flex items-baseline justify-between text-caption font-semibold text-smoke">
            Sources used <span className="text-ink tabular-nums">{sources.length}</span>
          </div>
          {sources.length === 0 ? (
            <p className="mt-3 flex items-center gap-2 text-body-sm font-medium text-status-unknown">
              <Search size={15} aria-hidden="true" /> No approved source matched
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {sources.map((s) => (
                <li key={s.id} className="flex items-center gap-2 text-caption">
                  <FileText size={14} className="shrink-0 text-smoke" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate font-medium text-ink" title={docInfo(s.id).title}>
                    {s.id}
                  </span>
                  {s.stale ? (
                    <span className="inline-flex items-center gap-1 font-semibold text-status-caution">
                      <Clock size={12} aria-hidden="true" /> Stale
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 font-medium text-status-verified">
                      <CircleCheck size={12} aria-hidden="true" /> Current
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {stale.length > 0 && <p className="mt-3 border-t border-line/[0.06] pt-2 text-caption text-carbon">{plural(stale.length, 'document')} past review or superseded.</p>}
        </div>
      </div>
    </section>
  )
}

/** Claim statuses present in this answer, worst first, in the same words the claim cards use. */
function statusCounts(claims) {
  return Object.entries(CLAIM_STATUS)
    .map(([id, s]) => ({ id, ...s, n: claims.filter((c) => c.status === id).length }))
    .filter((g) => g.n)
    .sort((a, b) => severityOf(a.id) - severityOf(b.id))
}

function StatusLegend({ claims }) {
  return (
    <ul className="hidden flex-wrap items-center gap-x-3 gap-y-1 md:flex" aria-label="Highlight legend">
      {statusCounts(claims).map((g) => (
        <li key={g.id} className={`inline-flex items-center gap-1 text-caption font-medium ${TONES[g.tone].text}`}>
          <g.Icon size={13} strokeWidth={2.25} aria-hidden="true" />
          <span className="text-carbon">{g.label}</span>
        </li>
      ))}
    </ul>
  )
}

/** The claim's sentence, located by offsets into the answer, never rewritten. */
function sentenceAround(text, start, end) {
  const prev = text.lastIndexOf('. ', start - 1)
  const s = prev < 0 ? 0 : prev + 2
  const next = text.indexOf('. ', end)
  const e = next < 0 ? text.length : next + 1
  return { before: text.slice(s, start), claim: text.slice(start, end), after: text.slice(end, e) }
}

function PanelLabel({ Icon, children }) {
  return (
    <div className="mb-2.5 flex items-center gap-1.5 text-caption font-semibold tracking-[0.06em] text-smoke uppercase">
      <Icon size={14} aria-hidden="true" /> {children}
    </div>
  )
}

function ClaimCard({ n, c, sc, text, focused, search, sameSearchAs }) {
  const s = CLAIM_STATUS[c.status]
  const t = TONES[s.tone]
  const ctx = sentenceAround(text, c.start, c.end)
  // The backend may name one passage as both the rule and the contradiction: show it once.
  const sameAsSource = c.counter && c.source && c.counter.docId === c.source.docId && c.counter.section === c.source.section && c.counter.version === c.source.version
  // The pill already names the status; don't say it twice ("No source found. No source found…").
  const reason = c.reason.toLowerCase().startsWith(`${s.label.toLowerCase()}.`) ? c.reason.slice(s.label.length + 1).trim() : c.reason
  return (
    <article id={`flag-${c.id}`} className={`rq-glass scroll-mt-6 overflow-hidden rounded-3xl transition-shadow ${focused ? 'ring-2 ring-carbon/40' : ''}`}>
      <header className={`flex flex-wrap items-center gap-x-3 gap-y-2 border-l-4 px-5 py-4 ${t.border} ${t.surface}`}>
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-inverse text-caption font-semibold text-white tabular-nums">{n}</span>
        <ClaimPill status={c.status} />
        <span className="min-w-0 basis-full text-body-sm font-semibold text-ink sm:flex-1 sm:basis-0">{reason}</span>
      </header>
      <div className="grid md:grid-cols-2">
        <div className="p-5">
          <PanelLabel Icon={Bot}>The AI said</PanelLabel>
          <p className="text-body text-carbon">
            {ctx.before}
            <span className={`claim claim-static ${t.surface} ${t.border} ${t.text}`}>
              <span className="font-semibold text-ink">{ctx.claim}</span>
            </span>
            {ctx.after}
          </p>
        </div>
        <div className="border-t border-line/[0.06] bg-surface/45 p-5 md:border-t-0 md:border-l">
          <PanelLabel Icon={BookOpen}>The source says</PanelLabel>
          {c.source ? (
            <div className="space-y-3">
              <Evidence source={c.source} />
              {c.counter && !sameAsSource && <Evidence source={c.counter} label="Also relevant" />}
            </div>
          ) : (
            <div>
              <div className="mb-2 flex items-center gap-1.5 text-body-sm font-semibold text-status-unknown">
                <Search size={15} aria-hidden="true" /> No approved passage matched
              </div>
              {sameSearchAs ? (
                <p className="text-body-sm text-carbon">Same retrieval search as claim {sameSearchAs}: nothing scored above the relevance threshold.</p>
              ) : (
                <SearchRecord scenarioId={sc.id} search={search} />
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  )
}

function Evidence({ source, label }) {
  const [open, setOpen] = useState(false)
  const info = docInfo(source.docId, source)
  const doc = DOCUMENTS[source.docId] ?? { id: source.docId, title: info.title, version: info.version }
  const f = freshnessOfPassage(source)
  const section = doc.sections?.find((x) => x.id === source.section)
  return (
    <div>
      {label && <div className="mb-1.5 text-caption font-semibold text-smoke">{label}</div>}
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-ocbc-red-tint text-ocbc-red-deep" aria-hidden="true">
          <FileText size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-body-sm font-semibold text-ink">{doc.title}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-smoke">
            <span>
              {doc.id} {source.section}
              {(source.version ?? doc.version) ? ` · ${source.version ?? doc.version}` : ''}
            </span>
            {!f.stale && (
              <span className="inline-flex items-center gap-1 font-medium text-status-verified">
                <CircleCheck size={12} aria-hidden="true" /> Current
              </span>
            )}
          </div>
          {doc.owner && (
            <div className="mt-0.5 text-caption text-smoke">
              Owner: {doc.owner} · Updated {formatDate(doc.updated)}
            </div>
          )}
        </div>
      </div>
      {f.stale && (
        <div className="mt-2.5 flex items-start gap-2 rounded-xl border border-status-caution/30 bg-status-caution-surface px-3 py-2 text-caption text-carbon">
          <Clock size={14} className="mt-px shrink-0 text-status-caution" aria-hidden="true" />
          <span>
            <span className="font-semibold text-status-caution">Stale source · </span>
            {f.state === 'superseded'
              ? `Superseded by ${f.supersededBy?.id ?? 'a newer version'}${f.supersededBy?.title ? ` (${f.supersededBy.title})` : ''}.`
              : f.months != null && doc.reviewCycleMonths
                ? `Reviewed every ${doc.reviewCycleMonths} months; last updated ${f.months} months ago (${f.months - doc.reviewCycleMonths} overdue). No newer version on file.`
                : 'This version is past its review date.'}
          </span>
        </div>
      )}
      <blockquote className="mt-2.5 rounded-xl border-l-[3px] border-carbon/25 bg-surface/70 px-3.5 py-2.5 text-body-sm text-ink">“{source.passage}”</blockquote>
      {source.screened && <p className="mt-1.5 text-caption text-carbon">Instruction-like text in this document was removed and never used as evidence.</p>}
      {section && (
        <>
          <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="mt-2 inline-flex items-center gap-1 rounded-lg py-1 text-caption font-medium text-carbon hover:text-ink">
            <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
            {open ? 'Hide full section' : 'Read full section'}
          </button>
          {open && (
            <div className="rise-in mt-1 rounded-xl border border-line/[0.06] bg-surface/60 p-3 text-body-sm">
              <p className="text-carbon">
                <span className="font-semibold text-ink">
                  {section.id} {section.heading}.
                </span>{' '}
                {section.text}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function ChecksGrid({ v }) {
  const rows = CHECKS.map((meta) => ({ meta, check: v.checks.find((c) => c.id === meta.id) })).filter((r) => r.check)
  const tally = ['pass', 'warning', 'fail', 'unavailable', 'na']
    .map((s) => ({ s, n: rows.filter((r) => r.check.status === s).length }))
    .filter((x) => x.n)
  return (
    <section className="rq-glass rounded-3xl p-6" aria-labelledby="rq-checks">
      <SectionHeader Icon={ListChecks} title="The six automated checks" id="rq-checks">
        <span className="hidden flex-wrap gap-1.5 sm:flex">
          {tally.map(({ s, n }) => {
            const m = CHECK_STATUS[s]
            return (
              <span key={s} className={`inline-flex items-center gap-1 text-caption font-semibold ${TONES[m.tone].text}`}>
                <m.Icon size={13} aria-hidden="true" />
                <span className="text-carbon">
                  {n} {m.label.toLowerCase()}
                </span>
              </span>
            )
          })}
        </span>
      </SectionHeader>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map(({ meta, check }) => {
          const st = CHECK_STATUS[check.status]
          const Icon = CHECK_ICON[meta.id]
          return (
            <li key={meta.id} className="rq-inset flex flex-col gap-2.5 rounded-2xl p-4" title={check.summary}>
              <div className="flex items-start gap-2.5">
                <IconTile Icon={Icon} tone={st.tone} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="text-body-sm font-semibold text-ink">{meta.name}</div>
                  <div className="text-caption text-smoke">{meta.question}</div>
                </div>
              </div>
              <p className="flex-1 text-body-sm font-medium text-carbon">{check.short ?? check.summary}</p>
              <span className="self-start">
                <CheckPill status={check.status} />
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/* ─── Side rail: score + decision ──────────────────────────────────────── */

function ScoreCard({ v, flags }) {
  const band = bandFor(v.score)
  const verdict = VERDICT[band.id]
  // "Has a source" and "flagged" overlap on purpose: a claim can quote a real but stale or off-topic passage.
  const sourced = v.claims.filter((c) => c.source).length
  const stale = sourcesOf(v.claims).filter((s) => s.stale).length
  return (
    <section className="rq-glass rounded-3xl p-5" aria-label="Trust score">
      <div className="flex items-center gap-5">
        <ScoreRing score={v.score} size={96} stroke={9}>
          <span className="block text-[30px] leading-none font-semibold tracking-[-0.03em] tabular-nums text-ink">{v.score ?? '–'}</span>
          <span className="mt-0.5 block text-caption text-smoke">/ 100</span>
        </ScoreRing>
        <div className="min-w-0">
          <div className="text-caption font-semibold text-smoke">Trust score</div>
          <BandLabel score={v.score} className="mt-1 text-body" />
          <div className="mt-0.5 text-body-sm font-semibold text-ink">{verdict.tag}</div>
          <div className="mt-1 text-caption text-smoke">{verdict.action}</div>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-3 divide-x divide-line/[0.06] rounded-2xl bg-line/[0.03] py-3 text-center">
        {[
          [`${flags.length}/${v.claims.length}`, 'Claims flagged', 'text-status-unsupported', Flag],
          [`${sourced}/${v.claims.length}`, 'Have a source', 'text-status-verified', BookOpen],
          [stale, 'Stale docs', 'text-status-caution', FileStack],
        ].map(([n, label, tone, Icon]) => (
          <div key={label}>
            <dd className="flex items-center justify-center gap-1.5 text-[20px] font-semibold tabular-nums text-ink">
              <Icon size={15} className={tone} aria-hidden="true" />
              {n}
            </dd>
            <dt className="text-caption text-smoke">{label}</dt>
          </div>
        ))}
      </dl>
    </section>
  )
}

const DECISIONS = {
  approved: { label: 'Approve', verb: 'Confirm approval', desc: 'The answer is correct as written.', Icon: Check },
  corrected: { label: 'Correct', verb: 'Send correction', desc: 'Send the employee a fixed answer.', Icon: Pencil },
  rejected: { label: 'Reject', verb: 'Confirm rejection', desc: 'Withdraw it. No safe correction exists.', Icon: Ban },
}

function Decision({ item, sc, k, v, flags, onDecided }) {
  const flagCount = flags.length
  const { state, decide } = useStore()
  const hint = REVIEW_HINTS[sc.id] ?? {}
  const draft = k.submitted ? null : CORRECTIONS[sc.id]
  const reviewers = state.health?.reviewers ?? DEMO_REVIEWERS
  const [reviewerId, setReviewerId] = useState(reviewers[0].id)
  const [decision, setDecision] = useState(null)
  const [text, setText] = useState(k.text)
  const [note, setNote] = useState('')
  const [ack, setAck] = useState(false)
  const [tried, setTried] = useState(false)
  const [check, setCheck] = useState(null) // backend: { text, result } once a correction has been checked
  const [checking, setChecking] = useState(false)
  const [sending, setSending] = useState(false)

  if (item.status === 'resolved') return <Resolved item={item} />

  const partial = !!v.assessment?.partial
  const changed = text.trim() !== k.text.trim()
  const checked = check && check.text === text.trim() ? check.result : null
  const correctionFlags = checked ? checked.claims.filter((c) => ['conflicting', 'unsupported', 'insufficient'].includes(c.status)).length : 0
  const needsAck = (decision === 'approved' && (flagCount > 0 || partial)) || (decision === 'corrected' && correctionFlags > 0)
  const noteOk = note.trim().length >= 5
  const textOk = decision !== 'corrected' || changed
  const valid = decision && noteOk && textOk && (!needsAck || ack) && !sending
  const problem = !decision ? 'Choose an outcome first.' : !noteOk ? `A note is required to ${DECISIONS[decision].label.toLowerCase()}.` : !textOk ? 'Edit the answer before sending a correction.' : needsAck && !ack ? 'Confirm the override.' : null
  const d = decision ? DECISIONS[decision] : null

  const runCheck = async () => {
    setChecking(true)
    try {
      const r = await api.preview({ question: k.question, answer: text.trim(), citations: [], asOf: v.assessment?.asOf })
      setCheck({ text: text.trim(), result: r })
    } catch {
      setCheck(null)
    }
    setChecking(false)
  }

  const submit = async () => {
    if (!valid) return setTried(true)
    setSending(true)
    const r = await decide({ queueId: item.id, decision, note: note.trim(), correctedText: decision === 'corrected' ? text.trim() : null, reviewerId, overrideFlags: needsAck && ack })
    setSending(false)
    if (r && !r.ok) {
      // The backend refused (e.g. a correction it re-checked still has flags): show why.
      if (r.result) setCheck({ text: text.trim(), result: r.result })
      return
    }
    onDecided?.(item.id, decision)
  }

  return (
    <section className="rq-glass space-y-4 rounded-3xl p-5" aria-labelledby="rq-decision">
      <div>
        <h2 id="rq-decision" className="text-[18px] font-semibold tracking-[-0.01em] text-ink">
          Your decision
        </h2>
        <p className="mt-0.5 text-caption text-smoke">Your note goes back to the employee who asked.</p>
      </div>

      <div>
        <label htmlFor="reviewer" className="text-caption font-semibold text-carbon">
          Acting as · simulated identity
        </label>
        <div className="rq-input mt-1.5 flex items-center gap-2 rounded-2xl px-3 py-2">
          <UserRound size={15} className="shrink-0 text-carbon" aria-hidden="true" />
          <select id="reviewer" value={reviewerId} onChange={(e) => setReviewerId(e.target.value)} className="min-w-0 flex-1 bg-transparent text-body-sm text-ink focus:outline-none">
            {reviewers.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} (simulated) · {r.role}
              </option>
            ))}
          </select>
        </div>
        <p className="mt-1 text-caption text-smoke">Prototype: there is no sign-in. The identity is recorded as simulated.</p>
      </div>

      <div className="grid gap-2" role="radiogroup" aria-label="Outcome">
        {Object.entries(DECISIONS).map(([id, opt]) => {
          const on = decision === id
          return (
            <button
              key={id}
              role="radio"
              aria-checked={on}
              onClick={() => (setDecision(on ? null : id), setTried(false), setAck(false))}
              className={`flex items-center gap-3 rounded-2xl border-2 px-3 ${!decision || on ? 'py-2.5' : 'py-1.5'} text-left transition-colors ${on ? 'border-ink bg-surface shadow-md' : 'border-transparent bg-surface/55 hover:border-line/15'}`}
            >
              <span className={`grid ${!decision || on ? 'size-9' : 'size-7'} shrink-0 place-items-center rounded-xl ${on ? 'bg-inverse text-white' : 'bg-line/[0.05] text-carbon'}`} aria-hidden="true">
                <opt.Icon size={17} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-body-sm font-semibold text-ink">{opt.label}</span>
                {(!decision || on) && <span className="block text-caption text-smoke">{opt.desc}</span>}
              </span>
              <span className={`grid size-5 shrink-0 place-items-center rounded-full border-2 ${on ? 'border-ink bg-ink' : 'border-line/20'}`} aria-hidden="true">
                {on && <Check size={12} strokeWidth={3} className="text-porcelain" />}
              </span>
            </button>
          )
        })}
      </div>

      {decision === 'corrected' && (
        <div className="rise-in">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <label htmlFor="corrected" className="text-caption font-semibold text-carbon">
              Corrected answer
            </label>
            {draft && (
              <button type="button" onClick={() => setText(draft.answer.text)} className="inline-flex items-center gap-1 text-caption font-medium text-carbon underline underline-offset-4 hover:text-ink">
                <Sparkles size={12} aria-hidden="true" /> Use draft from sources
              </button>
            )}
          </div>
          <textarea id="corrected" rows={7} value={text} onChange={(e) => setText(e.target.value)} className="rq-input w-full resize-y rounded-2xl px-3.5 py-2.5 text-body-sm text-ink" />
          {BACKEND ? (
            <div className="mt-1.5 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={runCheck} disabled={!changed || checking} className="rq-outline inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-caption font-semibold text-carbon disabled:opacity-50">
                  {checking ? <LoaderCircle size={14} className="spin" aria-hidden="true" /> : <ShieldCheck size={14} aria-hidden="true" />} Check this wording
                </button>
                {checked && <ScoreBadge score={checked.score} />}
              </div>
              {checked ? (
                <p className="text-caption text-carbon">
                  {checked.explanation}
                  {correctionFlags > 0 ? ' Fix the flagged claims, or confirm the override below.' : ''}
                </p>
              ) : (
                <p className="text-caption text-smoke">Any wording you write is re-verified by Assessment AI when you submit, and stored with its own assessment.</p>
              )}
            </div>
          ) : draft && text === draft.answer.text ? (
            <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-caption text-carbon">
              Assessment AI re-check: <ScoreBadge score={assess(draft.id).score} />
              <span className="basis-full text-smoke">
                The employee sees this score with the advice “{VERDICT[bandFor(assess(draft.id).score).id].action}”.
                {bandFor(assess(draft.id).score).id === 'medium' ? ' A Medium is fine to send once you have checked the sources yourself.' : ''}
              </span>
            </p>
          ) : (
            <p className="mt-1.5 text-caption text-smoke">Demo mode can only re-check the drafted correction. Backend mode re-checks any wording.</p>
          )}
        </div>
      )}

      {decision && (
        <div className="rise-in">
          <label htmlFor="note" className="flex items-center gap-1.5 text-caption font-semibold text-carbon">
            <MessageSquare size={13} aria-hidden="true" /> Note to the employee · required
          </label>
          <textarea
            id="note"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={decision === 'approved' ? 'e.g. Checked each claim against the cited source; the answer is correct as written.' : hint.placeholder}
            aria-invalid={tried && !noteOk}
            aria-describedby={tried && problem ? 'decision-problem' : undefined}
            className={`rq-input mt-1.5 w-full resize-none rounded-2xl px-3.5 py-2.5 text-body-sm text-ink placeholder:text-smoke/80 ${tried && !noteOk ? 'rq-input-invalid' : ''}`}
          />
        </div>
      )}

      {needsAck && (
        <label className="flex items-start gap-2.5 rounded-2xl border border-status-caution/30 bg-status-caution-surface p-3 text-body-sm text-carbon">
          <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-1 accent-carbon" />
          <span>
            {decision === 'approved'
              ? `I have checked the ${plural(flagCount, 'flagged or unchecked claim')}${partial ? ' and the parts Assessment AI could not run' : ''}, and I’m overriding Assessment AI.`
              : `My correction still has ${plural(correctionFlags, 'flagged claim')} and I’m sending it anyway.`}{' '}
            This override is recorded.
          </span>
        </label>
      )}

      {tried && problem && (
        <p id="decision-problem" className="flex items-center gap-1.5 text-caption font-medium text-status-unsupported">
          <CircleAlert size={14} aria-hidden="true" /> {problem}
        </p>
      )}
      <button
        onClick={submit}
        disabled={!decision || sending}
        className={`inline-flex w-full items-center justify-center gap-2 rounded-full px-6 py-3 text-body font-medium transition-colors ${decision ? 'bg-ocbc-red text-white shadow-md hover:bg-ocbc-red-deep' : 'cursor-not-allowed bg-line/[0.06] text-smoke'}`}
      >
        {sending ? <LoaderCircle size={17} className="spin" aria-hidden="true" /> : d ? <d.Icon size={17} aria-hidden="true" /> : <ArrowUp size={17} aria-hidden="true" />}
        {d ? d.verb : 'Choose an outcome'}
      </button>
      {decision && !valid && !tried && <p className="-mt-2 text-center text-caption text-smoke">{problem}</p>}
    </section>
  )
}

/** The recorded decision: who made it, when, against which assessment, and the audit trail. */
function Resolved({ item }) {
  const out = item.outcome
  const o = OUTCOME_META[out.decision]
  const re = out.recheck
  const [h, setH] = useState(null)
  useEffect(() => {
    if (BACKEND && item.answerId) api.history(item.answerId).then(setH, () => {})
  }, [item.answerId])
  return (
    <section className={`rq-glass space-y-3 rounded-3xl border-l-4 p-5 ${TONES[o.tone].border}`} aria-label="Decision">
      <div className={`flex items-center gap-2 text-body font-semibold ${TONES[o.tone].text}`}>
        <o.Icon size={18} aria-hidden="true" /> {o.label}
      </div>
      {out.reviewer && (
        <p className="text-caption text-carbon">
          {out.reviewer} · {formatWhen(out.at)}
          {out.override ? ' · overrode Assessment AI’s flags' : ''}
        </p>
      )}
      {out.correctedText && <p className="rq-inset rounded-2xl p-3 text-body-sm text-ink">{out.correctedText}</p>}
      <p className="text-body-sm text-carbon">
        <span className="font-semibold text-ink">Note:</span> {out.note}
      </p>
      {re && (
        <div className="rq-inset rounded-2xl p-3">
          <p className="flex flex-wrap items-center gap-1.5 text-caption text-carbon">
            Correction re-checked by Assessment AI <ScoreBadge score={re.result.score} />
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {re.result.claims.map((c) => (
              <ClaimPill key={c.id} status={c.status} />
            ))}
          </div>
          {re.result.assessment?.partial && <p className="mt-2 text-caption text-smoke">Partial assessment: {re.result.assessment.unavailable[0]?.reason}</p>}
        </div>
      )}
      {out.policyVersions?.length > 0 && <p className="text-caption text-smoke">Original assessment used {out.policyVersions.map((pv) => `${pv.docId} ${pv.version}`).join(', ')}.</p>}
      <p className="text-caption text-smoke">{item.answerId || item.watchers?.length ? 'Returned to the employee who asked. ' : ''}Feeds the recommendations on the Trends page.</p>
      {h?.events?.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-caption font-semibold text-smoke">
            <History size={12} aria-hidden="true" /> Audit trail
          </div>
          <AuditTrail events={h.events} />
        </div>
      )}
    </section>
  )
}
