import { useStore } from './state/store'
import TopNav from './components/TopNav'
import Chat from './components/Chat'
import VerifyPane from './components/VerifyPane'
import VerifyAnswerPage from './components/VerifyAnswerPage'
import ReviewQueue from './admin/ReviewQueue'
import Trends from './admin/Trends'
import Library from './admin/Library'
import Evaluation from './admin/Evaluation'
import TrustMap from './components/TrustMap'
import Pitch from './pitch/Pitch'

export default function App() {
  const { state } = useStore()
  // The verify pane belongs to the page its answer lives on: chat answers in the workspace, pasted ones on Verify answer.
  const paneMsg = state.messages.find((m) => m.id === state.paneId)
  const paneOn = (page) => paneMsg && (paneMsg.source === 'submitted') === (page === 'verify')
  return (
    <div className="relative flex h-full flex-col">
      <div className="atmosphere" aria-hidden="true" />
      <TopNav />
      <main className="relative z-10 min-h-0 flex-1 overflow-hidden">
        {state.view === 'workspace' && (
          <div className="mx-auto flex h-full max-w-[1440px] gap-4 px-2 pb-2 lg:px-4 lg:pb-4">
            <Chat />
            {paneOn('workspace') && <VerifyPane />}
          </div>
        )}
        {state.view === 'verify' && (
          <div className="mx-auto flex h-full max-w-[1440px] gap-4 px-2 pb-2 lg:px-4 lg:pb-4">
            <VerifyAnswerPage />
            {paneOn('verify') && <VerifyPane />}
          </div>
        )}
        {state.view === 'review' && <ReviewQueue />}
        {state.view === 'trends' && <Trends />}
        {state.view === 'library' && <Library />}
        {state.view === 'evaluation' && <Evaluation />}
      </main>
      <TrustMap />
      {state.pitch && <Pitch />}
      {state.toast && (
        <div role="status" className="glass-dark rise-in fixed top-20 left-1/2 z-50 max-w-[calc(100vw-32px)] text-center lg:top-auto lg:bottom-6 -translate-x-1/2 rounded-full px-5 py-2.5 text-body-sm text-white shadow-md">
          {state.toast.text}
        </div>
      )}
    </div>
  )
}
