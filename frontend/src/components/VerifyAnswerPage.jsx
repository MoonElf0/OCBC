import { useState } from 'react'
import { ClipboardPaste, LoaderCircle, ShieldCheck, ServerOff, Sparkles } from 'lucide-react'
import { useStore } from '../state/store'
import { DEMO_TODAY } from '../fixtures'
import { BACKEND } from '../lib/backend'
import { visibleClaims } from '../lib/view'
import AnswerText from './AnswerText'
import { VerifyButton, Outcome } from './Chat'
import { StateChip } from './lifecycle'

/*
 * Verify an answer written elsewhere. The employee pastes the question, the
 * AI-generated answer and any citations; Assessment AI checks it on its own,
 * with no help from the Policy Assistant. Reading arbitrary text needs the
 * backend's pipeline, so the offline demo explains that instead of faking it.
 */

const EXAMPLE = {
  question: 'Can I override the FX rate for a corporate client without approval?',
  answer: 'Yes. Relationship managers can apply an FX rate override of up to 50 basis points without further approval, as long as the client has an active treasury mandate. Every override must be recorded in the deal ticket with a reason code.',
  citations: 'DOC-FX-019 §2.1',
}

export default function VerifyAnswerPage() {
  const { state } = useStore()
  const submitted = state.messages.filter((m) => m.kind === 'answer' && m.source === 'submitted' && m.origin !== 'classic').reverse()

  return (
    <section aria-labelledby="va-title" className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[780px] space-y-6 px-4 pt-8 pb-10 sm:px-6">
          <header className="rise-in">
            <div className="glass-soft mb-5 inline-flex items-center gap-2 rounded-full py-1.5 pr-3 pl-1.5 text-body-sm text-carbon">
              <span className="grid size-6 place-items-center rounded-full bg-inverse text-white">
                <ClipboardPaste size={13} strokeWidth={2.25} />
              </span>
              For answers from any AI tool, not just the Policy Assistant
            </div>
            <h1 id="va-title" className="text-heading font-semibold text-ink sm:text-[40px] sm:tracking-[-1.2px]">
              Verify an answer
            </h1>
            <p className="mt-3 max-w-[60ch] text-body text-smoke">Paste the question, the AI-generated answer and any citations it gave. Assessment AI extracts the claims, finds its own evidence in the approved library for that policy date, and checks the citations.</p>
          </header>

          {!BACKEND && <BackendNotice />}
          <SubmitForm />

          {submitted.length > 0 && (
            <section aria-labelledby="va-list" className="space-y-4">
              <h2 id="va-list" className="text-body-sm font-semibold text-ink">
                Submitted answers <span className="font-normal text-smoke">· {submitted.length}</span>
              </h2>
              {submitted.map((m) => (
                <SubmittedCard key={m.id} m={m} />
              ))}
            </section>
          )}
        </div>
      </div>
    </section>
  )
}

function BackendNotice() {
  return (
    <div role="note" className="rise-in flex gap-3 rounded-2xl border border-dashed border-line/15 bg-bone/70 p-4">
      <ServerOff size={18} className="mt-0.5 shrink-0 text-status-unknown" aria-hidden="true" />
      <div className="text-body-sm text-carbon">
        <div className="font-semibold text-ink">Needs backend mode</div>
        <p className="mt-0.5">
          Checking an answer you paste in runs the backend’s verification pipeline, which this offline demo does not have. Nothing here is scripted, so it stays switched off rather than showing a made-up result. Start backend mode with{' '}
          <code className="rounded-lg bg-surface/80 px-1.5 py-0.5 text-caption">npm run dev:backend</code>.
        </p>
      </div>
    </div>
  )
}

function SubmitForm() {
  const { state, submitAnswer } = useStore()
  const [q, setQ] = useState('')
  const [a, setA] = useState('')
  const [cites, setCites] = useState('')
  const [asOf, setAsOf] = useState('')
  const [sending, setSending] = useState(false)
  const busy = sending || state.messages.some((m) => m.source === 'submitted' && m.kind === 'answer' && m.phase !== 'done')
  const today = state.health?.today ?? DEMO_TODAY
  const ready = BACKEND && q.trim() && a.trim() && !busy

  const submit = async (e) => {
    e.preventDefault()
    if (!ready) return
    setSending(true)
    const citations = cites
      .split(/[,;\n]+/)
      .map((c) => c.trim())
      .filter(Boolean)
    const ok = await submitAnswer({ question: q.trim(), answer: a.trim(), citations, asOf: asOf || null })
    setSending(false)
    if (ok) {
      setQ('')
      setA('')
      setCites('')
    }
  }

  const field = 'w-full rounded-2xl border border-line/10 bg-surface/80 px-3.5 py-2.5 text-body-sm text-ink placeholder:text-smoke focus:border-ocbc-red/40 focus:outline-none disabled:cursor-not-allowed disabled:bg-line/[0.03]'
  const label = 'text-caption font-semibold text-carbon'

  return (
    <form onSubmit={submit} className="glass rise-in space-y-4 rounded-3xl p-5 sm:p-6" aria-describedby="va-help">
      <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
        <div>
          <label htmlFor="va-q" className={label}>
            Original question
          </label>
          <input id="va-q" value={q} onChange={(e) => setQ(e.target.value)} disabled={!BACKEND} placeholder="What the employee asked" className={`mt-1.5 ${field}`} />
        </div>
        <div>
          <label htmlFor="va-date" className={label}>
            Policy date
          </label>
          <input id="va-date" type="date" value={asOf || today} max="2100-12-31" onChange={(e) => setAsOf(e.target.value)} disabled={!BACKEND} className={`mt-1.5 ${field}`} />
        </div>
      </div>
      <div>
        <label htmlFor="va-a" className={label}>
          AI-generated answer
        </label>
        <textarea id="va-a" rows={5} value={a} onChange={(e) => setA(e.target.value)} disabled={!BACKEND} placeholder="Paste the answer to check" className={`mt-1.5 resize-y ${field}`} />
      </div>
      <div>
        <label htmlFor="va-c" className={label}>
          Citations given with it <span className="font-normal text-smoke">(optional)</span>
        </label>
        <input id="va-c" value={cites} onChange={(e) => setCites(e.target.value)} disabled={!BACKEND} placeholder="e.g. DOC-FX-019 §2.1, DOC-SME-104" className={`mt-1.5 ${field}`} />
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-line/[0.06] pt-4">
        {BACKEND && (
          <button type="button" onClick={() => (setQ(EXAMPLE.question), setA(EXAMPLE.answer), setCites(EXAMPLE.citations))} className="inline-flex items-center gap-1.5 text-caption font-medium text-carbon underline underline-offset-4 hover:text-ink">
            <Sparkles size={13} aria-hidden="true" /> Fill in an example
          </button>
        )}
        <button type="submit" disabled={!ready} className="ml-auto inline-flex items-center gap-2 rounded-full bg-inverse px-5 py-2.5 text-body-sm font-medium text-white shadow-md transition-all hover:bg-inverse-hover active:scale-[0.98] disabled:bg-line/10 disabled:text-smoke disabled:shadow-none">
          {sending ? <LoaderCircle size={16} className="spin" aria-hidden="true" /> : <ShieldCheck size={16} aria-hidden="true" />} Verify answer
        </button>
      </div>
      <p id="va-help" className="text-caption text-smoke">
        The library text is treated as evidence, never as instructions. Without a model provider on the server, the model steps are reported as not run and the result is marked partial.
      </p>
    </form>
  )
}

function SubmittedCard({ m }) {
  const { state, dispatch } = useStore()
  const open = state.paneId === m.id
  const claims = visibleClaims(m)
  const faded = m.outcome?.decision === 'corrected' || m.outcome?.decision === 'rejected'
  return (
    <article aria-label={`Submitted answer to: ${m.question}`} className="rise-in">
      <div className={`glass rounded-3xl px-5 py-4 transition-shadow ${open ? 'ring-2 ring-ocbc-red/25' : ''}`}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-smoke">
          <ClipboardPaste size={13} aria-hidden="true" />
          <span className="font-medium text-carbon">Submitted for verification</span>
          {m.citations.length > 0 && <span>· cites {m.citations.join(', ')}</span>}
          {m.asOf && <span>· policy date {m.asOf}</span>}
        </div>
        <p className="mt-2 text-body-sm font-semibold text-ink">{m.question}</p>
        <div className={`mt-2 ${faded ? 'opacity-55' : ''}`}>
          {faded && <div className="mb-1.5 text-caption font-medium text-smoke">Original answer</div>}
          <AnswerText
            text={m.text}
            shown={m.shown}
            claims={claims}
            highlight={open || !!m.result}
            idPrefix="chat"
            activeClaimId={open ? state.focusClaimId : null}
            pulseId={open ? state.focusClaimId : null}
            onClaim={(c) => dispatch(open ? { type: 'focusClaim', claimId: c.id } : { type: 'openPane', id: m.id, claimId: c.id })}
          />
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <VerifyButton m={m} open={open} />
        <StateChip state={m.state} />
      </div>
      {m.outcome && <Outcome outcome={m.outcome} />}
    </article>
  )
}
