/**
 * Backend mode switch and API client.
 *
 *   npm run dev                 demo mode: scripted, fully offline (default)
 *   npm run dev:backend         backend mode: talks to the FastAPI service in
 *                               backend/ through the Vite proxy at /api
 *
 * Backend mode computes retrieval, rule checks, the reliability index,
 * routing and the dashboard on the server. Policy Assistant answers and their
 * judge verdicts are still scripted; submitted answers and reviewer
 * corrections run the backend's general pipeline, with model steps only when
 * a provider is configured on the server. The interface never calls this "live".
 */
export const BACKEND = import.meta.env?.VITE_MODE === 'backend'

async function call(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    // FastAPI puts the reason in `detail`; some 422s carry a JSON payload inside it.
    let detail = null
    try {
      detail = (await res.json()).detail
    } catch {
      /* not JSON */
    }
    let payload = null
    if (typeof detail === 'string' && detail.startsWith('{')) {
      try {
        payload = JSON.parse(detail)
      } catch {
        /* plain text */
      }
    }
    const err = new Error(payload?.message ?? (typeof detail === 'string' ? detail : `${method} /api${path} → ${res.status}`))
    err.status = res.status
    err.payload = payload
    err.fromServer = typeof detail === 'string'
    throw err
  }
  return res.json()
}

export const api = {
  // agent: 'model' asks the model-backed Policy Assistant when the server has one configured; 'scripted' never does.
  ask: (question, agent = 'scripted') => call('/ask', { method: 'POST', body: { question, agent } }),
  feedback: (answerId, value) => call(`/answers/${answerId}/feedback`, { method: 'POST', body: { value } }),
  escalate: (answerId, note) => call(`/answers/${answerId}/escalate`, { method: 'POST', body: { note } }),
  reviews: () => call('/reviews'),
  decide: (reviewId, body) => call(`/reviews/${reviewId}/decision`, { method: 'POST', body }),
  metrics: () => call('/metrics'),
  health: () => call('/health'),
  submit: (body) => call('/answers', { method: 'POST', body }),
  preview: (body) => call('/verify/preview', { method: 'POST', body }),
  reverify: (answerId) => call(`/answers/${answerId}/reverify`, { method: 'POST' }),
  history: (answerId) => call(`/answers/${answerId}/history`),
  library: () => call('/library'),
  proposeVersion: (docId, body) => call(`/library/${encodeURIComponent(docId)}/versions`, { method: 'POST', body }),
  approveVersion: (docId, version) => call(`/library/${encodeURIComponent(docId)}/versions/${encodeURIComponent(version)}/approve`, { method: 'POST' }),
  evalInfo: () => call('/eval'),
  evalRun: (split) => call('/eval/run', { method: 'POST', body: { split } }),
  reset: () => call('/admin/reset', { method: 'POST' }),
  releaseCheck: () => call('/release-check'),

  /** Same callbacks as pipeline.verify. Returns a cancel function. */
  verify(answerId, { onCheckStart, onCheckDone, onComplete, onError }) {
    const es = new EventSource(`/api/answers/${answerId}/verify`)
    const on = (name, fn) => es.addEventListener(name, (e) => fn(JSON.parse(e.data)))
    on('check_start', (d) => onCheckStart(d.i))
    on('check_done', (d) => onCheckDone(d.i, d.check, d.claims))
    on('complete', (d) => {
      es.close()
      onComplete(d.result, d.routed, { state: d.state, assessmentId: d.assessmentId })
    })
    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) return
      es.close()
      onError?.()
    }
    return () => es.close()
  },
}
