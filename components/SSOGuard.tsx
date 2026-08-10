"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"

interface SSOConfig {
  enabled: boolean
  keycloak_url?: string
  realm?: string
  client_id?: string
  idp_hint?: string
}

// Shown when the SSO user is authenticated but not permitted to open this app
function AccessDeniedScreen({ message }: { message: string }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ maxWidth: 380, textAlign: "center" }}>
        <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#fee2e2", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
          <span style={{ fontSize: 22 }}>🔒</span>
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 8px", color: "#111827" }}>Access restricted</h2>
        <p style={{ fontSize: 14, lineHeight: 1.5, color: "#6b7280", margin: 0 }}>{message}</p>
      </div>
    </div>
  )
}

export function SSOGuard({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [blocked, setBlocked] = useState<string | null>(null)
  const initialised = useRef(false)

  useEffect(() => {
    if (initialised.current) return
    initialised.current = true

    // Skip SSO when running inside an iframe (Architect sandbox preview).
    // The builder shouldn't be gated by Keycloak, and Keycloak's
    // frame-ancestors CSP blocks the silent-check-sso iframe anyway.
    // SSO is enforced on the standalone preview URL and deployed URL.
    if (window.self !== window.top) {
      setReady(true)
      return
    }

    fetch("/api/sso-config")
      .then<SSOConfig>((r) => r.json())
      .then(async (config) => {
        if (!config.enabled) {
          setReady(true)
          return
        }

        const { default: Keycloak } = await import("keycloak-js")
        const kc = new Keycloak({
          url: config.keycloak_url!,
          realm: config.realm!,
          clientId: config.client_id!,
        })

        try {
          // silentCheckSsoRedirectUri is intentionally omitted — Keycloak's
          // frame-ancestors 'self' CSP blocks the hidden iframe it creates,
          // causing every check-sso to fail and trigger an unwanted kc.login().
          // Without it, Keycloak JS falls back to a redirect round-trip which
          // is transparent when the user already has an active session.
          const authenticated = await kc.init({
            onLoad: "check-sso",
            checkLoginIframe: false,
          })

          if (!authenticated) {
            kc.login({
              idpHint: config.idp_hint || undefined,
              redirectUri: window.location.origin + "/",
            })
            return
          }

          // Per-app access check. The backend allows the owner and users 
          // the app is shared with; a restricted app blocks
          // everyone else. Open apps allow any authenticated tenant user. Fail
          // OPEN on network errors so a transient outage never locks users out.
          try {
            const res = await fetch("/api/access-check", {
              headers: kc.token ? { Authorization: `Bearer ${kc.token}` } : {},
            })
            const result = await res.json().catch(() => ({ allowed: true }))
            if (res.ok && result.allowed) {
              setReady(true)
            } else if (res.status >= 500) {
              setReady(true) // backend trouble → don't lock out
            } else {
              setBlocked(
                result.detail ||
                  "You have not been given permission to use this app. Ask the owner to share it with you.",
              )
            }
          } catch {
            setReady(true)
          }
        } catch {
          // If check-sso fails (network, config), redirect to login
          kc.login({
            idpHint: config.idp_hint || undefined,
            redirectUri: window.location.origin + "/",
          })
        }
      })
      .catch(() => {
        // If /api/sso-config is unreachable, let the app through
        setReady(true)
      })
  }, [])

  if (blocked) {
    return <AccessDeniedScreen message={blocked} />
  }

  if (!ready) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 32, height: 32, border: "3px solid #e5e7eb", borderTopColor: "#6b7280", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  return <>{children}</>
}
