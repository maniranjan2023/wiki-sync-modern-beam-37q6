'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ScrollText, Clock } from 'lucide-react'

interface AuditRow {
  id: string
  actor_user_id: string | null
  entity_type: string
  entity_id: string
  action: string
  detail: Record<string, any>
  created_at: string
}

const SAMPLE_AUDIT: AuditRow[] = [
  { id: 'a1', actor_user_id: 'dana.k', entity_type: 'proposal', entity_id: 'sample-p1', action: 'drafted', detail: { source_kind: 'slack' }, created_at: new Date(Date.now() - 12 * 60000).toISOString() },
  { id: 'a2', actor_user_id: 'admin', entity_type: 'source', entity_id: 'slack', action: 'connected', detail: { display_name: 'Slack' }, created_at: new Date(Date.now() - 2 * 3600000).toISOString() },
  { id: 'a3', actor_user_id: 'owner.m', entity_type: 'proposal', entity_id: 'sample-p0', action: 'approved', detail: { page_id: 'sample-4' }, created_at: new Date(Date.now() - 5 * 3600000).toISOString() },
  { id: 'a4', actor_user_id: 'admin', entity_type: 'page', entity_id: 'sample-1', action: 'imported', detail: { title: 'Pricing & Packaging' }, created_at: new Date(Date.now() - 26 * 3600000).toISOString() },
]

export default function AuditLogSection({
  authFetch, sampleMode, onSampleModeChange, refreshKey,
}: {
  authFetch: (input: RequestInfo, init?: RequestInit) => Promise<Response>
  sampleMode: boolean
  onSampleModeChange: (v: boolean) => void
  refreshKey: number
}) {
  const [rows, setRows] = useState<AuditRow[]>([])
  const [loading, setLoading] = useState(true)
  const [actorFilter, setActorFilter] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authFetch('/api/audit-log')
      const data = await res.json()
      if (data.success) setRows(Array.isArray(data.data) ? data.data : [])
      else toast.error(data.error ?? 'Failed to load audit log')
    } catch (err: any) {
      toast.error(err.message ?? 'Network error loading audit log')
    } finally {
      setLoading(false)
    }
  }, [authFetch])

  useEffect(() => { load() }, [load, refreshKey])

  const displayRows = sampleMode && rows.length === 0 ? SAMPLE_AUDIT : rows
  const filtered = displayRows.filter((r) => !actorFilter || (r.actor_user_id ?? '').toLowerCase().includes(actorFilter.toLowerCase()))

  return (
    <div className="max-w-5xl space-y-5 animate-in fade-in duration-300">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Audit Log</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Every state change — proposals, approvals, rejections, connector changes.</p>
        </div>
        <div className="flex items-center gap-3">
          <Input placeholder="Filter by actor…" value={actorFilter} onChange={(e) => setActorFilter(e.target.value)} className="h-8 w-40 text-xs" />
          <div className="flex items-center gap-2">
            <Switch id="sample-toggle-audit" checked={sampleMode} onCheckedChange={onSampleModeChange} />
            <Label htmlFor="sample-toggle-audit" className="text-xs text-muted-foreground">Sample Data</Label>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="h-72 rounded-xl bg-muted animate-pulse" />
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 flex flex-col items-center text-center gap-2">
            <ScrollText className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No audit events recorded yet.</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-card z-10">
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Detail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap"><Clock className="h-3 w-3 inline mr-1" />{new Date(r.created_at).toLocaleString()}</TableCell>
                    <TableCell className="text-xs font-mono">{r.actor_user_id ?? 'system'}</TableCell>
                    <TableCell className="text-xs">
                      <Badge variant="outline" className="text-[10px] capitalize">{r.entity_type}</Badge>
                      <span className="ml-1.5 text-muted-foreground font-mono">{String(r.entity_id).slice(0, 10)}</span>
                    </TableCell>
                    <TableCell className="text-xs capitalize">{r.action.replace(/_/g, ' ')}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-xs truncate">{JSON.stringify(r.detail ?? {})}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  )
}
