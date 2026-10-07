import { useEffect, useState } from 'react'
import { CircleCheck, Pencil, Ban, Clock, CircleSlash, Inbox, MessageSquare } from 'lucide-react'
import { useStore } from '../state/store'
import { REVIEW_HINTS, CORRECTIONS, TOPICS } from '../fixtures'
import { assess } from '../lib/assess'
import { scenarioById } from '../lib/pipeline'
import { CHECKS, REASONS, TONES } from '../lib/status'
import { freshnessOf, formatDate } from '../lib/freshness'
import { flagged } from '../lib/view'
import AnswerText from '../components/AnswerText'
import { CheckRow } from '../components/ChecksSheet'
import { SearchRecord } from '../components/Evidence'
import { Eyebrow, ScoreBadge, Passage, PrimaryButton, ClaimPill } from '../components/ui'
import { OUTCOME_META } from '../components/Thread'

export default function ReviewQueue() {
  const { state } = useStore()
  const [tab, setTab] = useState('pending')
  const items = state.queue.filter((q) => q.status === tab)
  const [selectedId, setSelectedId] = useState(items[0]?.id)
  const selected = state.queue.find((q) => q.id === selectedId) ?? items[0]

  useEffect(() => {
    if (!items.find((i) => i.id === selectedId)) setSelectedId(items[0]?.id)
  }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps

  // A decided item moves to Resolved; follow it there so the confirmation stays in view.
  const selectedStatus = state.queue.find((q) => q.id === selectedId)?.status
  useEffect(() => {
    if (selectedStatus && selectedStatus !== tab) setTab(selectedStatus)
  }, [selectedStatus]) // eslint-disable-line react-hooks/exhaustive-deps

  const counts = { pending: state.queue.filter((q) => q.status === 'pending').length, resolved: state.queue.filter((q) => q.status === 'resolved').length }

  return (
    <div className="mx-auto grid h-full max-w-[1200px] grid-cols-[280px_1fr] gap-6 px-6 py-6">
      <aside className="flex min-h-0 flex-col overflow-hidden rounded-3xl border border-frost bg-porcelain">
        <div className="border-b border-frost p-4">
          <Eyebrow>Reviewer queue</Eyebrow>
          <div className="mt-3 flex gap-1 rounded-full bg-bone p-1" role="tablist">
            {['pending', 'resolved'].map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`flex-1 rounded-full px-3 py-1.5 text-body-sm font-medium capitalize transition-colors ${tab === t ? 'bg-porcelain text-ink shadow-md' : 'text-smoke hover:text-ink'}`}>
                {t} <span className="tabular-nums text-smoke">{counts[t]}</span>
              </button>
            ))}
          </div>
        </div>
        <ul className="scroll-quiet flex-1 space-y-2 overflow-y-auto p-3">
          {items.length === 0 && <li className="p-4 text-body-sm text-smoke">{tab === 'pending' ? 'Queue is clear.' : 'No decisions yet this session.'}</li>}
          {items.map((q) => {
            const sc = scenarioById(q.scenarioId)
            const isSel = selected?.id === q.id
            return (
              <li key={q.id}>
                <button onClick={() => setSelectedId(q.id)} aria-current={isSel ? 'true' : undefined} className={`w-full rounded-2xl border p-3 text-left transition-colors ${isSel ? 'border-carbon bg-porcelain shadow-md' : 'border-frost hover:border-ash'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-caption font-medium text-carbon">{q.id}</span>
                    <ScoreBadge score={assess(sc.id).score} />
                  </div>
                  <div className="mt-2 line-clamp-2 text-body-sm font-medium text-ink">{sc.question}</div>
                  <div className="mt-1 text-caption text-smoke">
                    {TOPICS[sc.topic].name} · {q.askedAt === 'Just now' ? 'Just now' : formatWhen(q.askedAt)}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {q.reasons.map((r) => (
                      <ReasonTag key={r} id={r} />
                    ))}
                  </div>
                  {(q.answerId || q.watchers?.length > 0) && <div className="eyebrow mt-2 text-[12px] text-carbon">{q.watchers?.length ? `${1 + q.watchers.length} employees waiting` : 'From your session'}</div>}
                </button>
              </li>
            )
          })}
        </ul>
      </aside>

      {selected ? <ReviewDetail key={selected.id} item={selected} /> : <div className="grid place-items-center rounded-3xl border border-frost text-body-sm text-smoke">Nothing selected.</div>}
    </div>
  )
}

function formatWhen(iso) {
  const [d, t] = iso.split('T')
  return `${formatDate(d)}, ${t}`
}

function ReasonTag({ id }) {
  const r = REASONS[id]
  return (
    <span className={`inline-flex items-center gap-1 rounded-xl border border-frost px-2 py-0.5 text-[12px] font-medium ${TONES[r.tone].text}`}>
      <r.Icon size={11} strokeWidth={2.25} aria-hidden="true" />
      <span className="text-carbon">{r.label}</span>
    </span>
  )
}

function ReviewDetail({ item }) {
  const sc = scenarioById(item.scenarioId)
  const v = assess(sc.id)
  const [focus, setFocus] = useState(null)
  const claims = [...flagged(v.claims), ...v.claims.filter((c) => c.status === 'supported')]

  const jump = (c) => {
    setFocus(c.id)
    document.getElementById(`flag-${c.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return (
    <div className="scroll-quiet grid min-h-0 grid-cols-1 gap-6 overflow-y-auto xl:grid-cols-[1fr_300px] xl:overflow-visible">
      <section className="scroll-quiet space-y-6 rounded-3xl border border-frost bg-porcelain p-6 xl:min-h-0 xl:overflow-y-auto">
        <header>
          <div className="flex flex-wrap items-center gap-2">
            <Eyebrow>
              {item.id} · {TOPICS[sc.topic].name}
            </Eyebrow>
          </div>
          <div className="mt-1 text-caption text-smoke">
            {item.routedBy === 'auto' ? 'Routed automatically by Assessment AI' : 'Escalated by the employee'} · {item.askedBy}
          </div>
          <h1 className="mt-2 text-subheading font-medium text-ink">{sc.question}</h1>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {item.reasons.map((r) => (
              <ReasonTag key={r} id={r} />
            ))}
          </div>
          {item.note && (
            <div className="mt-4 flex gap-2 rounded-2xl bg-bone p-3 text-body-sm text-carbon">
              <MessageSquare size={15} className="mt-0.5 shrink-0" aria-hidden="true" /> Employee note: “{item.note}”
            </div>
          )}
        </header>

        <div className="rounded-2xl border border-frost p-5">
          <div className="mb-2 flex items-center justify-between gap-3">
            <Eyebrow>Agent answer · click a claim for its evidence</Eyebrow>
            <ScoreBadge score={v.score} />
          </div>
          <AnswerText text={sc.answer.text} claims={v.claims} activeClaimId={focus} onClaim={jump} />
          <p className="mt-3 max-w-[65ch] text-body-sm text-smoke">{v.explanation}</p>
        </div>

        <div>
          <Eyebrow className="mb-3">Claims and evidence</Eyebrow>
          <div className="space-y-3">
            {claims.map((c) => (
              <ClaimEvidence key={c.id} c={c} sc={sc} focused={focus === c.id} />
            ))}
          </div>
        </div>

        <div>
          <Eyebrow className="mb-1">Six checks</Eyebrow>
          {CHECKS.map((meta) => (
            <CheckRow key={meta.id} meta={meta} check={v.checks.find((c) => c.id === meta.id)} scenarioId={sc.id} />
          ))}
        </div>
      </section>

      <Decision item={item} sc={sc} />
    </div>
  )
}

function ClaimEvidence({ c, sc, focused }) {
  const f = c.source ? freshnessOf(c.source.docId) : null
  return (
    <div id={`flag-${c.id}`} className={`rounded-2xl border p-4 transition-colors ${focused ? 'border-carbon' : 'border-frost'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <ClaimPill status={c.status} />
        {f?.stale && (
          <span className="inline-flex items-center gap-1 text-caption text-status-caution">
            <Clock size={12} aria-hidden="true" /> Source {f.state === 'superseded' ? `superseded by ${f.supersededBy.id}` : 'overdue for review'}
          </span>
        )}
      </div>
      <p className="mt-2 text-body-sm font-medium text-ink">“{sc.answer.text.slice(c.start, c.end)}”</p>
      <p className="mt-1 text-body-sm text-carbon">{c.reason}</p>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {c.source ? (
          <Passage docId={c.source.docId} section={c.source.section} passage={c.source.passage} />
        ) : (
          <div>
            <div className="eyebrow mb-1.5 flex items-center gap-1.5 text-status-unknown">
              <CircleSlash size={12} aria-hidden="true" /> No source found
            </div>
            <SearchRecord scenarioId={sc.id} />
          </div>
        )}
        {c.counter && <Passage docId={c.counter.docId} section={c.counter.section} passage={c.counter.passage} />}
      </div>
    </div>
  )
}

const DECISIONS = [
  { id: 'approved', label: 'Approve', desc: 'The answer is correct as written.', Icon: CircleCheck },
  { id: 'corrected', label: 'Correct', desc: 'Send the employee a corrected answer.', Icon: Pencil },
  { id: 'rejected', label: 'Reject', desc: 'Withdraw the answer. No safe correction exists.', Icon: Ban },
]

function Decision({ item, sc }) {
  const { dispatch } = useStore()
  const hint = REVIEW_HINTS[sc.id] ?? {}
  const draft = CORRECTIONS[sc.id]
  const [decision, setDecision] = useState(null)
  const [text, setText] = useState(sc.answer.text)
  const [note, setNote] = useState('')
  const [ack, setAck] = useState(false)
  // Approving an answer that carries flags needs an explicit override.
  const flagCount = assess(sc.id).claims.filter((c) => c.status !== 'supported').length
  const needsAck = decision === 'approved' && flagCount > 0
  const valid = decision && note.trim().length >= 5 && (decision !== 'corrected' || text.trim() !== sc.answer.text) && (!needsAck || ack)

  if (item.status === 'resolved') {
    const o = OUTCOME_META[item.outcome.decision]
    return (
      <aside className="self-start rounded-3xl border border-frost bg-porcelain p-6">
        <Eyebrow>Decision</Eyebrow>
        <div className={`eyebrow mt-3 flex items-center gap-1.5 ${TONES[o.tone].text}`}>
          <o.Icon size={14} aria-hidden="true" /> {o.label}
        </div>
        {item.outcome.correctedText && <p className="mt-3 text-body-sm text-ink">{item.outcome.correctedText}</p>}
        <p className="mt-3 text-body-sm text-smoke">Note: {item.outcome.note}</p>
        {item.outcome.recheck && (
          <p className="mt-3 flex flex-wrap items-center gap-1.5 text-caption text-carbon">
            Re-checked by Assessment AI <ScoreBadge score={item.outcome.recheck.result.score} />
          </p>
        )}
        <p className="mt-4 text-caption text-carbon">
          {item.answerId || item.watchers?.length ? 'Returned to the employee who asked. ' : ''}Feeds the recommendations on the Trends page.
        </p>
      </aside>
    )
  }

  return (
    <aside className="scroll-quiet self-start overflow-y-auto rounded-3xl border border-frost bg-porcelain p-6" style={{ maxHeight: '100%' }}>
      <Eyebrow>Your decision</Eyebrow>
      <fieldset className="mt-3 space-y-2">
        <legend className="sr-only">Decision</legend>
        {DECISIONS.map((d) => (
          <label key={d.id} className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3 transition-colors ${decision === d.id ? 'border-carbon bg-bone' : 'border-frost hover:border-ash'}`}>
            <input type="radio" name="decision" value={d.id} checked={decision === d.id} onChange={() => setDecision(d.id)} className="mt-1 accent-carbon" />
            <span>
              <span className="flex items-center gap-1.5 text-body-sm font-medium text-ink">
                <d.Icon size={14} aria-hidden="true" /> {d.label}
              </span>
              <span className="text-caption text-smoke">{d.desc}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {decision === 'corrected' && (
        <div className="rise-in mt-4">
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="corrected" className="eyebrow text-smoke">
              Corrected answer
            </label>
            {draft && (
              <button type="button" onClick={() => setText(draft.answer.text)} className="text-caption font-medium text-carbon underline underline-offset-4 hover:text-ink">
                Use draft from evidence
              </button>
            )}
          </div>
          <textarea id="corrected" rows={7} value={text} onChange={(e) => setText(e.target.value)} className="w-full resize-none rounded-2xl border border-frost px-3 py-2 text-body-sm text-ink focus:border-ash focus:outline-none" />
          {draft && text === draft.answer.text ? (
            <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-caption text-carbon">
              Assessment AI re-check: <ScoreBadge score={assess(draft.id).score} />
            </p>
          ) : (
            <p className="mt-1.5 text-caption text-smoke">Your own wording is sent as reviewer-verified; it is not re-scored in this prototype.</p>
          )}
        </div>
      )}

      <div className="mt-4">
        <label htmlFor="note" className="eyebrow text-smoke">
          Why · required
        </label>
        <textarea
          id="note"
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={hint.placeholder}
          className="mt-1.5 w-full resize-none rounded-2xl border border-frost px-3 py-2 text-body-sm text-ink placeholder:text-ash focus:border-ash focus:outline-none"
        />
        <p className="mt-1 text-caption text-carbon">The note goes back to the employee and feeds the improvement recommendations.</p>
      </div>

      {needsAck && (
        <label className="rise-in mt-4 flex items-start gap-2 rounded-2xl border border-frost bg-bone p-3 text-body-sm text-carbon">
          <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-1 accent-carbon" />
          <span>
            I have checked the {flagCount} flagged claim{flagCount === 1 ? '' : 's'} and I’m overriding Assessment AI. This override is recorded.
          </span>
        </label>
      )}

      <PrimaryButton
        className="mt-5 w-full"
        disabled={!valid}
        onClick={() => dispatch({ type: 'decide', queueId: item.id, decision, note: note.trim(), correctedText: decision === 'corrected' ? text.trim() : null })}
      >
        <Inbox size={16} /> Submit decision
      </PrimaryButton>
      {!valid && decision && <p className="mt-2 text-caption text-smoke">{note.trim().length < 5 ? 'Add a note explaining the decision.' : needsAck && !ack ? 'Confirm you are overriding the flags.' : 'Edit the answer before sending a correction.'}</p>}
    </aside>
  )
}

