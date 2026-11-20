import { useEffect, useRef, useState } from 'react'
import { X, ChevronDown } from 'lucide-react'
import { useStore, useActiveAnswer } from '../state/store'
import { SCORE_MODEL } from '../lib/assess'
import { CHECKS, METHOD_LABEL } from '../lib/status'
import { checksDone } from '../lib/view'
import { BACKEND } from '../lib/backend'
import { CheckPill, Eyebrow } from './ui'
import { EvidenceItem } from './Evidence'

/** The centre research tab: six Check Rows over the thread. */
export default function ChecksSheet() {
  const { state, dispatch } = useStore()
  const m = useActiveAnswer()
  const dialog = useRef(null)
  const open = state.checksOpen && m

  // Modal behaviour: focus moves in, Tab stays in, Escape closes, focus returns.
  useEffect(() => {
    if (!open) return
    const opener = document.activeElement
    const el = dialog.current
    el.querySelector('button')?.focus()
    const onKey = (e) => {
      if (e.key === 'Escape') dispatch({ type: 'checks', open: false })
      if (e.key !== 'Tab') return
      const items = [...el.querySelectorAll('button:not([disabled]), [href], [tabindex="0"]')]
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      opener?.focus?.()
    }
  }, [open, dispatch])

  if (!open) return null

  return (
    <div ref={dialog} className="absolute inset-0 z-20 flex flex-col bg-porcelain/70 p-4 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-labelledby="checks-title">
      <div className="rise-in flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-frost bg-porcelain shadow-xl">
        <header className="flex items-start justify-between gap-4 border-b border-frost px-6 py-5">
          <div>
            <Eyebrow>
              Assessment AI · six checks · {checksDone(m)} of {CHECKS.length} resolved
            </Eyebrow>
            <h2 id="checks-title" className="mt-2 text-subheading font-medium text-ink">
              “{m.question}”
            </h2>
          </div>
          <button onClick={() => dispatch({ type: 'checks', open: false })} className="grid size-9 shrink-0 place-items-center rounded-full border border-frost text-carbon hover:border-ash" aria-label="Close checks">
            <X size={16} />
          </button>
        </header>
        <div className="scroll-quiet flex-1 overflow-y-auto px-6">
          {CHECKS.map((meta, i) => (
            <CheckRow key={meta.id} meta={meta} check={m.checks[i]} scenarioId={m.scenarioId} question={m.question} search={m.result?.search} />
          ))}
          <Method />

        </div>
      </div>
    </div>
  )
}

/** How the verdicts and the reliability index are produced — the answer to "how does it work?". */
function Method() {
  const m = SCORE_MODEL
  const { state } = useStore()
  const model = state.health?.model
  return (
    <section aria-labelledby="method-title" className="my-5 rounded-2xl bg-bone p-5">
      <h3 id="method-title" className="eyebrow text-carbon">
        How this works
      </h3>
      <dl className="mt-3 space-y-3 text-body-sm text-carbon">
        <div>
          <dt className="font-medium text-ink">Rule-based checks</dt>
          <dd>Citation verification, freshness and cross-referencing run as plain code: document lookups, review dates, and matching the figures in each claim against the cited passage.</dd>
        </div>
        <div>
          <dt className="font-medium text-ink">Judge checks</dt>
          <dd>Groundedness, consistency and intent alignment need judgement. Each verdict must quote the passage it relied on; a verdict whose quote is not in that passage is discarded. Retrieved policy text is treated as evidence only: text in it that reads like an instruction is removed before the judge sees it. The judge should run on a different model from the answering agent, so they don’t share blind spots. When no model is available these checks show “Not run” and the result is marked partial.</dd>
        </div>
        <div>
          <dt className="font-medium text-ink">Reliability index</dt>
          <dd>
            An evidence-based index from 0 to 100, not a probability that the answer is correct and not permission to act. Up to {m.claimWeight} points for claims (supported counts fully; stale or off-question counts {m.claimCredit.stale * 100}%; not checked counts 50%; unsupported, conflicting or without evidence counts nothing) plus up to {m.checkWeight} for checks (pass full, warning half). Capped at {m.cap}: the verifier can be wrong too. If no approved evidence was found for any claim, capped at {m.noSourceCap}. If part of the assessment could not run, capped at 70, so it can never show High. N/A and “Not run” checks are left out rather than counted as passes. High ≥ 80, Medium ≥ 50.
          </dd>
        </div>
        <div>
          <dt className="font-medium text-ink">Routing</dt>
          <dd>Review is mandatory when the index is Low, a claim conflicts with approved policy, a claim has no approved evidence, the assessment is partial, or the topic is designated high-risk (FX & Treasury, Collateral & Security) — at any index. Only a reviewer’s decision clears it: not a high index, not the Challenger’s clarifying question. Anything else, the employee can escalate.</dd>
        </div>
        <div>
          <dt className="font-medium text-ink">In this prototype</dt>
          <dd>
            {BACKEND
              ? `Policy Assistant answers and their judge verdicts are scripted fixtures; retrieval, rule checks, the index and routing are computed by the backend from the versioned policy library. Answers you submit and reviewer corrections run the full pipeline. Model: ${model?.available ? `${model.provider} · ${model.model}` : `none configured, so model steps are reported as not run (${model?.reason ?? 'no provider'})`}.`
              : 'Answers, retrieval results and judge verdicts are scripted fixtures; rule checks and the index are computed in code from them. Verifying your own answers needs backend mode.'}
          </dd>
        </div>
      </dl>
    </section>
  )
}

export function CheckRow({ meta, check, scenarioId, question, search, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  const settled = check.status !== 'queued' && check.status !== 'running'
  return (
    <div className="border-b border-frost py-4">
      <button className="flex w-full items-center gap-4 text-left disabled:cursor-default" onClick={() => setOpen((o) => !o)} disabled={!settled} aria-expanded={open}>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-body font-semibold text-ink">{meta.name}</span>
            <span className="text-caption text-ash">{METHOD_LABEL[meta.method]}</span>
          </div>
          <div className="mt-0.5 text-body-sm font-medium text-carbon">{settled ? (check.short ?? check.summary) : meta.question}</div>
        </div>
        <CheckPill status={check.status} />
        <ChevronDown size={18} className={`shrink-0 text-carbon transition-transform ${open ? 'rotate-180' : ''} ${settled ? '' : 'opacity-0'}`} aria-hidden="true" />
      </button>
      {open && settled && (
        <div className="rise-in mt-3 space-y-2">
          {check.short && <p className="text-body-sm text-smoke">{check.summary}</p>}
          {check.evidence.map((e, j) => (
            <EvidenceItem key={j} item={e} scenarioId={scenarioId} question={question} search={search} />
          ))}
        </div>
      )}
    </div>
  )
}
