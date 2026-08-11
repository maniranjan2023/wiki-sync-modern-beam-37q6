import { NextResponse } from "next/server";
import { authMiddleware, getDb } from "lyzr-architect-pg";
import { source_events } from "@/lib/db/schema";
import { eq, inArray, desc } from "drizzle-orm";

// Read back persisted, normalized source events for the drift-detection
// stage. Optionally scoped to one or more source_ids.
export const GET = authMiddleware(async (req: any) => {
  try {
    const { searchParams } = new URL(req.url);
    const sourceIdsParam = searchParams.get("source_ids");
    const db = getDb();
    let rows;
    if (sourceIdsParam) {
      const ids = sourceIdsParam.split(",").map((s) => s.trim()).filter(Boolean);
      rows = ids.length > 0
        ? await db.select().from(source_events).where(inArray(source_events.source_id, ids)).orderBy(desc(source_events.ingested_at))
        : [];
    } else {
      rows = await db.select().from(source_events).orderBy(desc(source_events.ingested_at));
    }
    return NextResponse.json({ success: true, data: rows });
  } catch (err: any) {
    console.error("[API] GET /api/source-events error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 400 });
  }
});
