import { useStore } from './state/store'
import TopNav from './components/TopNav'
import Chat from './components/Chat'
import VerifyPane from './components/VerifyPane'
import VerifyAnswerPage from './components/VerifyAnswerPage'
import ReviewQueue from './admin/ReviewQueue'
import Trends from './admin/Trends'
import Library from './admin/Library'
import Evaluation from './admin/Evaluation'
import Versions from './admin/Versions'
import TrustMap from './components/TrustMap'
import Pitch from './pitch/Pitch'
import ClassicPanel from './classic/CharacterPanel'
import ClassicThread from './classic/Thread'

export default function App() {
  const { state } = useStore()
  // The verify pane belongs to the page its answer lives on: chat answers (asked or pasted in the chat) in the workspace, pasted ones on Verify answer.
  const paneMsg = state.messages.find((m) => m.id === state.paneId)
  const onVerifyPage = (m) => m.source === 'submitted' && m.origin !== 'chat'
  const paneOn = (page) => paneMsg && onVerifyPage(paneMsg) === (page === 'verify')
  return (
    <div className="relative flex h-full flex-col">
      <div className="atmosphere" aria-hidden="true" />
      <TopNav />
      <main className="relative z-10 min-h-0 flex-1 overflow-hidden">
        {state.view === 'workspace' && (
          <div className="mx-auto flex h-full max-w-[1440px] gap-4 px-2 pt-2 pb-2 lg:px-4 lg:pt-4 lg:pb-4">
            <Chat />
            {paneOn('workspace') && <VerifyPane />}
          </div>
        )}
        {state.view === 'verify' && (
          <div className="mx-auto flex h-full max-w-[1440px] gap-4 px-2 pt-2 pb-2 lg:px-4 lg:pt-4 lg:pb-4">
            <VerifyAnswerPage />
            {paneOn('verify') && <VerifyPane />}
          </div>
        )}
        {state.view === 'classic' && (
          // The pre-redesign assistant: character panel + thread, checks run as soon as the answer lands.
          <div className="mx-auto grid h-full max-w-[1560px] grid-cols-1 gap-6 px-2 py-2 lg:grid-cols-[minmax(440px,38%)_1fr] lg:grid-rows-[minmax(0,1fr)] lg:px-4 lg:py-4">
            <ClassicPanel />
            <ClassicThread />
          </div>
        )}
        {state.view === 'review' && <ReviewQueue />}
        {state.view === 'trends' && <Trends />}
        {state.view === 'library' && <Library />}
        {state.view === 'evaluation' && <Evaluation />}
        {state.view === 'versions' && <Versions />}
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
