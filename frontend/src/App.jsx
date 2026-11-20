import { useStore } from './state/store'
import TopNav from './components/TopNav'
import Chat from './components/Chat'
import VerifyPane from './components/VerifyPane'
import ReviewQueue from './admin/ReviewQueue'
import Trends from './admin/Trends'

export default function App() {
  const { state } = useStore()
  return (
    <div className="relative flex h-full flex-col">
      <div className="atmosphere" aria-hidden="true" />
      <TopNav />
      <main className="relative z-10 min-h-0 flex-1 overflow-hidden">
        {state.view === 'workspace' && (
          <div className="mx-auto flex h-full max-w-[1440px] gap-4 px-2 pb-2 lg:px-4 lg:pb-4">
            <Chat />
            {state.paneId && <VerifyPane />}
          </div>
        )}
        {state.view === 'review' && <ReviewQueue />}
        {state.view === 'trends' && <Trends />}
      </main>
      {state.toast && (
        <div role="status" className="glass-dark rise-in fixed top-20 left-1/2 z-50 max-w-[calc(100vw-32px)] text-center lg:top-auto lg:bottom-6 -translate-x-1/2 rounded-full px-5 py-2.5 text-body-sm text-white shadow-md">
          {state.toast.text}
        </div>
      )}
    </div>
  )
}
