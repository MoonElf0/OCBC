import { useState } from 'react'
import { TrendingDown, TrendingUp, Minus, FileWarning, FilePlus, Wand2, Clock, ArrowRight } from 'lucide-react'
import { useStore } from '../state/store'
import { WEEKS, WINDOW_WEEKS } from '../fixtures'
import { overallStats, weeklySeries, topicTable, recommendations, direction, pct } from '../lib/metrics'
import { TONES } from '../lib/status'
import { Eyebrow } from '../components/ui'

// Lower is better for every rate except accuracy.
const KPIS = [
  { id: 'accuracy', label: 'Claim accuracy', hint: 'Claims not unsupported or conflicting', fmt: (v) => pct1(v), better: 'up' },
  { id: 'unsupportedRate', label: 'Unsupported-claim rate', hint: 'Claims with no supporting source', fmt: (v) => pct1(v), better: 'down' },
  { id: 'staleRate', label: 'Stale-source rate', hint: 'Claims resting on a superseded or overdue document', fmt: (v) => pct1(v), better: 'down' },
  { id: 'reviews', label: 'Review volume', hint: 'Answers sent to a human reviewer', fmt: (v) => v.toLocaleString(), better: 'down', count: true },
]

const pct1 = (v) => `${(v * 100).toFixed(1)}%`

const TREND = {
  improving: { label: 'Improving', tone: 'verified', Icon: TrendingDown },
  worsening: { label: 'Worsening', tone: 'unsupported', Icon: TrendingUp },
  flat: { label: 'No change', tone: 'unknown', Icon: Minus },
}

export default function Trends() {
  const { state } = useStore()
  const [metric, setMetric] = useState('accuracy')
  const last = overallStats('last')
  const prev = overallStats('prev')
  const series = weeklySeries()
  const topics = topicTable()
  const recs = recommendations(state.liveDecisions)
  const kpi = KPIS.find((k) => k.id === metric)

  return (
    <div className="scroll-quiet h-full overflow-y-auto">
      <div className="mx-auto max-w-[1560px] space-y-6 px-6 py-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Eyebrow>Trends · last 4 weeks vs the 4 before</Eyebrow>
            <h1 className="mt-2 text-heading font-medium text-ink">Is the agent getting more reliable?</h1>
            <p className="mt-2 max-w-[65ch] text-body-sm text-smoke">
              {last.answers.toLocaleString()} answers and {last.claims.toLocaleString()} claims scored in the last 4 weeks (7 Sep – 4 Oct 2026). The 12-week history is synthetic sample data; activity from this session is shown separately below and feeds the recommendations.
            </p>
          </div>
        </header>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" role="tablist" aria-label="Choose a metric to chart">
          {KPIS.map((k) => {
            const v = k.count ? last[k.id] : last[k.id]
            const p = k.count ? prev[k.id] : prev[k.id]
            const d = k.count ? direction(p / prev.answers, v / last.answers, 0.005) : k.better === 'up' ? direction(-p, -v, 0.005) : direction(p, v, 0.005)
            const tr = TREND[d.id]
            const delta = k.count ? `${v - p >= 0 ? '+' : ''}${v - p}` : `${v - p >= 0 ? '+' : ''}${((v - p) * 100).toFixed(1)} pts`
            const sel = metric === k.id
            return (
              <button key={k.id} role="tab" aria-selected={sel} onClick={() => setMetric(k.id)} className={`rounded-2xl border p-5 text-left transition-colors ${sel ? 'border-carbon bg-porcelain shadow-md' : 'border-frost bg-porcelain hover:border-ash'}`}>
                <div className="text-body-sm font-medium text-ink">{k.label}</div>
                <div className="text-caption text-smoke">{k.count ? 'Total, last 4 weeks' : '4-week average'}</div>
                <div className="mt-2 text-heading font-semibold text-ink tabular-nums">{k.fmt(v)}</div>
                <div className="mt-2 flex flex-wrap items-center gap-x-2 text-caption">
                  <span className={`inline-flex items-center gap-1 font-medium ${TONES[tr.tone].text}`}>
                    {(() => {
                      const Arrow = d.id === 'flat' ? Minus : v > p ? TrendingUp : TrendingDown
                      return <Arrow size={13} aria-hidden="true" />
                    })()}
                    {tr.label}
                  </span>
                  <span className="text-smoke">
                    {delta} vs prior 4 weeks{k.count ? ` (${pct1(v / last.answers)} of answers)` : ''}
                  </span>
                </div>
              </button>
            )
          })}
        </div>

        <section className="rounded-3xl border border-frost bg-porcelain p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <h2 className="text-subheading font-medium text-ink">{kpi.label}, weekly</h2>
              <p className="text-caption text-smoke">
                {kpi.hint} · all topics · 12 weeks · latest week ({series[series.length - 1].label}): <span className="font-medium text-ink">{kpi.fmt(series[series.length - 1][kpi.id])}</span>
              </p>
            </div>
            <span className="inline-flex items-center gap-2 text-caption text-smoke">
              <span className="inline-block h-3 w-6 rounded-xl border border-frost bg-bone" aria-hidden="true" /> Last 4 weeks
            </span>
          </div>
          <WeeklyChart series={series} metric={kpi} />
        </section>

        <div className="grid gap-6 xl:grid-cols-[1.15fr_1fr]">
          <section className="rounded-3xl border border-frost bg-porcelain p-6">
            <h2 className="text-subheading font-medium text-ink">Where it fails most</h2>
            <p className="text-caption text-smoke">Topics ranked by unsupported, conflicting and stale claims · last 4 weeks</p>
            <table className="mt-4 w-full text-left text-body-sm">
              <thead>
                <tr className="border-b border-frost text-caption text-smoke">
                  <th className="py-2 font-medium">Topic</th>
                  <th className="py-2 pl-3 text-right font-medium">Unsupported</th>
                  <th className="py-2 pl-3 text-right font-medium">Conflicting</th>
                  <th className="py-2 pl-3 text-right font-medium">Stale</th>
                  <th className="py-2 pl-4 font-medium">12 weeks</th>
                  <th className="py-2 font-medium">Trend</th>
                </tr>
              </thead>
              <tbody>
                {topics.map((t) => {
                  const tr = TREND[t.trend.id]
                  return (
                    <tr key={t.id} className="border-b border-frost last:border-0">
                      <td className="py-3">
                        <div className="font-medium text-ink">{t.name}</div>
                        <div className="text-caption text-smoke">{t.last.answers.toLocaleString()} answers</div>
                      </td>
                      <td className="py-3 pl-3 text-right tabular-nums text-ink">{pct(t.last.unsupportedRate)}</td>
                      <td className="py-3 pl-3 text-right tabular-nums text-ink">{pct(t.last.conflictingRate)}</td>
                      <td className="py-3 pl-3 text-right tabular-nums text-ink">{pct(t.last.staleRate)}</td>
                      <td className="py-3 pl-4">
                        <Sparkline values={t.series} label={`${t.name} failure rate over 12 weeks`} />
                      </td>
                      <td className="py-3">
                        <span className={`inline-flex items-center gap-1 text-caption font-medium ${TONES[tr.tone].text}`}>
                          <tr.Icon size={13} aria-hidden="true" />
                          <span className="text-carbon">{tr.label}</span>
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>

          <section className="rounded-3xl border border-frost bg-porcelain p-6">
            <h2 className="text-subheading font-medium text-ink">Recommendations</h2>
            <p className="text-caption text-smoke">Generated from reviewer decisions and the trend data · ranked by claims affected</p>
            <ol className="mt-4 space-y-3">
              {recs.map((r) => (
                <Recommendation key={r.id} r={r} />
              ))}
            </ol>
          </section>
        </div>

        <SessionStrip />

        <p className="pb-4 text-caption text-smoke">
          All figures are synthetic and computed from one fixture file. Twelve weeks from {WEEKS[0]} to the week of {WEEKS[WEEKS.length - 1]} 2026; “last 4 weeks” is the final {WINDOW_WEEKS}.
        </p>
      </div>
    </div>
  )
}

/** What this browser session added — kept apart from the synthetic history. */
function SessionStrip() {
  const { state } = useStore()
  const scored = state.messages.filter((m) => m.kind === 'answer' && m.result?.score != null)
  const flags = scored.reduce((t, m) => t + m.result.claims.filter((c) => c.status !== 'supported').length, 0)
  const routed = state.messages.filter((m) => m.routed).length
  const decided = state.liveDecisions.length
  const items = [
    ['Answers scored', scored.length],
    ['Claims flagged', flags],
    ['Sent to review', routed],
    ['Reviewer decisions', decided],
  ]
  return (
    <section aria-labelledby="session-title" className="rounded-3xl border border-frost bg-porcelain p-6">
      <h2 id="session-title" className="text-subheading font-medium text-ink">
        This session
      </h2>
      <p className="text-caption text-smoke">Activity in this browser tab. Reviewer decisions here update the recommendations above; nothing is saved after a refresh.</p>
      <dl className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
        {items.map(([label, v]) => (
          <div key={label} className="rounded-2xl bg-bone p-4">
            <dt className="text-caption text-carbon">{label}</dt>
            <dd className="mt-1 text-heading-sm font-semibold text-ink tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

const REC_ICON = { 'retire-document': FileWarning, 'review-document': Clock, 'add-source': FilePlus, 'tighten-prompt': Wand2 }
const REC_KIND = { 'retire-document': 'Outdated document', 'review-document': 'Document review', 'add-source': 'Missing source', 'tighten-prompt': 'Agent prompt' }

function Recommendation({ r }) {
  const Icon = REC_ICON[r.kind]
  return (
    <li className={`rounded-2xl border p-4 ${r.today ? 'border-carbon' : 'border-frost'}`}>
      <div className="flex items-start gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-bone text-carbon">
          <Icon size={16} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="eyebrow text-smoke">
              {REC_KIND[r.kind]} · {r.priority} priority
            </span>
            <span className="text-caption text-smoke">· {r.affected.toLocaleString()} {r.unit} affected</span>
            {r.today > 0 && <span className="eyebrow rounded-xl bg-bone px-2 py-0.5 text-[12px] text-carbon">Updated by today’s review</span>}
          </div>
          <div className="mt-1 text-body-sm font-medium text-ink">{r.title}</div>
          <p className="mt-1 text-body-sm text-smoke">{r.detail}</p>
          <ul className="mt-2 space-y-0.5">
            {r.evidence.map((e) => (
              <li key={e} className="flex items-start gap-1.5 text-caption text-carbon">
                <ArrowRight size={12} className="mt-0.5 shrink-0 text-ash" aria-hidden="true" />
                {e}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </li>
  )
}

/** Single-series weekly chart with a crosshair tooltip. One axis, recessive grid. */
function WeeklyChart({ series, metric }) {
  const [hover, setHover] = useState(null)
  const W = 1000
  const H = 260
  const pad = { l: 48, r: 36, t: 16, b: 30 }
  const values = series.map((w) => w[metric.id])
  const isCount = metric.count
  const step0 = isCount ? 20 : 0.02
  const max = Math.ceil((Math.max(...values) + (isCount ? 10 : 0.005)) / step0) * step0
  const min = isCount ? 0 : Math.max(0, Math.floor((Math.min(...values) - 0.005) / step0) * step0)
  const step = (W - pad.l - pad.r) / series.length
  const x = (i) => pad.l + step / 2 + i * step
  const y = (v) => pad.t + (1 - (v - min) / (max - min)) * (H - pad.t - pad.b)
  const ticks = Array.from({ length: Math.round((max - min) / step0) + 1 }, (_, i) => min + i * step0)
  const fmtTick = (v) => (isCount ? Math.round(v) : `${Math.round(v * 100)}%`)
  const windowStart = x(series.length - WINDOW_WEEKS) - step / 2
  const path = values.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ')
  const barW = step * 0.5

  return (
    <div className="relative mt-4">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${metric.label} by week, ${series[0].label} to ${series[series.length - 1].label}`} onMouseLeave={() => setHover(null)}>
        <rect x={windowStart} y={pad.t} width={W - pad.r - windowStart} height={H - pad.t - pad.b} rx="12" fill="var(--color-bone)" />
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--color-frost)" strokeWidth="1" />
            <text x={pad.l - 10} y={y(t) + 4} textAnchor="end" fontSize="12" fill="var(--color-smoke)">
              {fmtTick(t)}
            </text>
          </g>
        ))}
        {series.map((w, i) => (
          <text key={w.label} x={x(i)} y={H - 8} textAnchor="middle" fontSize="12" fill="var(--color-smoke)">
            {w.label}
          </text>
        ))}
        {isCount ? (
          values.map((v, i) => <path key={i} d={roundedBar(x(i) - barW / 2, y(v), barW, y(min) - y(v), 12)} fill={hover === i ? 'var(--color-ink)' : 'var(--color-carbon)'} opacity={hover == null || hover === i ? 1 : 0.55} />)
        ) : (
          <path d={path} fill="none" stroke="var(--color-ink)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        )}
        {!isCount && <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r="4" fill="var(--color-ink)" stroke="var(--color-porcelain)" strokeWidth="2" />}
        {hover != null && !isCount && (
          <>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="var(--color-ash)" strokeWidth="1" />
            <circle cx={x(hover)} cy={y(values[hover])} r="5" fill="var(--color-ink)" stroke="var(--color-porcelain)" strokeWidth="2" />
          </>
        )}
        {series.map((w, i) => (
          <rect key={i} x={x(i) - step / 2} y={pad.t} width={step} height={H - pad.t - pad.b} fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
      </svg>
      {hover != null && (
        <div className="pointer-events-none absolute top-0 rounded-xl border border-frost bg-porcelain px-3 py-2 text-caption shadow-md" style={{ left: `${(x(hover) / W) * 100}%`, transform: `translateX(${hover > series.length / 2 ? '-110%' : '10%'})` }}>
          <div className="font-medium text-ink">Week of {series[hover].label}</div>
          <div className="text-carbon">
            {metric.label}: <span className="font-medium tabular-nums">{metric.fmt(values[hover])}</span>
          </div>
          <div className="text-smoke">
            {series[hover].answers} answers · {series[hover].claims} claims
          </div>
        </div>
      )}
    </div>
  )
}

function roundedBar(x, y, w, h, r) {
  r = Math.min(r, h)
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`
}

function Sparkline({ values, label }) {
  const W = 96
  const H = 28
  const max = Math.max(...values)
  const min = Math.min(...values)
  const pts = values.map((v, i) => [2 + (i * (W - 6)) / (values.length - 1), 3 + (1 - (v - min) / (max - min || 1)) * (H - 6)])
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke="var(--color-carbon)" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.5" fill="var(--color-ink)" />
    </svg>
  )
}
