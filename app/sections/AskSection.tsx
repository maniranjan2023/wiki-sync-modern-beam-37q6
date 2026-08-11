'use client'

import React, { useState, useRef, useEffect } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Send, Loader2, MessageCircleQuestion, Radio, User, Quote, ChevronDown, AlertTriangle, Sparkles,
} from 'lucide-react'
import { callAIAgent } from '@/lib/aiAgent'

const VERIFIED_ANSWER_AGENT_ID = '6a7a22aacb71768e58329008'

function formatInline(text: string) {
  const parts = text.split(/\*\*(.*?)\*\*/g)
  if (parts.length === 1) return text
  return parts.map((part, i) => (i % 2 === 1 ? <strong key={i} className="font-semibold text-foreground">{part}</strong> : part))
}

interface ParsedAnswer {
  answer: string
  detail: string[]
  sources: string[]
  caution: string | null
}

// Parses the Verified Answer Agent's fixed Markdown contract:
// **Answer** / **Detail** (optional) / **Sources** / **Caution** (optional).
// Falls back to treating the whole reply as the answer if the shape doesn't
// match, so an off-contract response still renders instead of vanishing.
function parseAnswer(raw: string): ParsedAnswer {
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

interface Message { id: string; role: 'user' | 'assistant'; text: string }

const SAMPLE_MESSAGES: Message[] = [
  { id: 'm1', role: 'user', text: 'What is the current Enterprise tier price?' },
  {
    id: 'm2', role: 'assistant',
    text: '**Answer**\nThe Enterprise tier is billed at $2,500 per month annually, with a minimum of 25 seats.\n\n**Detail**\n- Includes SSO/SAML, audit export and a named CSM.\n- Legacy contracts signed before 1 Apr keep the previous $2,000 rate until renewal.\n\n**Sources**\n- Pricing & Packaging › Enterprise tier (linked) — "verified 2 days ago"',
  },
]

function CitationToggle({ sources }: { sources: string[] }) {
  const [open, setOpen] = useState(false)
  if (sources.length === 0) return null
  return (
    <div className="mt-2.5 pt-2.5 border-t border-border/70">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
      >
        <Quote className="h-3 w-3" />
        {sources.length} source{sources.length === 1 ? '' : 's'}
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="mt-2 space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
          {sources.map((s, i) => {
            // Agent citation lines look like:
            //   Page Title › Section Heading ([/wiki/slug](/wiki/slug)) — "verified <date>"
            // The quoted snippet can appear anywhere in the line (not just at
            // the end, once a markdown link sits in between), so extract it
            // first, then strip the markdown link syntax from what remains
            // for a clean label instead of showing raw "([...](...))".
            const quoteMatch = s.match(/[“"]([^”"]+)[”"]/)
            const quote = quoteMatch ? quoteMatch[1].trim() : null
            const withoutQuote = quoteMatch ? (s.slice(0, quoteMatch.index) + s.slice((quoteMatch.index ?? 0) + quoteMatch[0].length)) : s
            const label = withoutQuote
              .replace(/\[([^\]]*)\]\(([^)]*)\)/g, '$1') // [text](url) -> text
              .replace(/[—-]\s*$/, '')
              .trim()
            return (
              <div key={i} className="flex items-start gap-2 rounded-md bg-background border border-border px-2.5 py-2 text-xs">
                <Quote className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
                <div className="min-w-0">
                  {label && <div className="font-medium text-foreground break-words">{label}</div>}
                  {quote && <div className="text-muted-foreground italic mt-0.5 break-words">&ldquo;{quote}&rdquo;</div>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function AssistantBubble({ text }: { text: string }) {
  const parsed = parseAnswer(text)
  return (
    <div className="rounded-2xl rounded-tl-sm border border-border bg-muted/60 px-4 py-3 max-w-[85%] shadow-sm">
      <p className="text-sm leading-relaxed">{formatInline(parsed.answer)}</p>

      {parsed.detail.length > 0 && (
        <ul className="mt-2 space-y-1">
          {parsed.detail.map((d, i) => (
            <li key={i} className="text-xs text-muted-foreground flex gap-1.5">
              <span className="mt-1.5 h-1 w-1 rounded-full bg-muted-foreground/60 shrink-0" />
              <span>{formatInline(d)}</span>
            </li>
          ))}
        </ul>
      )}

      {parsed.caution && (
        <div className="mt-2.5 flex items-start gap-1.5 rounded-md border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-2.5 py-2 text-xs text-amber-800 dark:text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>{formatInline(parsed.caution)}</span>
        </div>
      )}

      <CitationToggle sources={parsed.sources} />
    </div>
  )
}

export default function AskSection({
  authFetch, sampleMode, onSampleModeChange,
}: {
  authFetch: (input: RequestInfo, init?: RequestInit) => Promise<Response>
  sampleMode: boolean
  onSampleModeChange: (v: boolean) => void
}) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [asking, setAsking] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const displayMessages = sampleMode && messages.length === 0 ? SAMPLE_MESSAGES : messages

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [displayMessages.length, asking])

  async function ask() {
    const question = input.trim()
    if (!question) return
    onSampleModeChange(false)
    const userMsg: Message = { id: `u_${Date.now()}`, role: 'user', text: question }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setAsking(true)
    try {
      const result = await callAIAgent(question, VERIFIED_ANSWER_AGENT_ID)
      if (!result.success || result.response?.status !== 'success') {
        toast.error(result.response?.message ?? 'Verified Answer Agent failed to respond')
        setMessages((prev) => [...prev, { id: `a_${Date.now()}`, role: 'assistant', text: '**Answer**\nSorry — I could not produce a verified answer right now.' }])
        return
      }
      // The Verified Answer Agent replies in plain Markdown text (response_format
      // "text", never JSON). /api/agent's normalizeResponse wraps a plain string
      // as { text: <string> } — it never produces a markdown_response key. Read
      // every shape this agent could legitimately arrive in before giving up.
      const resultObj = result.response.result as any
      const md =
        typeof resultObj?.text === 'string' ? resultObj.text
        : typeof resultObj?.markdown_response === 'string' ? resultObj.markdown_response
        : typeof resultObj?.message === 'string' ? resultObj.message
        : typeof resultObj === 'string' ? resultObj
        : null
      if (!md || !md.trim()) {
        toast.error('Verified Answer Agent returned an empty response')
        return
      }
      setMessages((prev) => [...prev, { id: `a_${Date.now()}`, role: 'assistant', text: md }])
    } catch (err: any) {
      toast.error(err.message ?? 'Network error asking the agent')
    } finally {
      setAsking(false)
    }
  }

  return (
    <div className="max-w-3xl space-y-5 animate-in fade-in duration-300">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Ask</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Answers only from pages currently in state <span className="font-medium text-foreground">verified</span>.</p>
        </div>
        <div className="flex items-center gap-2">
          <Switch id="sample-toggle-ask" checked={sampleMode} onCheckedChange={onSampleModeChange} />
          <Label htmlFor="sample-toggle-ask" className="text-xs text-muted-foreground">Sample Data</Label>
        </div>
      </div>

      <Card className="p-0 overflow-hidden">
        <div ref={scrollRef} className="max-h-[560px] min-h-[320px] overflow-y-auto p-4 space-y-4 bg-gradient-to-b from-muted/20 to-transparent">
          {displayMessages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center gap-2 py-14">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <MessageCircleQuestion className="h-6 w-6 text-primary" />
              </div>
              <p className="text-sm font-medium mt-1">Ask anything about the verified wiki</p>
              <p className="text-xs text-muted-foreground max-w-xs">Try &ldquo;What is the current Enterprise tier price?&rdquo;</p>
            </div>
          )}
          {displayMessages.map((m) => (
            <div key={m.id} className={`flex items-end gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {m.role === 'assistant' && (
                <div className="h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0 shadow-sm">
                  <Sparkles className="h-3.5 w-3.5" />
                </div>
              )}
              {m.role === 'user' ? (
                <div className="rounded-2xl rounded-tr-sm bg-primary text-primary-foreground px-3.5 py-2.5 max-w-[85%] shadow-sm">
                  <p className="text-sm leading-relaxed">{m.text}</p>
                </div>
              ) : (
                <AssistantBubble text={m.text} />
              )}
              {m.role === 'user' && (
                <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0"><User className="h-3.5 w-3.5" /></div>
              )}
            </div>
          ))}
          {asking && (
            <div className="flex items-end gap-2 justify-start">
              <div className="h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0 shadow-sm">
                <Sparkles className="h-3.5 w-3.5" />
              </div>
              <div className="rounded-2xl rounded-tl-sm border border-border bg-muted/60 px-4 py-3 flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking the verified wiki…
              </div>
            </div>
          )}
        </div>
        <div className="border-t border-border p-3 flex gap-2 bg-background">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask() } }}
            placeholder="Ask a question…"
            className="min-h-10 max-h-32 text-sm resize-none"
          />
          <Button onClick={ask} disabled={asking || !input.trim()} className="self-end active:scale-[0.98] transition-transform">
            {asking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </Card>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Radio className="h-3.5 w-3.5" />
        <span>Powering agent:</span>
        <Badge variant="outline" className="font-mono text-[10px]">Verified Answer Agent</Badge>
        <span className={`h-1.5 w-1.5 rounded-full ${asking ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} />
        <span>{asking ? 'running…' : 'idle'}</span>
      </div>
    </div>
  )
}
