import { NextRequest, NextResponse } from 'next/server'
import parseLLMJson from '@/lib/jsonParser'

const LYZR_AGENT_BASE_URL = process.env.LYZR_AGENT_BASE_URL || 'https://agent-prod.studio.lyzr.ai'
const LYZR_TASK_URL = `${LYZR_AGENT_BASE_URL}/v3/inference/chat/task`
const LYZR_API_KEY = process.env.LYZR_API_KEY || ''

// Types
interface ArtifactFile {
  file_url: string
  name: string
  format_type: string
}

interface ModuleOutputs {
  artifact_files?: ArtifactFile[]
  [key: string]: any
}

interface NormalizedAgentResponse {
  status: 'success' | 'error'
  result: Record<string, any>
  message?: string
  metadata?: {
    agent_name?: string
    timestamp?: string
    [key: string]: any
  }
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
// Never synthesize a new `result` object — that loses structured fields the
// UI needs (variants, escalation_reason, custom schema fields, etc.).
function deriveDisplayMessage(parsed: Record<string, any>): string | undefined {
  for (const key of ['message', 'text', 'response', 'answer', 'summary', 'content']) {
    if (typeof parsed[key] === 'string') return parsed[key]
  }
  return undefined
}

function normalizeResponse(parsed: any): NormalizedAgentResponse {
  if (parsed === null || parsed === undefined) {
    return { status: 'error', result: {}, message: 'Empty response from agent' }
  }

  // Plain string from a non-JSON agent — wrap it so `result` stays an object.
  if (typeof parsed === 'string') {
    return { status: 'success', result: { text: parsed }, message: parsed }
  }

  // Other primitives (number/boolean) — same.
  if (typeof parsed !== 'object') {
    return { status: 'success', result: { value: parsed }, message: String(parsed) }
  }

  // Single-key { response: <agent output> } envelope — unwrap once, recurse.
  if ('response' in parsed && !('result' in parsed) && !('status' in parsed)) {
    return normalizeResponse(parsed.response)
  }

  // Lyzr-style envelope { status, result, message?, metadata? } — pass through.
  if ('status' in parsed && 'result' in parsed) {
    return {
      status: parsed.status === 'error' ? 'error' : 'success',
      result: parsed.result ?? {},
      message: typeof parsed.message === 'string' ? parsed.message : undefined,
      metadata: parsed.metadata,
    }
  }

  // Schema-shaped object (the common case for JSON-mode agents).
  // Pass the WHOLE object through as `result`; derive `message` from it.
  return {
    status: parsed.status === 'error' ? 'error' : 'success',
    result: parsed,
    message: deriveDisplayMessage(parsed),
    metadata: parsed.metadata,
  }
}

/**
 * POST /api/agent
 *
 * Two modes, both POST:
 *   1. Submit:  body has { message, agent_id, ... }  → submits task, returns { task_id }
 *   2. Poll:    body has { task_id }                  → polls Lyzr, returns status/result
 *
 * Status-code contract: fetchWrapper escalates any 5xx to the parent preview
 * as a child-app error, so 5xx is reserved for genuine server/upstream
 * failures (missing key, Lyzr 5xx passed through, Lyzr unreachable).
 * Agent-level outcomes — including a failed task — are delivered in-band as
 * 200 + { success: false }; the client keys off the body, not the status.
 */
export async function POST(request: NextRequest) {
  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      {
        success: false,
        response: { status: 'error', result: {}, message: 'Invalid JSON in request body' },
        error: 'Invalid JSON in request body',
      },
      { status: 400 }
    )
  }

  if (!LYZR_API_KEY) {
    return NextResponse.json(
      {
        success: false,
        response: { status: 'error', result: {}, message: 'LYZR_API_KEY not configured' },
        error: 'LYZR_API_KEY not configured on server',
      },
      { status: 500 }
    )
  }

  try {
    // ── Poll mode: body has task_id ──
    if (body.task_id) {
      return await pollTask(body.task_id)
    }

    // ── Submit mode: body has message + agent_id ──
    return await submitTask(body)
  } catch (error) {
    // Only reached when the upstream call itself blew up (network/DNS,
    // malformed upstream body) — a real gateway failure, so 502 keeps it
    // visible to the preview error overlay.
    const errorMsg = error instanceof Error ? error.message : 'Upstream agent service error'
    return NextResponse.json(
      {
        success: false,
        response: { status: 'error', result: {}, message: errorMsg },
        error: errorMsg,
      },
      { status: 502 }
    )
  }
}

/**
 * Submit a new async task to Lyzr
 */
async function submitTask(body: any) {
  const { message, agent_id, user_id, session_id, assets } = body

  if (!message || !agent_id) {
    return NextResponse.json(
      {
        success: false,
        response: { status: 'error', result: {}, message: 'message and agent_id are required' },
        error: 'message and agent_id are required',
      },
      { status: 400 }
    )
  }

  const finalUserId = user_id || process.env.LYZR_USER_ID || process.env.NEXT_LYZR_USER_ID || `user-${generateUUID()}`
  const finalSessionId = session_id || `${agent_id}-${generateUUID().substring(0, 12)}`

  const payload: Record<string, any> = {
    message,
    agent_id,
    user_id: finalUserId,
    session_id: finalSessionId,
  }

  if (assets && assets.length > 0) {
    payload.assets = assets
  }

  const submitRes = await fetch(LYZR_TASK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': LYZR_API_KEY,
    },
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
    return NextResponse.json(
      {
        success: false,
        response: { status: 'error', result: {}, message: errorMsg },
        error: errorMsg,
        raw_response: submitText,
      },
      { status: submitRes.status }
    )
  }

  const { task_id } = await submitRes.json()

  return NextResponse.json({
    task_id,
    agent_id,
    user_id: finalUserId,
    session_id: finalSessionId,
  })
}

/**
 * Poll a task by ID — single request proxy with API key
 */
async function pollTask(task_id: string) {
  const pollRes = await fetch(`${LYZR_TASK_URL}/${task_id}`, {
    headers: {
      'accept': 'application/json',
      'x-api-key': LYZR_API_KEY,
    },
  })

  if (!pollRes.ok) {
    const pollText = await pollRes.text()
    const msg = pollRes.status === 404
      ? 'Task expired or not found'
      : `Poll failed with status ${pollRes.status}`
    return NextResponse.json(
      {
        success: false,
        status: 'failed',
        error: msg,
        raw_response: pollText,
      },
      { status: pollRes.status }
    )
  }

  const task = await pollRes.json()

  // Still processing
  if (task.status === 'processing') {
    return NextResponse.json({ status: 'processing' })
  }

  // Task failed — an agent-level outcome, not a server failure. The poll
  // itself succeeded, so this stays 200; a 5xx here would make fetchWrapper
  // flag the child app as broken for an upstream inference failure.
  if (task.status === 'failed') {
    return NextResponse.json({
      success: false,
      status: 'failed',
      response: { status: 'error', result: {}, message: task.error || 'Agent task failed' },
      error: task.error || 'Agent task failed',
    })
  }

  // Task completed — envelope extraction + parseLLMJson + normalizeResponse
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

  // Note: `raw_response` is intentionally omitted on success.
  // `response.result` is the canonical agent output; shipping a parallel
  // raw copy creates contract ambiguity and hides normalizer bugs by giving
  // the UI an escape hatch to re-parse.
  return NextResponse.json({
    success: true,
    status: 'completed',
    response: normalized,
    module_outputs: moduleOutputs,
    timestamp: new Date().toISOString(),
  })
}
