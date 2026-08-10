'use client'

import ErrorBoundary from '@/components/ErrorBoundary'
import { AgentInterceptorProvider } from '@/components/AgentInterceptorProvider'

export default function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <AgentInterceptorProvider>
        {children}
      </AgentInterceptorProvider>
    </ErrorBoundary>
  )
}
