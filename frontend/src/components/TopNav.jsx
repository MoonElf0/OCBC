import { MessageSquare, Inbox, ChartLine, ShieldCheck, ClipboardPaste, Library, FlaskConical } from 'lucide-react'
import { useStore } from '../state/store'
import { BACKEND } from '../lib/backend'

const LINKS = [
  { id: 'workspace', label: 'Assistant', Icon: MessageSquare },
  { id: 'verify', label: 'Verify answer', Icon: ClipboardPaste },
  { id: 'review', label: 'Review queue', Icon: Inbox },
  { id: 'library', label: 'Library', Icon: Library },
  { id: 'trends', label: 'Trends', Icon: ChartLine },
  { id: 'evaluation', label: 'Evaluation', Icon: FlaskConical },
]

export default function TopNav() {
  const { state, dispatch } = useStore()
  const pending = state.queue.filter((q) => q.status === 'pending').length

  return (
    <nav className="relative z-20 shrink-0 px-2 pt-2 lg:px-4 lg:pt-3">
      <div className="glass mx-auto flex h-14 max-w-[1440px] items-center gap-3 rounded-full pr-2 pl-2.5">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-full bg-gradient-to-br from-ocbc-red to-ocbc-red-deep text-white shadow-md">
            <ShieldCheck size={18} strokeWidth={2} />
          </span>
          <span className="hidden text-body-sm font-semibold tracking-[-0.2px] whitespace-nowrap text-ink sm:inline">Assessment AI</span>
        </div>

        <div className="mx-auto flex items-center gap-1 rounded-full bg-black/[0.04] p-1" role="tablist" aria-label="Views">
          {LINKS.map((l) => {
            const active = state.view === l.id
            return (
              <button
                key={l.id}
                role="tab"
                aria-selected={active}
                aria-label={l.id === 'review' && pending > 0 ? `${l.label}, ${pending} pending` : l.label}
                title={l.label}
                onClick={() => dispatch({ type: 'view', view: l.id })}
                className={`relative inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-body-sm font-medium whitespace-nowrap transition-all xl:px-4 ${active ? 'bg-white text-ink shadow-sm' : 'text-smoke hover:text-ink'}`}
              >
                <l.Icon size={15} aria-hidden="true" />
                <span className="hidden lg:inline">{l.label}</span>
                {l.id === 'review' && pending > 0 && <span className="rounded-full bg-ink px-1.5 text-[12px] font-semibold text-white tabular-nums">{pending}</span>}
                {l.id === 'workspace' && state.unreadOutcomes > 0 && <span className="size-2 rounded-full bg-ocbc-red" aria-label="Reviewer outcome waiting" />}
              </button>
            )
          })}
        </div>

        <span
          className="hidden items-center gap-1.5 rounded-full bg-black/[0.04] px-3 py-1 text-caption whitespace-nowrap text-carbon xl:inline-flex"
          title={BACKEND ? 'Backend mode: retrieval, rule checks, the reliability index, routing and the dashboard are computed by the backend. Policy Assistant answers and their judge verdicts are scripted; submitted answers and corrections run the pipeline, with model steps only if a provider is configured.' : 'Offline demo: everything runs in this browser tab and nothing is saved.'}
        >
          <span className={`size-1.5 rounded-full ${BACKEND ? 'bg-status-verified' : 'bg-smoke'}`} aria-hidden="true" />
          {BACKEND ? 'Backend' : 'Offline demo'}
        </span>
      </div>
    </nav>
  )
}
