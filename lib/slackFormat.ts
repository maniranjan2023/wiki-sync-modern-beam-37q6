/**
 * Converts the shared ParsedAnswer contract (lib/wikiAnswerParser.ts) into
 * Slack mrkdwn. Presentation-only — never alters the factual content, the
 * citation set, or the "not documented" wording produced by the agent.
 */
import type { ParsedAnswer } from '@/lib/wikiAnswerParser'

function mdInlineToSlack(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '*$1*') // **bold** -> *bold*
    .replace(/\[([^\]]*)\]\(([^)]*)\)/g, '<$2|$1>') // [text](url) -> <url|text>
}

// Slack mrkdwn treats &, <, > as special characters that must be escaped in
// any raw (non-mrkdwn) text — the user's original question is plain text we
// display verbatim, not markdown we generate, so it needs this escaping
// rather than mdInlineToSlack's bold/link conversion.
// https://api.slack.com/reference/surfaces/formatting#escaping
function escapeSlackText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Prepends a *Question* section showing the user's exact original text
// ahead of any final Slack message body (a successful answer OR an error/
// fallback message) so every response makes clear what was actually asked.
export function withQuestionHeader(question: string, bodyText: string): string {
  if (!question) return bodyText
  return `*Question*\n${escapeSlackText(question)}\n\n${bodyText}`
}

export function formatAnswerForSlack(parsed: ParsedAnswer): string {
  const lines: string[] = ['*Answer*', mdInlineToSlack(parsed.answer)]

  if (parsed.detail.length > 0) {
    lines.push('', '*Detail*')
    for (const d of parsed.detail) lines.push(`\u2022 ${mdInlineToSlack(d)}`)
  }

  if (parsed.sources.length > 0) {
    lines.push('', parsed.sources.length === 1 ? '*Source*' : '*Sources*')
    for (const s of parsed.sources) lines.push(`\u2022 ${mdInlineToSlack(s)}`)
  }

  if (parsed.caution) {
    lines.push('', '*Caution*', mdInlineToSlack(parsed.caution))
  }

  return lines.join('\n')
}
