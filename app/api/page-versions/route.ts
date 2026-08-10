import { NextResponse } from "next/server";
import { authMiddleware, getDb } from "lyzr-architect-pg";
import { page_versions } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

export const GET = authMiddleware(async (req: any) => {
  try {
    const { searchParams } = new URL(req.url);
    const pageId = searchParams.get("page_id");
    if (!pageId) return NextResponse.json({ success: false, error: "page_id is required" }, { status: 400 });
    const db = getDb();
    const rows = await db.select().from(page_versions).where(eq(page_versions.page_id, pageId)).orderBy(desc(page_versions.version_no));
    return NextResponse.json({ success: true, data: rows });
  } catch (err: any) {
    console.error("[API] GET /api/page-versions error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 400 });
  }
});
