'use client'

import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'

type Mode = 'light' | 'dark'

// The storage key and the `.dark` class on <html> are the contract set by the
// pre-paint resolver in app/layout.tsx. This component is the only writer of
// the stored choice; the resolver is the only reader at boot. Keep them in step.
const STORAGE_KEY = 'theme'

function applyMode(mode: Mode) {
  const root = document.documentElement
  root.classList.toggle('dark', mode === 'dark')
  // Native furniture -- scrollbars, form controls, the canvas behind <body> --
  // follows this, not the class. Setting only the class leaves light scrollbars
  // over a dark palette.
  root.style.colorScheme = mode
}

/**
 * ThemeToggle is the single light/dark switch mounted globally by
 * app/layout.tsx. It stays visible at the top-right on every generated page;
 * page-level UI leaves that fixed corner clear.
 */
export function ThemeToggle() {
  // null until mounted: the server cannot know the visitor's stored choice, so
  // rendering either icon during SSR would mismatch on hydration.
  const [mode, setMode] = useState<Mode | null>(null)

  useEffect(() => {
    const root = document.documentElement
    // Read the class the pre-paint script already resolved rather than
    // re-deriving it, so the button can never disagree with the page.
    setMode(root.classList.contains('dark') ? 'dark' : 'light')
  }, [])

  // No OS listener on purpose. The initial face is the theme's canonical one
  // (see the precedence note in app/layout.tsx), so following
  // `prefers-color-scheme` here would undo that the moment the visitor's system
  // flipped — swapping the app to a face the design was never reviewed in, in
  // the middle of a session. This button is the visitor's channel, and what it
  // writes persists.

  if (mode === null) return null

  const next: Mode = mode === 'dark' ? 'light' : 'dark'

  return (
    <button
      type="button"
      onClick={() => {
        applyMode(next)
        try {
          localStorage.setItem(STORAGE_KEY, next)
        } catch {
          // Storage can be unavailable; the mode still applies for this page.
        }
        setMode(next)
      }}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      className="fixed right-4 top-4 z-50 grid h-9 w-9 place-items-center rounded-full border border-border bg-background/80 text-foreground shadow-sm backdrop-blur transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background print:hidden"
    >
      {mode === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  )
}

export default ThemeToggle
