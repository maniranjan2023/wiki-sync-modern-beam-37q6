/**
 * Slack /ask-wiki slash command endpoint.
 *
 * Slack -> this route -> SAME Verified Answer Agent already used by the Web
 * Ask tab (lib/aiAgentServer.ts + lib/lyzrAgentCore.ts, shared with
 * app/api/agent/route.ts) -> SAME answer parsing (lib/wikiAnswerParser.ts)
 * -> Slack mrkdwn formatting only (lib/slackFormat.ts).
 *
 * No new agent, no new RAG/KB, no new permission model: this route never
 * grants more than Web Ask's own agent call already exposes to any
 * authenticated Viewer (read-only, verified-sections-only, per the agent's
 * own instructions). The signing-secret check below is the sole access
 * control, proving the request genuinely came from the one configured
 * Slack app for this workspace — see slackVerify.ts.
 */
import { NextRequest, NextResponse, after } from 'next/server'
import { verifySlackSignature } from '@/lib/slackVerify'
import { callAIAgentServer } from '@/lib/aiAgentServer'
import { parseAnswer, VERIFIED_ANSWER_AGENT_ID } from '@/lib/wikiAnswerParser'
import { formatAnswerForSlack, withQuestionHeader } from '@/lib/slackFormat'

const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET || ''

// This route uses Node's `crypto` module (in lib/slackVerify.ts), which
// requires the Node.js runtime rather than the Edge runtime.
export const runtime = 'nodejs'

// Simple in-memory sliding-window rate limit, keyed by team+user. NOTE: on
// Netlify's serverless Next.js runtime, each invocation may run in a fresh
// function instance, so this in-memory Map is a best-effort limiter (it
// helps within a warm/reused instance) rather than a guaranteed global
// limit. There is no existing app-wide rate limiter to reuse; a durable
// cross-instance limit would require a shared store (e.g. the app's own
// Postgres database), which is out of scope for this MVP.
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX_REQUESTS = 10
const rateLimitLog = new Map<string, number[]>()

function isRateLimited(key: string): boolean {
  const now = Date.now()
  const timestamps = (rateLimitLog.get(key) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS)
  timestamps.push(now)
  rateLimitLog.set(key, timestamps)
  return timestamps.length > RATE_LIMIT_MAX_REQUESTS
}

function ephemeral(text: string) {
  return NextResponse.json({ response_type: 'ephemeral', text })
}

// Never expose stack traces, keys, tokens, or the signing secret in any
// Slack-facing text or log line — only these safe fields.
function logEvent(event: 'slack_ask_wiki_received' | 'slack_ask_wiki_completed' | 'slack_ask_wiki_failed', fields: Record<string, any>) {
  console.log(JSON.stringify({ event, ...fields, ts: new Date().toISOString() }))
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now()

  // Read the raw body ONCE, verbatim — required for HMAC verification;
  // URLSearchParams parsing must happen on this same raw string afterward.
  const rawBody = await request.text()
  const timestamp = request.headers.get('x-slack-request-timestamp')
  const signature = request.headers.get('x-slack-signature')

  const verify = verifySlackSignature({ rawBody, timestamp, signature, signingSecret: SLACK_SIGNING_SECRET })
  if (!verify.ok) {
    logEvent('slack_ask_wiki_failed', { reason: verify.reason, latency_ms: Date.now() - startedAt })
    // Fail closed with a generic message — never confirm/deny specifics of
    // why verification failed, and never call the agent for an unverified request.
    return NextResponse.json({ error: 'Unauthorized' }, { status: verify.reason === 'signing_secret_not_configured' ? 500 : 401 })
  }

  const params = new URLSearchParams(rawBody)
  const command = params.get('command') ?? ''
  const text = (params.get('text') ?? '').trim()
  const team_id = params.get('team_id') ?? ''
  const user_id = params.get('user_id') ?? ''
  const channel_id = params.get('channel_id') ?? ''
  const response_url = params.get('response_url') ?? ''

  logEvent('slack_ask_wiki_received', { team_id, user_id, channel_id, command })

  if (!text) {
    return ephemeral('Usage: /ask-wiki <question>')
  }

  const rateLimitKey = `${team_id}:${user_id}`
  if (isRateLimited(rateLimitKey)) {
    logEvent('slack_ask_wiki_failed', { team_id, user_id, channel_id, reason: 'rate_limited', latency_ms: Date.now() - startedAt })
    return ephemeral('You are asking too quickly — please wait a moment and try again.')
  }

  if (!response_url) {
    logEvent('slack_ask_wiki_failed', { team_id, user_id, channel_id, reason: 'missing_response_url', latency_ms: Date.now() - startedAt })
    return ephemeral('Something went wrong reaching Slack — please try again.')
  }

  // Fire the agent call + response_url callback via Next.js's after(), which
  // is the platform primitive that keeps a serverless invocation (this app
  // deploys on Netlify via @netlify/plugin-nextjs) alive long enough to
  // finish background work AFTER the response has been sent. A plain
  // `.catch()`-only fire-and-forget call is NOT safe here: a serverless
  // function can be frozen/torn down the instant the response flushes,
  // which is exactly what produced the earlier "operation_timeout" /
  // "app did not respond" failures — the agent call and response_url POST
  // were being killed mid-flight before they could complete.
  after(() =>
    processAskWiki({ text, team_id, user_id, channel_id, response_url, startedAt }).catch(() => {
      logEvent('slack_ask_wiki_failed', { team_id, user_id, channel_id, reason: 'unhandled_exception', latency_ms: Date.now() - startedAt })
    })
  )

  // Immediate ack — well under Slack's 3s window. Never wait for the agent here.
  return ephemeral('Checking the verified wiki…')
}

async function processAskWiki(params: {
  text: string
  team_id: string
  user_id: string
  channel_id: string
  response_url: string
  startedAt: number
}) {
  const { text, team_id, user_id, channel_id, response_url, startedAt } = params

  let finalText: string
  try {
    const result = await callAIAgentServer(text, VERIFIED_ANSWER_AGENT_ID)
    if (!result.success || result.response?.status !== 'success') {
      finalText = 'Sorry — I could not produce a verified answer right now. Please try again in a moment.'
      logEvent('slack_ask_wiki_failed', { team_id, user_id, channel_id, reason: 'agent_failure', latency_ms: Date.now() - startedAt })
    } else {
      // Same shape-tolerant extraction as the Web Ask tab (the agent replies
      // in plain Markdown text, never JSON) — see AskSection.tsx for the
      // identical logic this mirrors.
      const resultObj = result.response.result as any
      const md =
        typeof resultObj?.text === 'string' ? resultObj.text
        : typeof resultObj?.markdown_response === 'string' ? resultObj.markdown_response
        : typeof resultObj?.message === 'string' ? resultObj.message
        : typeof resultObj === 'string' ? resultObj
        : null

      if (!md || !md.trim()) {
        finalText = 'Sorry — the verified wiki returned an empty response.'
        logEvent('slack_ask_wiki_failed', { team_id, user_id, channel_id, reason: 'empty_response', latency_ms: Date.now() - startedAt })
      } else {
        const parsed = parseAnswer(md)
        finalText = formatAnswerForSlack(parsed)
        logEvent('slack_ask_wiki_completed', { team_id, user_id, channel_id, latency_ms: Date.now() - startedAt })
      }
    }
  } catch (err) {
    finalText = 'Sorry — something went wrong checking the verified wiki. Please try again.'
    logEvent('slack_ask_wiki_failed', { team_id, user_id, channel_id, reason: 'exception', latency_ms: Date.now() - startedAt })
  }

  try {
    await fetch(response_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ response_type: 'ephemeral', replace_original: true, text: withQuestionHeader(text, finalText) }),
    })
  } catch {
    // response_url delivery failure — already logged the underlying outcome
    // above; nothing further to safely surface to the user from here.
  }
}
