import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowUp, PanelLeft, LoaderCircle, Ban, Pencil, CircleCheck, Inbox, ThumbsUp, ThumbsDown, CircleHelp } from 'lucide-react'
import { useStore } from '../state/store'
import { SCENARIOS, DOCUMENTS } from '../fixtures'
import { CLAIM_STATUS, CLAIM_COUNT_LABEL, TONES, CHECKS } from '../lib/status'
import { scenarioById } from '../lib/pipeline'
import { visibleClaims, checksDone, runningCheck, flagged, claimCounts } from '../lib/view'
import AnswerText from './AnswerText'
import { CharacterMark } from './Character'
import { ScoreBadge, Eyebrow } from './ui'
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
            <div className="text-caption text-smoke">Answering agent · a separate system, audited by Assessment AI</div>
          </div>
        </div>
        <span className="eyebrow hidden rounded-xl border border-frost px-2.5 py-1 text-smoke xl:inline">Synthetic policy library</span>
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

function Welcome() {
  return (
    <div className="flex gap-3">
      <AgentAvatar />
      <div className="max-w-[560px] rounded-2xl bg-bone px-4 py-3 text-body-sm text-ink">
        Hi, I’m the Policy Assistant. Ask me about internal banking policy — lending limits, KYC, FX, fees or collateral.
        <div className="mt-2 flex items-center gap-1.5 text-caption text-carbon">
          <CharacterMark size={16} /> Every answer I give is checked independently by Assessment AI.
        </div>
      </div>
    </div>
  )
}

function UserBubble({ text }) {
  return (
    <div className="rise-in flex justify-end">
      <div className="max-w-[520px] rounded-2xl border border-frost bg-porcelain px-4 py-3 text-body-sm text-ink">{text}</div>
    </div>
  )
}

function AnswerCard({ m }) {
  const { state, dispatch } = useStore()
  const active = state.activeId === m.id
  const claims = visibleClaims(m)
  const flags = flagged(claims)
  const activeClaimId = active && state.panel.mode === 'claim' ? state.panel.claimId : null
  const offered = state.offerId === m.id
  const settled = m.phase !== 'thinking' && m.phase !== 'streaming'
  const matched = settled && scenarioById(m.scenarioId).question && scenarioById(m.scenarioId).question !== m.question

  const openClaim = (c) => dispatch({ type: 'select', id: m.id, claimId: c.id })

  return (
    <article
      aria-label={`Answer to: ${m.question}`}
      aria-current={active ? 'true' : undefined}
      className={`rise-in relative ml-11 max-w-[640px] rounded-2xl border bg-porcelain transition-shadow ${active ? 'border-carbon shadow-md' : 'border-frost'}`}
    >
      <div className="absolute -left-11 top-0">
        <AgentAvatar />
      </div>

      <div className="px-5 pt-4 pb-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <Eyebrow>Policy Assistant{m.outcome?.decision === 'corrected' ? ' · original answer' : ''}</Eyebrow>
          {flags.length > 0 && (
            <button onClick={() => openClaim(flags[0])} className="eyebrow rounded-xl px-1 text-smoke underline-offset-4 hover:text-ink hover:underline">
              See details
            </button>
          )}
        </div>

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

        {settled && (
          <div className="rise-in mt-3 flex flex-wrap items-center gap-1.5 text-caption text-smoke">
            {m.citations.length ? (
              <>
                <span>Cited by the agent:</span>
                {m.citations.map((id) => (
                  <span key={id} className="rounded-xl border border-frost px-2 py-0.5 text-carbon">
                    {DOCUMENTS[id].title}
                  </span>
                ))}
              </>
            ) : (
              <span>The agent cited no documents.</span>
            )}
          </div>
        )}
        {matched && (
          <p className="mt-2 flex items-start gap-1.5 text-caption text-smoke">
            <CircleHelp size={13} className="mt-px shrink-0" aria-hidden="true" />
            Prototype: your question was matched to the scripted question “{scenarioById(m.scenarioId).question}”
          </p>
        )}
        {settled && <TrustChips m={m} claims={claims} />}
      </div>

      {settled && <AssessmentStrip m={m} active={active} claims={claims} offered={offered} />}
      {settled && !m.outcome && <div className="pt-3"><Challenger m={m} /></div>}
      {m.outcome && <Outcome outcome={m.outcome} />}
    </article>
  )
}

function AssessmentStrip({ m, active, claims, offered }) {
  const { dispatch } = useStore()
  const running = runningCheck(m)
  const done = checksDone(m)
  const counts = claimCounts(claims)
  const superseded = m.outcome && m.outcome.decision !== 'approved'

  return (
    <div className="rise-in flex flex-wrap items-center gap-x-3 gap-y-2 rounded-b-2xl border-t border-frost bg-bone/60 px-5 py-3">
      <span className="inline-flex items-center gap-1.5 text-caption font-medium text-carbon">
        <CharacterMark size={18} /> Assessment AI
      </span>

      {m.phase === 'verifying' ? (
        <span className="inline-flex items-center gap-1.5 text-caption text-carbon" aria-live="polite">
          <LoaderCircle size={13} className="spin" aria-hidden="true" />
          {running ? `Checking ${running.name.toLowerCase()}` : 'Preparing checks'} · {done} of {CHECKS.length}
        </span>
      ) : (
        <>
          <ScoreBadge score={m.result.score} className={superseded ? 'opacity-60' : ''} />
          {superseded && <span className="text-caption font-medium text-carbon">Superseded by reviewer</span>}
          <span className="flex flex-wrap items-center gap-2 text-caption">
            {Object.entries(CLAIM_STATUS)
              .filter(([k]) => counts[k])
              .map(([k, s]) => (
                <span key={k} className={`inline-flex items-center gap-1 ${TONES[s.tone].text}`}>
                  <s.Icon size={12} strokeWidth={2.25} aria-hidden="true" />
                  <span className="text-carbon">
                    {counts[k]} {CLAIM_COUNT_LABEL[k]}
                  </span>
                </span>
              ))}
          </span>
          {m.routed && !m.outcome && (
            <span className="inline-flex items-center gap-1 text-caption text-carbon">
              <Inbox size={12} aria-hidden="true" />
              {m.routed.joined ? 'Joined open review' : m.routed.by === 'auto' ? 'Routed to a reviewer automatically' : 'Sent for review'} · {m.routed.queueId}
            </span>
          )}
          {m.feedback && (
            <span className="inline-flex items-center gap-1 text-caption text-carbon">
              {m.feedback === 'helpful' ? <ThumbsUp size={12} aria-hidden="true" /> : <ThumbsDown size={12} aria-hidden="true" />}
              Marked {m.feedback}
            </span>
          )}
        </>
      )}

      <span className="ml-auto">
        {active ? (
          <span className="eyebrow inline-flex items-center gap-1.5 text-carbon">
            <PanelLeft size={13} aria-hidden="true" /> Shown in panel
          </span>
        ) : (
          <button
            onClick={() => dispatch({ type: 'select', id: m.id })}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-caption font-medium transition-colors ${offered ? 'border-carbon text-ink' : 'border-frost text-carbon hover:border-ash'}`}
          >
            <PanelLeft size={13} aria-hidden="true" /> {offered ? 'New · show in panel' : 'Show in panel'}
          </button>
        )}
      </span>
    </div>
  )
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
      {outcome.correctedText && !re && <p className="mt-1 text-caption text-smoke">Reviewer’s own wording · not re-scored in this prototype.</p>}
    </div>
  )
}

function Composer() {
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
    <div className="border-t border-frost px-6 pt-3 pb-4">
      <div className="mb-3 flex flex-wrap gap-2 p-0.5" role="group" aria-label="Suggested questions">
        {SCENARIOS.map((s) => (
          <button
            key={s.id}
            onClick={() => pick(s.question)}
            disabled={busy}
            title={s.question}
            className={`rounded-full border px-3 py-1.5 text-caption font-medium transition-colors disabled:opacity-50 ${asked.has(s.question) ? 'border-frost text-smoke' : 'border-frost text-carbon hover:border-ash hover:text-ink'}`}
          >
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
          rows={2}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          placeholder="Ask a policy question…"
          className="max-h-32 min-h-12 flex-1 resize-none bg-transparent text-body-sm text-ink placeholder:text-smoke focus:outline-none"
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
      <p className="mt-2 text-caption text-smoke">Scripted prototype · answers come from a fixed set of synthetic policy questions.</p>
    </div>
  )
}

