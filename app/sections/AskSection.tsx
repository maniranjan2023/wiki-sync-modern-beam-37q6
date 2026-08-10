'use client'

import React, { useState, useRef, useEffect } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Send, Loader2, MessageCircleQuestion, Radio, User } from 'lucide-react'
import { callAIAgent } from '@/lib/aiAgent'

const VERIFIED_ANSWER_AGENT_ID = '6a7a22aacb71768e58329008'

function renderMarkdown(text: string) {
  if (!text) return null
  return (
    <div className="space-y-2">
      {text.split('\n').map((line, i) => {
        if (line.startsWith('### ')) return <h4 key={i} className="mt-3 text-sm font-semibold">{line.slice(4)}</h4>
        if (line.startsWith('## ')) return <h3 key={i} className="mt-3 text-base font-semibold">{line.slice(3)}</h3>
        if (line.startsWith('# ')) return <h2 key={i} className="mt-4 text-lg font-bold">{line.slice(2)}</h2>
        if (line.startsWith('- ') || line.startsWith('* ')) return <li key={i} className="ml-4 list-disc text-sm">{formatInline(line.slice(2))}</li>
        if (/^\d+\.\s/.test(line)) return <li key={i} className="ml-4 list-decimal text-sm">{formatInline(line.replace(/^\d+\.\s/, ''))}</li>
        if (!line.trim()) return <div key={i} className="h-1" />
        return <p key={i} className="text-sm">{formatInline(line)}</p>
      })}
    </div>
  )
}
function formatInline(text: string) {
  const parts = text.split(/\*\*(.*?)\*\*/g)
  if (parts.length === 1) return text
  return parts.map((part, i) => i % 2 === 1 ? <strong key={i} className="font-semibold">{part}</strong> : part)
}

interface Message { id: string; role: 'user' | 'assistant'; text: string }

const SAMPLE_MESSAGES: Message[] = [
  { id: 'm1', role: 'user', text: 'What is the current Enterprise tier price?' },
  {
    id: 'm2', role: 'assistant',
    text: '**Answer**\nThe Enterprise tier is billed at $2,500 per month annually, with a minimum of 25 seats.\n\n**Detail**\n- Includes SSO/SAML, audit export and a named CSM.\n- Legacy contracts signed before 1 Apr keep the previous $2,000 rate until renewal.\n\n**Sources**\nPricing & Packaging › Enterprise tier — verified 2 days ago',
  },
]

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
        setMessages((prev) => [...prev, { id: `a_${Date.now()}`, role: 'assistant', text: '_Sorry — I could not produce a verified answer right now._' }])
        return
      }
      const md = (result.response.result as any)?.markdown_response
      if (typeof md !== 'string' || !md.trim()) {
        toast.error('Missing markdown_response in the agent contract')
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
        <div ref={scrollRef} className="max-h-[520px] min-h-[280px] overflow-y-auto p-4 space-y-4">
          {displayMessages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center gap-2 py-10">
              <MessageCircleQuestion className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Ask anything about the verified wiki — try "What is the current Enterprise tier price?"</p>
            </div>
          )}
          {displayMessages.map((m) => (
            <div key={m.id} className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {m.role === 'assistant' && (
                <div className="h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px] font-bold shrink-0">T</div>
              )}
              <div className={`rounded-lg px-3.5 py-2.5 max-w-[85%] ${m.role === 'user' ? 'bg-primary text-primary-foreground text-sm' : 'bg-muted'}`}>
                {m.role === 'user' ? <p className="text-sm">{m.text}</p> : renderMarkdown(m.text)}
              </div>
              {m.role === 'user' && (
                <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0"><User className="h-3.5 w-3.5" /></div>
              )}
            </div>
          ))}
          {asking && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Verified Answer Agent is checking the wiki…
            </div>
          )}
        </div>
        <div className="border-t border-border p-3 flex gap-2">
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
