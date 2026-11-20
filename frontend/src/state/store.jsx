import { createContext, useContext, useReducer, useRef, useCallback, useEffect } from 'react'
import { REVIEW_QUEUE_SEED, REVIEW_HINTS, CORRECTIONS } from '../fixtures'
import { ask, streamText } from '../lib/agent'
import { verify, scenarioById } from '../lib/pipeline'
import { assess } from '../lib/assess'
import { bandFor, CHECKS } from '../lib/status'
import { freshnessOf } from '../lib/freshness'
import { BACKEND, api } from '../lib/backend'
import { refreshLibrary } from '../lib/library'

// UI state. In demo mode this is the only state and nothing persists past a
// refresh. In backend mode the server is the record for answers, the review
// queue and reviewer decisions; the actions below mirror its responses.

const initial = {
  view: 'workspace', // 'workspace' | 'review' | 'trends'
  messages: [],
  activeId: null,
  panel: { mode: 'overall' }, // or { mode: 'claim', claimId }
  pinned: false, // true while the user is examining a specific older answer or claim
  offerId: null, // newer answer offered while the user is pinned
  checksOpen: false,
  queue: REVIEW_QUEUE_SEED.map((q) => ({ ...q, status: 'pending' })),
  liveDecisions: [],
  unreadOutcomes: 0,
  toast: null,
  trust: null, // { id, claimId } while the Trust Map is open
  pitch: false,
  seq: 1042,
}

const latestAnswerId = (messages) => [...messages].reverse().find((m) => m.kind === 'answer')?.id ?? null

function updateMsg(state, id, patch) {
  return { ...state, messages: state.messages.map((m) => (m.id === id ? { ...m, ...(typeof patch === 'function' ? patch(m) : patch) } : m)) }
}

function reducer(state, a) {
  switch (a.type) {
    case 'view':
      return { ...state, view: a.view, checksOpen: false, toast: null, unreadOutcomes: a.view === 'workspace' ? 0 : state.unreadOutcomes }

    case 'ask': {
      const user = { id: `u${a.id}`, kind: 'user', text: a.question }
      const answer = {
        id: `a${a.id}`,
        serverId: a.reply.answerId ?? null, // backend mode: the stored answer's id
        kind: 'answer',
        question: a.question,
        scenarioId: a.reply.scenarioId,
        text: a.reply.text,
        citations: a.reply.citations,
        shown: 0,
        phase: 'thinking', // thinking → streaming → verifying → done
        checks: CHECKS.map(() => ({ status: 'queued' })),
        result: null,
        routed: null,
        feedback: null,
        outcome: null,
      }
      const next = { ...state, messages: [...state.messages, user, answer] }
      // The newest answer becomes active — unless the user is examining another one.
      // Offered once verified (see 'verified'), not while it's still being written.
      if (state.pinned && state.activeId) return next
      return { ...next, activeId: answer.id, panel: { mode: 'overall' }, offerId: null, checksOpen: false }
    }

    case 'stream':
      return updateMsg(state, a.id, { shown: a.shown, phase: 'streaming' })

    case 'streamed':
      return updateMsg(state, a.id, (m) => ({ shown: m.text.length, phase: 'verifying' }))

    case 'checkStart':
      return updateMsg(state, a.id, (m) => ({ checks: m.checks.map((c, i) => (i === a.i ? { status: 'running' } : c)) }))

    case 'checkDone':
      return updateMsg(state, a.id, (m) => ({ checks: m.checks.map((c, i) => (i === a.i ? a.check : c)), ...(a.claims ? { claims: a.claims } : {}) }))

    case 'verified': {
      let s = updateMsg(state, a.id, { phase: 'done', result: a.result })
      if (s.activeId !== a.id && a.id === latestAnswerId(s.messages)) s = { ...s, offerId: a.id }
      // Backend mode: the server already applied the routing rule.
      if (a.server) return a.routed ? updateMsg(s, a.id, { routed: a.routed }) : s
      const msg = s.messages.find((m) => m.id === a.id)
      const sc = scenarioById(msg.scenarioId)
      // Routing rule: a Low score, any conflicting claim, or a high-stakes
      // topic scored below High goes to a reviewer without the employee asking.
      const conflicting = a.result.claims.some((c) => c.status === 'conflicting')
      const low = a.result.band?.id === 'low'
      const stakes = sc.highStakes && a.result.score != null && a.result.band?.id !== 'high'
      if (low || conflicting || stakes) {
        const reasons = []
        if (low) reasons.push('low-confidence')
        if (conflicting) reasons.push('conflicting')
        if (a.result.noSource) reasons.push('no-source')
        if (sc.highStakes) reasons.push('high-stakes')
        if (a.result.matchedQuestion) reasons.push('paraphrased')
        s = addToQueue(s, msg, 'auto', reasons, '')
      }
      return s
    }

    case 'select': {
      // User chose which answer the panel describes.
      const latest = latestAnswerId(state.messages)
      return {
        ...state,
        activeId: a.id,
        panel: a.claimId ? { mode: 'claim', claimId: a.claimId } : { mode: 'overall' },
        pinned: a.id !== latest || !!a.claimId,
        offerId: a.id === state.offerId ? null : state.offerId,
        checksOpen: false,
      }
    }

    case 'overall':
      return { ...state, panel: { mode: 'overall' }, pinned: state.activeId !== latestAnswerId(state.messages) }

    case 'checks':
      return { ...state, checksOpen: a.open }

    case 'feedback':
      return updateMsg(state, a.id, (m) => ({ feedback: m.feedback === a.value ? null : a.value }))

    case 'escalate': {
      const msg = state.messages.find((m) => m.id === a.id)
      const reasons = ['employee']
      const claims = msg.result?.claims ?? []
      if (claims.some((c) => c.status === 'unsupported')) reasons.push('unsupported')
      if (claims.some((c) => c.status === 'stale' || (c.source && freshnessOf(c.source.docId).stale))) reasons.push('stale')
      if (claims.some((c) => c.status === 'conflicting')) reasons.push('conflicting')
      if (msg.result?.noSource) reasons.push('no-source')
      if (msg.result?.matchedQuestion) reasons.push('paraphrased')
      const s = addToQueue(state, msg, 'employee', reasons, a.note)
      const joined = s.messages.find((m) => m.id === a.id).routed.joined
      return {
        ...s,
        toast: { text: joined ? 'Joined a review already open for this question. The outcome will appear here.' : 'Sent to a reviewer. The outcome will appear on this answer.' },
      }
    }

    case 'decide': {
      const item = state.queue.find((q) => q.id === a.queueId)
      // A correction sent as drafted is re-verified like any other answer.
      const draft = CORRECTIONS[item.scenarioId]
      const recheck = a.decision === 'corrected' && draft && a.correctedText === draft.answer.text
      const outcome = {
        decision: a.decision,
        note: a.note,
        correctedText: a.correctedText,
        recheck: recheck ? { scenarioId: draft.id, result: assess(draft.id) } : null,
        reviewer: 'Policy Reviewer · Business Banking Credit Risk',
        at: 'Today',
      }
      const queue = state.queue.map((q) => (q.id === a.queueId ? { ...q, status: 'resolved', outcome } : q))
      return applyDecision(state, item, outcome, queue, [item.answerId, ...(item.watchers ?? [])].filter(Boolean))
    }

    // Backend mode: the server recorded the decision; mirror it.
    case 'decided': {
      const item = state.queue.find((q) => q.id === a.queueId)
      return applyDecision(state, item, a.outcome, a.queue, a.askers)
    }

    case 'escalated':
      return {
        ...updateMsg(state, a.id, { routed: a.routed }),
        queue: a.queue,
        toast: { text: a.routed.joined ? 'Joined a review already open for this question. The outcome will appear here.' : 'Sent to a reviewer. The outcome will appear on this answer.' },
      }

    case 'queue':
      return { ...state, queue: a.queue }

    case 'trust':
      return { ...state, trust: a.id ? { id: a.id, claimId: a.claimId } : null }

    case 'pitch':
      return { ...state, pitch: a.open }

    case 'toast':
      return { ...state, toast: a.toast }

    default:
      return state
  }
}

/** Record a reviewer decision and return it to every employee waiting on it. */
function applyDecision(state, item, outcome, queue, askers) {
  const hint = REVIEW_HINTS[item.scenarioId] ?? {}
  let s = {
    ...state,
    queue,
    liveDecisions: [
      ...state.liveDecisions,
      { id: item.id, topic: scenarioById(item.scenarioId).topic, docId: hint.docId ?? null, decision: outcome.decision, category: outcome.decision === 'approved' ? 'none' : hint.category ?? 'none' },
    ],
  }
  // askers are message ids in demo mode, stored answer ids in backend mode.
  const ids = s.messages.filter((m) => askers.includes(m.id) || (m.serverId && askers.includes(m.serverId))).map((m) => m.id)
  for (const id of ids) s = updateMsg(s, id, { outcome })
  s = { ...s, unreadOutcomes: s.unreadOutcomes + ids.length }
  return { ...s, toast: { text: askers.length ? 'Decision sent back to the employee who asked.' : 'Decision recorded.' } }
}

function addToQueue(state, msg, routedBy, reasons, note) {
  // The same question already waiting for a reviewer? Join it instead of duplicating.
  const open = state.queue.find((q) => q.status === 'pending' && q.scenarioId === msg.scenarioId)
  if (open) {
    return {
      ...updateMsg(state, msg.id, { routed: { by: routedBy, queueId: open.id, joined: true } }),
      queue: state.queue.map((q) => (q.id === open.id ? { ...q, watchers: [...(q.watchers ?? []), msg.id], reasons: [...new Set([...q.reasons, ...reasons])] } : q)),
    }
  }
  const id = `RQ-${state.seq}`
  const item = {
    id,
    answerId: msg.id,
    scenarioId: msg.scenarioId,
    askedBy: 'You · Relationship Manager, Business Banking',
    askedAt: 'Just now',
    routedBy,
    reasons,
    note,
    status: 'pending',
  }
  return {
    ...updateMsg(state, msg.id, { routed: { by: routedBy, queueId: id } }),
    queue: [item, ...state.queue],
    seq: state.seq + 1,
  }
}

const Ctx = createContext(null)

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initial)
  const cancels = useRef([])
  const nextId = useRef(1)
  const stateRef = useRef(state)
  stateRef.current = state

  useEffect(() => () => cancels.current.forEach((c) => c()), [])

  const fail = useCallback((what) => dispatch({ type: 'toast', toast: { text: `${what} The backend did not respond. Is it running on port 8000?` } }), [])

  const refreshQueue = useCallback(() => {
    api.reviews().then((queue) => dispatch({ type: 'queue', queue }), () => fail('Could not load the review queue.'))
  }, [fail])

  // Backend mode: the review queue and the policy library live on the server.
  useEffect(() => {
    if (BACKEND) {
      refreshQueue()
      refreshLibrary()
    }
  }, [refreshQueue])

  const askQuestion = useCallback(async (question) => {
    const id = nextId.current++
    let reply
    try {
      reply = await ask(question)
    } catch {
      return fail('Could not get an answer.')
    }
    dispatch({ type: 'ask', id, question, reply })
    const answerId = `a${id}`
    // Brief "thinking" beat, then stream the answer, then stream verification in.
    const t = setTimeout(() => {
      const stopStream = streamText(
        reply.text,
        (shown) => dispatch({ type: 'stream', id: answerId, shown }),
        () => {
          dispatch({ type: 'streamed', id: answerId })
          const stopVerify = verify(reply.scenarioId, {
            answerId: reply.answerId,
            question,
            onCheckStart: (i) => dispatch({ type: 'checkStart', id: answerId, i }),
            onCheckDone: (i, check, claims) => dispatch({ type: 'checkDone', id: answerId, i, check, claims }),
            onComplete: (result, routed) => {
              dispatch({ type: 'verified', id: answerId, result, server: BACKEND, routed })
              if (routed) refreshQueue()
              refreshLibrary() // the library may have been edited since the last answer
            },
            onError: () => fail('Verification stopped.'),
          })
          cancels.current.push(stopVerify)
        },
      )
      cancels.current.push(stopStream)
    }, 260)
    cancels.current.push(() => clearTimeout(t))
  }, [fail, refreshQueue])

  const escalate = useCallback(
    async (id, note) => {
      if (!BACKEND) return dispatch({ type: 'escalate', id, note })
      const m = stateRef.current.messages.find((x) => x.id === id)
      try {
        const { routed, queue } = await api.escalate(m.serverId, note)
        dispatch({ type: 'escalated', id, routed, queue })
      } catch {
        fail('Could not send for review.')
      }
    },
    [fail],
  )

  const decide = useCallback(
    async ({ queueId, decision, note, correctedText }) => {
      if (!BACKEND) return dispatch({ type: 'decide', queueId, decision, note, correctedText })
      try {
        const { outcome, askers, queue } = await api.decide(queueId, { decision, note, correctedText })
        dispatch({ type: 'decided', queueId, outcome, askers, queue })
      } catch {
        fail('Could not record the decision.')
      }
    },
    [fail],
  )

  const feedback = useCallback((id, value) => {
    const m = stateRef.current.messages.find((x) => x.id === id)
    dispatch({ type: 'feedback', id, value })
    if (BACKEND && m?.serverId) api.feedback(m.serverId, m.feedback === value ? null : value).catch(() => {})
  }, [])

  useEffect(() => {
    if (!state.toast) return
    const t = setTimeout(() => dispatch({ type: 'toast', toast: null }), 3600)
    return () => clearTimeout(t)
  }, [state.toast])

  return <Ctx.Provider value={{ state, dispatch, askQuestion, escalate, decide, feedback }}>{children}</Ctx.Provider>
}

export function useStore() {
  return useContext(Ctx)
}

export function useActiveAnswer() {
  const { state } = useStore()
  return state.messages.find((m) => m.id === state.activeId) ?? null
}

export { bandFor }

