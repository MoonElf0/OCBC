import { useEffect, useRef, useState } from 'react'
import { UserRound, MessageSquare, Inbox, ChartLine, Check } from 'lucide-react'
import { useStore } from '../state/store'
import { CharacterMark } from './Character'

const LINKS = {
  workspace: [{ id: 'workspace', label: 'Workspace' }],
  admin: [
    { id: 'review', label: 'Review queue' },
    { id: 'trends', label: 'Trends' },
  ],
}

export default function TopNav() {
  const { state, dispatch } = useStore()
  const [open, setOpen] = useState(false)
  const menu = useRef(null)
  const admin = state.view !== 'workspace'
  const pending = state.queue.filter((q) => q.status === 'pending').length

  useEffect(() => {
    const close = (e) => menu.current && !menu.current.contains(e.target) && setOpen(false)
    const esc = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [])

  const go = (view) => {
    dispatch({ type: 'view', view })
    setOpen(false)
  }

  return (
    <nav className="h-16 shrink-0 bg-obsidian-bar text-white">
      <div className="mx-auto flex h-full max-w-[1560px] items-center gap-8 px-6">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-full bg-white/10">
            <CharacterMark size={22} />
          </span>
          <span className="whitespace-nowrap text-body font-semibold tracking-[-0.01em]">Assessment AI</span>
          <span className="hidden text-caption text-ash xl:inline">Trust layer for AI agents</span>
        </div>

        <div className="flex h-full items-center gap-6">
          {(admin ? LINKS.admin : LINKS.workspace).map((l) => (
            <button
              key={l.id}
              onClick={() => go(l.id)}
              aria-current={state.view === l.id ? 'page' : undefined}
              className={`relative flex h-full items-center gap-2 whitespace-nowrap text-body-sm font-medium transition-colors ${state.view === l.id ? 'text-white' : 'text-ash hover:text-white'}`}
            >
              {l.label}
              {l.id === 'review' && pending > 0 && <span className="rounded-full bg-white/15 px-1.5 text-caption tabular-nums">{pending}</span>}
              {state.view === l.id && <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-ocbc-red" />}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-3">
          <span className="hidden whitespace-nowrap rounded-full border border-white/25 px-3 py-1 text-caption text-white/80 lg:inline">Prototype · synthetic data only</span>
          {admin && (
            <button onClick={() => go('workspace')} className="whitespace-nowrap rounded-full border border-white/25 px-4 py-1.5 text-body-sm font-medium text-white hover:border-white/60">
              Back to workspace
            </button>
          )}
          <div ref={menu} className="relative">
            <button
              onClick={() => setOpen((o) => !o)}
              aria-haspopup="menu"
              aria-expanded={open}
              aria-label="Account and roles"
              className="relative grid size-9 place-items-center rounded-full border border-white/25 hover:border-white/60"
            >
              <UserRound size={17} />
              {state.unreadOutcomes > 0 && (
                <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-white ring-2 ring-obsidian-bar">
                  <span className="sr-only">Reviewer outcome waiting</span>
                </span>
              )}
            </button>
            {open && (
              <div role="menu" className="rise-in absolute right-0 top-12 z-30 w-72 rounded-2xl border border-frost bg-porcelain p-2 text-ink shadow-md">
                <div className="px-3 pt-2 pb-3">
                  <div className="eyebrow text-smoke">Switch role · demo</div>
                  <div className="mt-1 text-caption text-carbon">All roles share this browser session. Nothing is saved.</div>
                </div>
                <MenuItem Icon={MessageSquare} label="Employee workspace" sub="Relationship Manager · Business Banking" active={state.view === 'workspace'} onClick={() => go('workspace')} badge={state.unreadOutcomes ? `${state.unreadOutcomes} outcome` : null} />
                <div className="my-1 border-t border-frost" />
                <div className="eyebrow px-3 pt-2 pb-1 text-smoke">Admin</div>
                <MenuItem Icon={Inbox} label="Reviewer queue" sub={`${pending} pending`} active={state.view === 'review'} onClick={() => go('review')} />
                <MenuItem Icon={ChartLine} label="Trends dashboard" sub="Reliability over 12 weeks" active={state.view === 'trends'} onClick={() => go('trends')} />
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  )
}

function MenuItem({ Icon, label, sub, active, onClick, badge }) {
  return (
    <button role="menuitem" onClick={onClick} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-bone ${active ? 'bg-bone' : ''}`}>
      <Icon size={16} className="shrink-0 text-carbon" />
      <span className="min-w-0 flex-1">
        <span className="block text-body-sm font-medium">{label}</span>
        <span className="block text-caption text-smoke">{sub}</span>
      </span>
      {badge && <span className="rounded-xl bg-bone px-2 py-0.5 text-caption text-carbon">{badge}</span>}
      {active && <Check size={14} className="text-carbon" />}
    </button>
  )
}
