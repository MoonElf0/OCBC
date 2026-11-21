import { createContext, useContext, useReducer, useRef, useCallback, useEffect } from 'react'
import { REVIEW_QUEUE_SEED, REVIEW_HINTS, CORRECTIONS, PEOPLE } from '../fixtures'
import { ask, streamText } from '../lib/agent'
import { verify, scenarioById } from '../lib/pipeline'
import { assess } from '../lib/assess'
import { bandFor, CHECKS } from '../lib/status'
import { freshnessOf } from '../lib/freshness'
import { BACKEND, api } from '../lib/backend'

// UI state. In demo mode this is the only state and nothing persists past a
// refresh. In backend mode the server is the record for answers, their
// assessments, the review queue and reviewer decisions; the actions below
// mirror its responses.

// Prototype only: there is no sign-in. Reviewer identities are simulated and
// labelled as such wherever they appear.
export const DEMO_REVIEWERS = [{ id: 'rev-credit', name: 'Reviewer A', role: PEOPLE.reviewer.role, simulated: true }]

/**
 * Mandatory-review rules (same as backend/app/routing.py). A high reliability
 * index never bypasses them, and neither does a Challenger clarification.
 */
export function reviewReasons(result, highStakes) {
  const claims = result.claims
  const reasons = []
  if (result.band?.id === 'low') reasons.push('low-confidence')
  if (claims.some((c) => c.status === 'conflicting')) reasons.push('conflicting')
  if (result.noSource || claims.some((c) => c.status === 'no-source' || c.status === 'insufficient')) reasons.push('no-source')
  if (result.assessment?.partial) reasons.push('partial')
  if (highStakes && claims.length) reasons.push('high-stakes')
  if (reasons.length && result.matchedQuestion) reasons.push('paraphrased')
  return reasons
}

const freshChecks = () => CHECKS.map(() => ({ status: 'queued' }))

const initial = {
  view: 'workspace', // 'workspace' | 'classic' | 'verify' | 'review' | 'library' | 'trends' | 'evaluation' | 'versions'
  messages: [],
  paneId: null, // answer the verify pane is open for; null = pane closed
  focusClaimId: null, // claim the employee last clicked, in chat or pane
  // Classic assistant page (character panel + thread). Its messages live in
  // state.messages tagged origin: 'classic', so the review queue and reviewer
  // outcomes work across both pages.
  classic: { activeId: null, panel: { mode: 'overall' }, pinned: false, offerId: null, checksOpen: false },
  queue: REVIEW_QUEUE_SEED.map((q) => ({ ...q, status: 'pending' })),
  liveDecisions: [],
  unreadOutcomes: 0,
  toast: null,
  trust: null, // { id, claimId } while the Trust Map is open
  pitch: false,
  seq: 1042,
  health: null, // backend mode: model status, review rules, simulated reviewers
  verifyDraft: null, // { question, answer, citations, asOf } handed from an Assistant answer to the Verify answer form
}

const isClassic = (m) => m?.origin === 'classic'
const latestClassicId = (messages) => [...messages].reverse().find((m) => m.kind === 'answer' && isClassic(m))?.id ?? null
const setClassic = (state, patch) => ({ ...state, classic: { ...state.classic, ...patch } })

function updateMsg(state, id, patch) {
  return { ...state, messages: state.messages.map((m) => (m.id === id ? { ...m, ...(typeof patch === 'function' ? patch(m) : patch) } : m)) }
}

function reducer(state, a) {
  switch (a.type) {
    case 'view':
      return { ...state, view: a.view, toast: null, classic: { ...state.classic, checksOpen: false }, unreadOutcomes: a.view === 'workspace' || a.view === 'classic' ? 0 : state.unreadOutcomes }

    // Copy an Assistant answer into the Verify answer form and go there. The form
    // reads the draft once and clears it, so coming back later starts empty.
    case 'prefillVerify':
      return { ...reducer(state, { type: 'view', view: 'verify' }), verifyDraft: a.draft }
    case 'verifyDraftUsed':
      return { ...state, verifyDraft: null }

    case 'ask': {
      const origin = a.origin ?? 'assistant' // which page asked: 'assistant' | 'classic'
      const user = { id: `u${a.id}`, kind: 'user', text: a.question, source: a.source ?? 'asked', origin }
      const answer = {
        id: `a${a.id}`,
        serverId: a.reply.answerId ?? null, // backend mode: the stored answer's id
        kind: 'answer',
        origin,
        source: a.source ?? 'asked', // 'asked' (Policy Assistant) | 'submitted' (pasted in to verify)
        state: 'verifying',
        asOf: a.reply.asOf ?? null,
        question: a.question,
        scenarioId: a.reply.scenarioId,
        generatedBy: a.reply.generatedBy ?? null, // set when a model wrote the answer (backend mode)
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
      const next = { ...state, messages: [...state.messages, user, answer] }
      if (origin !== 'classic') return next
      // Classic page: the newest answer becomes active, unless the user is examining another one.
      if (state.classic.pinned && state.classic.activeId) return next
      return setClassic(next, { activeId: answer.id, panel: { mode: 'overall' }, offerId: null, checksOpen: false })
    }

    case 'stream':
      return updateMsg(state, a.id, { shown: a.shown, phase: 'streaming' })

    case 'streamed':
      return updateMsg(state, a.id, (m) => ({ shown: m.text.length, phase: 'answered' }))

    case 'verifyStart': {
      const s = updateMsg(state, a.id, (m) => ({ phase: 'verifying', checks: freshChecks(), prevScore: m.result ? m.result.score : undefined, result: null, runs: m.runs + 1 }))
      // The classic page has its own side panel; only the assistant page opens the verify pane.
      if (isClassic(s.messages.find((m) => m.id === a.id))) return s
      return { ...s, paneId: a.id, focusClaimId: null }
    }

    // The second verifier's advisory result, shown beside the main one. Never touches state or routing.
    case 'secondStart':
      return updateMsg(state, a.id, { second: { phase: 'running', verifier: a.verifier ?? null } })
    case 'secondDone':
      return updateMsg(state, a.id, { second: { phase: a.result ? 'done' : 'not-run', verifier: a.verifier, result: a.result } })
    case 'secondFailed':
      return updateMsg(state, a.id, { second: { phase: 'error', verifier: a.verifier ?? null, error: a.error } })

    case 'checkStart':
      return updateMsg(state, a.id, (m) => ({ checks: m.checks.map((c, i) => (i === a.i ? { status: 'running' } : c)) }))

    case 'checkDone':
      return updateMsg(state, a.id, (m) => ({ checks: m.checks.map((c, i) => (i === a.i ? a.check : c)), ...(a.claims ? { claims: a.claims } : {}) }))

    case 'verified': {
      let s = updateMsg(state, a.id, { phase: 'done', result: a.result, verifiedAt: Date.now() })
      const msg = s.messages.find((m) => m.id === a.id)
      // Classic page: offer the newest answer if the user is looking at an older one.
      if (isClassic(msg) && s.classic.activeId !== a.id && a.id === latestClassicId(s.messages)) s = setClassic(s, { offerId: a.id })
      if (msg.prevScore !== undefined) {
        const same = msg.prevScore === a.result.score
        s = updateMsg(s, a.id, { rerun: { same, from: msg.prevScore } })
        s = { ...s, toast: { text: same ? 'Re-verified. The policy library has not changed, so the result is the same.' : `Re-verified. Score moved from ${msg.prevScore} to ${a.result.score}.` } }
      }
      // Backend mode: the server already applied the review rules and set the state.
      if (a.server) return updateMsg(s, a.id, (m) => ({ state: a.meta?.state ?? m.state ?? 'cleared', assessmentId: a.meta?.assessmentId ?? null, ...(a.routed && !m.routed ? { routed: a.routed } : {}) }))
      if (msg.routed) return s // a re-run never files a second review
      // Mandatory-review rules: a high score never bypasses them.
      const reasons = reviewReasons(a.result, scenarioById(msg.scenarioId).highStakes)
      if (reasons.length) s = addToQueue(s, msg, 'auto', reasons, '')
      return updateMsg(s, a.id, { state: reasons.length ? 'review-required' : 'cleared' })
    }

    case 'openPane':
      return { ...state, paneId: a.id, focusClaimId: a.claimId ?? null }

    // Backend mode: re-verified against the current policy versions.
    case 'reverified':
      return {
        ...updateMsg(state, a.id, (m) => ({ result: a.result, claims: a.result.claims, checks: a.result.checks, state: a.state, assessmentId: a.assessmentId, routed: a.routed ?? m.routed, outcome: a.routed ? null : m.outcome, evidenceChanged: null, history: (m.history ?? 0) + 1 })),
        queue: a.queue ?? state.queue,
        toast: { text: a.routed ? 'Re-verified against current policy. It needs a reviewer again.' : 'Re-verified against current policy.' },
      }

    // A policy this answer relied on has a new approved version.
    case 'impacted': {
      const ids = new Set(a.impacted.map((i) => i.answerId))
      return {
        ...state,
        messages: state.messages.map((m) => (m.serverId && ids.has(m.serverId) ? { ...m, state: 'reverify-required', evidenceChanged: a.impacted.find((i) => i.answerId === m.serverId) } : m)),
      }
    }

    case 'health':
      return { ...state, health: a.health }

    // Classic page: which answer (and claim) its side panel describes.
    case 'select': {
      const latest = latestClassicId(state.messages)
      return setClassic(state, {
        activeId: a.id,
        panel: a.claimId ? { mode: 'claim', claimId: a.claimId } : { mode: 'overall' },
        pinned: a.id !== latest || !!a.claimId,
        offerId: a.id === state.classic.offerId ? null : state.classic.offerId,
        checksOpen: false,
      })
    }

    case 'overall':
      return setClassic(state, { panel: { mode: 'overall' }, pinned: state.classic.activeId !== latestClassicId(state.messages) })

    case 'checks':
      return setClassic(state, { checksOpen: a.open })

    case 'closePane':
      return { ...state, paneId: null, focusClaimId: null }

    case 'focusClaim':
      return { ...state, focusClaimId: a.claimId, focusNonce: (state.focusNonce ?? 0) + 1 }

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
      const s0 = addToQueue(state, msg, 'employee', reasons, a.note)
      const joined = s0.messages.find((m) => m.id === a.id).routed.joined
      const s = msg.state === 'cleared' ? updateMsg(s0, a.id, { state: 'review-required' }) : s0
      return {
        ...s,
        toast: { text: joined ? 'A reviewer already has this question. Their decision will appear here too.' : 'Sent to a reviewer. Their decision will appear on this answer.' },
      }
    }

    case 'decide': {
      const item = state.queue.find((q) => q.id === a.queueId)
      // Demo mode has no verification pipeline in the browser: only the draft
      // assembled from the evidence has a computed re-check. Any other wording
      // is recorded as not re-checked, and the interface says so.
      const draft = CORRECTIONS[item.scenarioId]
      const recheck = a.decision === 'corrected' && draft && a.correctedText === draft.answer.text
      const reviewer = DEMO_REVIEWERS.find((r) => r.id === a.reviewerId) ?? DEMO_REVIEWERS[0]
      const outcome = {
        decision: a.decision,
        note: a.note,
        correctedText: a.correctedText,
        recheck: recheck ? { scenarioId: draft.id, result: assess(draft.id) } : null,
        reviewer: `${reviewer.name} (simulated) · ${reviewer.role}`,
        simulatedIdentity: true,
        override: !!a.overrideFlags,
        at: new Date().toISOString(),
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
        ...updateMsg(state, a.id, (m) => ({ routed: a.routed, state: a.state ?? (m.state === 'cleared' ? 'review-required' : m.state) })),
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
  for (const id of ids) s = updateMsg(s, id, { outcome, state: outcome.decision })
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
  const running = useRef({})
  const verifyRef = useRef(null)
  const nextId = useRef(1)
  const stateRef = useRef(state)
  stateRef.current = state

  useEffect(() => () => cancels.current.forEach((c) => c()), [])

  const fail = useCallback((what) => dispatch({ type: 'toast', toast: { text: `${what} The backend did not respond. Is it running on port 8000?` } }), [])

  const refreshQueue = useCallback(() => {
    api.reviews().then((queue) => dispatch({ type: 'queue', queue }), () => fail('Could not load the review queue.'))
  }, [fail])

  // Backend mode: the review queue lives on the server.
  useEffect(() => {
    if (!BACKEND) return
    refreshQueue()
    api.health().then((health) => dispatch({ type: 'health', health }), () => {})
  }, [refreshQueue])

  const reverify = useCallback(
    async (id) => {
      const m = stateRef.current.messages.find((x) => x.id === id)
      if (!BACKEND || !m?.serverId) return
      try {
        const r = await api.reverify(m.serverId)
        dispatch({ type: 'reverified', id, result: r.result, state: r.answer.state, assessmentId: r.assessmentId, routed: r.routed, queue: r.queue })
      } catch {
        fail('Could not re-verify the answer.')
      }
    },
    [fail],
  )

  const askQuestion = useCallback(async (question, { origin = 'assistant' } = {}) => {
    const id = nextId.current++
    let reply
    try {
      // The assistant page asks the model-backed agent (if the server has one); the classic page keeps the scripted storyline.
      reply = await ask(question, { agent: origin === 'classic' ? 'scripted' : 'model' })
    } catch (e) {
      if (e.fromServer) return dispatch({ type: 'toast', toast: { text: e.message } })
      return fail('Could not get an answer.')
    }
    dispatch({ type: 'ask', id, question, reply, origin })
    const answerId = `a${id}`
    // Brief "thinking" beat, then stream the answer. On the assistant page
    // verification waits for the employee; the classic page verifies at once.
    const t = setTimeout(() => {
      const stop = streamText(
        reply.text,
        (shown) => dispatch({ type: 'stream', id: answerId, shown }),
        () => {
          dispatch({ type: 'streamed', id: answerId })
          if (origin === 'classic') verifyRef.current({ id: answerId, scenarioId: reply.scenarioId, serverId: reply.answerId ?? null, question })
        },
      )
      cancels.current.push(stop)
    }, 420)
    cancels.current.push(() => clearTimeout(t))
  }, [fail])

  const escalate = useCallback(
    async (id, note) => {
      if (!BACKEND) return dispatch({ type: 'escalate', id, note })
      const m = stateRef.current.messages.find((x) => x.id === id)
      try {
        const { routed, queue, state } = await api.escalate(m.serverId, note)
        dispatch({ type: 'escalated', id, routed, queue, state })
      } catch {
        fail('Could not send for review.')
      }
    },
    [fail],
  )

  const decide = useCallback(
    async ({ queueId, decision, note, correctedText, reviewerId, overrideFlags }) => {
      if (!BACKEND) {
        dispatch({ type: 'decide', queueId, decision, note, correctedText, reviewerId, overrideFlags })
        return { ok: true }
      }
      try {
        const { outcome, askers, queue } = await api.decide(queueId, { decision, note, correctedText, reviewerId, overrideFlags })
        dispatch({ type: 'decided', queueId, outcome, askers, queue })
        return { ok: true }
      } catch (e) {
        if (e.fromServer) {
          dispatch({ type: 'toast', toast: { text: e.message } })
          return { ok: false, error: e.message, result: e.payload?.result ?? null }
        }
        fail('Could not record the decision.')
        return { ok: false }
      }
    },
    [fail],
  )

  const feedback = useCallback((id, value) => {
    const m = stateRef.current.messages.find((x) => x.id === id)
    dispatch({ type: 'feedback', id, value })
    if (BACKEND && m?.serverId) api.feedback(m.serverId, m.feedback === value ? null : value).catch(() => {})
  }, [])

  /**
   * Backend mode, Assistant page: ask the second verifier for its own assessment
   * of the same answer, in parallel with the main one, so the two can be compared.
   */
  const secondOpinion = useCallback(async (m) => {
    if (!BACKEND || !m.serverId || m.origin === 'classic' || m.source === 'submitted') return
    const verifier = stateRef.current.health?.secondVerifier ?? null
    if (verifier && !verifier.available) return dispatch({ type: 'secondDone', id: m.id, verifier, result: null })
    dispatch({ type: 'secondStart', id: m.id, verifier })
    try {
      const r = await api.secondOpinion(m.serverId)
      dispatch({ type: 'secondDone', id: m.id, verifier: r.verifier, result: r.result })
    } catch (e) {
      dispatch({ type: 'secondFailed', id: m.id, verifier, error: e.fromServer ? e.message : 'The backend did not respond.' })
    }
  }, [])

  /** Run (or re-run) the verifier on one answer. Opens the pane on it. */
  const verifyAnswer = useCallback((m) => {
    running.current[m.id]?.()
    dispatch({ type: 'verifyStart', id: m.id })
    secondOpinion(m)
    const stop = verify(m.scenarioId, {
      answerId: m.serverId,
      question: m.question,
      onCheckStart: (i) => dispatch({ type: 'checkStart', id: m.id, i }),
      onCheckDone: (i, check, claims) => dispatch({ type: 'checkDone', id: m.id, i, check, claims }),
      onComplete: (result, routed, meta) => {
        delete running.current[m.id]
        dispatch({ type: 'verified', id: m.id, result, server: BACKEND, routed, meta })
        if (routed) refreshQueue()
      },
      onError: () => {
        delete running.current[m.id]
        fail('Verification stopped.')
      },
    })
    running.current[m.id] = stop
    cancels.current.push(stop)
  }, [fail, refreshQueue, secondOpinion])

  /**
   * Verify an answer written elsewhere: the user pastes the question, the AI
   * answer and its citations. Backend mode only — the scripted demo has no
   * pipeline that can read arbitrary text.
   */
  verifyRef.current = verifyAnswer

  const submitAnswer = useCallback(
    async ({ question, answer, citations, asOf }, { origin = 'assistant' } = {}) => {
      const id = nextId.current++
      let reply
      try {
        reply = await api.submit({ question, answer, citations, ...(asOf ? { asOf } : {}) })
      } catch (e) {
        fail(e.fromServer ? `${e.message}` : 'Could not submit the answer.')
        return false
      }
      dispatch({ type: 'ask', id, question, reply, source: 'submitted', origin })
      // Already written: show it at once, then let the checks resolve.
      dispatch({ type: 'streamed', id: `a${id}` })
      verifyAnswer({ id: `a${id}`, scenarioId: reply.scenarioId, serverId: reply.answerId, question, origin })
      return true
    },
    [fail, verifyAnswer],
  )

  useEffect(() => {
    if (!state.toast) return
    const t = setTimeout(() => dispatch({ type: 'toast', toast: null }), 3600)
    return () => clearTimeout(t)
  }, [state.toast])

  return <Ctx.Provider value={{ state, dispatch, askQuestion, verifyAnswer, submitAnswer, reverify, refreshQueue, escalate, decide, feedback }}>{children}</Ctx.Provider>
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

/**
 * The classic assistant page sees the store as it was before the redesign:
 * only its own messages, its panel state at the top level, and verifyAnswer
 * meaning "verify a pasted answer". Queue, decisions and toasts are shared.
 */
export function useClassicStore() {
  const store = useStore()
  const { state } = store
  return {
    ...store,
    state: { ...state, ...state.classic, messages: state.messages.filter(isClassic) },
    askQuestion: (q) => store.askQuestion(q, { origin: 'classic' }),
    verifyAnswer: (x) => store.submitAnswer(x, { origin: 'classic' }),
  }
}

export function useClassicActive() {
  const { state } = useStore()
  return state.messages.find((m) => m.id === state.classic.activeId) ?? null
}

export { bandFor }

