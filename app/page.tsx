/**
 * Truewiki — Self-Maintaining Knowledge Base.
 * Persistent left sidebar (Sources · Wiki · Review Queue · Ask · Audit Log ·
 * Settings), workspace switcher, slim top bar with breadcrumbs / search /
 * pending-review badge. Auth is Mode A (email+password) via lyzr-architect-pg.
 */
'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { AuthProvider, ProtectedRoute, LoginForm, RegisterForm, UserMenu, useAuth } from 'lyzr-architect-pg/client'
import { Toaster, toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Database, BookOpen, ListChecks, MessageCircleQuestion, ScrollText, Settings as SettingsIcon,
  Search, Loader2, ShieldCheck,
} from 'lucide-react'

import SourcesSection from '@/app/sections/SourcesSection'
import WikiSection from '@/app/sections/WikiSection'
import ReviewQueueSection from '@/app/sections/ReviewQueueSection'
import AskSection from '@/app/sections/AskSection'
import AuditLogSection from '@/app/sections/AuditLogSection'
import SettingsSection from '@/app/sections/SettingsSection'

export type Role = 'admin' | 'owner' | 'viewer'
export type ScreenKey = 'sources' | 'wiki' | 'review' | 'ask' | 'audit' | 'settings'

export interface Profile {
  id: string
  owner_user_id: string
  email: string
  role: Role
  default_cadence: string
  notify_on_drift: boolean
  notify_digest: boolean
}

const SCREENS: { key: ScreenKey; label: string; icon: any; group: 'Workspace' | 'Governance' }[] = [
  { key: 'sources', label: 'Sources', icon: Database, group: 'Workspace' },
  { key: 'wiki', label: 'Wiki', icon: BookOpen, group: 'Workspace' },
  { key: 'review', label: 'Review Queue', icon: ListChecks, group: 'Workspace' },
  { key: 'ask', label: 'Ask', icon: MessageCircleQuestion, group: 'Workspace' },
  { key: 'audit', label: 'Audit Log', icon: ScrollText, group: 'Governance' },
  { key: 'settings', label: 'Settings', icon: SettingsIcon, group: 'Governance' },
]

function AuthScreen() {
  const [isLogin, setIsLogin] = useState(false)
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <h1 className="font-sans text-xl font-bold tracking-tight">Truewiki</h1>
          <p className="text-sm text-muted-foreground">Your wiki, verified against what actually happened.</p>
        </div>
        {isLogin
          ? <LoginForm onSwitchToRegister={() => setIsLogin(false)} />
          : <RegisterForm onSwitchToLogin={() => setIsLogin(true)} />}
      </div>
    </div>
  )
}

function Sidebar({ active, onNavigate, role, pendingCount }: { active: ScreenKey; onNavigate: (k: ScreenKey) => void; role: Role; pendingCount: number }) {
  const visible = SCREENS.filter((s) => {
    if (s.key === 'audit' && role === 'viewer') return false
    if (s.key === 'review' && role === 'viewer') return false
    return true
  })
  return (
    <aside className="hidden md:flex md:w-56 md:flex-col border-r border-border bg-muted/30 px-3 py-4 min-h-screen shrink-0">
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-2 mb-5">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground text-[11px] font-bold">N</div>
        <span className="text-sm font-semibold truncate">Northwind</span>
      </div>
      <div className="space-y-5 flex-1">
        {(['Workspace', 'Governance'] as const).map((group) => (
          <div key={group}>
            <div className="px-2 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{group}</div>
            <nav className="space-y-0.5">
              {visible.filter((s) => s.group === group).map((s) => {
                const Icon = s.icon
                const isActive = active === s.key
                return (
                  <button
                    key={s.key}
                    onClick={() => onNavigate(s.key)}
                    className={`w-full flex items-center justify-between gap-2 rounded-md px-2.5 py-2 text-sm font-medium transition-colors min-h-10 ${
                      isActive ? 'bg-card border border-border text-foreground shadow-sm' : 'text-muted-foreground hover:bg-card/60 hover:text-foreground'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <Icon className="h-4 w-4 shrink-0" />
                      {s.label}
                    </span>
                    {s.key === 'review' && pendingCount > 0 && (
                      <Badge className="h-5 min-w-5 justify-center px-1.5 tabular-nums">{pendingCount}</Badge>
                    )}
                  </button>
                )
              })}
            </nav>
          </div>
        ))}
      </div>
      <div className="pt-3 border-t border-border">
        <UserMenu />
      </div>
    </aside>
  )
}

function TopBar({ active, role, pendingCount }: { active: ScreenKey; role: Role; pendingCount: number }) {
  const meta = SCREENS.find((s) => s.key === active)
  return (
    <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-background/85 backdrop-blur px-4 md:px-6 py-3">
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground font-mono uppercase tracking-wide truncate">Truewiki / {meta?.label ?? ''}</div>
      </div>
      <div className="flex items-center gap-3 flex-1 max-w-md">
        <div className="relative w-full hidden sm:block">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Search pages, proposals…" className="pl-8 h-9 text-sm" />
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <Badge variant="outline" className="text-[11px] font-mono capitalize">{role}</Badge>
        {pendingCount > 0 && (
          <Badge className="tabular-nums">{pendingCount} pending</Badge>
        )}
      </div>
    </div>
  )
}

function Dashboard() {
  const { authFetch, user } = useAuth()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loadingProfile, setLoadingProfile] = useState(true)
  const [active, setActive] = useState<ScreenKey>('sources')
  const [pendingCount, setPendingCount] = useState(0)
  const [sampleMode, setSampleMode] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  const bump = useCallback(() => setRefreshKey((k) => k + 1), [])

  useEffect(() => {
    let cancelled = false
    async function bootstrap() {
      try {
        await authFetch('/api/seed', { method: 'POST' })
        const res = await authFetch('/api/profile')
        const data = await res.json()
        if (!cancelled) {
          if (data.success) {
            setProfile(data.data)
            if (data.data.role !== 'viewer') setActive('sources')
            else setActive('ask')
          } else {
            toast.error(data.error ?? 'Failed to load profile')
          }
        }
      } catch (err: any) {
        if (!cancelled) toast.error(err.message ?? 'Network error loading profile')
      } finally {
        if (!cancelled) setLoadingProfile(false)
      }
    }
    bootstrap()
    return () => { cancelled = true }
  }, [authFetch])

  useEffect(() => {
    if (!profile || profile.role === 'viewer') return
    let cancelled = false
    authFetch('/api/proposals')
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d.success && Array.isArray(d.data)) {
          setPendingCount(d.data.filter((p: any) => p?.state === 'pending_review').length)
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [authFetch, profile, refreshKey])

  if (loadingProfile || !profile) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const role = profile.role

  return (
    <div className="flex min-h-screen w-full bg-background">
      <Sidebar active={active} onNavigate={setActive} role={role} pendingCount={pendingCount} />
      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar active={active} role={role} pendingCount={pendingCount} />
        <main className="flex-1 min-w-0 px-4 md:px-6 py-5">
          {active === 'sources' && (
            <SourcesSection authFetch={authFetch} role={role} sampleMode={sampleMode} onSampleModeChange={setSampleMode} onChanged={bump} />
          )}
          {active === 'wiki' && (
            <WikiSection authFetch={authFetch} role={role} userId={profile.owner_user_id} sampleMode={sampleMode} onSampleModeChange={setSampleMode} onChanged={bump} />
          )}
          {active === 'review' && role !== 'viewer' && (
            <ReviewQueueSection authFetch={authFetch} role={role} userId={profile.owner_user_id} sampleMode={sampleMode} onSampleModeChange={setSampleMode} onChanged={bump} refreshKey={refreshKey} />
          )}
          {active === 'ask' && (
            <AskSection authFetch={authFetch} sampleMode={sampleMode} onSampleModeChange={setSampleMode} />
          )}
          {active === 'audit' && role !== 'viewer' && (
            <AuditLogSection authFetch={authFetch} sampleMode={sampleMode} onSampleModeChange={setSampleMode} refreshKey={refreshKey} />
          )}
          {active === 'settings' && (
            <SettingsSection authFetch={authFetch} role={role} profile={profile} onProfileUpdated={setProfile} />
          )}
        </main>
      </div>
    </div>
  )
}

export default function Page() {
  return (
    <AuthProvider>
      <Toaster richColors position="top-right" />
      <ProtectedRoute unauthenticatedFallback={<AuthScreen />}>
        <Dashboard />
      </ProtectedRoute>
    </AuthProvider>
  )
}
