import { useEffect, useState } from 'react'
import { CircleCheck, Pencil, Ban, Clock, CircleSlash, Inbox, MessageSquare, ShieldCheck, LoaderCircle, UserRound, History } from 'lucide-react'
import { useStore, DEMO_REVIEWERS } from '../state/store'
import { REVIEW_HINTS, CORRECTIONS, TOPICS } from '../fixtures'
import { BACKEND, api } from '../lib/backend'
import { assess } from '../lib/assess'
import { scenarioById } from '../lib/pipeline'
import { CHECKS, REASONS, TONES } from '../lib/status'
import { freshnessOf } from '../lib/freshness'
import { flagged } from '../lib/view'
import AnswerText from '../components/AnswerText'
import { CheckRow } from '../components/ChecksSheet'
import { SearchRecord } from '../components/Evidence'
import { Eyebrow, ScoreBadge, Passage, PrimaryButton, GhostButton, ClaimPill } from '../components/ui'
import { OUTCOME_META, formatWhen } from '../components/Thread'
import { AuditTrail } from '../components/CharacterPanel'

/** What the reviewer sees: the backend sends the stored answer and its assessment; demo mode reads the fixture. */
function caseOf(q) {
  const sc = scenarioById(q.scenarioId)
  const topic = q.topic ?? sc.topic
  return {
    sc,
    question: q.question ?? sc.question,
    text: q.answerText ?? sc.answer.text,
    topicName: TOPICS[topic]?.name ?? 'Topic not identified',
    result: q.result ?? assess(sc.id),
    submitted: q.kind === 'submitted',
  }
}

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
    <div className="mx-auto grid h-full max-w-[1560px] grid-cols-[280px_1fr] gap-6 px-6 py-6">
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
            const k = caseOf(q)
            const isSel = selected?.id === q.id
            return (
              <li key={q.id}>
                <button onClick={() => setSelectedId(q.id)} aria-current={isSel ? 'true' : undefined} className={`w-full rounded-2xl border p-3 text-left transition-colors ${isSel ? 'border-carbon bg-porcelain shadow-md' : 'border-frost hover:border-ash'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-caption font-medium text-carbon">{q.id}</span>
                    <ScoreBadge score={k.result.score} />
                  </div>
                  <div className="mt-2 line-clamp-2 text-body-sm font-medium text-ink">{k.question}</div>
                  <div className="mt-1 text-caption text-smoke">
                    {k.submitted ? 'Submitted answer · ' : ''}
                    {k.topicName} · {q.askedAt === 'Just now' ? 'Just now' : formatWhen(q.askedAt)}
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
  const k = caseOf(item)
  const sc = k.sc
  const v = k.result // backend mode sends the stored assessment
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
              {item.id} · {k.topicName}
              {k.submitted ? ' · submitted answer' : ''}
            </Eyebrow>
          </div>
          <div className="mt-1 text-caption text-smoke">
            {item.routedBy === 'auto' ? 'Routed automatically by Assessment AI' : 'Escalated by the employee'} · {item.askedBy}
          </div>
          <h1 className="mt-2 text-subheading font-medium text-ink">{k.question}</h1>
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
          <AnswerText text={k.text} claims={v.claims} activeClaimId={focus} onClaim={jump} />
          <p className="mt-3 max-w-[65ch] text-body-sm text-smoke">{v.explanation}</p>
          {v.assessment?.partial && (
            <p className="mt-2 text-body-sm text-carbon">
              <span className="font-medium text-ink">Partial assessment:</span> {[...new Set(v.assessment.unavailable.map((u) => u.reason))].join(' ')} Model steps not run: {v.assessment.unavailable.map((u) => u.step).join(', ')}.
            </p>
          )}
          {item.assessment?.policyVersions?.length > 0 && (
            <p className="mt-2 text-caption text-smoke">Assessed against {item.assessment.policyVersions.map((p) => `${p.docId} ${p.version}`).join(', ')}{v.assessment?.asOf ? ` · policy date ${v.assessment.asOf}` : ''}</p>
          )}
        </div>

        <div>
          <Eyebrow className="mb-3">Claims and evidence</Eyebrow>
          <div className="space-y-3">
            {claims.map((c) => (
              <ClaimEvidence key={c.id} c={c} sc={sc} text={k.text} focused={focus === c.id} search={v.search} />
            ))}
          </div>
        </div>

        <div>
          <Eyebrow className="mb-1">Six checks</Eyebrow>
          {CHECKS.map((meta) => (
            <CheckRow key={meta.id} meta={meta} check={v.checks.find((c) => c.id === meta.id)} scenarioId={sc.id} search={v.search} />
          ))}
        </div>
      </section>

      <Decision item={item} sc={sc} k={k} />
    </div>
  )
}

function ClaimEvidence({ c, sc, text, focused, search }) {
  // The assessed version's own state when the backend sent it; the fixtures otherwise.
  const f = c.source?.version
    ? { stale: c.source.state !== 'current', state: c.source.state, supersededBy: { id: String(c.source.supersededBy ?? '').replace('@', ' ') } }
    : c.source && freshnessOf(c.source.docId)
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
      <p className="mt-2 text-body-sm font-medium text-ink">“{text.slice(c.start, c.end)}”</p>
      <p className="mt-1 text-body-sm text-carbon">{c.reason}</p>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {c.source ? (
          <Passage {...c.source} />
        ) : (
          <div>
            <div className="eyebrow mb-1.5 flex items-center gap-1.5 text-status-unknown">
              <CircleSlash size={12} aria-hidden="true" /> No source found
            </div>
            <SearchRecord scenarioId={sc.id} search={search} />
          </div>
        )}
        {c.counter && !(c.counter.docId === c.source?.docId && c.counter.section === c.source?.section && c.counter.version === c.source?.version) && <Passage {...c.counter} />}
      </div>
    </div>
  )
}

const DECISIONS = [
  { id: 'approved', label: 'Approve', desc: 'The answer is correct as written.', Icon: CircleCheck },
  { id: 'corrected', label: 'Correct', desc: 'Send the employee a corrected answer.', Icon: Pencil },
  { id: 'rejected', label: 'Reject', desc: 'Withdraw the answer. No safe correction exists.', Icon: Ban },
]

function Decision({ item, sc, k }) {
  const { state, decide } = useStore()
  const hint = REVIEW_HINTS[sc.id] ?? {}
  const draft = item.kind === 'submitted' ? null : CORRECTIONS[sc.id]
  const reviewers = state.health?.reviewers ?? DEMO_REVIEWERS
  const [reviewerId, setReviewerId] = useState(reviewers[0].id)
  const [decision, setDecision] = useState(null)
  const [text, setText] = useState(k.text)
  const [note, setNote] = useState('')
  const [ack, setAck] = useState(false)
  const [check, setCheck] = useState(null) // { text, result } once the correction has been checked
  const [checking, setChecking] = useState(false)
  const [sending, setSending] = useState(false)
  // Approving an answer with flagged or unchecked claims needs an explicit override.
  const result = k.result
  const flagCount = result.claims.filter((c) => c.status !== 'supported').length
  const partial = !!result.assessment?.partial
  const checked = check && check.text === text.trim() ? check.result : null
  const correctionFlags = checked ? checked.claims.filter((c) => ['conflicting', 'unsupported', 'insufficient'].includes(c.status)).length : 0
  const needsAck = (decision === 'approved' && (flagCount > 0 || partial)) || (decision === 'corrected' && correctionFlags > 0)
  const changed = text.trim() !== k.text.trim()
  const valid = decision && note.trim().length >= 5 && (decision !== 'corrected' || changed) && (!needsAck || ack) && !sending

  const runCheck = async () => {
    setChecking(true)
    try {
      const r = await api.preview({ question: k.question, answer: text.trim(), citations: [], asOf: result.assessment?.asOf })
      setCheck({ text: text.trim(), result: r })
    } catch {
      setCheck(null)
    }
    setChecking(false)
  }

  const submit = async () => {
    setSending(true)
    const r = await decide({ queueId: item.id, decision, note: note.trim(), correctedText: decision === 'corrected' ? text.trim() : null, reviewerId, overrideFlags: needsAck && ack })
    setSending(false)
    if (r && !r.ok && r.result) setCheck({ text: text.trim(), result: r.result })
  }

  if (item.status === 'resolved') return <Resolved item={item} />

  return (
    <aside className="scroll-quiet self-start overflow-y-auto rounded-3xl border border-frost bg-porcelain p-6" style={{ maxHeight: '100%' }}>
      <Eyebrow>Your decision</Eyebrow>
      <label htmlFor="reviewer" className="eyebrow mt-3 block text-smoke">
        Acting as · simulated identity
      </label>
      <div className="mt-1.5 flex items-center gap-2 rounded-2xl border border-frost px-3 py-2">
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

      <fieldset className="mt-4 space-y-2">
        <legend className="sr-only">Decision</legend>
        {DECISIONS.map((d) => (
          <label key={d.id} className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3 transition-colors ${decision === d.id ? 'border-carbon bg-bone' : 'border-frost hover:border-ash'}`}>
            <input type="radio" name="decision" value={d.id} checked={decision === d.id} onChange={() => (setDecision(d.id), setAck(false))} className="mt-1 accent-carbon" />
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
          {BACKEND ? (
            <div className="mt-1.5 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <GhostButton type="button" onClick={runCheck} disabled={!changed || checking} className="py-1.5">
                  {checking ? <LoaderCircle size={14} className="spin" aria-hidden="true" /> : <ShieldCheck size={14} aria-hidden="true" />} Check this wording
                </GhostButton>
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
            </p>
          ) : (
            <p className="mt-1.5 text-caption text-smoke">Demo mode can only re-check the drafted correction. Backend mode re-checks any wording.</p>
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
          placeholder={hint.placeholder ?? 'Explain the decision.'}
          className="mt-1.5 w-full resize-none rounded-2xl border border-frost px-3 py-2 text-body-sm text-ink placeholder:text-ash focus:border-ash focus:outline-none"
        />
        <p className="mt-1 text-caption text-carbon">The note goes back to the employee, is kept in the audit trail and feeds the improvement recommendations.</p>
      </div>

      {needsAck && (
        <label className="rise-in mt-4 flex items-start gap-2 rounded-2xl border border-frost bg-bone p-3 text-body-sm text-carbon">
          <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-1 accent-carbon" />
          <span>
            {decision === 'approved'
              ? `I have checked the ${flagCount} flagged or unchecked claim${flagCount === 1 ? '' : 's'}${partial ? ' and the parts Assessment AI could not run' : ''}, and I’m overriding Assessment AI.`
              : `My correction still has ${correctionFlags} flagged claim${correctionFlags === 1 ? '' : 's'} and I’m sending it anyway.`}{' '}
            This override is recorded.
          </span>
        </label>
      )}

      <PrimaryButton className="mt-5 w-full" disabled={!valid} onClick={submit}>
        {sending ? <LoaderCircle size={16} className="spin" /> : <Inbox size={16} />} Submit decision
      </PrimaryButton>
      {!valid && decision && !sending && <p className="mt-2 text-caption text-smoke">{note.trim().length < 5 ? 'Add a note explaining the decision.' : needsAck && !ack ? 'Confirm the override.' : 'Edit the answer before sending a correction.'}</p>}
    </aside>
  )
}

/** The recorded decision, with who made it, when, against which assessment, and the audit trail. */
function Resolved({ item }) {
  const o = OUTCOME_META[item.outcome.decision]
  const out = item.outcome
  const re = out.recheck
  const [h, setH] = useState(null)
  useEffect(() => {
    if (BACKEND && item.answerId) api.history(item.answerId).then(setH, () => {})
  }, [item.answerId])
  return (
    <aside className="scroll-quiet self-start overflow-y-auto rounded-3xl border border-frost bg-porcelain p-6" style={{ maxHeight: '100%' }}>
      <Eyebrow>Decision</Eyebrow>
      <div className={`eyebrow mt-3 flex items-center gap-1.5 ${TONES[o.tone].text}`}>
        <o.Icon size={14} aria-hidden="true" /> {o.label}
      </div>
      {out.reviewer && (
        <p className="mt-2 text-caption text-carbon">
          {out.reviewer} · {formatWhen(out.at)}
          {out.override ? ' · overrode Assessment AI’s flags' : ''}
        </p>
      )}
      {out.correctedText && <p className="mt-3 text-body-sm text-ink">{out.correctedText}</p>}
      <p className="mt-3 text-body-sm text-smoke">Note: {out.note}</p>
      {re && (
        <div className="mt-3 rounded-2xl bg-bone p-3">
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
      {out.policyVersions?.length > 0 && <p className="mt-3 text-caption text-smoke">Original assessment used {out.policyVersions.map((v) => `${v.docId} ${v.version}`).join(', ')}.</p>}
      <p className="mt-4 text-caption text-carbon">
        {item.answerId || item.watchers?.length ? 'Returned to the employee who asked. ' : ''}Feeds the recommendations on the Trends page.
      </p>
      {h?.events?.length > 0 && (
        <div className="mt-4">
          <div className="eyebrow flex items-center gap-1.5 text-smoke">
            <History size={12} aria-hidden="true" /> Audit trail
          </div>
          <AuditTrail events={h.events} />
        </div>
      )}
    </aside>
  )
}
