import { CLAIM_STATUS, TONES, severityFor } from '../lib/status'

/**
 * Renders the answer string with claim highlights placed by character
 * offset. The original text is never modified: spans are cut from it.
 * With `highlight` off, claims render as plain text.
 */
/**
 * `vocab="status"` labels flags with their claim status (Conflicting, Stale source…)
 * instead of the employee-facing severity words; `numbers` maps claim id → badge number.
 */
export default function AnswerText({ text, shown = text.length, claims = [], activeClaimId, pulseId, onClaim, streaming, highlight = true, idPrefix, vocab = 'severity', numbers }) {
  const visible = text.slice(0, shown)
  const sorted = highlight ? [...claims].sort((a, b) => a.start - b.start) : []
  const parts = []
  let cursor = 0
  for (const c of sorted) {
    if (c.start >= visible.length) break
    if (c.start > cursor) parts.push({ text: visible.slice(cursor, c.start) })
    parts.push({ text: visible.slice(c.start, Math.min(c.end, visible.length)), claim: c })
    cursor = Math.min(c.end, visible.length)
  }
  if (cursor < visible.length) parts.push({ text: visible.slice(cursor) })

  return (
    <p className={`text-body text-ink ${streaming ? 'caret' : ''}`}>
      {parts.map((p, i) => {
        if (!p.claim) return <span key={i}>{p.text}</span>
        const sev = severityFor(p.claim.status)
        const s = vocab === 'status' ? CLAIM_STATUS[p.claim.status] : { ...CLAIM_STATUS[p.claim.status], Icon: sev.Icon, label: sev.label }
        const t = TONES[sev.tone]
        // Supported claims stay quiet: plain text with a small check, so flags stand out.
        if (p.claim.status === 'supported') {
          return (
            <span key={i} id={idPrefix ? `${idPrefix}-${p.claim.id}` : undefined} className={`claim-ok ${pulseId === p.claim.id ? 'claim-ok-active' : ''}`} onClick={onClaim ? () => onClaim(p.claim) : undefined}>
              {p.text}
              <s.Icon size={13} strokeWidth={2.5} aria-label="Correct" className="ml-0.5 inline-block -translate-y-px align-middle text-status-verified" />
            </span>
          )
        }
        return (
          <span
            key={`${i}-${pulseId === p.claim.id ? 'p' : ''}`}
            id={idPrefix ? `${idPrefix}-${p.claim.id}` : undefined}
            {...(onClaim
              ? {
                  role: 'button',
                  tabIndex: 0,
                  'aria-label': `${s.label} claim: ${p.text}. ${vocab === 'status' ? 'Show its evidence.' : 'Show in verification panel.'}`,
                  onClick: () => onClaim(p.claim),
                  onKeyDown: (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onClaim(p.claim)),
                }
              : { title: `${s.label} claim` })}
            aria-current={activeClaimId === p.claim.id ? 'true' : undefined}
            className={`claim claim-reveal ${pulseId === p.claim.id ? 'claim-pulse' : ''} ${onClaim ? '' : 'claim-static'} ${t.surface} ${t.border} ${t.text}`}
            style={{ animationDelay: `${i * 70}ms` }}
          >
            {numbers?.[p.claim.id] != null && (
              <span className="mr-1 inline-grid size-[18px] -translate-y-px place-items-center rounded-full bg-ink align-middle text-[11px] leading-none font-semibold text-white tabular-nums" aria-hidden="true">
                {numbers[p.claim.id]}
              </span>
            )}
            <s.Icon size={14} strokeWidth={2.5} aria-hidden="true" className="mr-1 inline-block -translate-y-px align-middle" />
            <span className="text-ink">{p.text}</span>
          </span>
        )
      })}
    </p>
  )
}
