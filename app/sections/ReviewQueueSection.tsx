'use client'

import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Check, Pencil, X, Bell, ExternalLink, AlertTriangle, Loader2, Radio, ListChecks, ScaleIcon,
} from 'lucide-react'
import { callAIAgent } from '@/lib/aiAgent'
import { syncPageToWikiKB } from '@/lib/syncWikiKb'
import type { Role } from '@/app/page'

const REVIEW_NOTIFIER_ID = '6a7a228943595b3ec5c771fe'

function stripFences(raw: string): string {
  const trimmed = raw.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return fenced ? fenced[1] : trimmed
}

interface ProposalRow {
  id: string
  finding_id: string
  page_id: string
  section_id: string
  current_md: string
  proposed_md: string
  rationale: string
  source_kind: string
  source_url: string
  source_snippet: string
  conflict: { conflicting_sources?: string[]; reason?: string; section_id?: string } | null
  state: string
  owner_user_id: string | null
  created_at: string
}

const SAMPLE_PROPOSALS: ProposalRow[] = [
  {
    id: 'sample-p1', finding_id: 'f1', page_id: 'sample-1', section_id: 'sec-1',
    current_md: 'Billed annually at $2,000 per month, minimum 25 seats.',
    proposed_md: 'Billed annually at $2,500 per month, minimum 25 seats. Legacy contracts signed before 1 Apr keep the previous rate until renewal.',
    rationale: 'Enterprise list price moved from $2,000 to $2,500/mo per the pricing decision in #pricing on 14 Mar.',
    source_kind: 'slack', source_url: 'https://slack.com/archives/C02PRICING/p171000', source_snippet: 'Confirmed with finance — Enterprise goes to $2.5k/mo from 1 Apr. Anyone already on paper keeps $2k until renewal. — @dana.k',
    conflict: null, state: 'pending_review', owner_user_id: 'sample-owner', created_at: new Date(Date.now() - 12 * 60000).toISOString(),
  },
  {
    id: 'sample-p2', finding_id: 'f2', page_id: 'sample-2', section_id: 'sec-2',
    current_md: 'Provision laptop, Slack, and GitHub access within 24 hours.',
    proposed_md: 'Provision laptop, Slack, GitHub and Linear access within 4 business hours.',
    rationale: 'Onboarding SLA tightened to 4 hours per the updated Drive runbook.',
    source_kind: 'drive', source_url: 'https://drive.google.com/doc/onboarding', source_snippet: 'Updated SLA: new-hire access provisioning must complete within 4 business hours of start.',
    conflict: { conflicting_sources: ['drive', 'slack'], reason: 'Slack #it-ops still references the old 24-hour SLA; Drive doc is the published record.' },
    state: 'pending_review', owner_user_id: 'sample-owner', created_at: new Date(Date.now() - 40 * 60000).toISOString(),
  },
]

function ConflictBadge({ label, rank }: { label: string; rank?: number }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-xs">
      <span className="font-medium capitalize">{label}</span>
      {rank != null && <span className="font-mono text-[10px] text-muted-foreground">rank {rank}</span>}
    </div>
  )
}

// naive word-level diff for the inline redline view
function wordDiff(oldText: string, newText: string) {
  const oldWords = oldText.split(/(\s+)/)
  const newWords = newText.split(/(\s+)/)
  const maxLen = Math.max(oldWords.length, newWords.length)
  const out: { type: 'same' | 'add' | 'del'; text: string }[] = []
  let i = 0, j = 0
  while (i < oldWords.length || j < newWords.length) {
    if (oldWords[i] === newWords[j]) {
      out.push({ type: 'same', text: newWords[j] ?? '' })
      i++; j++
    } else {
      // simple lookahead: if the old word reappears later in new, treat as insert; else delete+insert
      const foundAhead = newWords.slice(j, j + 6).indexOf(oldWords[i])
      if (foundAhead > 0) {
        for (let k = 0; k < foundAhead; k++) out.push({ type: 'add', text: newWords[j + k] ?? '' })
        j += foundAhead
      } else {
        if (oldWords[i] !== undefined) out.push({ type: 'del', text: oldWords[i] })
        if (newWords[j] !== undefined) out.push({ type: 'add', text: newWords[j] })
        i++; j++
      }
    }
    if (out.length > maxLen * 4) break
  }
  return out
}

export default function ReviewQueueSection({
  authFetch, role, userId, sampleMode, onSampleModeChange, onChanged, refreshKey,
}: {
  authFetch: (input: RequestInfo, init?: RequestInit) => Promise<Response>
  role: Role
  userId: string
  sampleMode: boolean
  onSampleModeChange: (v: boolean) => void
  onChanged: () => void
  refreshKey: number
}) {
  const [proposals, setProposals] = useState<ProposalRow[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState(false)
  const [editedText, setEditedText] = useState('')
  const [busy, setBusy] = useState(false)
  const [notifying, setNotifying] = useState(false)
  const [filterState, setFilterState] = useState('pending_review')
  const [lastScanMinsAgo] = useState(12)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authFetch('/api/proposals')
      const data = await res.json()
      if (data.success) setProposals(Array.isArray(data.data) ? data.data : [])
      else toast.error(data.error ?? 'Failed to load proposals')
    } catch (err: any) {
      toast.error(err.message ?? 'Network error loading proposals')
    } finally {
      setLoading(false)
    }
  }, [authFetch])

  useEffect(() => { load() }, [load, refreshKey])

  const realProposals = proposals
  const displayProposals: ProposalRow[] = sampleMode && realProposals.length === 0 ? SAMPLE_PROPOSALS : realProposals
  const filtered = displayProposals.filter((p) => filterState === 'all' || p.state === filterState)

  useEffect(() => {
    if (filtered.length > 0 && !filtered.find((p) => p.id === selectedId)) setSelectedId(filtered[0].id)
    if (filtered.length === 0) setSelectedId(null)
  }, [filtered, selectedId])

  const selected = filtered.find((p) => p.id === selectedId) ?? null

  useEffect(() => { if (selected) setEditedText(selected.proposed_md) }, [selected?.id])

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function act(action: 'approve' | 'edit_approve' | 'reject', ids: string[], editedMd?: string) {
    if (ids.some((id) => id.startsWith('sample-'))) { toast.error('Turn off Sample Data to act on real proposals'); return }
    if (ids.length === 0) return
    setBusy(true)
    // Capture page_ids BEFORE the action mutates state, so we know which
    // pages need their content re-pushed to the Verified Wiki KB.
    const touchedPageIds = Array.from(new Set(
      displayProposals.filter((p) => ids.includes(p.id)).map((p) => p.page_id)
    ))
    try {
      const res = await authFetch('/api/proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ids, edited_md: editedMd }),
      })
      const data = await res.json()
      if (!data.success) { toast.error(data.error ?? 'Action failed'); return }
      const verb = action === 'reject' ? 'Rejected' : 'Approved'
      toast.success(`${verb} ${ids.length} proposal(s)`)
      setSelectedIds(new Set())
      setEditing(false)
      // Approving/editing rewrites the page's verified body_md server-side —
      // push each touched page's fresh content into the Verified Wiki KB so
      // Ask reflects it immediately, instead of only the stale prior version.
      if (action !== 'reject' && touchedPageIds.length > 0) {
        try {
          const pagesRes = await authFetch('/api/pages')
          const pagesData = await pagesRes.json()
          if (pagesData.success) {
            const touched = (pagesData.data ?? []).filter((p: any) => touchedPageIds.includes(p.id) && p.status === 'verified')
            for (const p of touched) syncPageToWikiKB(p.title, p.body_md, p.slug)
          }
        } catch { /* KB sync is best-effort */ }
      }
      await load()
      onChanged()
    } catch (err: any) {
      toast.error(err.message ?? 'Network error')
    } finally {
      setBusy(false)
    }
  }

  async function notifyOwners() {
    const pending = displayProposals.filter((p) => p.state === 'pending_review')
    if (pending.length === 0) { toast.error('No pending proposals to notify about'); return }
    setNotifying(true)
    try {
      const byOwner: Record<string, number> = {}
      for (const p of pending) byOwner[p.owner_user_id ?? 'unassigned'] = (byOwner[p.owner_user_id ?? 'unassigned'] ?? 0) + 1
      const message = `Notify page owners of their pending review-queue proposals. Grouped by owner: ${JSON.stringify(byOwner)}.`
      const result = await callAIAgent(message, REVIEW_NOTIFIER_ID)
      if (!result.success || result.response?.status !== 'success') {
        toast.error(result.response?.message ?? 'Notify failed')
        return
      }
      const data = result.response.result as any
      toast.success(`Notified ${data?.owner ?? 'owners'} — ${data?.proposal_count ?? pending.length} proposal(s) via ${data?.channel_or_dm ?? 'Slack'}`)
    } catch (err: any) {
      toast.error(err.message ?? 'Notify failed')
    } finally {
      setNotifying(false)
    }
  }

  const pendingCount = displayProposals.filter((p) => p.state === 'pending_review').length
  const diffParts = selected ? wordDiff(selected.current_md, selected.proposed_md) : []

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Review Queue</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {pendingCount} pending proposal{pendingCount === 1 ? '' : 's'} · last scan {lastScanMinsAgo} min ago · never auto-applied
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch id="sample-toggle-review" checked={sampleMode} onCheckedChange={onSampleModeChange} />
            <Label htmlFor="sample-toggle-review" className="text-xs text-muted-foreground">Sample Data</Label>
          </div>
          <Button size="sm" variant="outline" onClick={notifyOwners} disabled={notifying}>
            {notifying ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Bell className="h-4 w-4 mr-1.5" />} Notify owners
          </Button>
          {selectedIds.size > 0 && (
            <Button size="sm" onClick={() => act('approve', Array.from(selectedIds))} disabled={busy}>
              <Check className="h-4 w-4 mr-1.5" /> Bulk approve ({selectedIds.size})
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Label className="text-xs text-muted-foreground">Filter</Label>
        <Select value={filterState} onValueChange={setFilterState}>
          <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="pending_review">Pending review</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="applied">Applied</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="h-96 rounded-xl bg-muted animate-pulse" />
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 flex flex-col items-center text-center gap-2">
            <ListChecks className="h-8 w-8 text-muted-foreground" />
            <p className="font-semibold text-sm">Nothing drifting.</p>
            <p className="text-sm text-muted-foreground">Last scan {lastScanMinsAgo} min ago.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
          <Card className="p-0 overflow-hidden">
            <div className="px-3 py-2 border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {filterState === 'pending_review' ? 'Pending' : filterState} · {filtered.length}
            </div>
            <div className="max-h-[600px] overflow-y-auto">
              {filtered.map((p) => (
                <div key={p.id} className={`flex items-start gap-2 border-b border-border last:border-0 px-3 py-2.5 ${selectedId === p.id ? 'bg-muted shadow-[inset_2px_0_0_var(--primary)]' : 'hover:bg-muted/50'}`}>
                  {p.state === 'pending_review' && (
                    <Checkbox checked={selectedIds.has(p.id)} onCheckedChange={() => toggleSelect(p.id)} className="mt-1" onClick={(e) => e.stopPropagation()} />
                  )}
                  <button onClick={() => setSelectedId(p.id)} className="min-w-0 text-left flex-1 min-h-10">
                    <div className="text-sm font-semibold truncate">{p.section_id}</div>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <Badge variant="outline" className={`text-[10px] ${p.conflict ? 'border-amber-300 text-amber-700 dark:text-amber-400' : ''}`}>
                        {p.conflict ? 'conflict' : p.state.replace('_', ' ')}
                      </Badge>
                      <Badge variant="secondary" className="text-[10px] capitalize">{p.source_kind}</Badge>
                    </div>
                  </button>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-0 overflow-hidden">
            {selected ? (
              <>
                <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">Proposal · {selected.section_id}</div>
                  </div>
                  <Badge variant="outline" className="text-[10px] capitalize">{selected.state.replace('_', ' ')}</Badge>
                </div>

                {selected.conflict && (
                  <div className="mx-4 mt-3 rounded-md border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-3 space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-400">
                      <ScaleIcon className="h-3.5 w-3.5" /> Conflicting sources — arbitrate explicitly
                    </div>
                    <p className="text-xs text-amber-800/90 dark:text-amber-400/90">{selected.conflict.reason ?? 'Two sources disagree about this section.'}</p>
                    <div className="grid grid-cols-2 gap-2">
                      {(selected.conflict.conflicting_sources ?? []).map((s, i) => (
                        <ConflictBadge key={i} label={s} />
                      ))}
                    </div>
                  </div>
                )}

                <div className="px-4 py-3 text-xs text-muted-foreground border-b border-border">
                  <span className="font-semibold text-foreground">Rationale · </span>{selected.rationale}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2">
                  <div className="p-4 sm:border-r border-border">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-2">Proposed change</div>
                    {editing ? (
                      <Textarea value={editedText} onChange={(e) => setEditedText(e.target.value)} className="font-mono text-xs min-h-[160px]" />
                    ) : (
                      <p className="text-xs leading-relaxed">
                        {diffParts.map((part, i) =>
                          part.type === 'same' ? <span key={i}>{part.text}</span>
                          : part.type === 'add' ? <ins key={i} className="bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 no-underline rounded px-0.5 font-medium">{part.text}</ins>
                          : <del key={i} className="bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400 rounded px-0.5">{part.text}</del>
                        )}
                      </p>
                    )}
                  </div>
                  <div className="p-4">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-2">Current wiki section</div>
                    <p className="text-xs leading-relaxed text-muted-foreground">{selected.current_md}</p>
                  </div>
                </div>

                <div className="border-t border-border bg-muted/40 px-4 py-3">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1.5">
                    Source · {selected.source_kind} {selected.created_at ? `· ${new Date(selected.created_at).toLocaleDateString()}` : ''}
                  </div>
                  <p className="text-xs italic text-muted-foreground border-l-2 border-border pl-2.5">"{selected.source_snippet || 'No snippet provided.'}"</p>
                  {selected.source_url && (
                    <a href={selected.source_url} target="_blank" rel="noopener noreferrer" className="mt-1.5 inline-flex items-center gap-1 text-xs text-primary hover:underline">
                      Open source <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>

                {selected.state === 'pending_review' && (
                  <div className="flex flex-wrap gap-2 px-4 py-3 border-t border-border">
                    {!editing ? (
                      <>
                        <Button size="sm" onClick={() => act('approve', [selected.id])} disabled={busy}>
                          <Check className="h-3.5 w-3.5 mr-1.5" /> Approve
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditing(true)} disabled={busy}>
                          <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit &amp; approve
                        </Button>
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => act('reject', [selected.id])} disabled={busy}>
                          <X className="h-3.5 w-3.5 mr-1.5" /> Reject
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button size="sm" onClick={() => act('edit_approve', [selected.id], editedText)} disabled={busy}>
                          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Check className="h-3.5 w-3.5 mr-1.5" />} Save &amp; approve
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditing(false)} disabled={busy}>Cancel</Button>
                      </>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="p-10 text-center text-sm text-muted-foreground">Select a proposal</div>
            )}
          </Card>
        </div>
      )}

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Radio className="h-3.5 w-3.5" />
        <span>Powering agent:</span>
        <Badge variant="outline" className="font-mono text-[10px]">Review Notifier Agent</Badge>
        <span className={`h-1.5 w-1.5 rounded-full ${notifying ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} />
        <span>{notifying ? 'running…' : 'idle'}</span>
        {role !== 'viewer' && (
          <span className="ml-2 flex items-center gap-1.5 text-muted-foreground/80">
            <AlertTriangle className="h-3 w-3" /> Approve is deterministic — no agent runs when you click it.
          </span>
        )}
      </div>
    </div>
  )
}
