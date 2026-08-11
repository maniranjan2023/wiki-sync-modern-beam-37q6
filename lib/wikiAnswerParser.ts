/**
 * Pure parsing/constants for the Verified Answer Agent's fixed Markdown
 * contract (Answer / Detail / Sources / Caution sections, each marked with
 * bold headers). Shared by the Web Ask tab (app/sections/AskSection.tsx,
 * which renders it as JSX) and the Slack /ask-wiki route
 * (app/api/slack/ask-wiki/route.ts, which converts it to Slack mrkdwn) —
 * both consume the SAME parsed structure so the two surfaces can never
 * drift apart on what counts as the answer, detail, sources, or caution.
 */

export const VERIFIED_ANSWER_AGENT_ID = '6a7a22aacb71768e58329008'

export interface ParsedAnswer {
  answer: string
  detail: string[]
  sources: string[]
  caution: string | null
}

// Falls back to treating the whole reply as the answer if the shape doesn't
// match, so an off-contract response still renders instead of vanishing.
export function parseAnswer(raw: string): ParsedAnswer {
  const sectionRe = /\*\*(Answer|Detail|Sources|Caution)\*\*/gi
  const matches = [...raw.matchAll(sectionRe)]
  if (matches.length === 0) {
    return { answer: raw.trim(), detail: [], sources: [], caution: null }
  }
  const sections: Record<string, string> = {}
  for (let i = 0; i < matches.length; i++) {
    const name = matches[i][1].toLowerCase()
    const start = (matches[i].index ?? 0) + matches[i][0].length
    const end = i + 1 < matches.length ? matches[i + 1].index : raw.length
    sections[name] = raw.slice(start, end).trim()
  }
  const toLines = (s?: string) =>
    (s ?? '')
      .split('\n')
      .map((l) => l.replace(/^[-*]\s*/, '').trim())
      .filter(Boolean)
  return {
    answer: sections.answer ?? raw.trim(),
    detail: toLines(sections.detail),
    sources: toLines(sections.sources),
    caution: sections.caution?.trim() || null,
  }
}
