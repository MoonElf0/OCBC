import { useEffect, useState } from 'react'
import { Swords, ShieldCheck, MessageCircleQuestion, Sparkles } from 'lucide-react'
import { CHALLENGES, clarification } from '../lib/challenger'
import { DOCUMENTS } from '../fixtures'

export default function Challenger({ m, reviewRequired = false }) {
  const ch = CHALLENGES[m.scenarioId]
  const [ready, setReady] = useState(false)
  const [picked, setPicked] = useState(null)
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 1700)
    return () => clearTimeout(t)
  }, [])
  if (!ch || m.phase !== 'done') return null
  const doc = ch.finding && DOCUMENTS[ch.finding.docId]
  const sec = doc?.sections.find((s) => s.id === ch.finding.section)
  const opt = picked != null ? ch.options[picked] : null
  const words = clarification(opt ?? ch.options?.[0] ?? { title: '' }, reviewRequired)

  return (
    <div className="chal-border pop mx-3 mb-3 rounded-2xl p-4" role="region" aria-label="Challenger agent">
      <div className="flex items-center gap-2 text-caption font-medium text-carbon">
        <Swords size={15} aria-hidden="true" /> Challenger Agent
        <span className="eyebrow rounded-full border border-frost px-2 py-0.5 text-smoke">Second opinion</span>
      </div>
      {!ready ? (
        <div className="mt-3 space-y-2" aria-live="polite">
          <div className="text-body-sm text-smoke">Trying to disprove this answer with conflicting policies and edge cases…</div>
          <div className="shimmer h-2 w-2/3 rounded-full bg-frost" />
          <div className="shimmer h-2 w-1/2 rounded-full bg-frost" />
        </div>
      ) : !ch.finding ? (
        <p className="pop mt-3 flex items-start gap-2 text-body-sm text-ink">
          <ShieldCheck size={16} className="mt-0.5 shrink-0 text-status-verified" aria-hidden="true" />
          <span><b className="font-medium text-status-verified">No contradiction found.</b> {ch.summary}</span>
        </p>
      ) : (
        <div className="pop mt-3 space-y-3">
          <p className="text-body-sm text-ink">{ch.summary}</p>
          {sec && (
            <blockquote className="rounded-xl bg-bone px-3 py-2 text-caption text-carbon">
              <span className="font-medium">{doc.title} · {sec.id}</span> — “{sec.text}”
            </blockquote>
          )}
          {!opt ? (
            <div className="rounded-xl border border-frost bg-bone/60 p-3">
              <div className="flex items-center gap-2 text-body-sm font-medium text-ink">
                <MessageCircleQuestion size={16} aria-hidden="true" /> {ch.question}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {ch.options.map((o, i) => (
                  <button key={o.label} onClick={() => setPicked(i)} className="rounded-full border border-frost px-3.5 py-1.5 text-caption font-medium text-carbon transition hover:-translate-y-px hover:border-ash hover:text-ink">
                    {o.label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-caption text-smoke">{words.footer}</p>
            </div>
          ) : (
            <div className={`pop rounded-xl border p-3 ${reviewRequired ? 'border-status-caution bg-status-caution-surface' : 'border-status-verified bg-status-verified-surface'}`}>
              <div className={`eyebrow flex items-center gap-1.5 ${reviewRequired ? 'text-status-caution' : 'text-status-verified'}`}><Sparkles size={13} aria-hidden="true" /> {words.title}</div>
              <p className="mt-1.5 text-body-sm text-ink">{opt.text}</p>
              {reviewRequired && <p className="mt-1.5 text-caption text-carbon">{words.footer}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
