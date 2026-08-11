'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet'
import {
  Slack, HardDrive, Github, Trello, GitBranch, Plug, Plus, X, RefreshCw, Loader2,
  AlertTriangle, CheckCircle2, Radio,
} from 'lucide-react'
import { callAIAgent } from '@/lib/aiAgent'
import type { Role } from '@/app/page'

const DRIFT_SCAN_COORDINATOR_ID = '6a7a22c3cb71768e5832900a'
const SIGNAL_AGENT_IDS: Record<string, string> = {
  slack: '6a7a225479361ed888c5ef2a',
  drive: '6a7a2254fd0aefe8da8c6921',
  github: '6a7a22545a2d7a3a966e1d43',
  jira: '6a7a2254cb71768e58329006',
  linear: '6a7a22546ada253b4e709d3d',
}
const DRIFT_DETECTION_AGENT_ID = '6a7a22895a2d7a3a966e1d45'
const PROPOSAL_DRAFTER_AGENT_ID = '6a7a2289680f2f9bfa6250f8'
const SCOPE_NOUN: Record<string, string> = {
  slack: 'channels', drive: 'folders', github: 'repos', jira: 'projects', linear: 'teams',
}
// Formal, written-record sources outrank informal chat when authority_rank ties.
const FORMAL_SOURCE_KINDS = new Set(['drive', 'github', 'jira', 'linear'])

const CONNECTOR_DEFS = [
  { kind: 'slack', label: 'Slack', icon: Slack, placeholder: '#channel-name' },
  { kind: 'drive', label: 'Google Drive', icon: HardDrive, placeholder: 'Folder name or path' },
  { kind: 'github', label: 'GitHub', icon: Github, placeholder: 'owner/repo' },
  { kind: 'jira', label: 'Jira', icon: Trello, placeholder: 'PROJECT-KEY' },
  { kind: 'linear', label: 'Linear', icon: GitBranch, placeholder: 'Team name' },
] as const

interface SourceRow {
  id: string
  kind: string
  display_name: string
  scopes: string[]
  authority_rank: number
  status: string
  last_synced_at: string | null
  events_ingested?: number
  cursors?: { last_run_at: string | null; last_status: string }[]
}

interface DriftScanProposal {
  section_id: string
  current_md: string
  proposed_md: string
  rationale: string
  needs_human_input?: boolean
  question?: string | null
  citation?: { source_kind?: string; url?: string; snippet?: string; timestamp?: string }
}
interface DriftScanConflict { section_id: string; conflicting_sources: string[]; reason: string }
interface DriftScanResult {
  scan_id: string
  proposals: DriftScanProposal[]
  conflicts: DriftScanConflict[]
  status: 'success' | 'error'
  metadata?: { agent_name?: string; findings_count?: number; proposals_count?: number; sections_scanned?: number; timestamp?: string }
}

interface SignalFact { event_id: string; timestamp: string; author: string; text: string; url: string; scope: string }
interface DetectionResult {
  section_id: string
  drift: boolean
  kind?: 'contradiction' | 'staleness' | 'gap' | 'confirmation' | null
  confidence: number
  claim?: string
  evidence?: { event_id: string; quote: string; url: string; timestamp: string; author: string }[]
  note?: string
}

// Classify a raw agent/tool error string into the specific diagnostic
// categories requested for Sources UI + logs, instead of a generic opaque
// message. Never invents a cause not present in the text.
function classifySyncError(kind: string, raw: string): string {
  const label = kind.charAt(0).toUpperCase() + kind.slice(1)
  const lower = raw.toLowerCase()
  if (lower.includes('no active connection') || lower.includes('no credentials found') || lower.includes('tool authentication required') || lower.includes('connect an account') || lower.includes('connect your') || lower.includes('connect a ') || lower.includes('i need access')) {
    return `${label} API authentication failed — no connected account credential for this tool. ${raw}`.slice(0, 300)
  }
  if (lower.includes('channel') && (lower.includes('not found') || lower.includes('lookup'))) {
    return `${label} channel lookup failed — ${raw}`.slice(0, 300)
  }
  if (lower.includes('repository') || lower.includes('repo') || lower.includes('readme')) {
    return `${label} repository/content fetch failed — ${raw}`.slice(0, 300)
  }
  if (lower.includes('could not parse') || lower.includes('unexpected shape')) {
    return `${label} signal extraction failed — ${raw}`.slice(0, 300)
  }
  return `${label} message fetch failed — ${raw}`.slice(0, 300)
}

function stripFences(raw: string): string {
  const trimmed = raw.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return fenced ? fenced[1] : trimmed
}

const SAMPLE_SOURCES: SourceRow[] = [
  { id: 'sample-slack', kind: 'slack', display_name: '#pricing, #eng-announce', scopes: ['#pricing', '#eng-announce'], authority_rank: 2, status: 'connected', last_synced_at: new Date(Date.now() - 12 * 60000).toISOString(), events_ingested: 214 },
  { id: 'sample-drive', kind: 'drive', display_name: 'Runbooks, Policies', scopes: ['Runbooks', 'Policies'], authority_rank: 3, status: 'connected', last_synced_at: new Date(Date.now() - 40 * 60000).toISOString(), events_ingested: 38 },
  { id: 'sample-github', kind: 'github', display_name: 'northwind/platform', scopes: ['northwind/platform'], authority_rank: 5, status: 'connected', last_synced_at: new Date(Date.now() - 6 * 60000).toISOString(), events_ingested: 96 },
  { id: 'sample-jira', kind: 'jira', display_name: 'SUP, ENG', scopes: ['SUP', 'ENG'], authority_rank: 4, status: 'connected', last_synced_at: new Date(Date.now() - 3 * 3600000).toISOString(), events_ingested: 57 },
  { id: 'sample-linear', kind: 'linear', display_name: 'Growth', scopes: ['Growth'], authority_rank: 4, status: 'disconnected', last_synced_at: null, events_ingested: 0 },
]

export default function SourcesSection({
  authFetch, role, sampleMode, onSampleModeChange, onChanged,
}: {
  authFetch: (input: RequestInfo, init?: RequestInit) => Promise<Response>
  role: Role
  sampleMode: boolean
  onSampleModeChange: (v: boolean) => void
  onChanged: () => void
}) {
  const [sources, setSources] = useState<SourceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [scopeDrawerKind, setScopeDrawerKind] = useState<string | null>(null)
  const [newScope, setNewScope] = useState('')
  const [scanning, setScanning] = useState(false)
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null)
  const [lastScanSummary, setLastScanSummary] = useState<{ proposals: number; conflicts: number } | null>(null)

  const isAdmin = role === 'admin'

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authFetch('/api/sources')
      const data = await res.json()
      if (data.success) setSources(Array.isArray(data.data) ? data.data : [])
      else toast.error(data.error ?? 'Failed to load sources')
    } catch (err: any) {
      toast.error(err.message ?? 'Network error loading sources')
    } finally {
      setLoading(false)
    }
  }, [authFetch])

  useEffect(() => { load() }, [load])

  const displaySources: SourceRow[] = sampleMode && sources.length === 0 ? SAMPLE_SOURCES : sources

  async function connect(kind: string) {
    if (!isAdmin) return
    const def = CONNECTOR_DEFS.find((c) => c.kind === kind)
    try {
      const res = await authFetch('/api/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, display_name: def?.label ?? kind, scopes: [] }),
      })
      const data = await res.json()
      if (!data.success) { toast.error(data.error ?? 'Failed to connect'); return }
      toast.success(`${def?.label ?? kind} connected`)
      onSampleModeChange(false)
      await load()
      onChanged()
    } catch (err: any) {
      toast.error(err.message ?? 'Network error')
    }
  }

  async function disconnect(id: string) {
    if (!isAdmin) return
    try {
      const res = await authFetch(`/api/sources?id=${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!data.success) { toast.error(data.error ?? 'Failed to disconnect'); return }
      toast.success('Disconnected')
      await load()
      onChanged()
    } catch (err: any) {
      toast.error(err.message ?? 'Network error')
    }
  }

  async function setRank(id: string, rank: number) {
    if (!isAdmin) return
    try {
      const res = await authFetch('/api/sources', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, authority_rank: rank }),
      })
      const data = await res.json()
      if (!data.success) { toast.error(data.error ?? 'Failed to update rank'); return }
      await load()
    } catch (err: any) {
      toast.error(err.message ?? 'Network error')
    }
  }

  async function addScope(id: string, currentScopes: string[]) {
    if (!newScope.trim() || !isAdmin) return
    try {
      const res = await authFetch('/api/sources', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, scopes: [...currentScopes, newScope.trim()] }),
      })
      const data = await res.json()
      if (!data.success) { toast.error(data.error ?? 'Failed to add scope'); return }
      setNewScope('')
      await load()
      toast.success('Scope added')
    } catch (err: any) {
      toast.error(err.message ?? 'Network error')
    }
  }

  async function removeScope(id: string, currentScopes: string[], scope: string) {
    if (!isAdmin) return
    try {
      const res = await authFetch('/api/sources', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, scopes: currentScopes.filter((s) => s !== scope) }),
      })
      const data = await res.json()
      if (!data.success) { toast.error(data.error ?? 'Failed to remove scope'); return }
      await load()
    } catch (err: any) {
      toast.error(err.message ?? 'Network error')
    }
  }

  async function runDriftScan() {
    if (role === 'viewer') return
    setScanning(true)
    setActiveAgentId(DRIFT_SCAN_COORDINATOR_ID)
    const progress = { synced: 0, sourcesFailed: [] as string[], perSource: {} as Record<string, number> }
    try {
      // STAGE 0 — load wiki sections to compare against.
      const sectionsRes = await authFetch('/api/pages')
      const pagesData = await sectionsRes.json()
      const pageList = pagesData.success && Array.isArray(pagesData.data) ? pagesData.data : []
      if (pageList.length === 0) {
        toast.error('Import at least one wiki page before running a drift scan.')
        return
      }
      const sectionsAll: any[] = []
      for (const p of pageList) {
        const sRes = await authFetch(`/api/page-sections?page_id=${p.id}`)
        const sData = await sRes.json()
        if (sData.success) sectionsAll.push(...(sData.data ?? []).map((s: any) => ({ ...s, page_title: p.title, page_status: p.status, page_owner: p.owner_user_id })))
      }
      if (sectionsAll.length === 0) {
        toast.error('No wiki sections found to compare against.')
        return
      }

      const connectedSources = sources.filter((s) => s.status === 'connected' && (s.scopes ?? []).length > 0)
      if (connectedSources.length === 0) {
        toast.error('Connect at least one source and add a scope (channel/folder/repo/project) before scanning.')
        return
      }

      // STAGE 1+2 — fan out to each connected source's own Signal Agent with its
      // configured scopes, then persist every returned fact via /api/source-sync
      // (idempotent — dedup by event_uid). This is the step that was previously
      // missing entirely, which is why events_ingested always read 0.
      const factsBySource: Record<string, SignalFact[]> = {}
      for (const src of connectedSources) {
        const agentId = SIGNAL_AGENT_IDS[src.kind]
        if (!agentId) continue
        const noun = SCOPE_NOUN[src.kind] ?? 'scopes'
        const message = `Scan these scoped ${noun} for decision-bearing facts: ${JSON.stringify(src.scopes)}.`
        try {
          const result = await callAIAgent(message, agentId)
          if (!result.success || result.response?.status !== 'success') {
            progress.sourcesFailed.push(src.kind)
            const rawReason = result.response?.message ?? result.error ?? 'No response from signal agent'
            await authFetch('/api/source-sync', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ source_id: src.id, sync_status: 'error', error_message: classifySyncError(src.kind, String(rawReason)) }),
            })
            continue
          }
          let parsed: { facts?: SignalFact[]; status?: string; message?: string } | null = null
          try {
            const raw = result.response.result as any
            parsed = typeof raw === 'string' ? JSON.parse(stripFences(raw)) : (raw as { facts?: SignalFact[]; status?: string; message?: string })
          } catch {
            progress.sourcesFailed.push(src.kind)
            await authFetch('/api/source-sync', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ source_id: src.id, sync_status: 'error', error_message: 'Could not parse signal agent response' }),
            })
            continue
          }
          // The Signal Agent's OWN contract carries its own status field
          // (distinct from the outer envelope) and, when its tool has no
          // credentials connected, may reply in prose asking to connect the
          // account instead of the strict {facts:[]} shape. Both must be
          // treated as a real sync failure, not a silent zero-fact success.
          const hasFactsKey = parsed !== null && Array.isArray(parsed.facts)
          if (!parsed || parsed.status === 'error' || !hasFactsKey) {
            progress.sourcesFailed.push(src.kind)
            const rawReason = (parsed && (parsed as any).message) || (parsed && !hasFactsKey ? (result.response.result as any)?.response : null) || 'Tool returned an unexpected response with no facts'
            await authFetch('/api/source-sync', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ source_id: src.id, sync_status: 'error', error_message: classifySyncError(src.kind, String(rawReason)) }),
            })
            continue
          }
          const facts = parsed.facts as SignalFact[]
          factsBySource[src.id] = facts
          const syncRes = await authFetch('/api/source-sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ source_id: src.id, facts }),
          })
          const syncData = await syncRes.json()
          if (syncData.success) {
            progress.synced += syncData.data.persisted ?? 0
            progress.perSource[src.kind] = syncData.data.persisted ?? 0
          }
        } catch (err: any) {
          progress.sourcesFailed.push(src.kind)
          await authFetch('/api/source-sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ source_id: src.id, sync_status: 'error', error_message: err.message ?? 'Network error during sync' }),
          })
        }
      }
      await load() // refresh events_ingested + sync status now that sync has persisted rows

      const perSourceLines = [
        ...Object.entries(progress.perSource).map(([kind, n]) => `${kind}: ${n} fact${n === 1 ? '' : 's'} ingested`),
        ...progress.sourcesFailed.map((kind) => `${kind}: sync failed`),
      ]
      const summaryLine = perSourceLines.length > 0 ? ` (${perSourceLines.join(', ')})` : ''

      const allFacts = Object.values(factsBySource).flat()
      if (allFacts.length === 0) {
        toast.error(
          progress.sourcesFailed.length > 0
            ? `No facts ingested — sync failed for: ${progress.sourcesFailed.join(', ')}.${summaryLine ? ` See error detail on each Sources card.` : ''}`
            : 'No decision-bearing facts found in the configured scopes yet.'
        )
        return
      }
      if (progress.sourcesFailed.length > 0) {
        toast.error(`Continuing with successful sources — sync failed for: ${progress.sourcesFailed.join(', ')}.${summaryLine}`)
      }

      // STAGE 3 — detect drift once per (section, source) pair using the
      // just-persisted facts, exactly as the Drift Detection Agent contract
      // requires (one source per invocation, confidence >= 0.6 to report).
      const findings: { section: any; source: SourceRow; detection: DetectionResult }[] = []
      for (const section of sectionsAll) {
        for (const src of connectedSources) {
          const events = factsBySource[src.id]
          if (!events || events.length === 0) continue
          const message = JSON.stringify({
            section: { heading: section.heading, body: section.body_md, last_verified_at: section.last_verified_at ?? null, owner: section.page_owner ?? null },
            events,
            scope: src.scopes,
          })
          try {
            const result = await callAIAgent(`Compare this section against these source events:\n${message}`, DRIFT_DETECTION_AGENT_ID)
            if (!result.success || result.response?.status !== 'success') continue
            const raw = result.response.result as any
            const detection: DetectionResult = typeof raw === 'string' ? JSON.parse(stripFences(raw)) : raw
            if (detection && detection.drift && detection.confidence >= 0.6) {
              findings.push({ section, source: src, detection })
            }
          } catch {
            // one section/source pair failing does not fail the whole scan
          }
        }
      }
      console.log(`[drift-scan-client] sections_scanned=${sectionsAll.length} findings_count=${findings.length}`)

      if (findings.length === 0) {
        toast.success(`Sync complete — ${progress.synced} new event(s) ingested. No drift detected against current wiki content.`)
        return
      }

      // STAGE 4 — resolve multi-source conflicts per section using authority_rank,
      // then recency, then formal-record-beats-chat, exactly as the Coordinator's
      // own documented conflict rules specify. Unresolvable ties become a
      // needs_human_input conflict card instead of a guessed proposal.
      const bySection = new Map<string, typeof findings>()
      for (const f of findings) {
        const arr = bySection.get(f.section.id) ?? []
        arr.push(f)
        bySection.set(f.section.id, arr)
      }

      const winners: typeof findings = []
      const conflicts: DriftScanConflict[] = []
      for (const [sectionId, group] of bySection) {
        if (group.length === 1) { winners.push(group[0]); continue }
        const maxRank = Math.max(...group.map((g) => g.source.authority_rank))
        const topRank = group.filter((g) => g.source.authority_rank === maxRank)
        if (topRank.length === 1) { winners.push(topRank[0]); continue }
        const formal = topRank.filter((g) => FORMAL_SOURCE_KINDS.has(g.source.kind))
        const pool = formal.length > 0 ? formal : topRank
        if (pool.length === 1) { winners.push(pool[0]); continue }
        const newest = pool.slice().sort((a, b) => {
          const ta = new Date(a.detection.evidence?.[0]?.timestamp ?? 0).getTime()
          const tb = new Date(b.detection.evidence?.[0]?.timestamp ?? 0).getTime()
          return tb - ta
        })
        if (newest.length > 0 && !Number.isNaN(new Date(newest[0].detection.evidence?.[0]?.timestamp ?? '').getTime())) {
          winners.push(newest[0])
        } else {
          conflicts.push({
            section_id: sectionId,
            reason: `${group.length} sources disagree at equal authority rank (${maxRank}) with no clear recency signal — owner arbitration required.`,
            conflicting_sources: group.map((g) => g.source.kind),
          })
        }
      }

      // STAGE 5 — draft a minimal redline for each winning finding.
      const proposals: DriftScanProposal[] = []
      for (const w of winners) {
        const primaryEvidence = w.detection.evidence?.[0]
        const message = JSON.stringify({
          section: { heading: w.section.heading, body: w.section.body_md },
          finding: { claim: w.detection.claim, kind: w.detection.kind, evidence: w.detection.evidence ?? [] },
          style: 'match the existing wiki voice',
        })
        try {
          const result = await callAIAgent(`Draft a minimal redline for this finding:\n${message}`, PROPOSAL_DRAFTER_AGENT_ID)
          if (!result.success || result.response?.status !== 'success') continue
          const raw = result.response.result as any
          const draft = typeof raw === 'string' ? JSON.parse(stripFences(raw)) : raw
          proposals.push({
            section_id: w.section.id,
            current_md: draft.current_md ?? w.section.body_md,
            proposed_md: draft.proposed_md ?? w.section.body_md,
            rationale: draft.rationale ?? w.detection.note ?? 'Drift detected',
            needs_human_input: !!draft.needs_human_input,
            question: draft.question ?? null,
            citation: draft.citation ?? (primaryEvidence ? { source_kind: w.source.kind, url: primaryEvidence.url, snippet: primaryEvidence.quote, timestamp: primaryEvidence.timestamp } : undefined),
          })
        } catch {
          // one drafting failure does not fail the whole scan
        }
      }

      if (proposals.length === 0 && conflicts.length === 0) {
        toast.success(`Sync complete — ${progress.synced} new event(s) ingested. Findings detected but drafting produced nothing to review.`)
        return
      }

      // STAGE 6 — persist exactly as before (unchanged, deterministic DB write).
      const scanId = `scan_${Date.now()}`
      const persistRes = await authFetch('/api/drift-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scan_id: scanId, proposals, conflicts }),
      })
      const persistData = await persistRes.json()
      if (!persistData.success) { toast.error(persistData.error ?? 'Failed to persist scan results'); return }

      setLastScanSummary({ proposals: persistData.data.created_proposals, conflicts: conflicts.length })
      toast.success(`Drift scan complete — ${progress.synced} event(s) ingested, ${persistData.data.created_proposals} proposal(s) queued for review${conflicts.length > 0 ? `, ${conflicts.length} conflict(s) need arbitration` : ''}.${summaryLine}`)
      onChanged()
    } catch (err: any) {
      toast.error(err.message ?? 'Drift scan failed — you can retry without losing prior proposals')
    } finally {
      setScanning(false)
      setActiveAgentId(null)
    }
  }

  const drawerDef = CONNECTOR_DEFS.find((c) => c.kind === scopeDrawerKind)
  const drawerSource = displaySources.find((s) => s.kind === scopeDrawerKind)

  return (
    <div className="max-w-6xl space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Sources</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Connect Slack, Drive, GitHub, Jira and Linear, then run a scan to detect drift.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch id="sample-toggle" checked={sampleMode} onCheckedChange={onSampleModeChange} />
            <Label htmlFor="sample-toggle" className="text-xs text-muted-foreground">Sample Data</Label>
          </div>
          <Button size="sm" onClick={runDriftScan} disabled={scanning || role === 'viewer'} className="active:scale-[0.98] transition-transform">
            {scanning ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}
            Run Drift Scan
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Radio className="h-3.5 w-3.5" />
        <span>Powering agent:</span>
        <Badge variant="outline" className="font-mono text-[10px]">Drift Scan Coordinator</Badge>
        <span className={`h-1.5 w-1.5 rounded-full ${activeAgentId ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} />
        <span>{activeAgentId ? 'running…' : 'idle'}</span>
      </div>

      {lastScanSummary && (
        <div className="rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>Last scan queued <strong>{lastScanSummary.proposals}</strong> proposal(s){lastScanSummary.conflicts > 0 ? ` and flagged ${lastScanSummary.conflicts} conflict(s)` : ''}. Review them in the Review Queue.</span>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => <div key={i} className="h-40 rounded-xl bg-muted animate-pulse" />)}
        </div>
      ) : (!isAdmin && displaySources.length === 0) ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No sources are connected yet. Ask an admin to connect Slack, Drive, GitHub, Jira or Linear.
          </CardContent>
        </Card>
      ) : (displaySources.length === 0 && isAdmin) ? (
        <Card className="border-dashed">
          <CardContent className="py-10 flex flex-col items-center text-center gap-3">
            <Plug className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="font-semibold text-sm">Connect your first source</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">Truewiki watches your tools for decision-bearing activity. Connect at least one source, then import a wiki page to run your first drift scan.</p>
            </div>
            <div className="flex flex-wrap justify-center gap-2 mt-2">
              {CONNECTOR_DEFS.map((c) => (
                <Button key={c.kind} variant="outline" size="sm" onClick={() => connect(c.kind)}>
                  <c.icon className="h-3.5 w-3.5 mr-1.5" /> Connect {c.label}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {CONNECTOR_DEFS.map((def) => {
            const existing = displaySources.find((s) => s.kind === def.kind)
            const Icon = def.icon
            const isConnected = existing?.status === 'connected'
            const latestCursor = existing?.cursors && existing.cursors.length > 0
              ? existing.cursors.reduce((a, b) => (new Date(a.last_run_at ?? 0) > new Date(b.last_run_at ?? 0) ? a : b))
              : null
            const syncFailed = !!latestCursor?.last_status?.startsWith('error')
            const syncOk = latestCursor?.last_status === 'success'
            return (
              <Card key={def.kind} className={`flex flex-col ${syncFailed ? 'border-destructive/40' : ''}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                      <Icon className="h-4 w-4" /> {def.label}
                    </CardTitle>
                    <Badge variant={isConnected ? 'default' : 'secondary'} className="text-[10px]">
                      {isConnected ? 'Connected' : existing ? 'Disconnected' : 'Not connected'}
                    </Badge>
                  </div>
                  <CardDescription className="text-xs">
                    {existing?.last_synced_at ? `Last synced ${new Date(existing.last_synced_at).toLocaleString()}` : 'Never synced'}
                  </CardDescription>
                  {isConnected && (
                    <div className={`flex items-center gap-1.5 text-[11px] font-medium mt-1 ${syncFailed ? 'text-destructive' : syncOk ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                      {syncFailed ? <AlertTriangle className="h-3 w-3" /> : syncOk ? <CheckCircle2 className="h-3 w-3" /> : null}
                      {syncFailed ? 'Sync failed' : syncOk ? 'Synced' : 'Not yet synced'}
                    </div>
                  )}
                  {syncFailed && (
                    <p className="text-[10px] text-destructive/90 mt-0.5 break-words">
                      Error: {latestCursor!.last_status!.replace(/^error:\s*/, '')}
                    </p>
                  )}
                </CardHeader>
                <CardContent className="flex-1 flex flex-col gap-3 text-xs">
                  <div className="flex flex-wrap gap-1">
                    {(existing?.scopes ?? []).length > 0 ? existing!.scopes.map((s, i) => (
                      <Badge key={i} variant="outline" className="text-[10px]">{s}</Badge>
                    )) : <span className="text-muted-foreground">No scopes watched yet</span>}
                  </div>
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>Events ingested</span>
                    <span className="font-mono tabular-nums text-foreground">{existing?.events_ingested ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-muted-foreground">Authority rank</Label>
                    <Select
                      value={String(existing?.authority_rank ?? 3)}
                      onValueChange={(v) => existing && setRank(existing.id, Number(v))}
                      disabled={!isAdmin || !existing}
                    >
                      <SelectTrigger className="h-7 w-16 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4, 5].map((r) => <SelectItem key={r} value={String(r)}>{r}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="mt-auto flex gap-2 pt-1">
                    {existing && isConnected ? (
                      <>
                        <Button size="sm" variant="outline" className="flex-1 h-8 text-xs" onClick={() => setScopeDrawerKind(def.kind)} disabled={!isAdmin}>
                          <Plus className="h-3 w-3 mr-1" /> Add scope
                        </Button>
                        {isAdmin && (
                          <Button size="sm" variant="ghost" className="h-8 text-xs text-destructive" onClick={() => disconnect(existing.id)}>
                            Disconnect
                          </Button>
                        )}
                      </>
                    ) : (
                      <Button size="sm" className="flex-1 h-8 text-xs" onClick={() => connect(def.kind)} disabled={!isAdmin}>
                        <Plug className="h-3 w-3 mr-1" /> Connect
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Sheet open={!!scopeDrawerKind} onOpenChange={(o) => !o && setScopeDrawerKind(null)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{drawerDef?.label} scopes</SheetTitle>
            <SheetDescription>Add the channels, folders, repos or projects to watch.</SheetDescription>
          </SheetHeader>
          <div className="px-4 space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {(drawerSource?.scopes ?? []).map((s, i) => (
                <Badge key={i} variant="outline" className="text-xs gap-1">
                  {s}
                  <button onClick={() => drawerSource && removeScope(drawerSource.id, drawerSource.scopes, s)}><X className="h-3 w-3" /></button>
                </Badge>
              ))}
              {(drawerSource?.scopes ?? []).length === 0 && <p className="text-xs text-muted-foreground">No scopes yet.</p>}
            </div>
            <div className="flex gap-2">
              <Input value={newScope} onChange={(e) => setNewScope(e.target.value)} placeholder={drawerDef?.placeholder} className="h-9 text-sm" />
              <Button size="sm" onClick={() => drawerSource && addScope(drawerSource.id, drawerSource.scopes)}>Add</Button>
            </div>
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setScopeDrawerKind(null)}>Done</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}
