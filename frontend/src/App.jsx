import { useStore } from './state/store'
import TopNav from './components/TopNav'
import CharacterPanel from './components/CharacterPanel'
import Thread from './components/Thread'
import ReviewQueue from './admin/ReviewQueue'
import Trends from './admin/Trends'
import TrustMap from './components/TrustMap'
import Pitch from './pitch/Pitch'

export default function App() {
  const { state } = useStore()
  return (
    <div className="flex h-full flex-col">
      <TopNav />
      <main className="min-h-0 flex-1 overflow-hidden">
        {state.view === 'workspace' && (
          <div className="mx-auto grid h-full max-w-[1560px] grid-cols-1 gap-6 px-6 py-6 lg:grid-cols-[minmax(440px,38%)_1fr] lg:grid-rows-[minmax(0,1fr)]">
            <CharacterPanel />
            <Thread />
          </div>
        )}
        {state.view === 'review' && <ReviewQueue />}
        {state.view === 'trends' && <Trends />}
      </main>
      <TrustMap />
      {state.pitch && <Pitch />}
      {state.toast && (
        <div role="status" className="rise-in fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-carbon px-5 py-2.5 text-body-sm text-white shadow-md">
          {state.toast.text}
        </div>
      )}
    </div>
  )
}
