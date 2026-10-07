import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ChevronLeft, ChevronRight, ThumbsUp, ThumbsDown, Inbox, Clock, CircleSlash, Sparkles } from 'lucide-react'
import { useStore, useActiveAnswer } from '../state/store'
import { DOCUMENTS } from '../fixtures'
import { CHECKS, CHECK_STATUS, CLAIM_STATUS, TONES, BAND_ICON, bandFor, METHOD_LABEL } from '../lib/status'
import { freshnessOf, formatDate } from '../lib/freshness'
import { scenarioById } from '../lib/pipeline'
import { visibleClaims, moodFor, flagged, runningCheck } from '../lib/view'
import Character from './Character'
import { PrimaryButton, GhostButton, Eyebrow, SourceChip, Passage, Pill, ScoreBadge } from './ui'
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
      {claimMode && (
        <div className="flex shrink-0 items-center justify-between border-b border-frost bg-porcelain px-5 py-3">
          <button onClick={() => dispatch({ type: 'overall' })} className="inline-flex items-center gap-1.5 rounded-full text-body-sm font-medium text-carbon hover:text-ink">
            <ArrowLeft size={16} /> Overall answer
          </button>
          <ClaimCounter m={m} claimId={state.panel.claimId} />
        </div>
      )}
      <div ref={scroller} className="scroll-quiet min-h-0 flex-1 overflow-y-auto">
        {!m ? <EmptyState /> : claimMode ? <ClaimDetail m={m} claimId={state.panel.claimId} /> : <Overall m={m} answers={answers} />}
      </div>
      {m && <Actions m={m} />}
    </aside>
  )
}

function claimList(m) {
  const claims = visibleClaims(m)
  return [...flagged(claims), ...claims.filter((c) => c.status === 'supported')]
}

function ClaimCounter({ m, claimId }) {
  const list = claimList(m)
  return (
    <span className="text-caption text-smoke">
      Claim {list.findIndex((c) => c.id === claimId) + 1} of {list.length}
    </span>
  )
}

function OfferBanner() {
  const { state, dispatch } = useStore()
  return (
    <div className="rise-in flex shrink-0 items-center justify-between gap-3 border-b border-frost bg-porcelain px-5 py-3">
      <span className="text-body-sm text-carbon">A newer answer is ready.</span>
      <GhostButton onClick={() => dispatch({ type: 'select', id: state.offerId })} className="py-1.5">
        View it <ChevronRight size={14} />
      </GhostButton>
    </div>
  )
}

/** Character stage: fills the top of the panel edge to edge. */
function Stage({ mood, m, compact, onPrev, onNext, prevLabel, nextLabel, line, settled }) {
  const { dispatch } = useStore()
  const sc = m ? scenarioById(m.scenarioId) : null
  const ghost = sc ? sc.verification.claims.map((c) => c.source?.passage).filter(Boolean) : []
  const thinking = mood === 'thinking'
  return (
    <div
      className={`relative shrink-0 overflow-hidden transition-[height] duration-500 ${compact || settled ? 'h-44' : 'h-[clamp(200px,28vh,256px)]'}`}
      style={{ background: m ? 'radial-gradient(80% 90% at 60% 40%, #ffffff 0%, #f5f5f7 70%)' : 'var(--gradient-slate-wash)' }}
    >
      {/* Faint source passages drift behind the character while checks run. */}
      <div
        className={`pointer-events-none absolute inset-x-8 top-0 bottom-0 transition-opacity duration-500 ${thinking ? 'opacity-100' : 'opacity-0'}`}
        style={{ maskImage: 'linear-gradient(transparent, #000 25%, #000 60%, transparent)' }}
        aria-hidden="true"
      >
        <div className="drift space-y-2 pt-4 text-[9px] leading-snug text-ash/50">
          {[...ghost, ...ghost, ...ghost].map((p, i) => (
            <p key={i} className={i % 2 ? 'pl-24' : 'pr-24'}>
              {p}
            </p>
          ))}
        </div>
      </div>
      <button
        onClick={() => m && dispatch({ type: 'checks', open: true })}
        disabled={!m}
        className={`group absolute inset-0 flex items-end pb-2 disabled:cursor-default ${line ? 'justify-end pr-10' : 'justify-center'}`}
        aria-label={m ? 'Open all six checks' : 'Assessment AI character'}
      >
        <Character mood={mood} className={`${compact ? 'h-36' : 'h-[92%]'} w-auto transition-[height] duration-500 drop-shadow-[0_18px_18px_rgba(0,0,0,0.12)] transition-transform group-hover:scale-[1.02]`} />
      </button>
      {line && (
        <div key={line} className="rise-in pointer-events-none absolute left-5 top-5 max-w-[44%] rounded-2xl border border-frost bg-porcelain px-3 py-2 text-caption text-carbon shadow-md" aria-live="polite">
          {line}
        </div>
      )}
      {onPrev && (
        <button onClick={onPrev} disabled={!prevLabel} aria-label={prevLabel ?? 'No previous'} className="absolute left-4 bottom-4 grid size-9 place-items-center rounded-full border border-frost bg-porcelain text-carbon shadow-md transition-opacity hover:text-ink disabled:opacity-0">
          <ChevronLeft size={16} />
        </button>
      )}
      {onNext && (
        <button onClick={onNext} disabled={!nextLabel} aria-label={nextLabel ?? 'No next'} className="absolute right-4 bottom-4 grid size-9 place-items-center rounded-full border border-frost bg-porcelain text-carbon shadow-md transition-opacity hover:text-ink disabled:opacity-0">
          <ChevronRight size={16} />
        </button>
      )}
    </div>
  )
}

const LEGEND = ['supported', 'unsupported', 'conflicting', 'stale', 'off-intent']

function EmptyState() {
  return (
    <div>
      <Stage mood="idle" />
      <div className="space-y-6 p-6">
        <div>
          <Eyebrow>Assessment AI</Eyebrow>
          <h3 className="mt-2 text-heading-sm font-medium text-ink">Nothing to assess yet</h3>
          <p className="mt-2 max-w-[44ch] text-body-sm text-carbon">
            Ask the Policy Assistant a question. I’ll check its answer against the approved policy library, score it, flag any claim no source supports, and show you the evidence.
          </p>
        </div>
        <div>
          <Eyebrow className="mb-2">What the flags mean</Eyebrow>
          <ul className="space-y-2">
            {LEGEND.map((k) => {
              const s = CLAIM_STATUS[k]
              return (
                <li key={k} className="flex items-center gap-2 text-body-sm text-carbon">
                  <span className={`claim ${k === 'supported' ? 'claim-subtle' : TONES[s.tone].surface} ${TONES[s.tone].border} ${TONES[s.tone].text} pointer-events-none`}>
                    <s.Icon size={12} strokeWidth={2.5} aria-hidden="true" className="mr-1 inline-block -translate-y-px align-middle" />
                    <span className="text-ink">{s.label}</span>
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
        <div>
          <Eyebrow className="mb-2">Six checks on every answer</Eyebrow>
          <p className="text-body-sm text-carbon">{CHECKS.map((c) => c.name).join(' · ')}</p>
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

const MOOD_LINE = {
  watching: 'Reading the answer as it arrives…',
  thinking: 'Checking it against approved sources…',
  verified: 'This one holds up.',
  caution: 'Mostly sound — check the flags before you act.',
  unsupported: 'I would not act on this answer.',
  unknown: 'Nothing here I can verify.',
}

function moodLine(m, mood) {
  const claims = m.result?.claims ?? []
  if (mood === 'caution' && claims.some((c) => c.status === 'unsupported' || c.status === 'conflicting')) return 'One claim isn’t supported. Don’t act on it unchecked.'
  return MOOD_LINE[mood]
}

function Overall({ m, answers }) {
  const { dispatch } = useStore()
  const idx = answers.findIndex((a) => a.id === m.id)
  const prev = answers[idx - 1]
  const next = answers[idx + 1]
  const mood = moodFor(m)
  const flags = flagged(visibleClaims(m))
  const sc = scenarioById(m.scenarioId)

  return (
    <div>
      <Stage
        mood={mood}
        m={m}
        onPrev={() => prev && dispatch({ type: 'select', id: prev.id })}
        onNext={() => next && dispatch({ type: 'select', id: next.id })}
        prevLabel={prev && 'Previous answer'}
        nextLabel={next && 'Next answer'}
        line={moodLine(m, mood)}
        settled={m.phase === 'done'}
      />
      <div className="space-y-6 p-6">
        <div>
          <Eyebrow>
            Answer {idx + 1} of {answers.length} · in panel
          </Eyebrow>
          <p className="mt-1 line-clamp-2 text-body-sm text-carbon">“{m.question}”</p>
        </div>

        <ScoreBlock m={m} />

        {flags.length > 0 && (
          <div>
            <Eyebrow className="mb-2">Flagged claims · open for evidence</Eyebrow>
            <ul className="space-y-2">
              {flags.map((c) => {
                const s = CLAIM_STATUS[c.status]
                return (
                  <li key={c.id}>
                    <button onClick={() => dispatch({ type: 'select', id: m.id, claimId: c.id })} className="rise-in flex w-full items-start gap-3 rounded-2xl border border-frost bg-porcelain p-3 text-left transition-colors hover:border-ash">
                      <span className={`mt-0.5 ${TONES[s.tone].text}`}>
                        <s.Icon size={16} aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`eyebrow ${TONES[s.tone].text}`}>{s.label}</span>
                        <span className="mt-0.5 line-clamp-2 block text-body-sm text-ink">{m.text.slice(c.start, c.end)}</span>
                      </span>
                      <ChevronRight size={16} className="mt-0.5 shrink-0 text-ash" aria-hidden="true" />
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {m.phase === 'done' && <Sources m={m} sc={sc} />}

        <CheckList m={m} />
      </div>
    </div>
  )
}

function ScoreBlock({ m }) {
  const result = m.result
  const score = result?.score
  const band = result ? bandFor(score) : null
  const first = result && !counted.has(m.id)
  const shown = useCountUp(score, !!first)
  useEffect(() => {
    if (result) counted.add(m.id)
  }, [result, m.id])

  if (!result) {
    const running = runningCheck(m)
    return (
      <div aria-live="polite">
        <div className="flex items-baseline gap-2">
          <span className="text-display font-semibold text-ash tabular-nums animate-pulse">––</span>
          <span className="text-body text-smoke">/ 100</span>
        </div>
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-frost">
          <div className="h-full w-1/3 animate-pulse rounded-full bg-ash" />
        </div>
        <div className="eyebrow mt-3 text-carbon">{m.phase === 'verifying' ? `Verifying · ${running ? running.name : 'starting'}` : 'Waiting for the answer'}</div>
      </div>
    )
  }
  const t = TONES[band.status]
  const Icon = BAND_ICON[band.status]
  return (
    <div className="rise-in" aria-live="polite">
      {score == null ? (
        <div className="text-heading font-semibold text-carbon">Not scored</div>
      ) : (
        <div className="flex items-baseline gap-2">
          <span className="text-display font-semibold text-ink tabular-nums">{shown}</span>
          <span className="text-body text-smoke">/ 100</span>
        </div>
      )}
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-frost" role="presentation">
        <div className={`h-full rounded-full ${t.fill} transition-[width] duration-700 ease-out`} style={{ width: `${score ?? 0}%` }} />
      </div>
      <div className={`eyebrow mt-3 flex items-center gap-1.5 ${t.text}`}>
        <Icon size={14} strokeWidth={2.25} aria-hidden="true" />
        {score == null ? 'No claims to verify' : `Reliability · ${band.label}${result.noSource ? ' · No source found' : ''}`}
      </div>
      <p className="mt-2 max-w-[44ch] text-body-sm text-carbon">{result.explanation}</p>
      {result.parts && (
        <p className="mt-2 text-caption text-smoke">
          Score = claims supported {result.parts.claimPts}/60 + checks passed {result.parts.checkPts}/40{result.parts.capped ? `, capped at ${result.parts.cap}${result.parts.cap < 95 ? ' because no source was found' : ''}` : ''}.
        </p>
      )}
    </div>
  )
}

function CheckList({ m }) {
  const { dispatch } = useStore()
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <Eyebrow>Six checks</Eyebrow>
        <button onClick={() => dispatch({ type: 'checks', open: true })} className="eyebrow rounded-xl px-1 text-carbon hover:text-ink">
          See evidence
        </button>
      </div>
      <ul className="divide-y divide-frost overflow-hidden rounded-2xl bg-porcelain">
        {CHECKS.map((c, i) => {
          const s = CHECK_STATUS[m.checks[i].status]
          return (
            <li key={c.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
              <span className="text-body-sm font-medium text-ink">{c.name}</span>
              <span className={`inline-flex shrink-0 items-center gap-1 text-[12px] font-medium uppercase tracking-[0.05em] ${TONES[s.tone].text}`}>
                <s.Icon size={12} strokeWidth={2.25} className={m.checks[i].status === 'running' ? 'spin' : ''} aria-hidden="true" />
                {s.label}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function Sources({ m, sc }) {
  const ids = [...m.citations, ...sc.verification.retrieved.filter((d) => !m.citations.includes(d))]
  return (
    <div className="rise-in">
      <Eyebrow className="mb-2">Sources</Eyebrow>
      {ids.length === 0 ? (
        <div className="flex items-start gap-2 rounded-2xl border border-frost bg-porcelain p-3 text-body-sm text-carbon">
          <CircleSlash size={16} className="mt-0.5 shrink-0 text-status-unknown" aria-hidden="true" />
          <span>
            <span className="eyebrow block text-carbon">No source found</span>
            No approved document covers this question.
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {ids.map((id) => (
            <SourceChip key={id} docId={id} tag={m.citations.includes(id) ? 'Cited by agent' : 'Found by Assessment AI'} className="bg-porcelain" />
          ))}
        </div>
      )}
    </div>
  )
}

function ClaimDetail({ m, claimId }) {
  const { dispatch } = useStore()
  const list = claimList(m)
  const idx = list.findIndex((c) => c.id === claimId)
  const c = list[idx]
  if (!c) return null
  const s = CLAIM_STATUS[c.status]
  const t = TONES[s.tone]
  const f = c.source ? freshnessOf(c.source.docId) : null
  const checkMeta = CHECKS.find((k) => k.id === c.check)
  const go = (k) => list[k] && dispatch({ type: 'select', id: m.id, claimId: list[k].id })

  return (
    <div>
      <Stage
        compact
        mood={s.tone === 'verified' ? 'verified' : s.tone}
        m={m}
        onPrev={() => go(idx - 1)}
        onNext={() => go(idx + 1)}
        prevLabel={idx > 0 ? 'Previous claim' : null}
        nextLabel={idx < list.length - 1 ? 'Next claim' : null}
      />
      <div className="space-y-5 p-6">
        <div className="rise-in" key={c.id}>
          <Pill Icon={s.Icon} label={`${s.label} claim`} tone={s.tone} />
          <blockquote className={`mt-3 rounded-2xl border-l-2 bg-porcelain p-4 text-body text-ink ${t.border}`}>{m.text.slice(c.start, c.end)}</blockquote>
        </div>

        <div>
          <Eyebrow className="mb-1.5">Why it was flagged</Eyebrow>
          <p className="max-w-[44ch] text-body-sm text-carbon">{c.reason}</p>
          <p className="mt-1.5 text-caption text-smoke">
            Verdict from {checkMeta.name.toLowerCase()} · {METHOD_LABEL[checkMeta.method]}
          </p>
        </div>

        {c.source ? (
          <div>
            <Eyebrow className="mb-1.5">{c.nearest ? 'Nearest passage retrieved' : c.status === 'conflicting' ? 'Source it conflicts with' : 'Source passage'}</Eyebrow>
            <Passage docId={c.source.docId} section={c.source.section} passage={c.source.passage} className="bg-porcelain" />
          </div>
        ) : (
          <div>
            <Eyebrow className="mb-1.5">Source</Eyebrow>
            <div className="mb-2 flex items-center gap-2 text-body-sm text-carbon">
              <CircleSlash size={16} className="text-status-unknown" aria-hidden="true" />
              <span className="eyebrow text-carbon">No source found</span>
            </div>
            <SearchRecord scenarioId={m.scenarioId} />
          </div>
        )}

        {f?.stale && (
          <div className="flex gap-3 rounded-2xl border bg-status-caution-surface p-4" style={{ borderColor: 'color-mix(in srgb, var(--color-status-caution) 30%, transparent)' }}>
            <Clock size={16} className="mt-0.5 shrink-0 text-status-caution" aria-hidden="true" />
            <div className="text-body-sm text-carbon">
              <span className="eyebrow block text-carbon">Stale source</span>
              {f.state === 'superseded' ? (
                <>
                  {DOCUMENTS[c.source.docId].title} was last updated {formatDate(DOCUMENTS[c.source.docId].updated)} and was superseded by {f.supersededBy.title} ({f.supersededBy.id}) on {formatDate(f.supersededBy.updated)}.
                </>
              ) : (
                <>
                  {DOCUMENTS[c.source.docId].title} is {f.months} months old, past its {DOCUMENTS[c.source.docId].reviewCycleMonths}-month review cycle.
                </>
              )}
            </div>
          </div>
        )}

        {c.counter && (
          <div>
            <Eyebrow className="mb-1.5">{c.status === 'conflicting' ? 'What the policy allows' : 'Current approved policy says'}</Eyebrow>
            <Passage docId={c.counter.docId} section={c.counter.section} passage={c.counter.passage} className="bg-porcelain" />
          </div>
        )}
      </div>
    </div>
  )
}

function Actions({ m }) {
  const { dispatch } = useStore()
  const [composing, setComposing] = useState(false)
  const [note, setNote] = useState('')
  const done = m.phase === 'done'
  useEffect(() => {
    setComposing(false)
    setNote('')
  }, [m.id])

  return (
    <div className="shrink-0 border-t border-frost bg-bone px-6 py-4">
      {m.outcome ? (
        <OutcomeLine outcome={m.outcome} />
      ) : m.routed ? (
        <div className="flex items-start gap-2 text-body-sm text-carbon">
          <Inbox size={16} className="mt-0.5 shrink-0 text-carbon" aria-hidden="true" />
          <span>
            <span className="font-medium text-ink">{m.routed.joined ? 'Joined a review already open' : m.routed.by === 'auto' ? 'Routed to a reviewer automatically' : 'With a reviewer'}</span> · {m.routed.queueId} · pending. The outcome will appear on this answer.
          </span>
        </div>
      ) : composing ? (
        <form
          className="rise-in space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            dispatch({ type: 'escalate', id: m.id, note })
            setComposing(false)
          }}
        >
          <label htmlFor="esc-note" className="eyebrow text-smoke">
            Note for the reviewer (optional)
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
        <div className="grid grid-cols-2 gap-2">
          <PrimaryButton onClick={() => setComposing(true)} disabled={!done} className="col-span-2 whitespace-nowrap">
            <Inbox size={16} /> Send for human review
          </PrimaryButton>
          <GhostButton onClick={() => dispatch({ type: 'feedback', id: m.id, value: 'helpful' })} pressed={m.feedback === 'helpful'} disabled={!done}>
            <ThumbsUp size={15} /> Helpful
          </GhostButton>
          <GhostButton onClick={() => dispatch({ type: 'feedback', id: m.id, value: 'wrong' })} pressed={m.feedback === 'wrong'} disabled={!done}>
            <ThumbsDown size={15} /> Wrong
          </GhostButton>
        </div>
      )}
      {m.feedback && !m.routed && !composing && (
        <p className="mt-2 flex items-center gap-1 text-caption text-smoke">
          <Sparkles size={12} aria-hidden="true" /> Feedback recorded for this answer (this session only).
        </p>
      )}
    </div>
  )
}

function OutcomeLine({ outcome }) {
  const o = OUTCOME_META[outcome.decision]
  return (
    <div className="flex items-start gap-2 text-body-sm text-carbon">
      <o.Icon size={16} className={`mt-0.5 shrink-0 ${TONES[o.tone].text}`} aria-hidden="true" />
      <span className="min-w-0">
        <span className={`eyebrow flex flex-wrap items-center gap-2 ${TONES[o.tone].text}`}>
          {o.label}
          {outcome.recheck && <ScoreBadge score={outcome.recheck.result.score} />}
        </span>
        <span className="mt-1 block">{outcome.note}</span>
      </span>
    </div>
  )
}
