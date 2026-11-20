import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, ChevronDown, CircleCheck, CircleSlash, Clock, Minus, TriangleAlert, TrendingDown, TrendingUp, GitBranch } from 'lucide-react'
import { TOPICS } from '../fixtures'
import { evaluationPayload } from '../lib/releaseCheck'
import { TONES, topicIcon } from '../lib/status'
import { pct } from '../lib/metrics'
import { BACKEND, api } from '../lib/backend'
import AnswerText from '../components/AnswerText'
import { Eyebrow, Pill, ScoreBadge, ClaimPill, IconTile, StatusLabel } from '../components/ui'

/**
 * Agent release check. Demo mode computes the comparison in the browser from
 * the fixtures; backend mode reads GET /api/release-check, where the live
 * verifier (real retrieval + rule checks) scores every answer first.
 */
function useEvaluation() {
  const demo = useMemo(() => (BACKEND ? null : evaluationPayload()), [])
  const [remote, setRemote] = useState(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (BACKEND) api.releaseCheck().then(setRemote, () => setFailed(true))
  }, [])
  return BACKEND ? { data: remote, failed } : { data: demo, failed: false }
}

const CHANGE = {
  fixed: { label: 'Fixed', tone: 'verified', Icon: CircleCheck },
  improved: { label: 'Improved', tone: 'verified', Icon: TrendingDown },
  unchanged: { label: 'No change', tone: 'unknown', Icon: Minus },
  regressed: { label: 'Regressed', tone: 'unsupported', Icon: TrendingUp },
}

const RELEASE = {
  hold: { label: 'Hold the release', tone: 'caution', Icon: TriangleAlert },
  ready: { label: 'Ready to release', tone: 'verified', Icon: CircleCheck },
}

// Lower is better for every measure except answers scored High.
const KPIS = [
  { id: 'flagRate', label: 'Flagged claims', hint: 'Claims not fully supported by a current source', rate: true },
  { id: 'failureRate', label: 'Unsupported or conflicting', hint: 'Including claims with no source found', rate: true },
  { id: 'high', label: 'Answers scored High', hint: 'Safe to use without review', better: 'up' },
  { id: 'withoutSource', label: 'Answered with no source', hint: 'Confident answers no policy supports' },
]

export default function Versions() {
  const { data, failed } = useEvaluation()
  if (!data) {
    return <div className="mx-auto max-w-[1200px] px-6 py-6 text-body-sm text-smoke">{failed ? 'Could not load the release check. Is the backend running on port 8000?' : 'Scoring both versions…'}</div>
  }
  const [base, cand] = data.versions
  return (
    <div className="scroll-quiet h-full overflow-y-auto">
      <div className="mx-auto max-w-[1560px] space-y-6 px-6 py-6">
        <header>
          <Eyebrow>Release check · fixed test set</Eyebrow>
          <h1 className="mt-2 text-heading font-medium text-ink">
            Is {cand.label} ready to replace {base.label}?
          </h1>
          <p className="mt-2 max-w-[75ch] text-body-sm text-smoke">
            The same verifier scored both versions on {data.questions.length} questions, two per topic. The set is weighted to known failure cases, so its rates run higher than the production figures on Trends. Answers are scripted for the demo;{' '}
            {BACKEND ? 'retrieval, rule checks, scores and the comparison are computed by the backend.' : 'flags, scores and the comparison are computed by the same checks the workspace uses.'}
          </p>
        </header>

        <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
          <ReleaseCard data={data} />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            {data.versions.map((v) => (
              <VersionCard key={v.id} v={v} candidate={v.id === cand.id} />
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {KPIS.map((k) => (
            <Kpi key={k.id} k={k} base={data.overall.base} cand={data.overall.candidate} labels={[base.label, cand.label]} />
          ))}
        </div>

        <div className="grid gap-6 xl:grid-cols-[1fr_1.4fr]">
          <TopicTable topics={data.topics} labels={[base.label, cand.label]} />
          <Notes notes={data.notes} />
        </div>

        <QuestionList data={data} />

        <p className="pb-4 text-caption text-smoke">
          {cand.label} is a candidate release that exists only on this page: every answer in the workspace comes from {base.label}. All questions, answers and documents are synthetic.
        </p>
      </div>
    </div>
  )
}

function ReleaseCard({ data }) {
  const r = RELEASE[data.release.id]
  return (
    <section aria-labelledby="release-title" className="rounded-3xl border border-frost bg-porcelain p-6">
      <div className="flex items-start gap-4">
        <IconTile Icon={r.Icon} tone={r.tone} size="lg" />
        <div className="min-w-0 flex-1">
          <StatusLabel Icon={r.Icon} label={r.label} tone={r.tone} />
          <h2 id="release-title" className="mt-1 text-heading-sm font-semibold text-ink">
            {data.release.title}
          </h2>
          {data.release.detail.length > 0 && (
            <ul className="mt-2 space-y-1">
              {data.release.detail.map((d) => (
                <li key={d} className="flex items-start gap-2 text-body-sm text-carbon">
                  <ArrowRight size={14} className="mt-1 shrink-0 text-ash" aria-hidden="true" />
                  {d}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Object.entries(CHANGE).map(([k, c]) => (
          <div key={k} className="rounded-2xl bg-bone px-4 py-3">
            <dt className={`inline-flex items-center gap-1.5 text-caption font-medium ${TONES[c.tone].text}`}>
              <c.Icon size={14} strokeWidth={2.25} aria-hidden="true" />
              <span className="text-carbon">{c.label}</span>
            </dt>
            <dd className="mt-1 text-heading-sm font-semibold tabular-nums text-ink">{data.counts[k]}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function VersionCard({ v, candidate }) {
  return (
    <section className="rounded-3xl border border-frost bg-porcelain p-5">
      <div className="flex items-center gap-3">
        <IconTile Icon={GitBranch} />
        <div className="min-w-0 flex-1">
          <div className="text-body font-semibold text-ink">{v.label}</div>
          <div className="text-caption text-smoke">{v.stage}</div>
        </div>
      </div>
      <p className="mt-3 text-body-sm text-carbon">{v.summary}</p>
      {candidate && v.changes.length > 0 && (
        <ul className="mt-3 space-y-1">
          {v.changes.map((c) => (
            <li key={c} className="flex items-start gap-2 text-caption text-carbon">
              <ArrowRight size={12} className="mt-0.5 shrink-0 text-ash" aria-hidden="true" />
              {c}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

const fmt = (k, t) => (k.rate ? (t[k.id] == null ? '—' : pct(t[k.id])) : `${t[k.id]}/${t.answers}`)

function Big({ k, t }) {
  if (k.rate) return fmt(k, t)
  return (
    <>
      {t[k.id]}
      <span className="text-body font-medium text-smoke"> / {t.answers}</span>
    </>
  )
}

function Kpi({ k, base, cand, labels }) {
  const a = base[k.id]
  const b = cand[k.id]
  const delta = (b ?? 0) - (a ?? 0)
  const better = k.better === 'up' ? delta > 0 : delta < 0
  const tr = delta === 0 ? CHANGE.unchanged : better ? { ...CHANGE.improved, label: 'Better' } : { ...CHANGE.regressed, label: 'Worse' }
  const Arrow = delta === 0 ? Minus : delta > 0 ? TrendingUp : TrendingDown
  const deltaText = k.rate ? `${delta > 0 ? '+' : ''}${Math.round(delta * 100)} pts` : `${delta > 0 ? '+' : ''}${delta}`
  return (
    <div className="rounded-2xl border border-frost bg-porcelain p-5">
      <div className="text-body-sm font-medium text-ink">{k.label}</div>
      <div className="text-caption text-smoke">{k.hint}</div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-body-sm tabular-nums text-smoke" title={labels[0]}>
          {fmt(k, base)}
        </span>
        <ArrowRight size={14} className="self-center text-ash" aria-label="to" />
        <span className="whitespace-nowrap text-heading font-semibold tabular-nums text-ink" title={labels[1]}>
          <Big k={k} t={cand} />
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 text-caption">
        <span className={`inline-flex items-center gap-1 font-medium ${TONES[tr.tone].text}`}>
          <Arrow size={13} aria-hidden="true" />
          {tr.label}
        </span>
        <span className="text-smoke">
          {deltaText} vs {labels[0]}
        </span>
      </div>
    </div>
  )
}

function TopicTable({ topics, labels }) {
  return (
    <section className="rounded-3xl border border-frost bg-porcelain p-6">
      <h2 className="text-subheading font-medium text-ink">By topic</h2>
      <p className="text-caption text-smoke">Share of claims flagged · two questions per topic</p>
      <table className="mt-4 w-full text-left text-body-sm">
        <thead>
          <tr className="border-b border-frost text-caption text-smoke">
            <th className="py-2 font-medium">Topic</th>
            <th className="py-2 pl-3 text-right font-medium">{labels[0]}</th>
            <th className="py-2 pl-3 text-right font-medium">{labels[1]}</th>
            <th className="py-2 pl-4 font-medium">Verdict</th>
          </tr>
        </thead>
        <tbody>
          {topics.map((t) => {
            const v = CHANGE[t.verdict]
            const Icon = topicIcon(t.id)
            return (
              <tr key={t.id} className="border-b border-frost last:border-0">
                <td className="py-3">
                  <span className="inline-flex items-center gap-2 font-medium text-ink">
                    <Icon size={16} className="text-carbon" aria-hidden="true" /> {t.name}
                  </span>
                </td>
                <td className="py-3 pl-3 text-right tabular-nums text-ink">{rateCell(t.base)}</td>
                <td className="py-3 pl-3 text-right tabular-nums text-ink">{rateCell(t.candidate)}</td>
                <td className="py-3 pl-4">
                  <span className={`inline-flex items-center gap-1 text-caption font-medium ${TONES[v.tone].text}`}>
                    <v.Icon size={13} strokeWidth={2.25} aria-hidden="true" />
                    <span className="text-carbon">{v.label}</span>
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

function rateCell(t) {
  if (t.flagRate == null) return <span className="text-caption text-smoke">Declined all</span>
  return (
    <>
      {pct(t.flagRate)}
      <span className="ml-1 text-caption text-smoke">
        ({t.flagged}/{t.claims})
      </span>
    </>
  )
}

const NOTE_ICON = { 'stale-document': Clock, declined: CircleSlash }

function Notes({ notes }) {
  return (
    <section className="rounded-3xl border border-frost bg-porcelain p-6">
      <h2 className="text-subheading font-medium text-ink">What the comparison also shows</h2>
      <p className="text-caption text-smoke">Computed from the same results</p>
      <ul className="mt-4 space-y-3">
        {notes.map((n) => {
          const Icon = NOTE_ICON[n.kind]
          return (
            <li key={n.text} className="flex items-start gap-3 rounded-2xl border border-frost p-4">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-bone text-carbon">
                <Icon size={16} aria-hidden="true" />
              </span>
              <p className="text-body-sm text-carbon">{n.text}</p>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function QuestionList({ data }) {
  const [open, setOpen] = useState(data.questions.find((q) => q.change === 'regressed')?.id ?? null)
  const [base, cand] = data.versions
  return (
    <section aria-labelledby="questions-title" className="rounded-3xl border border-frost bg-porcelain p-6">
      <h2 id="questions-title" className="text-subheading font-medium text-ink">
        Question by question
      </h2>
      <p className="text-caption text-smoke">Open a question to see both answers and every flag with its source</p>
      <ul className="mt-4 divide-y divide-frost overflow-hidden rounded-2xl border border-frost">
        {data.questions.map((q) => {
          const c = CHANGE[q.change]
          const Icon = topicIcon(q.topic)
          const isOpen = open === q.id
          return (
            <li key={q.id}>
              <button onClick={() => setOpen(isOpen ? null : q.id)} aria-expanded={isOpen} className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-bone">
                <Icon size={18} className="shrink-0 text-carbon" aria-label={TOPICS[q.topic].name} />
                <span className="min-w-[16rem] flex-1 text-body-sm font-medium text-ink">{q.question}</span>
                <span className="flex items-center gap-2">
                  <Outcome a={q.base} />
                  <ArrowRight size={14} className="text-ash" aria-label="to" />
                  <Outcome a={q.candidate} />
                </span>
                <span className="w-32 shrink-0">
                  <Pill Icon={c.Icon} label={c.label} tone={c.tone} className="whitespace-nowrap" />
                </span>
                <ChevronDown size={18} className={`shrink-0 text-carbon transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
              </button>
              {isOpen && (
                <div className="rise-in grid gap-4 bg-bone/60 px-4 pb-5 pt-1 lg:grid-cols-2">
                  <AnswerColumn label={base.label} answer={data.answers[q.baseId]} />
                  <AnswerColumn label={cand.label} answer={data.answers[q.candidateId]} />
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function Outcome({ a }) {
  if (a.declined) return <Pill Icon={CircleSlash} label="Declined" tone="unknown" />
  return <ScoreBadge score={a.score} />
}

function AnswerColumn({ label, answer }) {
  const { text, result } = answer
  const flags = result.claims.filter((c) => c.status !== 'supported')
  return (
    <div className="rounded-2xl border border-frost bg-porcelain p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-body-sm font-semibold text-ink">{label}</span>
        {result.claims.length ? <ScoreBadge score={result.score} /> : <Pill Icon={CircleSlash} label="Declined" tone="unknown" />}
      </div>
      <AnswerText text={text} claims={result.claims} />
      <p className="mt-2 text-caption text-smoke">{result.headline}</p>
      {flags.length > 0 && (
        <ul className="mt-3 space-y-2">
          {flags.map((c) => {
            const ref = c.counter ?? c.source
            return (
              <li key={c.id} className="rounded-xl bg-bone p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <ClaimPill status={c.status} />
                  <span className="text-body-sm font-medium text-ink">{c.short}</span>
                </div>
                {ref ? (
                  <p className="mt-1.5 text-caption text-carbon">
                    <span className="font-medium">
                      {c.counter ? 'Current policy' : c.nearest ? 'Nearest passage' : 'Source'} · {ref.docId} {ref.section}:
                    </span>{' '}
                    “{ref.passage}”
                  </p>
                ) : (
                  <p className="mt-1.5 inline-flex items-center gap-1 text-caption text-carbon">
                    <CircleSlash size={12} className={TONES.unknown.text} aria-hidden="true" /> No approved passage found
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {!result.claims.length && <p className="mt-3 text-caption text-carbon">No policy claims. Retrieval found no approved document, so declining is the correct answer.</p>}
    </div>
  )
}
