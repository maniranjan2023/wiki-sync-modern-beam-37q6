import { NextResponse } from 'next/server'

// Server-side only — ARCHITECT_BACKEND_URL and ARCHITECT_TENANT_ID are never
// exposed in the client JS bundle. Returns { enabled: false } when not set
// (sandbox preview, SaaS tenants) so SSOGuard is a no-op.
export async function GET() {
  // Disable SSO entirely when running inside an E2B sandbox (builder preview).
  // The iframe check in SSOGuard.tsx handles the client-side case, but old
  // sandbox images may not have that check — this server-side guard covers all.
  if (process.env.SANDBOX_MODE === 'true') {
    return NextResponse.json({ enabled: false })
  }

  const backendUrl = process.env.ARCHITECT_BACKEND_URL
  // ARCHITECT_TENANT_ID is the canonical var; TENANT_ID is injected by both
  // sandbox init and Netlify deploy paths in the Architect backend.
  const tenantId = process.env.ARCHITECT_TENANT_ID || process.env.TENANT_ID

  if (!backendUrl) {
    return NextResponse.json({ enabled: false })
  }

  try {
    const res = await fetch(`${backendUrl}/api/v1/tenant/sso-config`, {
      headers: tenantId ? { 'X-Tenant': tenantId } : {},
      cache: 'no-store',
    })
    if (!res.ok) {
      return NextResponse.json({ enabled: false })
    }
    const config = await res.json()
    return NextResponse.json(config)
  } catch {
    return NextResponse.json({ enabled: false })
  }
}
