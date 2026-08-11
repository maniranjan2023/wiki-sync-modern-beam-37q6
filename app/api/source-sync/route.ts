import { NextResponse } from "next/server";
import { authMiddleware, getDb } from "lyzr-architect-pg";
import { sources, source_cursors, source_events, audit_log } from "@/lib/db/schema";
import { getRole } from "@/lib/roles";
import { eq, and, inArray } from "drizzle-orm";

/**
 * Persists normalized facts returned by a Signal Agent into source_events.
 * This is the missing link in the ingestion pipeline: Signal Agents fetch
 * real data via their tools on every scan, but nothing previously wrote
 * those facts anywhere, so events_ingested always read 0. This route makes
 * ingestion durable, idempotent (dedup by composite event_uid), and
 * observable (audit_log + server logs), independent of whether the LLM
 * orchestration that called it succeeded end-to-end.
 */

async function upsertCursor(db: any, sourceId: string, scopeKey: string, status: string) {
  const existing = (
    await db
      .select()
      .from(source_cursors)
      .where(and(eq(source_cursors.source_id, sourceId), eq(source_cursors.scope_key, scopeKey)))
  )[0];
  if (existing) {
    await db
      .update(source_cursors)
      .set({ last_run_at: new Date(), last_status: status, cursor_ts: new Date() })
      .where(eq(source_cursors.id, existing.id));
  } else {
    await db.insert(source_cursors).values({
      source_id: sourceId,
      scope_key: scopeKey,
      cursor_ts: new Date(),
      last_run_at: new Date(),
      last_status: status,
    } as any);
  }
}

export const POST = authMiddleware(async (req: any) => {
  try {
    const role = await getRole(req.userId, req.userEmail ?? "");
    if (role === "viewer") {
      return NextResponse.json({ success: false, error: "Viewers cannot sync sources" }, { status: 403 });
    }
    const body = await req.json();
    const sourceId = String(body.source_id ?? "");
    if (!sourceId) return NextResponse.json({ success: false, error: "source_id is required" }, { status: 400 });

    const db = getDb();
    const srcRows = await db.select().from(sources).where(eq(sources.id, sourceId));
    const src = srcRows[0];
    if (!src) return NextResponse.json({ success: false, error: "Source not found" }, { status: 404 });

    console.log(`[source-sync] sync_started source_kind=${src.kind} source_id=${sourceId}`);
    console.log(`[source-sync] provider_selected provider=${src.kind}`);
    console.log(`[source-sync] scope_selected source_kind=${src.kind} scopes=${JSON.stringify(src.scopes)}`);

    if (body.sync_status === "error") {
      const errMsg = String(body.error_message ?? "Unknown sync error").slice(0, 300);
      console.error(`[source-sync] sync_failed source_kind=${src.kind} source_id=${sourceId} error=${errMsg}`);
      await upsertCursor(db, sourceId, "default", `error: ${errMsg}`);
      await db.insert(audit_log).values({
        actor_user_id: req.userId,
        entity_type: "source",
        entity_id: sourceId,
        action: "sync_failed",
        detail: { kind: src.kind, error: errMsg },
      } as any);
      return NextResponse.json({ success: true, data: { persisted: 0, skipped: 0, status: "error" } });
    }

    const rawFacts: any[] = Array.isArray(body.facts) ? body.facts : [];
    console.log(`[source-sync] provider_request_started source_kind=${src.kind}`);
    console.log(`[source-sync] provider_response_status source_kind=${src.kind} result_count=${rawFacts.length}`);

    const normalized = rawFacts
      .filter((f) => f && f.event_id && f.text)
      .map((f) => {
        let ts: Date | null = null;
        if (f.timestamp) {
          const d = new Date(f.timestamp);
          if (!Number.isNaN(d.getTime())) ts = d;
        }
        return {
          event_uid: `${src.kind}:${sourceId}:${String(f.event_id)}`.slice(0, 500),
          source_id: sourceId,
          scope_key: String(f.scope ?? "").slice(0, 200) || "default",
          author: String(f.author ?? "").slice(0, 200),
          event_ts: ts,
          text: String(f.text).slice(0, 4000),
          url: String(f.url ?? "").slice(0, 500),
        };
      });
    console.log(`[source-sync] normalized source_kind=${src.kind} count=${normalized.length}`);

    let persisted = 0;
    if (normalized.length > 0) {
      const uids = normalized.map((n) => n.event_uid);
      const existing = await db
        .select({ event_uid: source_events.event_uid })
        .from(source_events)
        .where(inArray(source_events.event_uid, uids));
      const existingSet = new Set(existing.map((e: any) => e.event_uid));
      const toInsert = normalized.filter((n) => !existingSet.has(n.event_uid));
      if (toInsert.length > 0) {
        await db.insert(source_events).values(toInsert as any);
        persisted = toInsert.length;
      }
    }
    console.log(
      `[source-sync] sync_completed source_kind=${src.kind} new=${persisted} duplicates=${normalized.length - persisted}`
    );

    await db.update(sources).set({ last_synced_at: new Date() }).where(eq(sources.id, sourceId));
    await upsertCursor(db, sourceId, "default", "success");

    await db.insert(audit_log).values({
      actor_user_id: req.userId,
      entity_type: "source",
      entity_id: sourceId,
      action: "synced",
      detail: { kind: src.kind, fetched: rawFacts.length, persisted, duplicates: normalized.length - persisted },
    } as any);

    const totalRows = await db.select().from(source_events).where(eq(source_events.source_id, sourceId));
    return NextResponse.json({
      success: true,
      data: { persisted, skipped: normalized.length - persisted, total_events: totalRows.length },
    });
  } catch (err: any) {
    console.error("[API] POST /api/source-sync error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 400 });
  }
});
