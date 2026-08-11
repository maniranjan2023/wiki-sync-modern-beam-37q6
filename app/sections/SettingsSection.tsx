'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Users, Mail, Loader2, Sun, Trash2, TriangleAlert } from 'lucide-react'
import type { Role, Profile } from '@/app/page'

interface Member {
  id: string
  owner_user_id: string
  email: string
  role: Role
  invited?: boolean
}

export default function SettingsSection({
  authFetch, role, profile, onProfileUpdated,
}: {
  authFetch: (input: RequestInfo, init?: RequestInit) => Promise<Response>
  role: Role
  profile: Profile
  onProfileUpdated: (p: Profile) => void
}) {
  const [members, setMembers] = useState<Member[]>([])
  const [loadingMembers, setLoadingMembers] = useState(role === 'admin')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  const [savingPrefs, setSavingPrefs] = useState(false)
  const [resetting, setResetting] = useState(false)

  const loadMembers = useCallback(async () => {
    if (role !== 'admin') return
    setLoadingMembers(true)
    try {
      const res = await authFetch('/api/members')
      const data = await res.json()
      if (data.success) setMembers(Array.isArray(data.data) ? data.data : [])
      else toast.error(data.error ?? 'Failed to load members')
    } catch (err: any) {
      toast.error(err.message ?? 'Network error loading members')
    } finally {
      setLoadingMembers(false)
    }
  }, [authFetch, role])

  useEffect(() => { loadMembers() }, [loadMembers])

  async function changeRole(owner_user_id: string, newRole: Role) {
    try {
      const res = await authFetch('/api/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_role', owner_user_id, role: newRole }),
      })
      const data = await res.json()
      if (!data.success) { toast.error(data.error ?? 'Failed to change role'); return }
      toast.success('Role updated')
      await loadMembers()
    } catch (err: any) {
      toast.error(err.message ?? 'Network error')
    }
  }

  async function invite() {
    if (!inviteEmail.trim()) return
    setInviting(true)
    try {
      const res = await authFetch('/api/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'invite', email: inviteEmail.trim(), role: 'viewer' }),
      })
      const data = await res.json()
      if (!data.success) { toast.error(data.error ?? 'Failed to invite'); return }
      toast.success(`Invite created for ${inviteEmail} — a pending account shell was created (no email is sent yet).`)
      setInviteEmail('')
      await loadMembers()
    } catch (err: any) {
      toast.error(err.message ?? 'Network error')
    } finally {
      setInviting(false)
    }
  }

  async function resetWorkspace() {
    setResetting(true)
    try {
      const res = await authFetch('/api/reset', { method: 'POST' })
      const data = await res.json()
      if (!data.success) { toast.error(data.error ?? 'Failed to reset workspace'); return }
      toast.success('Workspace reset. Sources, wiki pages, findings, proposals and audit history were cleared.')
      window.location.reload()
    } catch (err: any) {
      toast.error(err.message ?? 'Network error')
    } finally {
      setResetting(false)
    }
  }

  async function updatePrefs(updates: Partial<Profile>) {
    setSavingPrefs(true)
    try {
      const res = await authFetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      const data = await res.json()
      if (!data.success) { toast.error(data.error ?? 'Failed to save'); return }
      onProfileUpdated(data.data)
      toast.success('Preferences saved')
    } catch (err: any) {
      toast.error(err.message ?? 'Network error')
    } finally {
      setSavingPrefs(false)
    }
  }

  return (
    <div className="max-w-3xl space-y-6 animate-in fade-in duration-300">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Settings</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Members, defaults and notification preferences.</p>
      </div>

      {role === 'admin' && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2"><Users className="h-4 w-4" /> Members &amp; roles</CardTitle>
            <CardDescription className="text-xs">Change any member's role. Inviting creates a pending account shell — no email is sent.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="teammate@company.com" className="h-9 text-sm" />
              <Button size="sm" onClick={invite} disabled={inviting || !inviteEmail.trim()}>
                {inviting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Mail className="h-4 w-4 mr-1.5" />} Invite
              </Button>
            </div>
            {loadingMembers ? (
              <div className="h-24 rounded-lg bg-muted animate-pulse" />
            ) : members.length === 0 ? (
              <p className="text-xs text-muted-foreground">No members yet.</p>
            ) : (
              <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
                {members.map((m) => (
                  <div key={m.id} className="flex items-center justify-between px-3 py-2.5 text-sm">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{m.email || m.owner_user_id}</div>
                      {m.invited && <span className="text-[10px] text-muted-foreground">Pending invite</span>}
                    </div>
                    <Select value={m.role} onValueChange={(v) => changeRole(m.owner_user_id, v as Role)}>
                      <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="owner">Owner</SelectItem>
                        <SelectItem value="viewer">Viewer</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Defaults</CardTitle>
          <CardDescription className="text-xs">Default cadence applied to newly imported pages.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between max-w-xs">
            <Label className="text-sm">Default cadence</Label>
            <Select value={profile.default_cadence} onValueChange={(v) => updatePrefs({ default_cadence: v })} disabled={savingPrefs}>
              <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Notification preferences</CardTitle>
          <CardDescription className="text-xs">Controls the payload sent to the Review Notifier agent.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm">Notify me when a page I own drifts</Label>
            <Switch checked={profile.notify_on_drift} onCheckedChange={(v) => updatePrefs({ notify_on_drift: v })} disabled={savingPrefs} />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-sm">Include me in the review digest</Label>
            <Switch checked={profile.notify_digest} onCheckedChange={(v) => updatePrefs({ notify_digest: v })} disabled={savingPrefs} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2"><Sun className="h-4 w-4" /> Appearance</CardTitle>
          <CardDescription className="text-xs">Use the light/dark toggle fixed at the top of the app.</CardDescription>
        </CardHeader>
      </Card>

      {role === 'admin' && (
        <Card className="border-destructive/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2 text-destructive"><TriangleAlert className="h-4 w-4" /> Danger zone</CardTitle>
            <CardDescription className="text-xs">Permanently clear all sources, wiki pages, sections, findings, proposals and audit history. Accounts, roles and preferences (members, your login, notification settings) are kept.</CardDescription>
          </CardHeader>
          <CardContent>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="destructive" disabled={resetting}>
                  {resetting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Trash2 className="h-4 w-4 mr-1.5" />} Reset workspace data
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reset workspace data?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This deletes every source, wiki page, section, version, finding, proposal and audit log entry for good. Member accounts and profiles are not touched. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={resetWorkspace} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Yes, delete everything
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
