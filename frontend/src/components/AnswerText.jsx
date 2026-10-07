import { CLAIM_STATUS, TONES } from '../lib/status'

/**
 * Renders the answer string with claim highlights placed by character
 * offset. The original text is never modified — spans are cut from it.
 */
export default function AnswerText({ text, shown = text.length, claims = [], activeClaimId, onClaim, streaming }) {
  const visible = text.slice(0, shown)
  const sorted = [...claims].sort((a, b) => a.start - b.start)
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
        const s = CLAIM_STATUS[p.claim.status]
        const t = TONES[s.tone]
        const subtle = p.claim.status === 'supported'
        return (
          <span
            key={i}
            {...(onClaim
              ? {
                  role: 'button',
                  tabIndex: 0,
                  'aria-label': `${s.label} claim: ${p.text}. Open details.`,
                  onClick: () => onClaim(p.claim),
                  onKeyDown: (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onClaim(p.claim)),
                }
              : { title: `${s.label} claim` })}
            aria-current={activeClaimId === p.claim.id ? 'true' : undefined}
            className={`claim claim-reveal ${onClaim ? '' : 'claim-static'} ${subtle ? 'claim-subtle' : t.surface} ${t.border} ${t.text}`}
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <s.Icon size={12} strokeWidth={2.5} aria-hidden="true" className="mr-1 inline-block -translate-y-px align-middle" />
            <span className="text-ink">{p.text}</span>
          </span>
        )
      })}
    </p>
  )
}
