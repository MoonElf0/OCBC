import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowUp, PanelLeft, LoaderCircle, Ban, Pencil, CircleCheck, CircleHelp, Flag, ShieldCheck, ClipboardPaste, Bot } from 'lucide-react'
import { useStore } from '../state/store'
import { SCENARIOS, DEMO_TODAY } from '../fixtures'
import { TONES, CHECKS, topicIcon, ANSWER_STATES } from '../lib/status'
import { BACKEND } from '../lib/backend'
import { scenarioById } from '../lib/pipeline'
import { visibleClaims, checksDone, flagged } from '../lib/view'
import AnswerText from './AnswerText'
import { CharacterMark } from './Character'
import { ScoreBadge } from './ui'
import ChecksSheet from './ChecksSheet'
import Challenger from './Challenger'
import { TrustChips } from './TrustMap'

export default function Thread() {
  const { state } = useStore()
  const scroller = useRef(null)
  const stick = useRef(true)
  const last = state.messages[state.messages.length - 1]

  // Follow new content only while the reader is already at the bottom, so an
  // older answer being read is never scrolled away.
  const onScroll = () => {
    const el = scroller.current
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }
  useLayoutEffect(() => {
    const el = scroller.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [state.messages.length, last?.shown, last?.phase, last?.outcome])
  useEffect(() => {
    // A question the employee just sent always brings the view down.
    stick.current = true
  }, [state.messages.length])

  return (
    <section aria-labelledby="thread-title" className="relative flex min-h-0 flex-col overflow-hidden rounded-3xl border border-frost bg-porcelain">
      <header className="flex items-center justify-between gap-4 border-b border-frost px-6 py-4">
        <div className="flex items-center gap-3">
          <AgentAvatar />
          <div>
            <h2 id="thread-title" className="text-body-sm font-medium text-ink">
              Policy Assistant
            </h2>
            <div className="truncate text-caption text-smoke">Answering agent · audited separately by Assessment AI</div>
          </div>
        </div>
        <span className="eyebrow hidden shrink-0 whitespace-nowrap rounded-xl border border-frost px-2.5 py-1 text-smoke 2xl:inline">Synthetic policy library</span>
      </header>

      <div ref={scroller} onScroll={onScroll} className="scroll-quiet flex-1 space-y-6 overflow-y-auto px-6 py-6">
        <Welcome />
        {state.messages.map((m) => (m.kind === 'user' ? <UserBubble key={m.id} text={m.text} /> : <AnswerCard key={m.id} m={m} />))}
      </div>

      <Composer />
      <ChecksSheet />
    </section>
  )
}

function AgentAvatar() {
  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-full border border-frost bg-bone text-[12px] font-semibold text-carbon" aria-hidden="true">
      PA
    </span>
  )
}

/** A pasted answer was not written by the Policy Assistant, so it doesn't wear its avatar. */
function SubmittedAvatar() {
  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-full border border-frost bg-porcelain text-carbon" aria-hidden="true">
      <ClipboardPaste size={15} />
    </span>
  )
}

function Welcome() {
  return (
    <div className="flex gap-3">
      <AgentAvatar />
      <div className="max-w-[640px] rounded-3xl bg-bone px-5 py-4 text-body text-ink">
        Hi, I’m the Policy Assistant. Ask me about lending limits, KYC, FX, fees or collateral.
        <div className="mt-2 flex items-center gap-1.5 text-body-sm text-carbon">
          <CharacterMark size={18} /> Every answer is checked by Assessment AI.
        </div>
      </div>
    </div>
  )
}

function UserBubble({ text }) {
  return (
    <div className="rise-in flex justify-end">
      <div className="max-w-[640px] rounded-3xl border border-frost bg-porcelain px-5 py-3 text-body text-ink">{text}</div>
    </div>
  )
}

function AnswerCard({ m }) {
  const { state, dispatch } = useStore()
  const active = state.activeId === m.id
  const claims = visibleClaims(m)
  const activeClaimId = active && state.panel.mode === 'claim' ? state.panel.claimId : null
  const settled = m.phase !== 'thinking' && m.phase !== 'streaming'
  const matched = settled && scenarioById(m.scenarioId).question && scenarioById(m.scenarioId).question !== m.question

  const openClaim = (c) => dispatch({ type: 'select', id: m.id, claimId: c.id })

  return (
    <article
      aria-label={`Answer to: ${m.question}`}
      aria-current={active ? 'true' : undefined}
      className={`rise-in relative ml-12 max-w-[760px] rounded-3xl border bg-porcelain transition-shadow ${active ? 'border-carbon shadow-md' : 'border-frost'}`}
    >
      <div className="absolute -left-12 top-0">{m.source === 'submitted' ? <SubmittedAvatar /> : <AgentAvatar />}</div>

      <div className="px-6 pt-5 pb-5">
        {m.source === 'submitted' && (
          <div className="mb-2 flex flex-wrap items-center gap-1.5 text-caption font-medium text-carbon">
            <ClipboardPaste size={13} aria-hidden="true" /> Submitted for verification · not from the Policy Assistant
            {m.citations.length > 0 && <span className="text-smoke">· cites {m.citations.join(', ')}</span>}
            {m.asOf && <span className="text-smoke">· policy date {m.asOf}</span>}
          </div>
        )}
        {m.source === 'asked' && m.writtenBy && m.writtenBy !== 'scripted' && (
          <div className="mb-2 flex flex-wrap items-center gap-1.5 text-caption font-medium text-carbon">
            <Bot size={13} aria-hidden="true" /> Written by {m.writtenBy} from the synthetic policy library
            {m.citations.length > 0 && <span className="text-smoke">· cites {m.citations.join(', ')}</span>}
          </div>
        )}
        {m.outcome?.decision === 'corrected' && <div className="mb-2 text-caption font-semibold text-smoke">Original answer</div>}
        {m.phase === 'thinking' ? (
          <div className="flex items-center gap-2 text-body-sm text-smoke">
            <span className="flex gap-1" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <span key={i} className="size-1.5 animate-bounce rounded-full bg-ash" style={{ animationDelay: `${i * 120}ms` }} />
              ))}
            </span>
            Searching the policy library…
          </div>
        ) : (
          <div className={m.outcome?.decision === 'corrected' || m.outcome?.decision === 'rejected' ? 'opacity-60' : ''}>
            <AnswerText text={m.text} shown={m.shown} claims={claims} activeClaimId={activeClaimId} onClaim={openClaim} streaming={m.phase === 'streaming'} />
          </div>
        )}
        {matched && (
          <p className="mt-3 flex items-start gap-1.5 text-caption text-smoke">
            <CircleHelp size={14} className="mt-px shrink-0" aria-hidden="true" />
            Matched to “{scenarioById(m.scenarioId).question}”
          </p>
        )}
        {settled && <TrustChips m={m} claims={claims} />}
      </div>

      {settled && <AssessmentStrip m={m} active={active} claims={claims} />}
      {settled && !m.outcome && <div className="pt-3"><Challenger m={m} reviewRequired={m.state === 'review-required' || !!m.routed} /></div>}
      {m.outcome && <Outcome outcome={m.outcome} />}
    </article>
  )
}

function AssessmentStrip({ m, active, claims }) {
  const { state, dispatch } = useStore()
  const done = checksDone(m)
  const flags = flagged(claims)
  const superseded = m.outcome && m.outcome.decision !== 'approved'
  const inDetail = active && state.panel.mode === 'claim'

  return (
    <div className="rise-in flex flex-wrap items-center gap-x-4 gap-y-2 rounded-b-3xl border-t border-frost bg-bone/60 px-6 py-3.5">
      {m.phase === 'verifying' ? (
        <span className="inline-flex items-center gap-2 text-body-sm font-medium text-carbon" aria-live="polite">
          <LoaderCircle size={16} className="spin" aria-hidden="true" />
          Checking · {done} of {CHECKS.length}
        </span>
      ) : (
        <>
          <ScoreBadge score={m.result.score} className={`!px-3 !py-1.5 !text-body !font-semibold ${superseded ? 'opacity-60' : ''}`} />
          {flags.length > 0 ? (
            <span className="inline-flex items-center gap-1.5 text-body-sm font-semibold text-ink">
              <Flag size={16} className="text-carbon" aria-hidden="true" />
              {flags.length} {flags.length === 1 ? 'flag' : 'flags'}
            </span>
          ) : claims.length > 0 ? (
            <span className="inline-flex items-center gap-1.5 text-body-sm font-semibold text-ink">
              <CircleCheck size={16} className="text-status-verified" aria-hidden="true" /> No flags
            </span>
          ) : null}
          <StateChip state={m.state} />
        </>
      )}

      <span className="ml-auto">
        {m.phase === 'verifying' ? null : active && (inDetail || !flags.length) ? (
          <span className="inline-flex items-center gap-1.5 text-body-sm font-medium text-smoke">
            <PanelLeft size={16} aria-hidden="true" /> In panel
          </span>
        ) : (
          <button
            onClick={() => dispatch({ type: 'select', id: m.id, ...(flags.length ? { claimId: flags[0].id } : {}) })}
            className="inline-flex items-center gap-1.5 rounded-full border border-carbon bg-porcelain px-4 py-1.5 text-body-sm font-semibold text-ink transition-colors hover:bg-bone"
          >
            <PanelLeft size={16} aria-hidden="true" /> See details
          </button>
        )}
      </span>
    </div>
  )
}

/** The answer's state: icon, colour and label together, never colour alone. */
export function StateChip({ state }) {
  const st = ANSWER_STATES[state]
  if (!st || state === 'verifying') return null
  return (
    <span className={`inline-flex items-center gap-1.5 text-body-sm font-medium ${TONES[st.tone].text}`}>
      <st.Icon size={16} aria-hidden="true" /> <span className="text-carbon">{st.label}</span>
    </span>
  )
}

export function formatWhen(iso) {
  if (!iso) return ''
  if (!iso.includes('T')) return iso
  return new Date(iso).toLocaleString('en-SG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export const OUTCOME_META = {
  approved: { label: 'Approved by reviewer', tone: 'verified', Icon: CircleCheck },
  corrected: { label: 'Corrected by reviewer', tone: 'verified', Icon: Pencil },
  rejected: { label: 'Rejected by reviewer · do not use', tone: 'unsupported', Icon: Ban },
}

function Outcome({ outcome }) {
  const o = OUTCOME_META[outcome.decision]
  const t = TONES[o.tone]
  const re = outcome.recheck
  return (
    <div className={`rise-in m-3 mt-0 rounded-2xl border border-frost ${t.surface} p-4`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`eyebrow flex items-center gap-1.5 ${t.text}`}>
          <o.Icon size={13} strokeWidth={2.25} aria-hidden="true" /> {o.label}
        </span>
        {re && (
          <span className="inline-flex items-center gap-1.5 text-caption text-carbon">
            <CharacterMark size={16} /> Re-checked <ScoreBadge score={re.result.score} />
          </span>
        )}
      </div>
      {outcome.correctedText &&
        (re ? (
          <div className="mt-2">
            <AnswerText text={outcome.correctedText} claims={re.result.claims} />
          </div>
        ) : (
          <p className="mt-2 text-body-sm text-ink">{outcome.correctedText}</p>
        ))}
      <p className="mt-2 text-caption text-carbon">
        <span className="font-medium">Reviewer note:</span> {outcome.note}
      </p>
      {outcome.reviewer && (
        <p className="mt-1 text-caption text-smoke">
          {outcome.reviewer} · {formatWhen(outcome.at)}
          {outcome.override ? ' · approved over Assessment AI’s flags' : ''}
        </p>
      )}
      {outcome.correctedText && !re && <p className="mt-1 text-caption text-smoke">Not re-checked. Demo mode can only re-check the drafted correction; backend mode re-checks any wording.</p>}
    </div>
  )
}

function Composer() {
  const [mode, setMode] = useState('ask')
  return (
    <div className="border-t border-frost px-6 pt-3 pb-4">
      <div className="mb-3 flex gap-1 rounded-full bg-bone p-1" role="tablist" aria-label="What do you want to do?">
        {[
          { id: 'ask', label: 'Ask the Policy Assistant' },
          { id: 'verify', label: 'Verify an answer' },
        ].map((t) => (
          <button key={t.id} role="tab" aria-selected={mode === t.id} onClick={() => setMode(t.id)} className={`flex-1 rounded-full px-3 py-1.5 text-body-sm font-medium transition-colors ${mode === t.id ? 'bg-porcelain text-ink shadow-md' : 'text-smoke hover:text-ink'}`}>
            {t.label}
          </button>
        ))}
      </div>
      {mode === 'ask' ? <AskComposer /> : <VerifyComposer />}
    </div>
  )
}

const EXAMPLE = {
  question: 'Can I override the FX rate for a corporate client without approval?',
  answer: 'Yes. Relationship managers can apply an FX rate override of up to 50 basis points without further approval, as long as the client has an active treasury mandate. Every override must be recorded in the deal ticket with a reason code.',
  citations: 'DOC-FX-019 §2.1',
}

/** Paste in a question, an AI-generated answer and its citations; Assessment AI checks it on its own. */
function VerifyComposer() {
  const { state, verifyAnswer } = useStore()
  const [q, setQ] = useState('')
  const [a, setA] = useState('')
  const [cites, setCites] = useState('')
  const [asOf, setAsOf] = useState('')
  const [sending, setSending] = useState(false)
  const busy = sending || state.messages.some((m) => m.kind === 'answer' && m.phase !== 'done')
  const today = state.health?.today ?? DEMO_TODAY
  const ready = BACKEND && q.trim() && a.trim() && !busy

  const submit = async (e) => {
    e.preventDefault()
    if (!ready) return
    setSending(true)
    const citations = cites.split(/[,;\n]+/).map((c) => c.trim()).filter(Boolean)
    const ok = await verifyAnswer({ question: q.trim(), answer: a.trim(), citations, asOf: asOf || null })
    setSending(false)
    if (ok) {
      setQ('')
      setA('')
      setCites('')
    }
  }
  const field = 'w-full rounded-2xl border border-frost bg-porcelain px-3 py-2 text-body-sm text-ink placeholder:text-smoke focus:border-ash focus:outline-none disabled:bg-bone'

  return (
    <form onSubmit={submit} className="space-y-2" aria-describedby="verify-help">
      {!BACKEND && (
        <p className="rounded-2xl bg-bone p-3 text-body-sm text-carbon">
          Checking an answer you paste in runs the backend’s verification pipeline, which this offline demo does not have. Start backend mode with <code className="rounded-xl bg-porcelain px-1.5 py-0.5 text-caption">npm run dev:backend</code>.
        </p>
      )}
      <div className="grid gap-2 md:grid-cols-[1fr_170px]">
        <div>
          <label htmlFor="v-q" className="eyebrow text-smoke">Original question</label>
          <input id="v-q" value={q} onChange={(e) => setQ(e.target.value)} disabled={!BACKEND} placeholder="What the employee asked" className={`mt-1 ${field}`} />
        </div>
        <div>
          <label htmlFor="v-date" className="eyebrow text-smoke">Policy date</label>
          <input id="v-date" type="date" value={asOf || today} max="2100-12-31" onChange={(e) => setAsOf(e.target.value)} disabled={!BACKEND} className={`mt-1 ${field}`} />
        </div>
      </div>
      <div>
        <label htmlFor="v-a" className="eyebrow text-smoke">AI-generated answer</label>
        <textarea id="v-a" rows={3} value={a} onChange={(e) => setA(e.target.value)} disabled={!BACKEND} placeholder="Paste the answer to check" className={`mt-1 resize-none ${field}`} />
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[220px] flex-1">
          <label htmlFor="v-c" className="eyebrow text-smoke">Citations given with it <span className="normal-case tracking-normal">(optional)</span></label>
          <input id="v-c" value={cites} onChange={(e) => setCites(e.target.value)} disabled={!BACKEND} placeholder="e.g. DOC-FX-019 §2.1, DOC-SME-104" className={`mt-1 ${field}`} />
        </div>
        <button type="submit" disabled={!ready} className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full bg-carbon px-5 text-body-sm font-medium text-white transition-colors hover:bg-ink disabled:bg-frost disabled:text-smoke">
          {sending ? <LoaderCircle size={16} className="spin" aria-hidden="true" /> : <ShieldCheck size={16} aria-hidden="true" />} Verify answer
        </button>
      </div>
      <p id="verify-help" className="flex flex-wrap items-center gap-x-3 text-caption text-smoke">
        <span>Assessment AI extracts the claims, finds its own evidence in the approved library for that date, and checks the citations. The library text is treated as evidence, never as instructions.</span>
        {BACKEND && (
          <button type="button" onClick={() => (setQ(EXAMPLE.question), setA(EXAMPLE.answer), setCites(EXAMPLE.citations))} className="font-medium text-carbon underline underline-offset-4 hover:text-ink">
            Fill in an example
          </button>
        )}
      </p>
    </form>
  )
}

function AskComposer() {
  const { state, askQuestion } = useStore()
  const [value, setValue] = useState('')
  const typing = useRef(null)
  const busy = state.messages.some((m) => m.kind === 'answer' && m.phase !== 'done')
  const asked = new Set(state.messages.filter((m) => m.kind === 'user').map((m) => m.text))

  useEffect(() => () => clearInterval(typing.current), [])

  const submit = (text) => {
    const q = (text ?? value).trim()
    if (!q || busy) return
    setValue('')
    askQuestion(q)
  }

  // Suggested prompts type themselves into the box, so takes look natural.
  const pick = (question) => {
    if (busy || typing.current) return
    let i = 0
    typing.current = setInterval(() => {
      i += 4
      setValue(question.slice(0, i))
      if (i >= question.length) {
        clearInterval(typing.current)
        typing.current = null
        setTimeout(() => submit(question), 120)
      }
    }, 12)
  }

  return (
    <div>
      <div className={`scroll-quiet mb-3 flex gap-2 p-0.5 ${asked.size ? "flex-nowrap overflow-x-auto" : "flex-wrap"}`} role="group" aria-label="Suggested questions">
        {SCENARIOS.map((s) => (
          <button
            key={s.id}
            onClick={() => pick(s.question)}
            disabled={busy}
            title={s.question}
            className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-2 text-body-sm font-medium transition-colors disabled:opacity-50 ${asked.has(s.question) ? 'border-frost text-smoke' : 'border-frost text-carbon hover:border-carbon hover:text-ink'}`}
          >
            <TopicGlyph topic={s.topic} />
            {s.prompt}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        className="flex items-end gap-3 rounded-3xl border border-frost bg-porcelain px-4 py-3 focus-within:border-ash"
      >
        <label htmlFor="ask" className="sr-only">
          Ask a policy question
        </label>
        <textarea
          id="ask"
          rows={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          placeholder="Ask a policy question…"
          className="max-h-32 min-h-7 flex-1 resize-none bg-transparent py-1 text-body text-ink placeholder:text-smoke focus:outline-none"
        />
        <button
          type="submit"
          disabled={!value.trim() || busy}
          aria-label="Send question"
          className="grid size-10 shrink-0 place-items-center rounded-full bg-carbon text-white transition-colors hover:bg-ink disabled:bg-frost disabled:text-smoke"
        >
          <ArrowUp size={18} />
        </button>
      </form>
      <p className="mt-2 text-caption text-smoke">
        {state.health?.agent?.available
          ? `Backend mode · suggested questions are scripted; other questions are answered by ${state.health.agent.model} from synthetic policies.`
          : 'Scripted prototype · answers come from a fixed set of synthetic policy questions.'}
      </p>
    </div>
  )
}

function TopicGlyph({ topic }) {
  const Icon = topicIcon(topic)
  return <Icon size={16} className="shrink-0" aria-hidden="true" />
}
