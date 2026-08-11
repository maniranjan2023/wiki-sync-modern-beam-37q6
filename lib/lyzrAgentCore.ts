/**
 * Shared server-side core for calling the Lyzr async task API. Extracted
 * from app/api/agent/route.ts so both the existing /api/agent HTTP route
 * (used by the client-side Web Ask tab) and new server-to-server callers
 * (e.g. the Slack /ask-wiki route) invoke the EXACT same submit/poll logic
 * — no duplicated agent-calling code, no behavior drift between surfaces.
 *
 * Every function here returns plain data ({status, body} or similar) rather
 * than NextResponse, so it has no dependency on the HTTP route layer and
 * can be called in-process from anywhere on the server.
 */
import parseLLMJson from '@/lib/jsonParser'

const LYZR_AGENT_BASE_URL = process.env.LYZR_AGENT_BASE_URL || 'https://agent-prod.studio.lyzr.ai'
const LYZR_TASK_URL = `${LYZR_AGENT_BASE_URL}/v3/inference/chat/task`
const LYZR_API_KEY = process.env.LYZR_API_KEY || ''

export interface ArtifactFile {
  file_url: string
  name: string
  format_type: string
}

export interface ModuleOutputs {
  artifact_files?: ArtifactFile[]
  [key: string]: any
}

export interface NormalizedAgentResponse {
  status: 'success' | 'error'
  result: Record<string, any>
  message?: string
  metadata?: {
    agent_name?: string
    timestamp?: string
    [key: string]: any
  }
}

export function hasLyzrApiKey(): boolean {
  return !!LYZR_API_KEY
}

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

// Contract: `result` is ALWAYS the agent's parsed output, passed through
// untouched. `message` is a derived display string for convenience only.
function deriveDisplayMessage(parsed: Record<string, any>): string | undefined {
  for (const key of ['message', 'text', 'response', 'answer', 'summary', 'content']) {
    if (typeof parsed[key] === 'string') return parsed[key]
  }
  return undefined
}

export function normalizeResponse(parsed: any): NormalizedAgentResponse {
  if (parsed === null || parsed === undefined) {
    return { status: 'error', result: {}, message: 'Empty response from agent' }
  }
  if (typeof parsed === 'string') {
    return { status: 'success', result: { text: parsed }, message: parsed }
  }
  if (typeof parsed !== 'object') {
    return { status: 'success', result: { value: parsed }, message: String(parsed) }
  }
  if ('response' in parsed && !('result' in parsed) && !('status' in parsed)) {
    return normalizeResponse(parsed.response)
  }
  if ('status' in parsed && 'result' in parsed) {
    return {
      status: parsed.status === 'error' ? 'error' : 'success',
      result: parsed.result ?? {},
      message: typeof parsed.message === 'string' ? parsed.message : undefined,
      metadata: parsed.metadata,
    }
  }
  return {
    status: parsed.status === 'error' ? 'error' : 'success',
    result: parsed,
    message: deriveDisplayMessage(parsed),
    metadata: parsed.metadata,
  }
}

export interface CoreResult {
  status: number
  body: any
}

/**
 * Submit a new async task to Lyzr. Same logic/status-code contract as the
 * previous inline submitTask() in app/api/agent/route.ts.
 */
export async function submitAgentTaskCore(body: any): Promise<CoreResult> {
  const { message, agent_id, user_id, session_id, assets } = body

  if (!message || !agent_id) {
    return {
      status: 400,
      body: {
        success: false,
        response: { status: 'error', result: {}, message: 'message and agent_id are required' },
        error: 'message and agent_id are required',
      },
    }
  }

  const finalUserId = user_id || process.env.LYZR_USER_ID || process.env.NEXT_LYZR_USER_ID || `user-${generateUUID()}`
  const finalSessionId = session_id || `${agent_id}-${generateUUID().substring(0, 12)}`

  const payload: Record<string, any> = {
    message,
    agent_id,
    user_id: finalUserId,
    session_id: finalSessionId,
  }
  if (assets && assets.length > 0) payload.assets = assets

  const submitRes = await fetch(LYZR_TASK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': LYZR_API_KEY },
    body: JSON.stringify(payload),
  })

  if (!submitRes.ok) {
    const submitText = await submitRes.text()
    let errorMsg = `Task submit failed with status ${submitRes.status}`
    try {
      const errorData = JSON.parse(submitText)
      errorMsg = errorData?.detail || errorData?.error || errorData?.message || errorMsg
    } catch {
      try {
        const errorData = parseLLMJson(submitText)
        errorMsg = errorData?.error || errorData?.message || errorMsg
      } catch {}
    }
    return {
      status: submitRes.status,
      body: {
        success: false,
        response: { status: 'error', result: {}, message: errorMsg },
        error: errorMsg,
        raw_response: submitText,
      },
    }
  }

  const { task_id } = await submitRes.json()
  return {
    status: 200,
    body: { task_id, agent_id, user_id: finalUserId, session_id: finalSessionId },
  }
}

/**
 * Poll a task by ID. Same logic/status-code contract as the previous inline
 * pollTask() in app/api/agent/route.ts.
 */
export async function pollAgentTaskCore(task_id: string): Promise<CoreResult> {
  const pollRes = await fetch(`${LYZR_TASK_URL}/${task_id}`, {
    headers: { accept: 'application/json', 'x-api-key': LYZR_API_KEY },
  })

  if (!pollRes.ok) {
    const pollText = await pollRes.text()
    const msg = pollRes.status === 404 ? 'Task expired or not found' : `Poll failed with status ${pollRes.status}`
    return {
      status: pollRes.status,
      body: { success: false, status: 'failed', error: msg, raw_response: pollText },
    }
  }

  const task = await pollRes.json()

  if (task.status === 'processing') {
    return { status: 200, body: { status: 'processing' } }
  }

  if (task.status === 'failed') {
    return {
      status: 200,
      body: {
        success: false,
        status: 'failed',
        response: { status: 'error', result: {}, message: task.error || 'Agent task failed' },
        error: task.error || 'Agent task failed',
      },
    }
  }

  const rawText = JSON.stringify(task.response)
  let moduleOutputs: ModuleOutputs | undefined
  let agentResponseRaw: any = rawText

  try {
    const envelope = JSON.parse(rawText)
    if (envelope && typeof envelope === 'object' && 'response' in envelope) {
      moduleOutputs = envelope.module_outputs
      agentResponseRaw = envelope.response
    }
  } catch {
    // Not standard JSON envelope — parseLLMJson will handle it
  }

  const parsed = parseLLMJson(agentResponseRaw)
  const toNormalize =
    parsed && typeof parsed === 'object' && parsed.success === false && parsed.data === null
      ? agentResponseRaw
      : parsed
  const normalized = normalizeResponse(toNormalize)

  return {
    status: 200,
    body: {
      success: true,
      status: 'completed',
      response: normalized,
      module_outputs: moduleOutputs,
      timestamp: new Date().toISOString(),
    },
  }
}
