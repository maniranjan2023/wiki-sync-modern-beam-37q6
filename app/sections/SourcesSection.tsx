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
    try {
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
        if (sData.success) sectionsAll.push(...(sData.data ?? []).map((s: any) => ({ ...s, page_title: p.title, page_status: p.status })))
      }
      const connectedSources = sources.filter((s) => s.status === 'connected')
      const message = `Run a drift scan. Connected sources and scopes: ${JSON.stringify(
        connectedSources.map((s) => ({ id: s.id, kind: s.kind, scopes: s.scopes, authority_rank: s.authority_rank }))
      )}. Wiki page_sections to compare against: ${JSON.stringify(
        sectionsAll.map((s) => ({ section_id: s.id, page_title: s.page_title, heading: s.heading, body_md: s.body_md }))
      )}. Return findings and drafted proposals per the response contract.`

      const result = await callAIAgent(message, DRIFT_SCAN_COORDINATOR_ID)
      if (!result.success || result.response?.status !== 'success') {
        toast.error(result.response?.message ?? 'Drift scan failed')
        return
      }
      let parsed: DriftScanResult | null = null
      try {
        const raw = result.response.result as any
        parsed = typeof raw === 'string' ? JSON.parse(stripFences(raw)) : (raw as DriftScanResult)
      } catch {
        toast.error('Could not parse the coordinator response')
        return
      }
      if (!parsed || !Array.isArray(parsed.proposals)) {
        toast.error('Coordinator returned an unexpected shape')
        return
      }

      const persistRes = await authFetch('/api/drift-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scan_id: parsed.scan_id, proposals: parsed.proposals, conflicts: parsed.conflicts ?? [] }),
      })
      const persistData = await persistRes.json()
      if (!persistData.success) { toast.error(persistData.error ?? 'Failed to persist scan results'); return }

      setLastScanSummary({ proposals: persistData.data.created_proposals, conflicts: (parsed.conflicts ?? []).length })
      toast.success(`Drift scan complete — ${persistData.data.created_proposals} proposal(s) queued for review`)
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
            return (
              <Card key={def.kind} className="flex flex-col">
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
