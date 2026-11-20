import { Search, MessageSquare } from 'lucide-react'
import { scenarioById } from '../lib/pipeline'
import { Passage } from './ui'

/** One evidence item from a check: a source passage, the question, or a search record. */
export function EvidenceItem({ item, scenarioId, question, search }) {
  if (item.kind === 'question') {
    return (
      <div className="rounded-2xl bg-bone p-4 text-body-sm text-carbon">
        <div className="eyebrow mb-1.5 flex items-center gap-1.5 text-smoke">
          <MessageSquare size={12} aria-hidden="true" /> Question asked
        </div>
        “{question ?? scenarioById(scenarioId).question}”
      </div>
    )
  }
  if (item.kind === 'search') return <SearchRecord scenarioId={scenarioId} search={search} />
  return <Passage docId={item.docId} section={item.section} passage={item.passage} />
}

/** `search` is the result's retrieval record when the backend computed it. */
export function SearchRecord({ scenarioId, search: computed }) {
  const search = computed ?? scenarioById(scenarioId).verification.search
  return (
    <div className="rounded-2xl bg-bone p-4 text-body-sm text-carbon">
      <div className="eyebrow mb-1.5 flex items-center gap-1.5 text-smoke">
        <Search size={12} aria-hidden="true" /> Retrieval record
      </div>
      {search ? (
        <>
          Searched {search.documentsSearched} approved documents for “{search.query}”. Best match scored {search.topMatch.toFixed(2)}, below the {search.threshold.toFixed(2)} relevance threshold, so no passage was used.
        </>
      ) : (
        'No source passages apply to this reply.'
      )}
    </div>
  )
}
