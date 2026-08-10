import { NextRequest, NextResponse } from 'next/server'

// GET /api/access-check
//
// Server-side only. Asks the Architect backend whether the SSO-authenticated
// caller may open THIS deployed app (PAA-58). Only the app owner and users the
// app was shared with are allowed in.
//
// Returns { allowed }. Fails OPEN (allowed:true) in sandbox/preview mode or when
// the app isn't wired for SSO, so the builder preview and non-Keycloak tenants
// are never gated.
export async function GET(request: NextRequest) {
  if (process.env.SANDBOX_MODE === 'true') {
    return NextResponse.json({ allowed: true })
  }

  const backendUrl = process.env.ARCHITECT_BACKEND_URL
  const appId = process.env.APP_ID
  const tenantId = process.env.ARCHITECT_TENANT_ID || process.env.TENANT_ID

  // Can't identify the app or backend → nothing to check, let the app through.
  if (!backendUrl || !appId) {
    return NextResponse.json({ allowed: true })
  }

  const authorization = request.headers.get('authorization')
  if (!authorization) {
    return NextResponse.json({ error: 'Authorization required' }, { status: 401 })
  }

  try {
    const res = await fetch(`${backendUrl}/api/v1/apps/${appId}/access-check`, {
      headers: {
        Authorization: authorization,
        ...(tenantId ? { 'X-Tenant': tenantId } : {}),
      },
      cache: 'no-store',
    })

    if (res.ok) {
      return NextResponse.json(await res.json())
    }

    // 403 = tenant-invite gate rejected the user. Surface the backend's message.
    if (res.status === 403) {
      let detail = 'You have not been given permission to use this app.'
      try {
        const body = await res.json()
        if (body?.detail) detail = body.detail
      } catch { /* ignore parse errors */ }
      return NextResponse.json({ allowed: false, detail }, { status: 403 })
    }

    // 5xx / other → fail open so a transient backend issue doesn't lock users out.
    return NextResponse.json({ allowed: true })
  } catch {
    return NextResponse.json({ allowed: true })
  }
}
