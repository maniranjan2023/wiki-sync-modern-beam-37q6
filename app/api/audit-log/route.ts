import { NextResponse } from "next/server";
import { authMiddleware, getDb } from "lyzr-architect-pg";
import { audit_log, pages } from "@/lib/db/schema";
import { getRole } from "@/lib/roles";
import { desc } from "drizzle-orm";

export const GET = authMiddleware(async (req: any) => {
  try {
    const role = await getRole(req.userId, req.userEmail ?? "");
    if (role === "viewer") return NextResponse.json({ success: false, error: "Viewers cannot access the audit log" }, { status: 403 });
    const db = getDb();
    let rows = await db.select().from(audit_log).orderBy(desc(audit_log.created_at));
    if (role === "owner") {
      const myPages = await db.select().from(pages);
      const ownedPageIds = new Set(myPages.filter((p) => p.owner_user_id === req.userId || !p.owner_user_id).map((p) => p.id));
      rows = rows.filter((r) => (r.entity_type === "page" || r.entity_type === "proposal" ? true : false) && (ownedPageIds.has(r.entity_id) || r.actor_user_id === req.userId));
      // Include page-scoped rows where entity_id matches an owned page, plus this user's own actions.
      rows = rows.filter((r) => r.actor_user_id === req.userId || ownedPageIds.has(r.entity_id));
    }
    return NextResponse.json({ success: true, data: rows });
  } catch (err: any) {
    console.error("[API] GET /api/audit-log error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 400 });
  }
});
