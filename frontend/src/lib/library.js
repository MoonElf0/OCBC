// The policy library the interface shows. Demo mode: the fixtures. Backend mode:
// the server's copy, which can be edited through the API — refreshed on load and
// after every verification, so the document viewer never contradicts a verdict.
import { useSyncExternalStore } from 'react'
import { DOCUMENTS } from '../fixtures'
import { BACKEND, api } from './backend'

let docs = DOCUMENTS
const listeners = new Set()

export const documentById = (id) => docs[id]

/** Re-render when the library changes. */
export function useLibrary() {
  return useSyncExternalStore(
    (fn) => (listeners.add(fn), () => listeners.delete(fn)),
    () => docs,
  )
}

export async function refreshLibrary() {
  if (!BACKEND) return
  try {
    const list = await api.documents()
    docs = Object.fromEntries(list.map(({ freshness, ...d }) => [d.id, d])) // eslint-disable-line no-unused-vars
    listeners.forEach((fn) => fn())
  } catch {
    // Keep the last copy; the queue and verify calls already report a missing backend.
  }
}
