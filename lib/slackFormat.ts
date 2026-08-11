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
