'use client'

import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import {
  FileText, Upload, History, CheckCircle2, AlertTriangle, Clock, Loader2, Save, Radio, User,
} from 'lucide-react'
import { callAIAgent } from '@/lib/aiAgent'
import type { Role } from '@/app/page'

const WIKI_IMPORT_AGENT_ID = '6a7a228915c60742623cc095'

function stripFences(raw: string): string {
  const trimmed = raw.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return fenced ? fenced[1] : trimmed
}

interface PageRow {
  id: string
  title: string
  slug: string
  body_md: string
  status: string
  owner_user_id: string | null
  cadence: string
  last_verified_at: string | null
  open_finding_count: number
}
interface SectionRow { id: string; page_id: string; heading: string; body_md: string; position: number }
interface VersionRow { id: string; page_id: string; body_md: string; version_no: number; created_by: string | null; created_at: string }

interface MapperSection { heading: string; body_md: string; position: number; suggested_owner: string; suggested_scopes: string[] }
interface MapperResult { sections: MapperSection[]; status: 'success' | 'error'; metadata?: { agent_name?: string; timestamp?: string } }

const SAMPLE_PAGES: PageRow[] = [
  { id: 'sample-1', title: 'Pricing & Packaging', slug: 'pricing-packaging', body_md: '## Enterprise tier\n\nBilled annually at $2,000 per month, minimum 25 seats.', status: 'drift_detected', owner_user_id: 'sample-owner', cadence: 'weekly', last_verified_at: new Date(Date.now() - 12 * 86400000).toISOString(), open_finding_count: 1 },
  { id: 'sample-2', title: 'Onboarding Runbook', slug: 'onboarding-runbook', body_md: '## New hire checklist\n\nProvision laptop, Slack, and GitHub access within 24 hours.', status: 'drift_detected', owner_user_id: 'sample-owner', cadence: 'monthly', last_verified_at: new Date(Date.now() - 30 * 86400000).toISOString(), open_finding_count: 1 },
  { id: 'sample-3', title: 'Support SLAs', slug: 'support-slas', body_md: '## Response times\n\nP1 incidents acknowledged within 15 minutes, 24/7.', status: 'stale', owner_user_id: null, cadence: 'monthly', last_verified_at: new Date(Date.now() - 64 * 86400000).toISOString(), open_finding_count: 0 },
  { id: 'sample-4', title: 'Security Review Process', slug: 'security-review', body_md: '## Vendor review\n\nAll new vendors require a completed security questionnaire before signature.', status: 'verified', owner_user_id: 'sample-owner', cadence: 'weekly', last_verified_at: new Date(Date.now() - 2 * 86400000).toISOString(), open_finding_count: 0 },
]
const SAMPLE_SECTIONS: Record<string, SectionRow[]> = {
  'sample-1': [{ id: 'sec-1', page_id: 'sample-1', heading: 'Enterprise tier', body_md: 'Billed annually at $2,000 per month, minimum 25 seats.', position: 0 }],
  'sample-2': [{ id: 'sec-2', page_id: 'sample-2', heading: 'New hire checklist', body_md: 'Provision laptop, Slack, and GitHub access within 24 hours.', position: 0 }],
  'sample-3': [{ id: 'sec-3', page_id: 'sample-3', heading: 'Response times', body_md: 'P1 incidents acknowledged within 15 minutes, 24/7.', position: 0 }],
  'sample-4': [{ id: 'sec-4', page_id: 'sample-4', heading: 'Vendor review', body_md: 'All new vendors require a completed security questionnaire before signature.', position: 0 }],
}

function statusDot(status: string) {
  if (status === 'verified') return 'bg-emerald-500'
  if (status === 'drift_detected') return 'bg-amber-500'
  return 'bg-zinc-400'
}
function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    verified: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-900',
    drift_detected: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-900',
    stale: 'bg-muted text-muted-foreground border-border',
    applying: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-400 dark:border-blue-900',
  }
  const label: Record<string, string> = { verified: 'verified', drift_detected: 'drift detected', stale: 'stale', applying: 'applying' }
  return <Badge variant="outline" className={`text-[10px] font-medium ${map[status] ?? ''}`}>{label[status] ?? status}</Badge>
}

export default function WikiSection({
  authFetch, role, userId, sampleMode, onSampleModeChange, onChanged,
}: {
  authFetch: (input: RequestInfo, init?: RequestInit) => Promise<Response>
  role: Role
  userId: string
  sampleMode: boolean
  onSampleModeChange: (v: boolean) => void
  onChanged: () => void
}) {
  const [pages, setPages] = useState<PageRow[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sections, setSections] = useState<SectionRow[]>([])
  const [editBody, setEditBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [cadence, setCadence] = useState('weekly')
  const [versions, setVersions] = useState<VersionRow[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)

  const [importOpen, setImportOpen] = useState(false)
  const [importText, setImportText] = useState('')
  const [importing, setImporting] = useState(false)
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null)
  const [mapperSections, setMapperSections] = useState<MapperSection[] | null>(null)
  const [importTitle, setImportTitle] = useState('')
  const [importOwner, setImportOwner] = useState('')

  const isViewer = role === 'viewer'

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authFetch('/api/pages')
      const data = await res.json()
      if (data.success) setPages(Array.isArray(data.data) ? data.data : [])
      else toast.error(data.error ?? 'Failed to load pages')
    } catch (err: any) {
      toast.error(err.message ?? 'Network error loading pages')
    } finally {
      setLoading(false)
    }
  }, [authFetch])

  useEffect(() => { load() }, [load])

  const displayPages = sampleMode && pages.length === 0 ? SAMPLE_PAGES : pages
  const canEditPage = useCallback((p: PageRow | undefined) => {
    if (!p) return false
    if (role === 'admin') return true
    if (role === 'owner') return p.owner_user_id === userId || !p.owner_user_id
    return false
  }, [role, userId])

  useEffect(() => {
    if (displayPages.length > 0 && !selectedId) setSelectedId(displayPages[0].id)
  }, [displayPages, selectedId])

  const selectedPage = displayPages.find((p) => p.id === selectedId) ?? null

  useEffect(() => {
    if (!selectedPage) return
    setCadence(selectedPage.cadence)
    setEditBody(selectedPage.body_md)
    if (selectedPage.id.startsWith('sample-')) {
      setSections(SAMPLE_SECTIONS[selectedPage.id] ?? [])
      return
    }
    authFetch(`/api/page-sections?page_id=${selectedPage.id}`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setSections(Array.isArray(d.data) ? d.data : []) })
      .catch(() => {})
  }, [selectedPage?.id, authFetch])

  async function saveBody() {
    if (!selectedPage || selectedPage.id.startsWith('sample-')) { toast.error('Turn off Sample Data to edit a real page'); return }
    setSaving(true)
    try {
      const res = await authFetch('/api/pages', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedPage.id, body_md: editBody }),
      })
      const data = await res.json()
      if (!data.success) { toast.error(data.error ?? 'Failed to save'); return }
      toast.success('Page saved and versioned')
      await load()
      onChanged()
    } catch (err: any) {
      toast.error(err.message ?? 'Network error')
    } finally {
      setSaving(false)
    }
  }

  async function saveCadence(v: string) {
    setCadence(v)
    if (!selectedPage || selectedPage.id.startsWith('sample-')) return
    try {
      const res = await authFetch('/api/pages', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedPage.id, cadence: v }),
      })
      const data = await res.json()
      if (!data.success) toast.error(data.error ?? 'Failed to update cadence')
    } catch (err: any) {
      toast.error(err.message ?? 'Network error')
    }
  }

  async function openHistory() {
    if (!selectedPage) return
    setHistoryOpen(true)
    if (selectedPage.id.startsWith('sample-')) { setVersions([]); return }
    try {
      const res = await authFetch(`/api/page-versions?page_id=${selectedPage.id}`)
      const data = await res.json()
      if (data.success) setVersions(Array.isArray(data.data) ? data.data : [])
    } catch { /* ignore */ }
  }

  async function runImport() {
    if (!importText.trim()) { toast.error('Paste some Markdown first'); return }
    setImporting(true)
    setActiveAgentId(WIKI_IMPORT_AGENT_ID)
    try {
      const result = await callAIAgent(`Split this Markdown wiki page into sections and suggest an owner and source scopes for each:\n\n${importText}`, WIKI_IMPORT_AGENT_ID)
      if (!result.success || result.response?.status !== 'success') {
        toast.error(result.response?.message ?? 'Import failed')
        return
      }
      let parsed: MapperResult | null = null
      try {
        const raw = result.response.result as any
        parsed = typeof raw === 'string' ? JSON.parse(stripFences(raw)) : (raw as MapperResult)
      } catch {
        toast.error('Could not parse the mapper response')
        return
      }
      if (!parsed || !Array.isArray(parsed.sections)) {
        toast.error('Mapper returned an unexpected shape')
        return
      }
      setMapperSections(parsed.sections)
      if (!importTitle) {
        const firstHeading = parsed.sections[0]?.heading ?? 'Imported Page'
        setImportTitle(firstHeading)
      }
      toast.success(`Mapped ${parsed.sections.length} section(s) — confirm owner and scopes below`)
    } catch (err: any) {
      toast.error(err.message ?? 'Import failed')
    } finally {
      setImporting(false)
      setActiveAgentId(null)
    }
  }

  async function confirmImport() {
    if (!mapperSections || !importTitle.trim()) { toast.error('Title and mapped sections are required'); return }
    try {
      const res = await authFetch('/api/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: importTitle,
          sections: mapperSections,
          owner_user_id: role === 'admin' ? (importOwner || null) : userId,
          cadence: 'weekly',
        }),
      })
      const data = await res.json()
      if (!data.success) { toast.error(data.error ?? 'Failed to import page'); return }
      toast.success('Page imported and indexed')
      setImportOpen(false)
      setImportText('')
      setMapperSections(null)
      setImportTitle('')
      setImportOwner('')
      onSampleModeChange(false)
      await load()
      onChanged()
    } catch (err: any) {
      toast.error(err.message ?? 'Network error')
    }
  }

  const canImport = role !== 'viewer'

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Wiki</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Section-level pages kept in sync with source-of-truth activity.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch id="sample-toggle-wiki" checked={sampleMode} onCheckedChange={onSampleModeChange} />
            <Label htmlFor="sample-toggle-wiki" className="text-xs text-muted-foreground">Sample Data</Label>
          </div>
          {canImport && (
            <Button size="sm" onClick={() => setImportOpen(true)} className="active:scale-[0.98] transition-transform">
              <Upload className="h-4 w-4 mr-1.5" /> Import &amp; Index
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="h-72 rounded-xl bg-muted animate-pulse" />
      ) : displayPages.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-10 flex flex-col items-center text-center gap-3">
            <FileText className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="font-semibold text-sm">No pages yet</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">Import your first Markdown page — Truewiki will split it into sections and suggest an owner and source scopes for each.</p>
            </div>
            {canImport && <Button size="sm" onClick={() => setImportOpen(true)}><Upload className="h-3.5 w-3.5 mr-1.5" /> Import &amp; Index</Button>}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4">
          <Card className="p-0 overflow-hidden">
            <div className="px-3 py-2 border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Pages</div>
            <div className="max-h-[560px] overflow-y-auto">
              {displayPages.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedId(p.id)}
                  className={`w-full text-left px-3 py-2.5 border-b border-border last:border-0 flex items-start gap-2 min-h-10 ${selectedId === p.id ? 'bg-muted' : 'hover:bg-muted/50'}`}
                >
                  <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${statusDot(p.status)}`} />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium truncate">{p.title}</span>
                    <span className="block text-[11px] text-muted-foreground">{p.cadence} · {p.open_finding_count} open</span>
                  </span>
                </button>
              ))}
            </div>
          </Card>

          <Card className="p-0 overflow-hidden">
            {selectedPage ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-border">
                  <div className="flex items-center gap-2 min-w-0">
                    <h3 className="font-semibold text-sm truncate">{selectedPage.title}</h3>
                    <StatusPill status={selectedPage.status} />
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] gap-1"><User className="h-3 w-3" />{selectedPage.owner_user_id ? 'Owned' : 'Unassigned (admin)'}</Badge>
                    <Select value={cadence} onValueChange={saveCadence} disabled={!canEditPage(selectedPage)}>
                      <SelectTrigger className="h-7 w-24 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={openHistory}><History className="h-3 w-3 mr-1" /> History</Button>
                  </div>
                </div>

                {selectedPage.status !== 'verified' && isViewer && (
                  <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-400 text-xs border-b border-amber-200 dark:border-amber-900">
                    <AlertTriangle className="h-3.5 w-3.5" /> This page may be outdated — a drift scan flagged unresolved changes.
                  </div>
                )}

                <div className="px-4 py-3 space-y-4">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Sections</div>
                    <div className="space-y-2">
                      {sections.length === 0 && <p className="text-sm text-muted-foreground">No sections indexed for this page yet.</p>}
                      {sections.map((s) => (
                        <div key={s.id} className="rounded-md border border-border px-3 py-2">
                          <div className="text-xs font-semibold mb-1">{s.heading}</div>
                          <p className="text-xs text-muted-foreground line-clamp-2">{s.body_md}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Markdown</Label>
                      {canEditPage(selectedPage) && (
                        <Button size="sm" className="h-7 text-xs" onClick={saveBody} disabled={saving || editBody === selectedPage.body_md}>
                          {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />} Save
                        </Button>
                      )}
                    </div>
                    <Textarea
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                      readOnly={!canEditPage(selectedPage)}
                      className="font-mono text-xs min-h-[220px]"
                    />
                    {!canEditPage(selectedPage) && (
                      <p className="text-[11px] text-muted-foreground mt-1">Read-only — you are not this page's owner.</p>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="p-10 text-center text-sm text-muted-foreground">Select a page</div>
            )}
          </Card>
        </div>
      )}

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Radio className="h-3.5 w-3.5" />
        <span>Powering agent:</span>
        <Badge variant="outline" className="font-mono text-[10px]">Wiki Import &amp; Section Mapper</Badge>
        <span className={`h-1.5 w-1.5 rounded-full ${activeAgentId ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} />
        <span>{activeAgentId ? 'running…' : 'idle'}</span>
      </div>

      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent className="sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Version history</SheetTitle>
            <SheetDescription>{selectedPage?.title}</SheetDescription>
          </SheetHeader>
          <div className="px-4 space-y-3 max-h-[70vh] overflow-y-auto">
            {versions.length === 0 && <p className="text-xs text-muted-foreground">No prior versions recorded yet.</p>}
            {versions.map((v, i) => {
              const prev = versions[i + 1]
              return (
                <div key={v.id} className="rounded-md border border-border p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold">Version {v.version_no}</span>
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" />{new Date(v.created_at).toLocaleString()}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <div className="text-muted-foreground mb-1">Previous</div>
                      <pre className="whitespace-pre-wrap font-mono bg-muted rounded p-2 max-h-32 overflow-y-auto">{prev?.body_md ?? '(none)'}</pre>
                    </div>
                    <div>
                      <div className="text-muted-foreground mb-1">This version</div>
                      <pre className="whitespace-pre-wrap font-mono bg-muted rounded p-2 max-h-32 overflow-y-auto">{v.body_md}</pre>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={importOpen} onOpenChange={(o) => { setImportOpen(o); if (!o) { setMapperSections(null); setImportText('') } }}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Import &amp; Index</DialogTitle>
            <DialogDescription>Paste Markdown — the Section Mapper agent will split it and suggest an owner + scopes per section.</DialogDescription>
          </DialogHeader>
          {!mapperSections ? (
            <div className="space-y-3">
              <Textarea value={importText} onChange={(e) => setImportText(e.target.value)} placeholder={'# Page title\n\n## Section heading\n\nSection content…'} className="min-h-[220px] font-mono text-xs" />
              <DialogFooter>
                <Button variant="outline" onClick={() => setImportOpen(false)}>Cancel</Button>
                <Button onClick={runImport} disabled={importing}>
                  {importing ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Upload className="h-4 w-4 mr-1.5" />} Map sections
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Page title</Label>
                <Input value={importTitle} onChange={(e) => setImportTitle(e.target.value)} className="h-8 text-sm mt-1" />
              </div>
              {role === 'admin' && (
                <div>
                  <Label className="text-xs">Owner (user id, optional — leave blank to assign later)</Label>
                  <Input value={importOwner} onChange={(e) => setImportOwner(e.target.value)} className="h-8 text-sm mt-1" placeholder="owner_user_id" />
                </div>
              )}
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {mapperSections.map((s, i) => (
                  <div key={i} className="rounded-md border border-border p-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold">{s.heading}</span>
                      <span className="text-[10px] text-muted-foreground">suggested owner: {s.suggested_owner || 'unassigned'}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{s.body_md}</p>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {(s.suggested_scopes ?? []).map((sc, j) => <Badge key={j} variant="outline" className="text-[10px]">{sc}</Badge>)}
                    </div>
                  </div>
                ))}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setMapperSections(null)}>Back</Button>
                <Button onClick={confirmImport}><CheckCircle2 className="h-4 w-4 mr-1.5" /> Confirm &amp; create page</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
