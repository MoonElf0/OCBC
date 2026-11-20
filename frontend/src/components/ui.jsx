import { Clock, CalendarDays, FileText, ScanSearch } from 'lucide-react'
import { TONES, CLAIM_STATUS, CHECK_STATUS, BAND_ICON, bandFor } from '../lib/status'
import { freshnessOf } from '../lib/freshness'
import { documentById } from '../lib/library'

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

/** Square icon tile that leads a section or a row. */
export function IconTile({ Icon, tone, size = 'md', className = '' }) {
  const box = size === 'lg' ? 'size-11 rounded-2xl' : size === 'sm' ? 'size-8 rounded-xl' : 'size-9 rounded-xl'
  const t = tone ? TONES[tone] : null
  return (
    <span className={`grid shrink-0 place-items-center ${box} ${t ? `${t.surface} ${t.text}` : 'border border-frost bg-porcelain text-carbon'} ${className}`} aria-hidden="true">
      <Icon size={size === 'lg' ? 22 : size === 'sm' ? 16 : 18} strokeWidth={2} />
    </span>
  )
}

/** Section title: icon tile, bold title, optional count and right-hand slot. */
export function SectionHeader({ Icon, title, count, children, id }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <IconTile Icon={Icon} />
      <h3 id={id} className="text-[18px] font-semibold tracking-[-0.01em] text-ink">
        {title}
      </h3>
      {count != null && <span className="rounded-full bg-frost px-2 py-0.5 text-caption font-semibold tabular-nums text-carbon">{count}</span>}
      {children && <div className="ml-auto flex items-center gap-2">{children}</div>}
    </div>
  )
}


/** Source chip: document icon, title, then freshness led by its own icon. */
export function SourceChip({ docId, section, tag, className = '' }) {
  const doc = documentById(docId)
  const f = freshnessOf(docId)
  const Fresh = f.stale ? Clock : CalendarDays
  return (
    <div className={`flex max-w-full items-center gap-3 rounded-2xl border border-frost bg-bone px-3 py-2.5 ${className}`}>
      <IconTile Icon={FileText} size="sm" className="!bg-bone" />
      <div className="min-w-0 flex-1">
        <div className="text-body-sm font-semibold text-ink">{doc.title}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-caption">
          <span className="whitespace-nowrap text-smoke">
            {doc.id}
            {section ? ` ${section}` : ''}
          </span>
          <span className={`inline-flex items-center gap-1 whitespace-nowrap font-medium ${f.stale ? 'text-status-caution' : 'text-smoke'}`}>
            <Fresh size={13} strokeWidth={2.25} aria-hidden="true" />
            <span>{f.note.replace('Last updated ', 'Updated ')}</span>
            {f.stale && <span className="sr-only">(stale source)</span>}
          </span>
        </div>
      </div>
      {tag && (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-frost bg-porcelain px-2 py-1 text-caption font-medium text-carbon">
          <ScanSearch size={14} aria-hidden="true" />
          {tag}
        </span>
      )}
    </div>
  )
}

export function Passage({ docId, section, passage, className = '' }) {
  return (
    <figure className={`rounded-2xl bg-bone p-4 ${className}`}>
      <blockquote className="text-body text-ink">“{passage}”</blockquote>
      <figcaption className="mt-3">
        <SourceChip docId={docId} section={section} className="bg-porcelain" />
      </figcaption>
    </figure>
  )
}
