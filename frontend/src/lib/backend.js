/**
 * Backend mode switch and API client.
 *
 *   npm run dev                 demo mode: scripted, fully offline (default)
 *   npm run dev:backend         backend mode: talks to the FastAPI service in
 *                               backend/ through the Vite proxy at /api
 *
 * Backend mode computes retrieval, rule checks, scores, routing and the
 * dashboard on the server. Answers and judge verdicts are still scripted,
 * so the interface never calls this "live".
 */
export const BACKEND = import.meta.env?.VITE_MODE === 'backend'

async function call(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`${method} /api${path} → ${res.status}`)
  return res.json()
}

export const api = {
  ask: (question) => call('/ask', { method: 'POST', body: { question } }),
  feedback: (answerId, value) => call(`/answers/${answerId}/feedback`, { method: 'POST', body: { value } }),
  escalate: (answerId, note) => call(`/answers/${answerId}/escalate`, { method: 'POST', body: { note } }),
  reviews: () => call('/reviews'),
  decide: (reviewId, body) => call(`/reviews/${reviewId}/decision`, { method: 'POST', body }),
  metrics: () => call('/metrics'),
  evaluation: () => call('/evaluation'),

  /** Same callbacks as pipeline.verify. Returns a cancel function. */
  verify(answerId, { onCheckStart, onCheckDone, onComplete, onError }) {
    const es = new EventSource(`/api/answers/${answerId}/verify`)
    const on = (name, fn) => es.addEventListener(name, (e) => fn(JSON.parse(e.data)))
    on('check_start', (d) => onCheckStart(d.i))
    on('check_done', (d) => onCheckDone(d.i, d.check, d.claims))
    on('complete', (d) => {
      es.close()
      onComplete(d.result, d.routed)
    })
    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) return
      es.close()
      onError?.()
    }
    return () => es.close()
  },
}
