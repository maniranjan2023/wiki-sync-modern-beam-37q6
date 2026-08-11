/**
 * Server-only helper to call a Lyzr agent synchronously (submit + poll to
 * completion) without going through the client-only fetchWrapper/iframe
 * machinery in lib/aiAgent.ts. Used by server-to-server callers such as the
 * Slack /ask-wiki route, which needs to invoke the SAME Verified Answer
 * Agent as the Web Ask tab from inside a Node API route.
 *
 * Calls submitAgentTaskCore/pollAgentTaskCore directly (in-process function
 * calls, not HTTP round-trips to our own /api/agent) — the exact same logic
 * the /api/agent route itself uses, so behavior never diverges from Web Ask.
 */
import { submitAgentTaskCore, pollAgentTaskCore, hasLyzrApiKey } from '@/lib/lyzrAgentCore'

export interface ServerAgentResponse {
  success: boolean
  response: {
    status: 'success' | 'error'
    result: Record<string, any>
    message?: string
  }
  error?: string
}

// Bounded wait for a Slack round-trip: Slack's response_url accepts delayed
// posts for a generous window, but we still cap this so a stuck task can
// never hang the Node process indefinitely.
const POLL_TIMEOUT_MS = 90 * 1000

export async function callAIAgentServer(message: string, agent_id: string): Promise<ServerAgentResponse> {
  if (!hasLyzrApiKey()) {
    return {
      success: false,
      response: { status: 'error', result: {}, message: 'LYZR_API_KEY not configured' },
      error: 'LYZR_API_KEY not configured',
    }
  }

  const submit = await submitAgentTaskCore({ message, agent_id })
  if (submit.status !== 200 || !submit.body?.task_id) {
    const errorMsg = submit.body?.error ?? 'Failed to submit agent task'
    return { success: false, response: { status: 'error', result: {}, message: errorMsg }, error: errorMsg }
  }

  const { task_id } = submit.body
  const start = Date.now()
  let attempt = 0

  while (Date.now() - start < POLL_TIMEOUT_MS) {
    const delay = Math.min(300 * Math.pow(1.5, attempt), 3000)
    await new Promise((r) => setTimeout(r, delay))
    attempt++

    const poll = await pollAgentTaskCore(task_id)
    if (poll.body?.status === 'processing') continue
    return poll.body as ServerAgentResponse
  }

  return {
    success: false,
    response: { status: 'error', result: {}, message: 'Agent task timed out' },
    error: 'Agent task timed out',
  }
}
