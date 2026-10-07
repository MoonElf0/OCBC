import { Clock } from 'lucide-react'
import { TONES, CLAIM_STATUS, CHECK_STATUS, BAND_ICON, bandFor } from '../lib/status'
import { freshnessOf } from '../lib/freshness'
import { DOCUMENTS } from '../fixtures'

export function PrimaryButton({ children, className = '', ...props }) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-full bg-ocbc-red px-6 py-3 text-body-sm font-medium text-white shadow-md transition-colors hover:bg-ocbc-red-deep disabled:cursor-not-allowed disabled:bg-ash disabled:shadow-none ${className}`}
    >
      {children}
    </button>
  )
}

export function GhostButton({ children, className = '', pressed, ...props }) {
  return (
    <button
      {...props}
      aria-pressed={pressed}
      className={`inline-flex items-center justify-center gap-2 rounded-full border px-4 py-2 text-body-sm font-medium transition-colors ${
        pressed ? 'border-carbon bg-porcelain text-ink' : 'border-frost text-carbon hover:border-ash hover:text-ink'
      } disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  )
}

export function Eyebrow({ children, className = '' }) {
  return <div className={`eyebrow text-smoke ${className}`}>{children}</div>
}

/** Icon + text label in a status tone. */
export function StatusLabel({ Icon, label, tone, size = 14, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1.5 eyebrow ${TONES[tone].text} ${className}`}>
      <Icon size={size} strokeWidth={2} aria-hidden="true" className={label === 'Checking' ? 'spin' : ''} />
      {label}
    </span>
  )
}

export function Pill({ Icon, label, tone, className = '' }) {
  const t = TONES[tone]
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-2.5 py-1 eyebrow ${t.surface} ${t.text} ${t.border} border-opacity-30 ${className}`} style={{ borderColor: 'color-mix(in srgb, currentColor 30%, transparent)' }}>
      <Icon size={12} strokeWidth={2.25} aria-hidden="true" className={label === 'Checking' ? 'spin' : ''} />
      {label}
    </span>
  )
}

export function CheckPill({ status }) {
  const s = CHECK_STATUS[status]
  return <Pill Icon={s.Icon} label={s.label} tone={s.tone} />
}

export function ClaimPill({ status }) {
  const s = CLAIM_STATUS[status]
  return <Pill Icon={s.Icon} label={s.label} tone={s.tone} />
}

/** Compact score badge: never a bare number. */
export function ScoreBadge({ score, className = '' }) {
  const band = bandFor(score)
  const t = TONES[band.status]
  const Icon = BAND_ICON[band.status]
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border px-2.5 py-1 text-caption font-medium ${t.surface} ${t.text} ${className}`}
      style={{ borderColor: 'color-mix(in srgb, currentColor 35%, transparent)' }}
    >
      <Icon size={13} strokeWidth={2.25} aria-hidden="true" />
      {score == null ? (
        'Not scored'
      ) : (
        <>
          <span className="text-ink tabular-nums">{score} / 100</span>
          <span aria-hidden="true">·</span>
          {band.label}
        </>
      )}
    </span>
  )
}

/** Source chip: title, separator, freshness. Only the note takes the caution colour. */
export function SourceChip({ docId, section, tag, className = '' }) {
  const doc = DOCUMENTS[docId]
  const f = freshnessOf(docId)
  return (
    <div className={`flex max-w-full items-start gap-3 rounded-xl border border-frost bg-bone px-3 py-2 ${className}`}>
      <div className="min-w-0 flex-1">
        <div className="text-body-sm font-medium text-ink">{doc.title}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-caption">
          <span className="whitespace-nowrap text-smoke">
            {doc.id}
            {section ? ` ${section}` : ''}
          </span>
          <span className="text-smoke" aria-hidden="true">
            ·
          </span>
          <span className={`inline-flex items-center gap-1 whitespace-nowrap ${f.stale ? 'text-status-caution' : 'text-smoke'}`}>
            {f.stale && <Clock size={12} strokeWidth={2.25} aria-hidden="true" />}
            {f.note}
            {f.stale && <span className="sr-only">(stale source)</span>}
          </span>
        </div>
      </div>
      {tag && <span className="eyebrow shrink-0 rounded-xl border border-frost bg-porcelain px-2 py-0.5 text-[12px] text-carbon">{tag}</span>}
    </div>
  )
}

export function Passage({ docId, section, passage, className = '' }) {
  return (
    <figure className={`rounded-2xl bg-bone p-4 ${className}`}>
      <blockquote className="text-body-sm text-carbon">“{passage}”</blockquote>
      <figcaption className="mt-3">
        <SourceChip docId={docId} section={section} className="bg-porcelain" />
      </figcaption>
    </figure>
  )
}
