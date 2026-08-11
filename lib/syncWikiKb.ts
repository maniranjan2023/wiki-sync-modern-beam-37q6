'use client'

/**
 * Pushes a wiki page's current content into the Verified Wiki KB so the
 * Verified Answer Agent (Ask panel) can actually retrieve it. Nothing else
 * in the app calls the RAG train endpoint — without this, a page can exist
 * and even be "verified" in Postgres while Ask still says it isn't
 * documented, because the KB itself was never populated.
 *
 * Best-effort: never throws, never blocks the caller's save/import/approve
 * flow. The page's row in Postgres is the source of truth regardless of
 * whether indexing into the KB succeeds.
 */
export const VERIFIED_WIKI_RAG_ID = '6a7a229c9f728ecff562a0ea'

export async function syncPageToWikiKB(title: string, bodyMd: string, slug: string): Promise<boolean> {
  try {
    const content = `# ${title}\n\n${bodyMd}`
    const blob = new Blob([content], { type: 'text/plain' })
    const formData = new FormData()
    formData.append('ragId', VERIFIED_WIKI_RAG_ID)
    formData.append('file', blob, `${(slug || 'page').replace(/[^a-z0-9-]+/gi, '-') || 'page'}.txt`)
    const res = await fetch('/api/rag', { method: 'POST', body: formData })
    const data = await res.json()
    return !!data.success
  } catch {
    return false
  }
}
