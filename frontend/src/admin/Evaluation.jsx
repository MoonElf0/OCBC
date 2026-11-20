import { useEffect, useState } from 'react'
import { FlaskConical, LoaderCircle, Play, CircleCheck, CircleDashed, Cpu, ListChecks } from 'lucide-react'
import { BACKEND, api } from '../lib/backend'
import { CLAIM_STATUS, CHECK_STATUS, TONES } from '../lib/status'
import { Eyebrow, Pill, PrimaryButton, ScoreBadge } from '../components/ui'
import { formatWhen } from '../components/Thread'
import { DEMO_TODAY } from '../fixtures'

/**
 * Evaluation. Runs the verification pipeline over labelled synthetic cases
 * (backend/data/eval_cases.json) and shows what it measured: every rate with
 * its numerator, denominator and definition, computed from the predictions
 * recorded for that run. No figure here is typed in.
 */
const SPLITS = [
  { id: 'heldout', label: 'Held-out', desc: 'Written after the verifier was built; not used to tune it.' },
  { id: 'tuning', label: 'Tuning', desc: 'Used while building the verifier. Expect these to look better.' },
  { id: 'all', label: 'All cases', desc: 'Both splits together.' },
]

const LABEL = {
  correct: { label: 'Correct', tone: 'verified', Icon: CircleCheck },
  incorrect: { label: 'Incorrect', tone: 'unsupported', Icon: CLAIM_STATUS.conflicting.Icon },
  'no-evidence': { label: 'No policy covers it', tone: 'unknown', Icon: CLAIM_STATUS.insufficient.Icon },
}

const pct = (r) => (r == null ? '—' : `${Math.round(r * 100)}%`)

export default function Evaluation() {
  const [info, setInfo] = useState(null)
  const [failed, setFailed] = useState(false)
  const [split, setSplit] = useState('heldout')
  const [running, setRunning] = useState(false)
  const [err, setErr] = useState(null)

  useEffect(() => {
    if (BACKEND) api.evalInfo().then(setInfo, () => setFailed(true))
  }, [])

  if (!BACKEND) {
    return (
      <div className="mx-auto max-w-[1560px] px-6 py-6">
        <Eyebrow>Evaluation</Eyebrow>
        <h1 className="mt-2 text-heading font-medium text-ink">How well does Assessment AI catch wrong answers?</h1>
        <p className="mt-3 max-w-[65ch] text-body-sm text-carbon">
          Measuring the verifier means running its pipeline over labelled cases, which this offline demo does not have. Start backend mode with <code className="rounded-xl bg-bone px-1.5 py-0.5 text-caption">npm run dev:backend</code>. The demo’s own tests (<code className="rounded-xl bg-bone px-1.5 py-0.5 text-caption">npm test</code>) check that the scripted fixtures are consistent; they do not measure accuracy.
        </p>
      </div>
    )
  }
  if (!info) return <div className="mx-auto max-w-[1560px] px-6 py-6 text-body-sm text-smoke">{failed ? 'Could not load the evaluation. Is the backend running on port 8000?' : 'Loading evaluation…'}</div>

  const run = info.runs.find((r) => r.split === split)
  const defs = Object.fromEntries(info.definitions.map((d) => [d.id, d]))
  const go = async () => {
    setRunning(true)
    setErr(null)
    try {
      const r = await api.evalRun(split)
      setInfo({ ...info, runs: [r, ...info.runs] })
    } catch (e) {
      setErr(e.message)
    }
    setRunning(false)
  }

  return (
    <div className="scroll-quiet h-full overflow-y-auto">
      <div className="mx-auto max-w-[1560px] space-y-6 px-6 py-6">
        <header>
          <Eyebrow>Evaluation · {info.dataset.cases} labelled synthetic cases</Eyebrow>
          <h1 className="mt-2 text-heading font-medium text-ink">How well does Assessment AI catch wrong answers?</h1>
          <p className="mt-2 max-w-[75ch] text-body-sm text-smoke">
            Each case is a question, an AI answer and its citations, with every claim labelled by hand as correct, incorrect, or not covered by any policy. A run sends every case through the same pipeline that checks submitted answers and records what it predicted. The figures below are counted from those records.
          </p>
        </header>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-3xl border border-frost bg-porcelain p-6">
            <h2 className="flex items-center gap-2 text-subheading font-medium text-ink">
              <ListChecks size={20} className="text-carbon" aria-hidden="true" /> Fixture tests
            </h2>
            <p className="mt-1 text-body-sm text-carbon">
              <code className="rounded-xl bg-bone px-1.5 py-0.5 text-caption">npm test</code> and <code className="rounded-xl bg-bone px-1.5 py-0.5 text-caption">pytest</code> check that the scripted demo is consistent: claim offsets, quoted passages, dashboard numbers, review rules. They prove the software does what it was written to do. They are not a measure of how often the verifier is right.
            </p>
          </div>
          <div className="rounded-3xl border border-frost bg-porcelain p-6">
            <h2 className="flex items-center gap-2 text-subheading font-medium text-ink">
              <Cpu size={20} className="text-carbon" aria-hidden="true" /> Evaluation runs
            </h2>
            <p className="mt-1 text-body-sm text-carbon">
              {info.model.available
                ? `A model is configured (${info.model.provider} · ${info.model.model}), so runs are model-based: its verdicts are included.`
                : 'No model is configured, so runs are rule-based: figures, policy versions, citations and missing evidence are checked by code. Claims whose meaning needs a model are counted as “not checked”, never as right or wrong.'}
            </p>
          </div>
        </section>

        <section className="rounded-3xl border border-frost bg-porcelain p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="flex gap-1 rounded-full bg-bone p-1" role="tablist" aria-label="Which cases">
                {SPLITS.map((s) => (
                  <button key={s.id} role="tab" aria-selected={split === s.id} onClick={() => setSplit(s.id)} className={`rounded-full px-4 py-1.5 text-body-sm font-medium transition-colors ${split === s.id ? 'bg-porcelain text-ink shadow-md' : 'text-smoke hover:text-ink'}`}>
                    {s.label} <span className="tabular-nums text-smoke">{s.id === 'all' ? info.dataset.cases : info.dataset.splits[s.id]}</span>
                  </button>
                ))}
              </div>
              <p className="mt-2 text-caption text-smoke">{SPLITS.find((s) => s.id === split).desc}</p>
            </div>
            <div className="text-right">
              <PrimaryButton onClick={go} disabled={running}>
                {running ? <LoaderCircle size={16} className="spin" /> : <Play size={16} />} Run evaluation
              </PrimaryButton>
              {err && <p className="mt-1 text-caption text-smoke">{err}</p>}
            </div>
          </div>

          {!run ? (
            <p className="mt-6 rounded-2xl bg-bone p-4 text-body-sm text-carbon">No run of this split yet. Run it to see how the verifier does.</p>
          ) : (
            <RunResult run={run} defs={defs} />
          )}
        </section>

        {info.runs.length > 0 && (
          <section className="rounded-3xl border border-frost bg-porcelain p-6">
            <h2 className="text-subheading font-medium text-ink">Earlier runs</h2>
            <p className="text-caption text-smoke">Every run is kept, so a change to the verifier can be compared with the runs before it.</p>
            <table className="mt-4 w-full text-left text-body-sm">
              <thead>
                <tr className="border-b border-frost text-caption text-smoke">
                  <th className="py-2 font-medium">When</th>
                  <th className="py-2 font-medium">Cases</th>
                  <th className="py-2 font-medium">Mode</th>
                  <th className="py-2 text-right font-medium">Detection</th>
                  <th className="py-2 text-right font-medium">False positives</th>
                  <th className="py-2 text-right font-medium">Citations</th>
                </tr>
              </thead>
              <tbody>
                {info.runs.map((r) => (
                  <tr key={r.id} className="border-b border-frost last:border-0">
                    <td className="py-2 text-carbon">{formatWhen(r.createdAt)}</td>
                    <td className="py-2 text-carbon">{SPLITS.find((s) => s.id === r.split)?.label} · {r.cases.length}</td>
                    <td className="py-2"><ModePill run={r} /></td>
                    <Frac v={r.summary.detection} />
                    <Frac v={r.summary.falsePositive} />
                    <Frac v={r.summary.citation} />
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>
    </div>
  )
}

function Frac({ v }) {
  return (
    <td className="py-2 text-right tabular-nums text-ink">
      {pct(v.rate)} <span className="text-caption text-smoke">({v.numerator}/{v.denominator})</span>
    </td>
  )
}

function ModePill({ run }) {
  return run.mode === 'model-based' ? (
    <Pill Icon={Cpu} label={`Model-based · ${run.provider.model}`} tone="verified" />
  ) : (
    <Pill Icon={CircleDashed} label="Rule-based · no model" tone="unknown" />
  )
}

const TILES = ['detection', 'falsePositive', 'confirmed', 'citation', 'abstention', 'routing', 'injection']

function RunResult({ run, defs }) {
  const s = run.summary
  return (
    <div className="mt-6 space-y-6">
      <div className="flex flex-wrap items-center gap-2 text-caption text-smoke">
        <ModePill run={run} />
        <span>
          {run.cases.length} cases · run {formatWhen(run.createdAt)} · {s.unchecked.numerator} of {s.unchecked.denominator} labelled claims not checked by a model
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {TILES.map((id) => {
          const v = s[id]
          return (
            <div key={id} className="rounded-2xl border border-frost bg-porcelain p-5">
              <div className="text-body-sm font-medium text-ink">{defs[id].label}</div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-heading font-semibold tabular-nums text-ink">{pct(v.rate)}</span>
                <span className="text-body-sm tabular-nums text-carbon">
                  {v.numerator} / {v.denominator}
                </span>
              </div>
              <p className="mt-2 text-caption text-smoke">{defs[id].definition}</p>
            </div>
          )
        })}
        <div className="rounded-2xl border border-frost bg-porcelain p-5">
          <div className="text-body-sm font-medium text-ink">{defs.latency.label}</div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-heading font-semibold tabular-nums text-ink">{s.latency.medianMs} ms</span>
            <span className="text-body-sm text-carbon">median · slowest {s.latency.maxMs} ms</span>
          </div>
          <p className="mt-2 text-caption text-smoke">{defs.latency.definition}</p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_2fr]">
        <div>
          <h3 className="text-body font-semibold text-ink">By category</h3>
          <p className="text-caption text-smoke">Claims where the verdict matched the label: incorrect flagged, correct confirmed, uncovered abstained.</p>
          <table className="mt-3 w-full text-left text-body-sm">
            <thead>
              <tr className="border-b border-frost text-caption text-smoke">
                <th className="py-2 font-medium">Category</th>
                <th className="py-2 text-right font-medium">Cases</th>
                <th className="py-2 text-right font-medium">Matched</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(s.byCategory).map(([k, b]) => (
                <tr key={k} className="border-b border-frost last:border-0">
                  <td className="py-2 text-ink">{k.replace(/-/g, ' ')}</td>
                  <td className="py-2 text-right tabular-nums text-carbon">{b.cases}</td>
                  <td className="py-2 text-right tabular-nums text-carbon">
                    {b.agree} / {b.claims}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <h3 className="text-body font-semibold text-ink">Every case</h3>
          <p className="text-caption text-smoke">The label a person gave each claim, then what Assessment AI said.</p>
          <div className="scroll-quiet mt-3 max-h-[520px] overflow-y-auto rounded-2xl border border-frost">
            <table className="w-full text-left text-body-sm">
              <thead className="sticky top-0 bg-porcelain">
                <tr className="border-b border-frost text-caption text-smoke">
                  <th className="px-3 py-2 font-medium">Case</th>
                  <th className="px-3 py-2 font-medium">Claims: label → verdict</th>
                  <th className="px-3 py-2 font-medium">Citation</th>
                  <th className="px-3 py-2 font-medium">Index</th>
                </tr>
              </thead>
              <tbody>
                {run.cases.map((c) => (
                  <tr key={c.id} className="border-b border-frost align-top last:border-0">
                    <td className="px-3 py-2.5">
                      <div className="font-semibold text-ink">{c.id}</div>
                      <div className="text-caption text-smoke">{c.category.replace(/-/g, ' ')}</div>
                      {c.asOf !== DEMO_TODAY && <div className="text-caption text-smoke">policy date {c.asOf}</div>}
                    </td>
                    <td className="px-3 py-2.5">
                      <ul className="space-y-1.5">
                        {c.claims.map((x, i) => {
                          const l = LABEL[x.label]
                          const p = CLAIM_STATUS[x.predicted]
                          return (
                            <li key={i}>
                              <p className="text-caption text-carbon">“{x.quote}”</p>
                              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-caption">
                                <span className={`inline-flex items-center gap-1 font-medium ${TONES[l.tone].text}`}>
                                  <l.Icon size={12} aria-hidden="true" /> <span className="text-carbon">{l.label}</span>
                                </span>
                                <span className="text-smoke">→</span>
                                {p ? <Pill Icon={p.Icon} label={p.label} tone={p.tone} /> : <span className="text-smoke">Not extracted</span>}
                                {x.source && <span className="text-smoke">{x.source}</span>}
                              </div>
                            </li>
                          )
                        })}
                      </ul>
                    </td>
                    <td className="px-3 py-2.5 text-caption">
                      <div className="text-carbon">expected {c.citationLabel}</div>
                      <Pill Icon={CHECK_STATUS[c.citationPredicted].Icon} label={CHECK_STATUS[c.citationPredicted].label} tone={CHECK_STATUS[c.citationPredicted].tone} />
                    </td>
                    <td className="px-3 py-2.5">
                      <ScoreBadge score={c.index} />
                      <div className="mt-1 text-caption text-smoke">{c.routed ? 'Sent to review' : 'No review'}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <p className="flex items-center gap-1.5 text-caption text-smoke">
        <FlaskConical size={13} aria-hidden="true" /> Synthetic cases written for this prototype. Small numbers: one case moves a rate by several points. These are not production accuracy figures.
      </p>
    </div>
  )
}
