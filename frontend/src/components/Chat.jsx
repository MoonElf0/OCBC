import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowUp, ShieldCheck, ShieldAlert, ShieldX, ShieldQuestion, Inbox, CircleHelp, Sparkles, ChevronRight } from 'lucide-react'
import { useStore } from '../state/store'
import { SCENARIOS, TOPICS } from '../fixtures'
import { TONES, CHECKS, VERDICT, OUTCOME_META, bandFor, topicIcon } from '../lib/status'
import { scenarioById } from '../lib/pipeline'
import { visibleClaims, checksDone } from '../lib/view'
import AnswerText from './AnswerText'
import { MiniRing } from './charts'

export default function Chat() {
  const { state } = useStore()
  const scroller = useRef(null)
  const stick = useRef(true)
  // Answers pasted in on the Verify answer page live there, not in the chat.
  const messages = state.messages.filter((m) => m.source !== 'submitted')
  const last = messages[messages.length - 1]
  const empty = messages.length === 0

  // Follow new content only while the reader is already at the bottom.
  const onScroll = () => {
    const el = scroller.current
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }
  useLayoutEffect(() => {
    const el = scroller.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [messages.length, last?.shown, last?.phase, last?.outcome])
  useEffect(() => {
    stick.current = true
  }, [messages.length])

  return (
    <section aria-label="Policy Assistant chat" className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      <div ref={scroller} onScroll={onScroll} className="scroll-quiet min-h-0 flex-1 overflow-y-auto">
        <div className={`mx-auto w-full max-w-[780px] px-4 sm:px-6 ${empty ? 'flex min-h-full flex-col py-8' : 'space-y-7 pt-3 pb-6'}`}>
          {empty ? <Welcome /> : messages.map((m) => (m.kind === 'user' ? <UserBubble key={m.id} text={m.text} /> : <AnswerBubble key={m.id} m={m} />))}
        </div>
      </div>
      <Composer compact={!empty} />
    </section>
  )
}

function AgentAvatar() {
  return (
    <span className="glass hidden size-10 shrink-0 place-items-center rounded-2xl text-carbon sm:grid" aria-hidden="true">
      <Sparkles size={17} strokeWidth={2} />
    </span>
  )
}

function Welcome() {
  const { askQuestion, state } = useStore()
  return (
    <div className="rise-in my-auto">
      <div className="glass-soft mb-6 inline-flex items-center gap-2 rounded-full py-1.5 pr-3 pl-1.5 text-body-sm text-carbon">
        <span className="grid size-6 place-items-center rounded-full bg-ocbc-red text-white">
          <ShieldCheck size={14} strokeWidth={2.25} />
        </span>
        Press Verify to check any answer against approved policy
      </div>
      <h1 className="text-heading font-semibold text-ink sm:text-[44px] sm:tracking-[-1.4px]">What policy question do you have?</h1>
      <p className="mt-3 max-w-[52ch] text-body text-smoke">Ask the Policy Assistant. Press Verify on any answer to see how far you can trust it.</p>

      <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {SCENARIOS.map((s, i) => {
          const Icon = topicIcon(s.topic)
          return (
            <button
              key={s.id}
              onClick={() => askQuestion(s.question)}
              disabled={state.messages.some((m) => m.phase === 'thinking' || m.phase === 'streaming')}
              className={`glass group flex items-center gap-3.5 rounded-2xl p-3.5 text-left transition-transform hover:-translate-y-0.5 active:scale-[0.99] ${i === 0 ? 'sm:col-span-2' : ''}`}
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-surface to-ocbc-red-tint text-ocbc-red ring-1 ring-surface">
                <Icon size={20} strokeWidth={1.75} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-caption text-smoke">{TOPICS[s.topic].name}</span>
                <span className="block truncate text-body-sm font-medium text-ink">{s.prompt}</span>
              </span>
              <ChevronRight size={18} className="shrink-0 text-ash transition-transform group-hover:translate-x-0.5 group-hover:text-ink" />
            </button>
          )
        })}
      </div>
    </div>
  )
}

function UserBubble({ text }) {
  return (
    <div className="rise-in flex justify-end">
      <div className="user-bubble max-w-[560px] rounded-3xl rounded-br-lg px-5 py-3 text-body font-medium text-ink">{text}</div>
    </div>
  )
}

function AnswerBubble({ m }) {
  const { state, dispatch } = useStore()
  const open = state.paneId === m.id
  const claims = visibleClaims(m)
  const matched = m.phase !== 'thinking' && m.phase !== 'streaming' && scenarioById(m.scenarioId).question && scenarioById(m.scenarioId).question !== m.question
  const faded = m.outcome?.decision === 'corrected' || m.outcome?.decision === 'rejected'

  return (
    <article aria-label={`Answer to: ${m.question}`} className="rise-in flex gap-3">
      <AgentAvatar />
      <div className="min-w-0 flex-1">
        <div className={`glass rounded-3xl rounded-tl-lg px-5 pt-3.5 pb-4 transition-shadow ${open ? 'ring-2 ring-line/15' : ''}`}>
          <div className="mb-2 flex items-center gap-2 text-caption">
            <span className="font-semibold text-carbon">Policy Assistant</span>
            {TOPICS[scenarioById(m.scenarioId)?.topic] && (
              <>
                <span className="text-ash" aria-hidden="true">
                  ·
                </span>
                <span className="text-smoke">{TOPICS[scenarioById(m.scenarioId).topic].name}</span>
              </>
            )}
            {m.phase === 'streaming' && <span className="ml-auto text-smoke">Answering</span>}
          </div>
          {m.phase === 'thinking' ? (
            <div className="flex items-center gap-2 py-1 text-body-sm text-smoke">
              <span className="flex gap-1" aria-hidden="true">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="size-1.5 animate-bounce rounded-full bg-ash" style={{ animationDelay: `${i * 120}ms` }} />
                ))}
              </span>
              Searching the policy library
            </div>
          ) : (
            <div className={faded ? 'opacity-55' : ''}>
              {faded && <div className="mb-1.5 text-caption font-medium text-smoke">Original answer</div>}
              <AnswerText
                text={m.text}
                shown={m.shown}
                claims={claims}
                highlight={open || !!m.result}
                idPrefix="chat"
                activeClaimId={open ? state.focusClaimId : null}
                pulseId={open ? state.focusClaimId : null}
                onClaim={(c) => dispatch({ type: 'focusClaim', claimId: c.id })}
                streaming={m.phase === 'streaming'}
              />
            </div>
          )}
          {matched && (
            <p className="mt-3 flex items-start gap-1.5 text-caption text-smoke">
              <CircleHelp size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
              Matched to “{scenarioById(m.scenarioId).question}”
            </p>
          )}
        </div>

        {m.phase !== 'thinking' && m.phase !== 'streaming' && (
          <div className="rise-in mt-2.5 flex flex-wrap items-center gap-2">
            <VerifyButton m={m} open={open} />
          </div>
        )}
        {m.outcome && <Outcome outcome={m.outcome} />}
      </div>
    </article>
  )
}

/** One button per answer: verify, watch it run, then toggle the pane. */
export function VerifyButton({ m, open }) {
  const { dispatch, verifyAnswer } = useStore()
  const verified = m.phase === 'done' && m.result
  const running = m.phase === 'verifying'

  if (!verified && !running) {
    return (
      <>
        <button
          onClick={() => verifyAnswer(m)}
          className="glass inline-flex items-center gap-2 rounded-full py-1.5 pr-4 pl-2 text-body-sm font-medium text-ink transition-transform hover:-translate-y-px active:scale-[0.98]"
        >
          <span className="grid size-6 place-items-center rounded-full bg-inverse text-white">
            <ShieldCheck size={14} strokeWidth={2.25} />
          </span>
          Verify
        </button>
        <span className="inline-flex items-center gap-1.5 text-caption text-carbon">
          <ShieldQuestion size={14} aria-hidden="true" /> Not checked yet
        </span>
      </>
    )
  }

  if (running) {
    const done = checksDone(m)
    return (
      <button onClick={() => dispatch(open ? { type: 'closePane' } : { type: 'openPane', id: m.id })} aria-pressed={open} className="glass inline-flex items-center gap-2 rounded-full py-1.5 pr-4 pl-2 text-body-sm font-medium text-carbon" aria-live="polite">
        <MiniRing value={(done / CHECKS.length) * 100} tone="unknown" />
        Verifying {done}/{CHECKS.length}
      </button>
    )
  }

  const band = bandFor(m.result.score)
  const t = TONES[band.status]
  const v = VERDICT[band.id]
  const Icon = band.status === 'verified' ? ShieldCheck : band.status === 'unsupported' ? ShieldX : ShieldAlert
  return (
    <button
      onClick={() => dispatch(open ? { type: 'closePane' } : { type: 'openPane', id: m.id })}
      aria-pressed={open}
      aria-label={`${open ? 'Hide' : 'Show'} verification: ${m.result.score ?? 'not scored'} out of 100, ${v.tag}`}
      className={`inline-flex items-center gap-2 rounded-full py-1.5 pr-3.5 pl-1.5 text-body-sm font-medium transition-all active:scale-[0.98] ${open ? 'glass text-ink ring-1 ring-line/15' : 'glass text-ink hover:-translate-y-px'}`}
    >
      {m.result.score != null ? (
        <span className="relative grid place-items-center">
          <MiniRing value={m.result.score} tone={band.status} size={28} stroke={3} />
          <span className={`absolute text-[10px] font-semibold tabular-nums text-ink`}>{m.result.score}</span>
        </span>
      ) : (
        <span className="grid size-7 place-items-center">
          <CircleHelp size={16} />
        </span>
      )}
      <span className="text-caption font-medium text-carbon tabular-nums">
        {m.result.score != null ? `${m.result.score}/100 · ${band.label}` : band.label}
      </span>
      <span className={`inline-flex items-center gap-1 ${t.text}`}>
        <Icon size={15} strokeWidth={2.25} aria-hidden="true" />
        {v.tag}
      </span>
      {m.routed && !m.outcome && (
        <span className={`inline-flex items-center gap-1 text-caption text-carbon`}>
          <Inbox size={13} aria-hidden="true" /> With reviewer
        </span>
      )}
      <span className="ml-0.5 rounded-full bg-line/[0.05] px-2 py-0.5 text-caption text-carbon">{open ? 'Hide' : 'Details'}</span>
    </button>
  )
}

export function Outcome({ outcome }) {
  const o = OUTCOME_META[outcome.decision]
  const t = TONES[o.tone]
  return (
    <div className="glass rise-in mt-3 rounded-2xl p-4">
      <span className={`flex items-center gap-1.5 text-body-sm font-semibold ${t.text}`}>
        <o.Icon size={15} strokeWidth={2.25} aria-hidden="true" /> {o.label}
      </span>
      {outcome.correctedText &&
        (outcome.recheck ? (
          <div className="mt-2">
            <AnswerText text={outcome.correctedText} claims={outcome.recheck.result.claims} highlight={false} />
          </div>
        ) : (
          <p className="mt-2 text-body-sm text-ink">{outcome.correctedText}</p>
        ))}
      {outcome.note && <p className="mt-2 text-caption text-smoke">Reviewer: {outcome.note}</p>}
    </div>
  )
}

function Composer({ compact }) {
  const { state, askQuestion } = useStore()
  const [value, setValue] = useState('')
  const busy = state.messages.some((m) => m.kind === 'answer' && (m.phase === 'thinking' || m.phase === 'streaming'))
  const asked = new Set(state.messages.filter((m) => m.kind === 'user').map((m) => m.text))

  const submit = (text) => {
    const q = (text ?? value).trim()
    if (!q || busy) return
    setValue('')
    askQuestion(q)
  }

  return (
    <div className="shrink-0 px-4 pt-2 pb-4 sm:px-6">
      <div className="mx-auto w-full max-w-[780px]">
        {compact && (
          <div className="scroll-quiet mb-2.5 flex gap-2 overflow-x-auto pr-6 pb-1 [mask-image:linear-gradient(to_right,black_calc(100%-32px),transparent)]" role="group" aria-label="Suggested questions">
            {SCENARIOS.filter((s) => !asked.has(s.question)).map((s) => {
              const Icon = topicIcon(s.topic)
              return (
                <button key={s.id} onClick={() => submit(s.question)} disabled={busy} className="glass-soft inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-caption font-medium whitespace-nowrap text-carbon transition-colors hover:text-ink disabled:opacity-50">
                  <Icon size={14} aria-hidden="true" />
                  {s.prompt}
                </button>
              )
            })}
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
          className="glass flex items-end gap-3 rounded-[28px] py-2.5 pr-2.5 pl-5 focus-within:ring-2 focus-within:ring-ocbc-red/20"
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
            placeholder="Ask a policy question"
            className="max-h-32 min-h-7 flex-1 resize-none bg-transparent py-2 text-body text-ink placeholder:text-smoke focus:outline-none"
          />
          <button
            type="submit"
            disabled={!value.trim() || busy}
            aria-label="Send question"
            className="grid size-11 shrink-0 place-items-center rounded-full bg-inverse text-white shadow-md transition-all hover:bg-inverse-hover active:scale-95 disabled:bg-line/10 disabled:text-white disabled:shadow-none"
          >
            <ArrowUp size={20} strokeWidth={2.25} />
          </button>
        </form>
        <p className="mt-2 text-center text-caption text-smoke">Scripted prototype with synthetic policy data</p>
      </div>
    </div>
  )
}
