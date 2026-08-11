import { NextRequest, NextResponse } from 'next/server'
import { submitAgentTaskCore, pollAgentTaskCore, hasLyzrApiKey } from '@/lib/lyzrAgentCore'

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
 *
 * The actual submit/poll logic lives in lib/lyzrAgentCore.ts so server-side
 * callers (e.g. the Slack /ask-wiki route) can invoke the identical logic
 * in-process without duplicating it or round-tripping through this HTTP route.
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

  if (!hasLyzrApiKey()) {
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
    if (body.task_id) {
      const { status, body: resBody } = await pollAgentTaskCore(body.task_id)
      return NextResponse.json(resBody, { status })
    }
    const { status, body: resBody } = await submitAgentTaskCore(body)
    return NextResponse.json(resBody, { status })
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
