import { NextResponse } from "next/server";
import { authMiddleware, getDb } from "lyzr-architect-pg";
import { sources, source_cursors, source_events, audit_log } from "@/lib/db/schema";
import { getRole } from "@/lib/roles";
import { eq, desc } from "drizzle-orm";

export const GET = authMiddleware(async (req: any) => {
  try {
    const db = getDb();
    const rows = await db.select().from(sources).orderBy(desc(sources.created_at));
    const cursors = await db.select().from(source_cursors);
    const eventCounts: Record<string, number> = {};
    for (const c of cursors) {
      // rough events-ingested count per source (dedup already enforced at insert time)
    }
    const events = await db.select().from(source_events);
    const bySource: Record<string, number> = {};
    for (const e of events) bySource[e.source_id] = (bySource[e.source_id] ?? 0) + 1;
    const data = rows.map((s) => ({
      ...s,
      cursors: cursors.filter((c) => c.source_id === s.id),
      events_ingested: bySource[s.id] ?? 0,
    }));
    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    console.error("[API] GET /api/sources error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 400 });
  }
});

export const POST = authMiddleware(async (req: any) => {
  try {
    const role = await getRole(req.userId, req.userEmail ?? "");
    if (role !== "admin") return NextResponse.json({ success: false, error: "Only admins can connect sources" }, { status: 403 });
    const body = await req.json();
    if (!body.kind || !body.display_name) {
      return NextResponse.json({ success: false, error: "kind and display_name are required" }, { status: 400 });
    }
    const db = getDb();
    const [row] = await db
      .insert(sources)
      .values({
        kind: body.kind,
        display_name: body.display_name,
        scopes: Array.isArray(body.scopes) ? body.scopes : [],
        authority_rank: Number.isFinite(body.authority_rank) ? body.authority_rank : 3,
        status: "connected",
        last_synced_at: new Date(),
      } as any)
      .returning();
    await db.insert(audit_log).values({
      actor_user_id: req.userId,
      entity_type: "source",
      entity_id: row.id,
      action: "connected",
      detail: { kind: body.kind, display_name: body.display_name },
    } as any);
    return NextResponse.json({ success: true, data: row }, { status: 201 });
  } catch (err: any) {
    console.error("[API] POST /api/sources error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 400 });
  }
});

export const PUT = authMiddleware(async (req: any) => {
  try {
    const role = await getRole(req.userId, req.userEmail ?? "");
    if (role !== "admin") return NextResponse.json({ success: false, error: "Only admins can modify sources" }, { status: 403 });
    const body = await req.json();
    if (!body.id) return NextResponse.json({ success: false, error: "id is required" }, { status: 400 });
    const db = getDb();
    const updates: Record<string, any> = {};
    if (Array.isArray(body.scopes)) updates.scopes = body.scopes;
    if (Number.isFinite(body.authority_rank)) updates.authority_rank = body.authority_rank;
    if (typeof body.status === "string") updates.status = body.status;
    if (typeof body.display_name === "string") updates.display_name = body.display_name;
    if (body.touch_synced) updates.last_synced_at = new Date();
    const [row] = await db.update(sources).set(updates).where(eq(sources.id, body.id)).returning();
    if (!row) return NextResponse.json({ success: false, error: "Source not found" }, { status: 404 });
    await db.insert(audit_log).values({
      actor_user_id: req.userId,
      entity_type: "source",
      entity_id: row.id,
      action: "updated",
      detail: updates,
    } as any);
    return NextResponse.json({ success: true, data: row });
  } catch (err: any) {
    console.error("[API] PUT /api/sources error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 400 });
  }
});

export const DELETE = authMiddleware(async (req: any) => {
  try {
    const role = await getRole(req.userId, req.userEmail ?? "");
    if (role !== "admin") return NextResponse.json({ success: false, error: "Only admins can disconnect sources" }, { status: 403 });
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ success: false, error: "id is required" }, { status: 400 });
    const db = getDb();
    await db.update(sources).set({ status: "disconnected" }).where(eq(sources.id, id));
    await db.insert(audit_log).values({
      actor_user_id: req.userId,
      entity_type: "source",
      entity_id: id,
      action: "disconnected",
      detail: {},
    } as any);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[API] DELETE /api/sources error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 400 });
  }
});
