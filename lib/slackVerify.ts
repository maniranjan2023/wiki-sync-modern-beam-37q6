/**
 * Slack request signature verification (HMAC-SHA256), per Slack's current
 * signing-secret scheme. NEVER uses the deprecated verification token.
 * https://api.slack.com/authentication/verifying-requests-from-slack
 *
 * The signing secret itself is read only from process.env.SLACK_SIGNING_SECRET
 * by the caller — this module never reads env vars, hardcodes a secret, or
 * logs one; it only receives it as a plain function argument and uses it
 * in-memory for a single HMAC computation.
 */
import crypto from 'crypto'

const MAX_CLOCK_SKEW_SECONDS = 60 * 5 // reject stale/replayed requests older than 5 minutes

export type SlackVerifyFailureReason =
  | 'signing_secret_not_configured'
  | 'missing_headers'
  | 'invalid_timestamp'
  | 'stale_timestamp'
  | 'signature_mismatch'

export interface SlackVerifyResult {
  ok: boolean
  reason?: SlackVerifyFailureReason
}

export function verifySlackSignature(params: {
  rawBody: string
  timestamp: string | null
  signature: string | null
  signingSecret: string
}): SlackVerifyResult {
  const { rawBody, timestamp, signature, signingSecret } = params

  if (!signingSecret) return { ok: false, reason: 'signing_secret_not_configured' }
  if (!timestamp || !signature) return { ok: false, reason: 'missing_headers' }

  const ts = Number(timestamp)
  if (!Number.isFinite(ts)) return { ok: false, reason: 'invalid_timestamp' }

  const nowSeconds = Math.floor(Date.now() / 1000)
  if (Math.abs(nowSeconds - ts) > MAX_CLOCK_SKEW_SECONDS) return { ok: false, reason: 'stale_timestamp' }

  const base = `v0:${timestamp}:${rawBody}`
  const computed = `v0=${crypto.createHmac('sha256', signingSecret).update(base, 'utf8').digest('hex')}`

  const computedBuf = Buffer.from(computed, 'utf8')
  const signatureBuf = Buffer.from(signature, 'utf8')
  if (computedBuf.length !== signatureBuf.length) return { ok: false, reason: 'signature_mismatch' }
  if (!crypto.timingSafeEqual(computedBuf, signatureBuf)) return { ok: false, reason: 'signature_mismatch' }

  return { ok: true }
}
