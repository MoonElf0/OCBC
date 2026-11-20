import { useEffect, useState } from 'react'

export const TONE_HEX = {
  verified: 'var(--color-status-verified)',
  caution: 'var(--color-status-caution)',
  unsupported: 'var(--color-status-unsupported)',
  unknown: 'var(--color-status-unknown)',
}

/** Eases a number from 0 to target once, for the score reveal. */
export function useCountUp(target, ms = 900) {
  const [v, setV] = useState(0)
  useEffect(() => {
    if (target == null) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return setV(target)
    let raf
    const t0 = performance.now()
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / ms)
      setV(Math.round(target * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, ms])
  return v
}

/**
 * Score ring. While checks run it shows six segments filling in; once scored
 * it shows one continuous arc to the score, in the band's tone.
 */
export function ScoreRing({ score, tone, checks, size = 168, stroke = 14, children }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const [drawn, setDrawn] = useState(0)
  useEffect(() => {
    const t = requestAnimationFrame(() => setDrawn(score ?? 0))
    return () => cancelAnimationFrame(t)
  }, [score])

  const segGap = 10
  const seg = c / 6 - segGap

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(0 0 0 / 0.06)" strokeWidth={stroke} />
        {checks
          ? checks.map((k, i) => (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                strokeLinecap="round"
                strokeWidth={stroke}
                stroke={k.status === 'queued' ? 'transparent' : k.status === 'running' ? 'rgb(0 0 0 / 0.14)' : 'var(--color-carbon)'}
                strokeDasharray={`${seg} ${c - seg}`}
                strokeDashoffset={-(i * (c / 6)) - segGap / 2}
                className={k.status === 'running' ? 'animate-pulse' : ''}
                style={{ transition: 'stroke 300ms ease' }}
              />
            ))
          : score != null && (
              <circle
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                strokeLinecap="round"
                strokeWidth={stroke}
                stroke={TONE_HEX[tone]}
                strokeDasharray={c}
                strokeDashoffset={c * (1 - drawn / 100)}
                style={{ transition: 'stroke-dashoffset 1000ms cubic-bezier(0.16, 1, 0.3, 1)' }}
              />
            )}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  )
}

/** Small inline ring for the Verify button. */
export function MiniRing({ value, tone, size = 22, stroke = 3, spinning }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={`-rotate-90 shrink-0 ${spinning ? 'spin' : ''}`} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(0 0 0 / 0.1)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={TONE_HEX[tone] ?? 'currentColor'}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - (value ?? 0) / 100)}
        style={{ transition: 'stroke-dashoffset 500ms ease' }}
      />
    </svg>
  )
}

/** How the score is built: claim points plus check points, on one 0-100 track. */
export function CompositionBar({ claimPts, checkPts, score, capNote }) {
  const raw = claimPts + checkPts
  return (
    <div>
      <div className="relative flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-black/5">
        <span className="h-full rounded-l-full bg-ink transition-[width] duration-700" style={{ width: `${claimPts}%` }} />
        <span className="h-full bg-ash transition-[width] duration-700" style={{ width: `${checkPts}%` }} />
        {capNote && <span className="absolute inset-y-0 bg-[repeating-linear-gradient(135deg,rgb(255_255_255/0.85)_0_3px,transparent_3px_6px)]" style={{ left: `${score}%`, width: `${raw - score}%` }} aria-hidden="true" />}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-carbon">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-ink" aria-hidden="true" /> Claims <b className="font-semibold tabular-nums">{claimPts}</b>
          <span className="text-smoke">/60</span>
        </span>
        <span className="text-smoke">+</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-ash" aria-hidden="true" /> Checks <b className="font-semibold tabular-nums">{checkPts}</b>
          <span className="text-smoke">/40</span>
        </span>
        <span className="text-smoke">=</span>
        {capNote ? (
          <span>
            <b className="font-semibold tabular-nums">{raw}</b>, capped at <b className="font-semibold text-ink tabular-nums">{score}</b> <span className="text-smoke">({capNote})</span>
          </span>
        ) : (
          <b className="font-semibold text-ink tabular-nums">{score}</b>
        )}
      </div>
    </div>
  )
}
