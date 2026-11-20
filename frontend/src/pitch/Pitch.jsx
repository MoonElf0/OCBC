import { useEffect, useState } from 'react'
import { X, ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react'
import { useStore } from '../state/store'

const Big = ({ children, className = '' }) => <h1 className={`text-[clamp(40px,7vw,96px)] font-semibold leading-[1.02] tracking-[-0.04em] ${className}`}>{children}</h1>
const Sub = ({ children }) => <p className="mx-auto mt-6 max-w-2xl text-[clamp(16px,2vw,24px)] leading-snug text-smoke">{children}</p>
const Grad = ({ children }) => <span className="bg-gradient-to-r from-ocbc-red via-[#7c5cff] to-[#1f9d6b] bg-clip-text text-transparent">{children}</span>
const Box = ({ title, sub, hot, i = 0 }) => (
  <div className="pop rounded-2xl border border-frost bg-bone px-4 py-3 text-left" style={{ animationDelay: `${i * 120}ms`, ...(hot ? { borderColor: '#e4002b' } : {}) }}>
    <div className="text-body-sm font-medium text-ink">{title}</div>
    {sub && <div className="text-caption text-smoke">{sub}</div>}
  </div>
)
const Arrow = () => <ArrowRight className="mx-auto shrink-0 text-ash max-md:rotate-90" size={20} aria-hidden="true" />

const SLIDES = [
  () => (<><div className="eyebrow mb-6 text-smoke">OCBC × NYP Ignite · Trusted AI Agents</div><Big>AI that answers.<br /><Grad>Another that audits.</Grad></Big><Sub>Assessment AI is the independent verifier that tells employees whether to trust an AI answer, and shows why.</Sub></>),
  () => (<><div className="eyebrow mb-6 text-smoke">The problem</div><Big>Confident answers.<br />Quietly wrong.</Big><Sub>Staff act on AI answers about lending limits, KYC and fees. One outdated circular can turn a fluent reply into a compliance incident.</Sub></>),
  () => (
    <><div className="eyebrow mb-6 text-smoke">Why it happens</div><Big className="!text-[clamp(32px,5vw,64px)]">Policy changes. The AI does not notice.</Big>
      <div className="mx-auto mt-12 grid max-w-5xl items-center gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr]">
        {[['Policy updated', 'Limit drops to SGD 200k'], ['Old circular lingers', 'Still in the index'], ['Agent retrieves it', 'Fluent, confident answer'], ['Employee acts', 'Wrong limit approved']].flatMap((b, i) => [i ? <Arrow key={`a${i}`} /> : null, <Box key={b[0]} title={b[0]} sub={b[1]} i={i} hot={i === 3} />])}
      </div></>),
  () => (<><div className="eyebrow mb-6 text-smoke">Our answer</div><Big>Two systems.<br /><Grad>Never one.</Grad></Big><Sub>The Policy Assistant answers. Assessment AI re-checks every claim against source passages, freshness and other documents, then gives it a reliability index with a verdict, never a bare number.</Sub></>),
  () => (
    <><div className="eyebrow mb-6 text-smoke">Innovation</div><Big className="!text-[clamp(32px,5vw,64px)]">Beyond a score.</Big>
      <div className="mx-auto mt-12 grid max-w-4xl gap-4 text-left md:grid-cols-2">
        {[['Challenger Agent', 'A second AI tries to disprove the answer with conflicting policies and edge cases. If it finds a doubt, it asks the employee one clarifying question in chat, so most cases never reach a human queue.'], ['Proof-of-Trust Map', 'Click any claim to trace it: document, section and paragraph, a freshness path (green, yellow, red), and whether it rests on one source or several.']].map(([t, d], i) => (
          <div key={t} className="pop rounded-3xl border border-frost bg-bone p-6" style={{ animationDelay: `${i * 160}ms` }}><div className="text-subheading font-semibold">{t}</div><p className="mt-2 text-body-sm text-smoke">{d}</p></div>
        ))}
      </div></>),
  () => (
    <><div className="eyebrow mb-6 text-smoke">Technical execution</div><Big className="!text-[clamp(28px,4vw,52px)]">What happens behind the answer</Big>
      <div className="mx-auto mt-10 grid max-w-5xl items-stretch gap-3 md:grid-cols-[1fr_auto_1.3fr_auto_1.3fr_auto_1fr]">
        <Box i={0} title="Employee question" sub="Chat workspace" /><Arrow />
        <Box i={1} title="Answering agent" sub="Retriever + LLM, deliberately simple" /><Arrow />
        <div className="pop rounded-2xl border border-ocbc-red p-3 text-left" style={{ animationDelay: '360ms' }}>
          <div className="eyebrow mb-2 text-ocbc-red">Assessment AI · verifier</div>
          <div className="grid gap-1.5">{['Claim splitter (offsets)', 'Citation + freshness (plain code)', 'Cross-reference documents', '3 LLM judges: grounded, consistent, on-intent', 'Challenger agent'].map((s) => <div key={s} className="rounded-xl bg-bone px-3 py-1.5 text-caption text-carbon">{s}</div>)}</div>
        </div><Arrow />
        <Box i={3} title="Router" sub="Score + band, clarify in chat, or reviewer queue, audit trail, dashboard" />
      </div>
      <p className="mt-6 text-caption text-smoke">Production design. This demo scripts the model calls with synthetic data, behind the same interfaces.</p></>),
  () => (<><div className="eyebrow mb-6 text-smoke">User experience</div><Big>Show the answer first.<br /><Grad>Prove it second.</Grad></Big><Sub>Answers never wait for the score. Status is always an icon plus a label, never colour alone. Light and dark modes, keyboard friendly, and failure states built in.</Sub></>),
  () => (<><Big>Trust, <Grad>made visible.</Grad></Big><Sub>Fewer wrong answers acted on. Fewer needless reviews. A clear audit trail for compliance.</Sub></>),
]

export default function Pitch() {
  const { dispatch } = useStore()
  const [i, setI] = useState(0)
  const go = (d) => setI((x) => Math.max(0, Math.min(SLIDES.length - 1, x + d)))
  useEffect(() => {
    const k = (e) => {
      if (e.key === 'ArrowRight' || e.key === ' ') go(1)
      else if (e.key === 'ArrowLeft') go(-1)
      else if (e.key === 'Escape') dispatch({ type: 'pitch', open: false })
    }
    document.addEventListener('keydown', k)
    return () => document.removeEventListener('keydown', k)
  }, [dispatch])
  const S = SLIDES[i]
  return (
    <div className="fixed inset-0 z-[60] overflow-hidden bg-porcelain text-ink" role="dialog" aria-label="Pitch deck">
      <div className="aurora pointer-events-none absolute -top-40 left-1/4 size-[420px] rounded-full bg-ocbc-red/15" aria-hidden="true" />
      <div className="aurora pointer-events-none absolute -bottom-40 right-1/4 size-[420px] rounded-full bg-[#7c5cff]/15" aria-hidden="true" />
      <button onClick={() => dispatch({ type: 'pitch', open: false })} aria-label="Close deck" className="absolute top-5 right-5 z-10 grid size-10 place-items-center rounded-full border border-frost text-carbon hover:border-ash"><X size={18} /></button>
      <div key={i} className="pop relative grid h-full place-items-center overflow-y-auto px-8 py-16 text-center"><div><S /></div></div>
      <div className="absolute inset-x-0 bottom-6 flex items-center justify-center gap-4">
        <button onClick={() => go(-1)} disabled={i === 0} aria-label="Previous slide" className="grid size-9 place-items-center rounded-full border border-frost text-carbon disabled:opacity-30"><ChevronLeft size={16} /></button>
        <div className="flex gap-1.5">{SLIDES.map((_, n) => <button key={n} onClick={() => setI(n)} aria-label={`Slide ${n + 1}`} aria-current={n === i} className={`h-1.5 rounded-full transition-all ${n === i ? 'w-6 bg-ink' : 'w-1.5 bg-frost'}`} />)}</div>
        <button onClick={() => go(1)} disabled={i === SLIDES.length - 1} aria-label="Next slide" className="grid size-9 place-items-center rounded-full border border-frost text-carbon disabled:opacity-30"><ChevronRight size={16} /></button>
      </div>
    </div>
  )
}
