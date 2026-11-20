import { createContext, useContext, useReducer, useRef, useCallback, useEffect } from 'react'
import { REVIEW_QUEUE_SEED, REVIEW_HINTS, CORRECTIONS } from '../fixtures'
import { ask, streamText } from '../lib/agent'
import { verify, scenarioById } from '../lib/pipeline'
import { assess } from '../lib/assess'
import { bandFor, CHECKS } from '../lib/status'
import { freshnessOf } from '../lib/freshness'

// Local state only. Nothing persists past a refresh.

const freshChecks = () => CHECKS.map(() => ({ status: 'queued' }))

const initial = {
  view: 'workspace', // 'workspace' | 'review' | 'trends'
  messages: [],
  paneId: null, // answer the verify pane is open for; null = pane closed
  focusClaimId: null, // claim the employee last clicked, in chat or pane
  queue: REVIEW_QUEUE_SEED.map((q) => ({ ...q, status: 'pending' })),
  liveDecisions: [],
  unreadOutcomes: 0,
  toast: null,
  seq: 1042,
}

function updateMsg(state, id, patch) {
  return { ...state, messages: state.messages.map((m) => (m.id === id ? { ...m, ...(typeof patch === 'function' ? patch(m) : patch) } : m)) }
}

function reducer(state, a) {
  switch (a.type) {
    case 'view':
      return { ...state, view: a.view, toast: null, unreadOutcomes: a.view === 'workspace' ? 0 : state.unreadOutcomes }

    case 'ask': {
      const user = { id: `u${a.id}`, kind: 'user', text: a.question }
      const answer = {
        id: `a${a.id}`,
        kind: 'answer',
        question: a.question,
        scenarioId: a.reply.scenarioId,
        text: a.reply.text,
        citations: a.reply.citations,
        shown: 0,
        phase: 'thinking', // thinking → streaming → answered → (verifying → done)
        checks: freshChecks(),
        result: null,
        runs: 0, // how many times this answer has been verified
        routed: null,
        outcome: null,
      }
      return { ...state, messages: [...state.messages, user, answer] }
    }

    case 'stream':
      return updateMsg(state, a.id, { shown: a.shown, phase: 'streaming' })

    case 'streamed':
      return updateMsg(state, a.id, (m) => ({ shown: m.text.length, phase: 'answered' }))

    case 'verifyStart':
      return {
        ...updateMsg(state, a.id, (m) => ({ phase: 'verifying', checks: freshChecks(), prevScore: m.result ? m.result.score : undefined, result: null, runs: m.runs + 1 })),
        paneId: a.id,
        focusClaimId: null,
      }

    case 'checkStart':
      return updateMsg(state, a.id, (m) => ({ checks: m.checks.map((c, i) => (i === a.i ? { status: 'running' } : c)) }))

    case 'checkDone':
      return updateMsg(state, a.id, (m) => ({ checks: m.checks.map((c, i) => (i === a.i ? a.check : c)) }))

    case 'verified': {
      let s = updateMsg(state, a.id, { phase: 'done', result: a.result, verifiedAt: Date.now() })
      const msg = s.messages.find((m) => m.id === a.id)
      if (msg.prevScore !== undefined) {
        const same = msg.prevScore === a.result.score
        s = updateMsg(s, a.id, { rerun: { same, from: msg.prevScore } })
        s = { ...s, toast: { text: same ? 'Re-verified. The policy library has not changed, so the result is the same.' : `Re-verified. Score moved from ${msg.prevScore} to ${a.result.score}.` } }
      }
      if (msg.routed) return s // a re-run never files a second review
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

    case 'openPane':
      return { ...state, paneId: a.id, focusClaimId: a.claimId ?? null }

    case 'closePane':
      return { ...state, paneId: null, focusClaimId: null }

    case 'focusClaim':
      return { ...state, focusClaimId: a.claimId, focusNonce: (state.focusNonce ?? 0) + 1 }

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
        toast: { text: joined ? 'A reviewer already has this question. Their decision will appear here too.' : 'Sent to a reviewer. Their decision will appear on this answer.' },
      }
    }

    case 'decide': {
      const item = state.queue.find((q) => q.id === a.queueId)
      const hint = REVIEW_HINTS[item.scenarioId] ?? {}
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
      let s = {
        ...state,
        queue: state.queue.map((q) => (q.id === a.queueId ? { ...q, status: 'resolved', outcome } : q)),
        liveDecisions: [
          ...state.liveDecisions,
          { id: item.id, topic: scenarioById(item.scenarioId).topic, docId: hint.docId ?? null, decision: a.decision, category: a.decision === 'approved' ? 'none' : hint.category ?? 'none' },
        ],
      }
      const askers = [item.answerId, ...(item.watchers ?? [])].filter(Boolean)
      for (const id of askers) s = updateMsg(s, id, { outcome })
      s = { ...s, unreadOutcomes: s.unreadOutcomes + askers.length }
      return { ...s, toast: { text: askers.length ? 'Decision sent back to the employee who asked.' : 'Decision recorded.' } }
    }

    case 'toast':
      return { ...state, toast: a.toast }

    default:
      return state
  }
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
  const running = useRef({})
  const nextId = useRef(1)

  useEffect(() => () => cancels.current.forEach((c) => c()), [])

  const askQuestion = useCallback((question) => {
    const id = nextId.current++
    const reply = ask(question)
    dispatch({ type: 'ask', id, question, reply })
    const answerId = `a${id}`
    // Brief "thinking" beat, then stream the answer. Verification waits for the employee.
    const t = setTimeout(() => {
      const stop = streamText(
        reply.text,
        (shown) => dispatch({ type: 'stream', id: answerId, shown }),
        () => dispatch({ type: 'streamed', id: answerId }),
      )
      cancels.current.push(stop)
    }, 420)
    cancels.current.push(() => clearTimeout(t))
  }, [])

  /** Run (or re-run) the verifier on one answer. Opens the pane on it. */
  const verifyAnswer = useCallback((m) => {
    running.current[m.id]?.()
    dispatch({ type: 'verifyStart', id: m.id })
    const stop = verify(m.scenarioId, {
      question: m.question,
      onCheckStart: (i) => dispatch({ type: 'checkStart', id: m.id, i }),
      onCheckDone: (i, check) => dispatch({ type: 'checkDone', id: m.id, i, check }),
      onComplete: (result) => {
        delete running.current[m.id]
        dispatch({ type: 'verified', id: m.id, result })
      },
    })
    running.current[m.id] = stop
    cancels.current.push(stop)
  }, [])

  useEffect(() => {
    if (!state.toast) return
    const t = setTimeout(() => dispatch({ type: 'toast', toast: null }), 3600)
    return () => clearTimeout(t)
  }, [state.toast])

  return <Ctx.Provider value={{ state, dispatch, askQuestion, verifyAnswer }}>{children}</Ctx.Provider>
}

export function useStore() {
  return useContext(Ctx)
}

export function usePaneAnswer() {
  const { state } = useStore()
  return state.messages.find((m) => m.id === state.paneId) ?? null
}

// The admin review screen still asks for "the active answer".
export const useActiveAnswer = usePaneAnswer

export { bandFor }
