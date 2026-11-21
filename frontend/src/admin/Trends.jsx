import { useEffect, useId, useRef, useState } from 'react'
import { TrendingDown, TrendingUp, Minus, CircleCheck, CircleAlert, FileWarning, FilePlus, Wand2, Clock, ArrowRight, ChevronDown, Sparkles, Activity } from 'lucide-react'
import { useStore } from '../state/store'
import { WEEKS, WINDOW_WEEKS } from '../fixtures'
import { overallStats, weeklySeries, topicTable, recommendations, direction, pct } from '../lib/metrics'
import { TONES, CLAIM_STATUS, topicIcon } from '../lib/status'
import { Eyebrow, Pill } from '../components/ui'
import { BACKEND, api } from '../lib/backend'

/**
 * Dashboard figures. Demo mode computes them from the fixtures in the
 * browser; backend mode reads the same computation from GET /api/metrics,
 * which works from the database (seeded history + decisions recorded there).
 */
function useDashboard(liveDecisions) {
  const [remote, setRemote] = useState(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (BACKEND) api.metrics().then(setRemote, () => setFailed(true))
  }, [liveDecisions.length])
  if (!BACKEND) {
    return { last: overallStats('last'), prev: overallStats('prev'), series: weeklySeries(), topics: topicTable(), recs: recommendations(liveDecisions) }
  }
  if (!remote) return { failed }
  return { last: remote.overall.last, prev: remote.overall.prev, series: remote.series, topics: remote.topics, recs: remote.recommendations }
}

const pct1 = (v) => `${(v * 100).toFixed(1)}%`

// Lower is better for every rate except accuracy.
const KPIS = [
  { id: 'accuracy', label: 'Claim accuracy', hint: 'Claims not unsupported or conflicting · 4-week average', fmt: pct1, better: 'up' },
  { id: 'unsupportedRate', label: 'Unsupported claims', hint: 'Claims with no supporting source · 4-week average', fmt: pct1, better: 'down' },
  { id: 'staleRate', label: 'Stale sources', hint: 'Claims resting on a superseded or overdue document · 4-week average', fmt: pct1, better: 'down' },
  { id: 'reviews', label: 'Sent to review', hint: 'Answers routed to a human reviewer · total, last 4 weeks', fmt: (v) => v.toLocaleString(), better: 'down', count: true },
]

const TREND = {
  improving: { label: 'Improving', tone: 'verified', Icon: TrendingDown },
  worsening: { label: 'Worsening', tone: 'unsupported', Icon: TrendingUp },
  flat: { label: 'No change', tone: 'unknown', Icon: Minus },
}

/** Direction and delta for one KPI, judged by which way is better for it. */
function kpiChange(k, last, prev) {
  const v = last[k.id]
  const p = prev[k.id]
  const d = k.count ? direction(p / prev.answers, v / last.answers, 0.005) : k.better === 'up' ? direction(-p, -v, 0.005) : direction(p, v, 0.005)
  const delta = k.count ? `${v - p >= 0 ? '+' : ''}${v - p}` : `${v - p >= 0 ? '+' : ''}${((v - p) * 100).toFixed(1)} pts`
  const Arrow = d.id === 'flat' ? Minus : v > p ? TrendingUp : TrendingDown
  return { v, p, trend: TREND[d.id], id: d.id, delta, Arrow }
}

/** One-phrase answer to "is it getting more reliable?", from the KPI directions. */
function verdictFor(changes) {
  const up = changes.filter((c) => c.id === 'improving').length
  const down = changes.filter((c) => c.id === 'worsening').length
  if (!up && !down) return 'Holding steady'
  if (up === down) return 'Mixed picture'
  if (up > down) return down ? 'Mostly improving' : 'More reliable'
  return up ? 'Mostly slipping' : 'Less reliable'
}

export default function Trends() {
  const { state } = useStore()
  const [metric, setMetric] = useState('accuracy')
  const { last, prev, series, topics, recs, failed } = useDashboard(state.liveDecisions)
  if (!last) {
    return <div className="mx-auto max-w-[1200px] px-6 py-6 text-body-sm text-smoke">{failed ? 'Could not load the dashboard. Is the backend running on port 8000?' : 'Loading dashboard…'}</div>
  }
  const kpi = KPIS.find((k) => k.id === metric)
  const changes = KPIS.map((k) => kpiChange(k, last, prev))
  const count = (id) => changes.filter((c) => c.id === id).length
  const [top, ...rest] = recs

  return (
    <div className="scroll-quiet h-full overflow-y-auto">
      <div className="mx-auto max-w-[1440px] space-y-5 px-4 py-5 lg:px-6 lg:py-6">
        {/* 1 · The answer, then the one thing to fix. */}
        <header className="tr-hero rise-in relative overflow-hidden rounded-3xl p-6 lg:p-8">
          <div className="relative grid gap-6 lg:grid-cols-[1.25fr_1fr] lg:items-center">
            <div>
              <Eyebrow>Is the agent getting more reliable?</Eyebrow>
              <h1 className="mt-2 text-heading font-semibold text-ink lg:text-[52px] lg:leading-[1.02] lg:tracking-[-1.8px]">{verdictFor(changes)}</h1>
              <div className="mt-4 flex flex-wrap gap-2">
                {count('improving') > 0 && <Pill Icon={CircleCheck} tone="verified" label={`${count('improving')} improving`} />}
                {count('worsening') > 0 && <Pill Icon={CircleAlert} tone="unsupported" label={`${count('worsening')} worsening`} />}
                {count('flat') > 0 && <Pill Icon={Minus} tone="unknown" label={`${count('flat')} unchanged`} />}
              </div>
              <p className="mt-4 text-body-sm text-smoke">
                <span className="font-medium text-carbon tabular-nums">{last.answers.toLocaleString()}</span> answers ·{' '}
                <span className="font-medium text-carbon tabular-nums">{last.claims.toLocaleString()}</span> claims · 7 Sep – 4 Oct 2026, vs the 4 weeks before · synthetic sample data
              </p>
            </div>
            {top && <FixFirst r={top} />}
          </div>
        </header>

        {/* 2 · Four numbers. Each one picks what the chart shows. */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4" role="tablist" aria-label="Choose a metric to chart">
          {KPIS.map((k, i) => (
            <KpiTile key={k.id} k={k} c={changes[i]} series={series} selected={metric === k.id} onSelect={() => setMetric(k.id)} delay={i * 60} />
          ))}
        </div>

        {/* 3 · The selected number over 12 weeks. */}
        <section className="glass rise-in rounded-3xl p-5 lg:p-6" style={{ animationDelay: '120ms' }} aria-labelledby="chart-title">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-xl bg-ocbc-red-tint text-ocbc-red" aria-hidden="true">
                <Activity size={17} />
              </span>
              <div>
                <h2 id="chart-title" className="text-body font-semibold text-ink" title={kpi.hint}>
                  {kpi.label}, weekly
                </h2>
                <p className="text-caption text-smoke">All topics · 12 weeks</p>
              </div>
            </div>
            <div className="flex items-center gap-4 text-caption text-smoke">
              <span className="inline-flex items-center gap-2">
                <span className="tr-window-swatch inline-block h-3 w-5 rounded-md" aria-hidden="true" /> Last 4 weeks
              </span>
              <span className="rounded-full bg-line/[0.05] px-3 py-1">
                Latest <b className="font-semibold text-ink tabular-nums">{kpi.fmt(series[series.length - 1][kpi.id])}</b>
              </span>
            </div>
          </div>
          <WeeklyChart series={series} metric={kpi} />
        </section>

        {/* 4 · Where it breaks, and what to do next. */}
        <div className="grid gap-5 xl:grid-cols-[1.1fr_1fr]">
          <TopicRisk topics={topics} />
          <section className="glass rise-in rounded-3xl p-5 lg:p-6" style={{ animationDelay: '200ms' }} aria-labelledby="recs-title">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="recs-title" className="text-body font-semibold text-ink">
                Next fixes
              </h2>
              <span className="text-caption text-smoke">by claims affected</span>
            </div>
            <ol className="mt-4 space-y-2.5">
              {rest.map((r) => (
                <Recommendation key={r.id} r={r} />
              ))}
            </ol>
          </section>
        </div>

        <SessionStrip />

        <p className="pb-2 text-center text-caption text-smoke">
          Synthetic figures from one fixture file · weeks of {WEEKS[0]} – {WEEKS[WEEKS.length - 1]} 2026 · “last 4 weeks” is the final {WINDOW_WEEKS}
        </p>
      </div>
    </div>
  )
}

const REC_ICON = { 'retire-document': FileWarning, 'review-document': Clock, 'add-source': FilePlus, 'tighten-prompt': Wand2 }
const REC_KIND = { 'retire-document': 'Outdated document', 'review-document': 'Document review', 'add-source': 'Missing source', 'tighten-prompt': 'Agent prompt' }

/** The top recommendation, lifted into the hero so the next action is the second thing you read. */
function FixFirst({ r }) {
  const Icon = REC_ICON[r.kind]
  return (
    <div className="tr-inset rounded-2xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="eyebrow inline-flex items-center gap-1.5 whitespace-nowrap text-ocbc-red">
          <Sparkles size={13} aria-hidden="true" /> Fix first
        </span>
        <span className="text-caption text-smoke">
          {REC_KIND[r.kind]} · {r.priority} priority
        </span>
      </div>
      <div className="mt-3 flex items-start gap-3">
        <span className="tr-icon grid size-10 shrink-0 place-items-center rounded-xl" aria-hidden="true">
          <Icon size={18} />
        </span>
        <div className="min-w-0">
          <div className="text-body font-semibold text-ink">{r.title}</div>
          <div className="mt-1 text-body-sm text-smoke">
            <b className="font-semibold text-ink tabular-nums">{r.affected.toLocaleString()}</b> {r.unit} affected
            {r.today > 0 && <span className="ml-2 rounded-full bg-line/[0.06] px-2 py-0.5 text-caption text-carbon">Updated by today’s review</span>}
          </div>
        </div>
      </div>
      <Why r={r} />
    </div>
  )
}

/** Detail and evidence, folded away until asked for. */
function WhyBody({ r }) {
  return (
    <>
      <p className="text-body-sm text-carbon">{r.detail}</p>
      <ul className="mt-2 space-y-1">
        {r.evidence.map((e) => (
          <li key={e} className="flex items-start gap-1.5 text-caption text-smoke">
            <ArrowRight size={12} className="mt-0.5 shrink-0 text-ash" aria-hidden="true" />
            {e}
          </li>
        ))}
      </ul>
    </>
  )
}

function Why({ r }) {
  return (
    <details className="tr-why group mt-3">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-full text-caption font-medium text-carbon hover:text-ink">
        Why <ChevronDown size={14} className="transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="mt-2">
        <WhyBody r={r} />
      </div>
    </details>
  )
}

/** One recommendation: the whole row opens to show why. */
function Recommendation({ r }) {
  const Icon = REC_ICON[r.kind]
  return (
    <li className={`tr-row rounded-2xl ${r.today ? 'tr-row-today' : ''}`}>
      <details className="tr-why group">
        <summary className="flex cursor-pointer list-none items-center gap-3 rounded-2xl p-4">
          <span className="tr-icon grid size-9 shrink-0 place-items-center rounded-xl" aria-hidden="true">
            <Icon size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-body-sm font-medium text-ink">{r.title}</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-caption text-smoke">
              <span>{REC_KIND[r.kind]}</span>
              <span aria-hidden="true">·</span>
              <span>{r.priority} priority</span>
              {r.today > 0 && <span className="rounded-full bg-line/[0.06] px-2 py-0.5 text-carbon">Updated by today’s review</span>}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-subheading font-semibold text-ink tabular-nums">{r.affected.toLocaleString()}</div>
            <div className="text-caption text-smoke">{r.unit}</div>
          </div>
          <ChevronDown size={16} className="shrink-0 text-ash transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="px-4 pb-4 pl-16">
          <WhyBody r={r} />
        </div>
      </details>
    </li>
  )
}

function KpiTile({ k, c, series, selected, onSelect, delay }) {
  const tone = TONES[c.trend.tone]
  return (
    <button
      role="tab"
      aria-selected={selected}
      title={k.hint}
      onClick={onSelect}
      className={`tr-tile rise-in group relative flex flex-col overflow-hidden rounded-2xl p-4 text-left lg:p-5 ${selected ? 'tr-tile-on' : ''}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-body-sm font-medium text-carbon">{k.label}</span>
        {selected && <span className="size-2 rounded-full bg-ocbc-red" aria-hidden="true" />}
      </div>
      <div className="mt-2 text-[32px] leading-none font-semibold tracking-[-1px] text-ink tabular-nums lg:text-[40px]">{k.fmt(c.v)}</div>
      <div className={`mt-3 inline-flex flex-wrap items-center gap-x-1.5 text-caption font-medium ${tone.text}`}>
        <c.Arrow size={14} strokeWidth={2.25} aria-hidden="true" />
        {c.trend.label}
        <span className="font-normal text-smoke tabular-nums">{c.delta}</span>
      </div>
      <TileSpark values={series.map((w) => w[k.id])} on={selected} />
    </button>
  )
}

/** Tile sparkline: the 12 weeks, the last 4 drawn stronger. */
function TileSpark({ values, on }) {
  const W = 200
  const H = 36
  const max = Math.max(...values)
  const min = Math.min(...values)
  const pts = values.map((v, i) => [(i * W) / (values.length - 1), 3 + (1 - (v - min) / (max - min || 1)) * (H - 6)])
  const cut = values.length - WINDOW_WEEKS - 1
  const line = (arr) => arr.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="mt-4 h-9 w-full" aria-hidden="true">
      <path d={line(pts.slice(0, cut + 1))} fill="none" strokeWidth="1.75" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: 'color-mix(in srgb, var(--color-ink) 28%, transparent)' }} />
      <path d={line(pts.slice(cut))} fill="none" strokeWidth="2.25" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: on ? 'var(--color-ocbc-red)' : 'var(--color-ink)' }} />
    </svg>
  )
}

/** Topics as stacked bars: unsupported, conflicting and stale share of claims. */
const SEGMENTS = [
  { id: 'unsupportedRate', status: 'unsupported', color: 'var(--color-status-unsupported)' },
  { id: 'conflictingRate', status: 'conflicting', color: 'color-mix(in srgb, var(--color-status-unsupported) 45%, var(--color-surface))' },
  { id: 'staleRate', status: 'stale', color: 'var(--color-status-caution)' },
]

function TopicRisk({ topics }) {
  const total = (t) => t.last.unsupportedRate + t.last.conflictingRate + t.last.staleRate
  return (
    <section className="glass rise-in rounded-3xl p-5 lg:p-6" style={{ animationDelay: '160ms' }} aria-labelledby="topics-title">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="topics-title" className="text-body font-semibold text-ink">
          Where it fails most
        </h2>
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-caption text-smoke" aria-label="Legend">
          {SEGMENTS.map((s) => {
            const st = CLAIM_STATUS[s.status]
            return (
              <li key={s.id} className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-full" style={{ background: s.color }} aria-hidden="true" />
                <st.Icon size={12} aria-hidden="true" />
                {st.label}
              </li>
            )
          })}
        </ul>
      </div>
      <ol className="mt-5 space-y-4">
        {topics.map((t, i) => {
          const tr = TREND[t.trend.id]
          const TIcon = topicIcon(t.id)
          const sum = total(t)
          const summary = SEGMENTS.map((s) => `${pct(t.last[s.id])} ${CLAIM_STATUS[s.status].label.toLowerCase()}`).join(', ')
          return (
            <li key={t.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1.5">
              <span className={`grid size-9 place-items-center rounded-xl ${i === 0 ? 'tr-icon' : 'bg-line/[0.05] text-carbon'}`} aria-hidden="true">
                <TIcon size={16} />
              </span>
              <div className="min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 text-body-sm font-medium text-ink">{t.name}</span>
                  <span className={`inline-flex shrink-0 items-center gap-1 text-caption font-medium ${TONES[tr.tone].text}`}>
                    <tr.Icon size={13} aria-hidden="true" />
                    {tr.label}
                  </span>
                </div>
                <div className="mt-1.5 flex h-2.5 overflow-hidden rounded-full bg-line/[0.06]" role="img" aria-label={`${t.name}: ${summary}`} title={summary}>
                  {SEGMENTS.map((s) => (
                    <span key={s.id} className="growx h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${t.last[s.id] * 100}%`, background: s.color, animationDelay: `${300 + i * 70}ms` }} />
                  ))}
                </div>
              </div>
              <div className="w-14 text-right">
                <div className="text-body font-semibold text-ink tabular-nums">{pct(sum)}</div>
                <div className="text-[11px] text-smoke tabular-nums">{t.last.answers.toLocaleString()} ans.</div>
              </div>
            </li>
          )
        })}
      </ol>
      <p className="mt-5 text-caption text-smoke">Share of claims flagged · last 4 weeks · hover a bar for the split</p>
    </section>
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
    <section aria-labelledby="session-title" className="glass-soft flex flex-wrap items-center gap-x-6 gap-y-3 rounded-3xl px-5 py-4 lg:px-6">
      <div className="mr-auto">
        <h2 id="session-title" className="text-body-sm font-semibold text-ink">
          This session
        </h2>
        <p className="text-caption text-smoke">{BACKEND ? 'Decisions saved by the backend' : 'This tab only · cleared on refresh'}</p>
      </div>
      <dl className="flex flex-wrap gap-x-6 gap-y-2">
        {items.map(([label, v]) => (
          <div key={label} className="flex items-baseline gap-2">
            <dd className="text-subheading font-semibold text-ink tabular-nums">{v}</dd>
            <dt className="text-caption text-smoke">{label}</dt>
          </div>
        ))}
      </dl>
    </section>
  )
}

/** Single-series weekly chart: soft red area under an ink line, crosshair tooltip. */
function WeeklyChart({ series, metric }) {
  const uid = useId().replace(/:/g, '')
  const [hover, setHover] = useState(null)
  // Draw at the real pixel width, so text stays 12px on a phone and labels thin out instead of shrinking.
  const box = useRef(null)
  const [W, setW] = useState(1000)
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))))
    ro.observe(box.current)
    return () => ro.disconnect()
  }, [])
  const H = W < 640 ? 220 : 280
  const pad = { l: 40, r: 8, t: 20, b: 32 }
  const values = series.map((w) => w[metric.id])
  const isCount = metric.count
  const step0 = isCount ? 20 : 0.02
  const max = Math.ceil((Math.max(...values) + (isCount ? 10 : 0.005)) / step0) * step0
  const min = isCount ? 0 : Math.max(0, Math.floor((Math.min(...values) - 0.005) / step0) * step0)
  const step = (W - pad.l - pad.r) / series.length
  const x = (i) => pad.l + step / 2 + i * step
  const y = (v) => pad.t + (1 - (v - min) / (max - min)) * (H - pad.t - pad.b)
  const base = H - pad.b
  const ticks = Array.from({ length: Math.round((max - min) / step0) + 1 }, (_, i) => min + i * step0)
  const fmtTick = (v) => (isCount ? Math.round(v) : `${Math.round(v * 100)}%`)
  const windowStart = x(series.length - WINDOW_WEEKS) - step / 2
  // Smooth line through the points (monotone-ish cubic), and the area under it.
  const pts = values.map((v, i) => [x(i), y(v)])
  const curve = pts.map((p, i) => {
    if (!i) return `M${p[0]},${p[1]}`
    const [px, py] = pts[i - 1]
    const mx = (px + p[0]) / 2
    return `C${mx},${py} ${mx},${p[1]} ${p[0]},${p[1]}`
  })
  const line = curve.join(' ')
  const area = `${line} L${pts[pts.length - 1][0]},${base} L${pts[0][0]},${base} Z`
  const barW = step * 0.46
  const lastI = values.length - 1
  const every = step < 46 ? 2 : 1

  return (
    <div ref={box} className="relative mt-5">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible" role="img" aria-label={`${metric.label} by week, ${series[0].label} to ${series[lastI].label}`} onMouseLeave={() => setHover(null)}>
        <defs>
          <linearGradient id={`a${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-ocbc-red)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--color-ocbc-red)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`b${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-ocbc-red)" stopOpacity="0.85" />
            <stop offset="100%" stopColor="var(--color-ocbc-red)" stopOpacity="0.25" />
          </linearGradient>
        </defs>
        <rect x={windowStart} y={pad.t - 8} width={W - pad.r - windowStart} height={base - pad.t + 8} rx="14" className="tr-window" />
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} strokeWidth="1" strokeDasharray="2 6" style={{ stroke: 'color-mix(in srgb, var(--color-line) 14%, transparent)' }} />
            <text x={pad.l - 10} y={y(t) + 4} textAnchor="end" fontSize="12" fill="var(--color-smoke)">
              {fmtTick(t)}
            </text>
          </g>
        ))}
        {series.map((w, i) => (
          (hover === i || (lastI - i) % every === 0) && <text key={w.label} x={x(i)} y={H - 8} textAnchor="middle" fontSize="12" fill={hover === i ? 'var(--color-ink)' : 'var(--color-smoke)'} fontWeight={hover === i ? 600 : 400}>
            {w.label}
          </text>
        ))}
        {isCount ? (
          values.map((v, i) => (
            <path key={i} d={roundedBar(x(i) - barW / 2, y(v), barW, base - y(v), 10)} fill={`url(#b${uid})`} opacity={hover == null || hover === i ? 1 : 0.45} style={{ transition: 'opacity 150ms' }} />
          ))
        ) : (
          <g key={metric.id} className="tr-draw">
            <path d={area} fill={`url(#a${uid})`} />
            <path d={line} fill="none" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" style={{ stroke: 'var(--color-ink)' }} />
          </g>
        )}
        {!isCount && (
          <g>
            <circle cx={pts[lastI][0]} cy={pts[lastI][1]} r="10" className="tr-pulse" fill="var(--color-ocbc-red)" />
            <circle cx={pts[lastI][0]} cy={pts[lastI][1]} r="5" fill="var(--color-ocbc-red)" stroke="var(--color-surface)" strokeWidth="2.5" />
          </g>
        )}
        {hover != null && (
          <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={base} strokeWidth="1" style={{ stroke: 'color-mix(in srgb, var(--color-line) 25%, transparent)' }} />
        )}
        {hover != null && !isCount && <circle cx={pts[hover][0]} cy={pts[hover][1]} r="5.5" fill="var(--color-ink)" stroke="var(--color-surface)" strokeWidth="2.5" />}
        {series.map((w, i) => (
          <rect key={i} x={x(i) - step / 2} y={pad.t} width={step} height={base - pad.t} fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
      </svg>
      {hover != null && (
        <div className="glass-strong pointer-events-none absolute top-0 z-10 rounded-xl px-3 py-2 text-caption" style={{ left: `${(x(hover) / W) * 100}%`, transform: `translateX(${hover > series.length / 2 ? '-110%' : '10%'})` }}>
          <div className="text-smoke">Week of {series[hover].label}</div>
          <div className="text-body font-semibold text-ink tabular-nums">{metric.fmt(values[hover])}</div>
          <div className="text-smoke tabular-nums">
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
