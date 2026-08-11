import { NextResponse } from "next/server";
import { authMiddleware, getDb } from "lyzr-architect-pg";
import {
  sources,
  source_cursors,
  source_events,
  pages,
  page_sections,
  page_versions,
  findings,
  proposals,
  audit_log,
} from "@/lib/db/schema";
import { getRole } from "@/lib/roles";

// Fresh-start reset: wipes every workspace data table (sources, wiki pages,
// findings, proposals, audit log, ...) but NEVER touches users or
// user_profiles — accounts, roles and preferences survive. Admin only.
export const POST = authMiddleware(async (req: any) => {
  try {
    const role = await getRole(req.userId, req.userEmail ?? "");
    if (role !== "admin") {
      return NextResponse.json({ success: false, error: "Only admins can reset the workspace" }, { status: 403 });
    }
    const db = getDb();

    // Children first, then parents — safe even without enforced FKs.
    await db.delete(proposals);
    await db.delete(findings);
    await db.delete(page_versions);
    await db.delete(page_sections);
    await db.delete(pages);
    await db.delete(source_events);
    await db.delete(source_cursors);
    await db.delete(sources);
    await db.delete(audit_log);

    // Log the reset itself as a fresh first audit entry.
    await db.insert(audit_log).values({
      actor_user_id: req.userId,
      entity_type: "workspace",
      entity_id: "workspace",
      action: "reset",
      detail: { note: "All sources, wiki pages, findings, proposals and audit history cleared. Users and profiles preserved." },
    } as any);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[API] POST /api/reset error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 400 });
  }
});
