import { useEffect, useId, useState } from 'react'

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
 * Score ring. While checks run it shows six segments filling in, with a sweep
 * travelling round the track; once scored it draws one glowing arc to the score
 * in the band's tone, with a live end-cap and a tick dial behind it.
 */
export function ScoreRing({ score, tone, checks, size = 168, stroke = 14, children }) {
  const uid = useId().replace(/:/g, '')
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const mid = size / 2
  const [drawn, setDrawn] = useState(0)
  useEffect(() => {
    const t = requestAnimationFrame(() => setDrawn(score ?? 0))
    return () => cancelAnimationFrame(t)
  }, [score])

  const segGap = 10
  const seg = c / 6 - segGap
  const hex = TONE_HEX[tone] ?? 'var(--color-carbon)'
  const ease = 'cubic-bezier(0.16, 1, 0.3, 1)'
  const tickR = r - stroke / 2 - 7
  const ticks = Array.from({ length: 60 }, (_, i) => i)

  return (
    <div className="ring-wrap relative shrink-0" style={{ width: size, height: size, '--ring-tone': hex }}>
      {/* Soft halo in the band's tone: the ring's light source. */}
      {score != null && <div className="ring-halo pointer-events-none absolute inset-[8%] rounded-full" aria-hidden="true" />}
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="relative -rotate-90 overflow-visible" aria-hidden="true">
        <defs>
          <linearGradient id={`g${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" style={{ stopColor: `color-mix(in srgb, ${hex} 45%, transparent)` }} />
            <stop offset="100%" style={{ stopColor: hex }} />
          </linearGradient>
        </defs>
        {/* Tick dial: quiet scale marks inside the track. */}
        {ticks.map((i) => {
          const ang = (i / 60) * 2 * Math.PI
          const long = i % 5 === 0
          const r1 = tickR - (long ? 5 : 3)
          const lit = score != null && i / 60 < drawn / 100
          return (
            <line
              key={i}
              x1={mid + tickR * Math.cos(ang)}
              y1={mid + tickR * Math.sin(ang)}
              x2={mid + r1 * Math.cos(ang)}
              y2={mid + r1 * Math.sin(ang)}
              strokeWidth={long ? 1.5 : 1}
              strokeLinecap="round"
              style={{ stroke: lit ? `color-mix(in srgb, ${hex} 55%, transparent)` : 'color-mix(in srgb, var(--color-line) 12%, transparent)', transition: `stroke 400ms ${i * 12}ms` }}
            />
          )
        })}
        <circle cx={mid} cy={mid} r={r} fill="none" strokeWidth={stroke} style={{ stroke: 'color-mix(in srgb, var(--color-line) 7%, transparent)' }} />
        {checks ? (
          <>
            {checks.map((k, i) => (
              <circle
                key={i}
                cx={mid}
                cy={mid}
                r={r}
                fill="none"
                strokeLinecap="round"
                strokeWidth={stroke}
                strokeDasharray={`${seg} ${c - seg}`}
                strokeDashoffset={-(i * (c / 6)) - segGap / 2}
                className={k.status === 'running' ? 'animate-pulse' : ''}
                style={{
                  stroke: k.status === 'queued' ? 'transparent' : k.status === 'running' ? 'color-mix(in srgb, var(--color-line) 16%, transparent)' : 'var(--color-carbon)',
                  opacity: k.status === 'running' ? 1 : 0.85,
                  transition: 'stroke 300ms ease',
                }}
              />
            ))}
            {/* Scanning sweep while the checks run. */}
            <g className="ring-scan" style={{ transformOrigin: `${mid}px ${mid}px` }}>
              <circle cx={mid} cy={mid} r={r} fill="none" strokeLinecap="round" strokeWidth={stroke * 0.35} strokeDasharray={`${c * 0.08} ${c}`} style={{ stroke: 'color-mix(in srgb, var(--color-ink) 45%, transparent)' }} />
            </g>
          </>
        ) : (
          score != null && (
            <>
              <circle
                cx={mid}
                cy={mid}
                r={r}
                fill="none"
                strokeLinecap="round"
                strokeWidth={stroke}
                stroke={`url(#g${uid})`}
                strokeDasharray={c}
                strokeDashoffset={c * (1 - drawn / 100)}
                className="ring-arc"
                style={{ transition: `stroke-dashoffset 1100ms ${ease}` }}
              />
              {/* End-cap that rides the arc and keeps breathing once it lands. */}
              <g style={{ transform: `rotate(${(drawn / 100) * 360}deg)`, transformOrigin: `${mid}px ${mid}px`, transition: `transform 1100ms ${ease}` }}>
                <circle cx={mid + r} cy={mid} r={stroke * 0.95} className="ring-cap-pulse" style={{ fill: hex }} />
                <circle cx={mid + r} cy={mid} r={stroke / 2 - 1.5} style={{ fill: 'var(--color-porcelain)', stroke: hex, strokeWidth: 2.5 }} />
              </g>
            </>
          )
        )}
      </svg>
      {/* Inner glass disc: lifts the number off the dial. */}
      <div className="ring-core absolute grid place-items-center rounded-full text-center" style={{ inset: stroke + 14 }}>
        {children}
      </div>
    </div>
  )
}

/** Small inline ring for the Verify button. */
export function MiniRing({ value, tone, size = 22, stroke = 3, spinning }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={`-rotate-90 shrink-0 ${spinning ? 'spin' : ''}`} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} style={{ stroke: 'color-mix(in srgb, currentColor 18%, transparent)' }} />
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
      <div className="relative flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-line/5">
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
