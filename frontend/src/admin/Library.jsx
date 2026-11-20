import { useEffect, useState } from 'react'
import { CircleCheck, History, FilePen, Clock, FilePlus, RefreshCw, LoaderCircle, ArrowRight } from 'lucide-react'
import { useStore } from '../state/store'
import { DOCUMENTS, TOPICS, DEMO_TODAY } from '../fixtures'
import { BACKEND, api } from '../lib/backend'
import { freshnessOf, formatDate } from '../lib/freshness'
import { Eyebrow, Pill, PrimaryButton, GhostButton } from '../components/ui'

/**
 * Knowledge Library. Policy documents as versions: approved text is never
 * edited; a change is a new draft that replaces the version in force only
 * when it is approved. Backend mode reads and writes GET/POST /api/library;
 * demo mode shows the fixture library read-only.
 */
const VERSION_STATUS = {
  inForce: { label: 'Approved · in force', tone: 'verified', Icon: CircleCheck },
  overdue: { label: 'In force · review overdue', tone: 'caution', Icon: Clock },
  superseded: { label: 'Superseded', tone: 'unknown', Icon: History },
  draft: { label: 'Draft', tone: 'unknown', Icon: FilePen },
  pending: { label: 'Approved · not yet effective', tone: 'unknown', Icon: Clock },
}

function statusOf(v) {
  if (v.status === 'draft') return VERSION_STATUS.draft
  if (v.status === 'superseded' || v.state === 'superseded') return VERSION_STATUS.superseded
  if (v.state === 'overdue') return VERSION_STATUS.overdue
  if (v.inForce) return VERSION_STATUS.inForce
  return VERSION_STATUS.pending
}

/** Demo mode: one approved version per fixture document. */
function demoLibrary() {
  return {
    asOf: DEMO_TODAY,
    documents: Object.values(DOCUMENTS).map((d) => {
      const f = freshnessOf(d.id)
      const v = { docId: d.id, version: d.version, status: d.supersededBy ? 'superseded' : 'approved', title: d.title, topic: d.topic, owner: d.owner, effectiveFrom: d.updated, reviewDate: null, replaces: null, sections: d.sections, changeNote: '', inForce: !d.supersededBy, state: f.state, supersededByKey: d.supersededBy }
      return { docId: d.id, title: d.title, topic: d.topic, owner: d.owner, versions: [v], current: v.inForce ? v : null }
    }),
  }
}

export default function Library() {
  const { dispatch, refreshQueue } = useStore()
  const [lib, setLib] = useState(BACKEND ? null : demoLibrary())
  const [failed, setFailed] = useState(false)
  const [docId, setDocId] = useState(null)
  const [impact, setImpact] = useState(null)

  useEffect(() => {
    if (BACKEND) api.library().then(setLib, () => setFailed(true))
  }, [])

  if (!lib) {
    return <div className="mx-auto max-w-[1560px] px-6 py-6 text-body-sm text-smoke">{failed ? 'Could not load the library. Is the backend running on port 8000?' : 'Loading library…'}</div>
  }
  const doc = lib.documents.find((d) => d.docId === docId) ?? lib.documents[0]

  const approved = (r) => {
    setLib(r.library)
    setImpact({ docId: r.version.docId, version: r.version.version, replaces: r.version.replaces, impacted: r.impacted })
    dispatch({ type: 'impacted', impacted: r.impacted })
    refreshQueue()
  }

  return (
    <div className="mx-auto grid h-full max-w-[1560px] grid-cols-[300px_1fr] gap-6 px-6 py-6">
      <aside className="flex min-h-0 flex-col overflow-hidden rounded-3xl border border-frost bg-porcelain">
        <div className="border-b border-frost p-4">
          <Eyebrow>Knowledge library</Eyebrow>
          <p className="mt-1 text-caption text-smoke">
            {lib.documents.length} documents · versions in force on {formatDate(lib.asOf)}
          </p>
        </div>
        <ul className="scroll-quiet flex-1 space-y-2 overflow-y-auto p-3">
          {lib.documents.map((d) => {
            const isSel = doc.docId === d.docId
            const shown = d.current ?? d.versions.find((v) => v.status !== 'draft') ?? d.versions[0]
            const st = statusOf(shown)
            const drafts = d.versions.filter((v) => v.status === 'draft').length
            return (
              <li key={d.docId}>
                <button onClick={() => (setDocId(d.docId), setImpact(null))} aria-current={isSel ? 'true' : undefined} className={`w-full rounded-2xl border p-3 text-left transition-colors ${isSel ? 'border-carbon bg-porcelain shadow-md' : 'border-frost hover:border-ash'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-caption font-medium text-carbon">
                      {d.docId} · {shown.version}
                    </span>
                    {drafts > 0 && <Pill Icon={FilePen} label={`${drafts} draft`} tone="unknown" />}
                  </div>
                  <div className="mt-1.5 text-body-sm font-medium text-ink">{d.title}</div>
                  <div className="mt-1 text-caption text-smoke">{TOPICS[d.topic]?.name ?? d.topic}</div>
                  <div className="mt-2">
                    <Pill Icon={st.Icon} label={st.label} tone={st.tone} />
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      </aside>

      <DocumentDetail key={doc.docId} doc={doc} asOf={lib.asOf} impact={impact?.docId === doc.docId ? impact : null} onApproved={approved} onDrafted={setLib} />
    </div>
  )
}

function DocumentDetail({ doc, asOf, impact, onApproved, onDrafted }) {
  const [sel, setSel] = useState(doc.versions[0].version)
  const [drafting, setDrafting] = useState(false)
  const v = doc.versions.find((x) => x.version === sel) ?? doc.versions[0]
  const prev = v.replaces ? doc.versions.find((x) => x.version === v.replaces) : null
  const hasDraft = doc.versions.some((x) => x.status === 'draft')

  return (
    <div className="scroll-quiet min-h-0 space-y-6 overflow-y-auto">
      <section className="rounded-3xl border border-frost bg-porcelain p-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Eyebrow>
              {doc.docId} · {TOPICS[doc.topic]?.name ?? doc.topic}
            </Eyebrow>
            <h1 className="mt-2 text-heading-sm font-semibold text-ink">{doc.title}</h1>
            <p className="mt-1 text-body-sm text-smoke">Owner: {doc.owner}</p>
          </div>
          {BACKEND && !hasDraft && !drafting && (
            <GhostButton onClick={() => setDrafting(true)}>
              <FilePlus size={16} /> Draft a new version
            </GhostButton>
          )}
        </header>
        {!BACKEND && <p className="mt-3 rounded-2xl bg-bone p-3 text-body-sm text-carbon">Read-only in demo mode. Drafting and approving versions, and seeing which answers they affect, needs backend mode.</p>}

        {impact && <ImpactNotice impact={impact} />}

        <table className="mt-5 w-full text-left text-body-sm">
          <caption className="sr-only">Versions of {doc.title}</caption>
          <thead>
            <tr className="border-b border-frost text-caption text-smoke">
              <th className="py-2 font-medium">Version</th>
              <th className="py-2 font-medium">Status</th>
              <th className="py-2 font-medium">Effective</th>
              <th className="py-2 font-medium">Review by</th>
              <th className="py-2 font-medium">Replaces</th>
              <th className="py-2 font-medium">Owner</th>
            </tr>
          </thead>
          <tbody>
            {doc.versions.map((x) => {
              const st = statusOf(x)
              const on = x.version === v.version
              return (
                <tr key={x.version} className={`border-b border-frost last:border-0 ${on ? 'bg-bone' : ''}`}>
                  <td className="py-2.5 pl-2">
                    <button onClick={() => setSel(x.version)} aria-pressed={on} className="font-semibold text-ink underline-offset-4 hover:underline">
                      {x.version}
                    </button>
                  </td>
                  <td className="py-2.5">
                    <Pill Icon={st.Icon} label={st.label} tone={st.tone} />
                  </td>
                  <td className="py-2.5 text-carbon">{formatDate(x.effectiveFrom)}</td>
                  <td className="py-2.5 text-carbon">{x.reviewDate ? formatDate(x.reviewDate) : '—'}</td>
                  <td className="py-2.5 text-carbon">{x.replaces ?? (x.supersededByKey && x.status === 'superseded' && !x.supersededByKey.startsWith(doc.docId) ? `replaced by ${x.supersededByKey.replace('@', ' ')}` : '—')}</td>
                  <td className="py-2.5 text-carbon">{x.owner}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>

      {drafting && <DraftForm doc={doc} asOf={asOf} onCancel={() => setDrafting(false)} onDrafted={(lib, version) => (onDrafted(lib), setDrafting(false), setSel(version))} />}

      <section className="rounded-3xl border border-frost bg-porcelain p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-subheading font-medium text-ink">
              {v.version} text{prev ? ` · compared with ${prev.version}` : ''}
            </h2>
            <p className="text-caption text-smoke">
              {v.changeNote || 'No change note.'}
              {v.approvedAt && v.status !== 'draft' ? ` · approved ${formatDate(v.approvedAt.slice(0, 10))}` : ''}
            </p>
          </div>
          {v.status === 'draft' && BACKEND && <ApproveButton doc={doc} v={v} onApproved={onApproved} />}
        </div>
        <div className="mt-4 space-y-3">
          {v.sections.map((s) => {
            const before = prev?.sections.find((x) => x.id === s.id)
            const changed = prev && (!before || before.text !== s.text)
            return (
              <div key={s.id} className="rounded-2xl bg-bone p-4">
                <div className="flex items-center gap-2 text-body-sm font-semibold text-ink">
                  <span className="rounded-xl bg-porcelain px-1.5 py-0.5 text-caption text-carbon">{s.id}</span> {s.heading}
                  {changed && <Pill Icon={RefreshCw} label="Changed" tone="caution" />}
                </div>
                {changed && before && <p className="mt-2 text-body-sm text-smoke line-through decoration-1">“{before.text}”</p>}
                <p className="mt-2 text-body text-ink">“{s.text}”</p>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}

function ApproveButton({ doc, v, onApproved }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  return (
    <div className="text-right">
      <PrimaryButton
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          try {
            onApproved(await api.approveVersion(doc.docId, v.version))
          } catch (e) {
            setErr(e.message)
          }
          setBusy(false)
        }}
      >
        {busy ? <LoaderCircle size={16} className="spin" /> : <CircleCheck size={16} />} Approve {v.version}
      </PrimaryButton>
      <p className="mt-1 text-caption text-smoke">{err ?? `Replaces ${v.replaces}, which is kept as superseded.`}</p>
    </div>
  )
}

function DraftForm({ doc, asOf, onCancel, onDrafted }) {
  const base = doc.current ?? doc.versions.find((x) => x.status !== 'draft')
  const [sections, setSections] = useState(base.sections.map((s) => ({ ...s })))
  const [effective, setEffective] = useState(asOf)
  const [note, setNote] = useState('')
  const [err, setErr] = useState(null)
  const changed = sections.some((s, i) => s.text.trim() !== base.sections[i].text)
  const save = async () => {
    try {
      const rec = await api.proposeVersion(doc.docId, { sections: sections.map((s) => ({ ...s, text: s.text.trim() })), effectiveFrom: effective, changeNote: note.trim() })
      onDrafted(await api.library(), rec.version)
    } catch (e) {
      setErr(e.message)
    }
  }
  const field = 'w-full rounded-2xl border border-frost bg-porcelain px-3 py-2 text-body-sm text-ink focus:border-ash focus:outline-none'
  return (
    <section className="rise-in rounded-3xl border border-frost bg-porcelain p-6">
      <h2 className="text-subheading font-medium text-ink">Draft a new version of {doc.docId}</h2>
      <p className="text-caption text-smoke">Starts from {base.version}. Saving creates a draft; nothing changes for answers until it is approved.</p>
      <div className="mt-4 space-y-3">
        {sections.map((s, i) => (
          <div key={s.id}>
            <label htmlFor={`sec-${i}`} className="eyebrow text-smoke">
              {s.id} · {s.heading}
            </label>
            <textarea id={`sec-${i}`} rows={2} value={s.text} onChange={(e) => setSections(sections.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} className={`mt-1 resize-none ${field}`} />
          </div>
        ))}
        <div className="grid gap-3 md:grid-cols-[180px_1fr]">
          <div>
            <label htmlFor="eff" className="eyebrow text-smoke">Effective from</label>
            <input id="eff" type="date" value={effective} onChange={(e) => setEffective(e.target.value)} className={`mt-1 ${field}`} />
          </div>
          <div>
            <label htmlFor="cn" className="eyebrow text-smoke">Change note · required</label>
            <input id="cn" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Treasury raised RM override authority to 25 bps." className={`mt-1 ${field}`} />
          </div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <GhostButton onClick={save} disabled={!changed || note.trim().length < 3}>
          <FilePen size={16} /> Save draft
        </GhostButton>
        <GhostButton onClick={onCancel}>Cancel</GhostButton>
        <span className="text-caption text-smoke">{err ?? (!changed ? 'Change at least one section.' : note.trim().length < 3 ? 'Add a change note.' : '')}</span>
      </div>
    </section>
  )
}

function ImpactNotice({ impact }) {
  const { dispatch } = useStore()
  const n = impact.impacted.length
  return (
    <div className="rise-in mt-4 rounded-2xl border border-frost bg-bone p-4">
      <div className="flex items-center gap-2 text-body-sm font-semibold text-ink">
        <RefreshCw size={16} className="text-status-caution" aria-hidden="true" /> {impact.version} approved · {impact.replaces} is now superseded
      </div>
      <p className="mt-1 text-body-sm text-carbon">
        {n === 0
          ? 'No current assessment relied on the previous version.'
          : `${n} assessment${n === 1 ? '' : 's'} relied on ${impact.replaces}. ${n === 1 ? 'Its answer is' : 'Their answers are'} marked “Evidence changed · re-verification required”. The original results are kept.`}
      </p>
      {n > 0 && (
        <ul className="mt-2 space-y-1.5">
          {impact.impacted.map((i) => (
            <li key={i.assessmentId} className="flex flex-wrap items-center gap-2 text-caption text-carbon">
              <span className="font-medium text-ink">{i.answerId}</span>
              <span className="min-w-0 flex-1 truncate">“{i.question}”</span>
              <span className="text-smoke">
                used {i.usedVersions.join(', ')} · was {i.previousState}
              </span>
            </li>
          ))}
        </ul>
      )}
      {n > 0 && (
        <button onClick={() => dispatch({ type: 'view', view: 'workspace' })} className="mt-2 inline-flex items-center gap-1 text-body-sm font-medium text-carbon underline-offset-4 hover:text-ink hover:underline">
          Re-verify from the workspace <ArrowRight size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
