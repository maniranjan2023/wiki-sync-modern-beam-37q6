'use client'

/**
 * Pushes a wiki page's current content into the Verified Wiki KB so the
 * Verified Answer Agent (Ask panel) can actually retrieve it.
 *
 * CRITICAL: the agent's own contract (see its instructions) expects each
 * retrieved chunk to carry {page_title, heading, body_md, status,
 * last_verified_at, url} and explicitly filters out anything whose status
 * is not "verified". A KB document that is just prose with no literal
 * status/date/url field gives the agent nothing to check against that
 * instruction — so it correctly (per its own rules) treats the content as
 * unverifiable and refuses to answer, even when the fact is right there.
 * This is why "it's in the wiki" queries kept failing after content sync
 * alone: the document existed in the KB but had no status marker for the
 * agent to key off. Every synced document below is written with that
 * metadata as literal, labeled lines immediately before the content.
 *
 * Best-effort: never throws, never blocks the caller's save/import/approve
 * flow. The page's row in Postgres is the source of truth regardless of
 * whether indexing into the KB succeeds.
 */
export const VERIFIED_WIKI_RAG_ID = '6a7a229c9f728ecff562a0ea'

export async function syncPageToWikiKB(
  title: string,
  bodyMd: string,
  slug: string,
  status: string = 'verified',
  lastVerifiedAt?: string | null
): Promise<boolean> {
  try {
    const verifiedDate = lastVerifiedAt ? new Date(lastVerifiedAt).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)
    const content = `Page: ${title}\nStatus: ${status}\nLast verified: ${verifiedDate}\nURL: /wiki/${slug || 'page'}\n\n${bodyMd}`
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
