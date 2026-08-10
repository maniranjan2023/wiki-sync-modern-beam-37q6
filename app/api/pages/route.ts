import { NextResponse } from "next/server";
import { authMiddleware, getDb } from "lyzr-architect-pg";
import { pages, page_sections, page_versions, audit_log } from "@/lib/db/schema";
import { getRole, isPageOwnerOrAdmin } from "@/lib/roles";
import { eq, asc } from "drizzle-orm";

function slugify(title: string) {
  return (
    title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || `page-${Date.now()}`
  );
}

export const GET = authMiddleware(async (req: any) => {
  try {
    const db = getDb();
    const rows = await db.select().from(pages).orderBy(asc(pages.title));
    return NextResponse.json({ success: true, data: rows });
  } catch (err: any) {
    console.error("[API] GET /api/pages error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 400 });
  }
});

// Create a page from the Wiki Import & Section Mapper result. Admin can
// import for anyone; owner can only import pages they will own themselves.
export const POST = authMiddleware(async (req: any) => {
  try {
    const role = await getRole(req.userId, req.userEmail ?? "");
    if (role === "viewer") return NextResponse.json({ success: false, error: "Viewers cannot import pages" }, { status: 403 });
    const body = await req.json();
    if (!body.title || !Array.isArray(body.sections)) {
      return NextResponse.json({ success: false, error: "title and sections[] are required" }, { status: 400 });
    }
    let ownerUserIdForPage: string | null = body.owner_user_id ?? null;
    if (role === "owner") {
      ownerUserIdForPage = req.userId; // owners may only import pages they own
    }
    const db = getDb();
    const bodyMd = body.sections.map((s: any) => `## ${s.heading ?? ""}\n\n${s.body_md ?? ""}`).join("\n\n");
    const [page] = await db
      .insert(pages)
      .values({
        title: body.title,
        slug: slugify(body.title),
        body_md: bodyMd,
        status: "verified",
        owner_user_id: ownerUserIdForPage,
        cadence: body.cadence ?? "weekly",
        last_verified_at: new Date(),
        open_finding_count: 0,
        self_maintained: true,
      } as any)
      .returning();

    const sectionRows = [];
    for (let i = 0; i < body.sections.length; i++) {
      const s = body.sections[i];
      const [row] = await db
        .insert(page_sections)
        .values({
          page_id: page.id,
          heading: s.heading ?? `Section ${i + 1}`,
          body_md: s.body_md ?? "",
          source_scope_ids: Array.isArray(s.suggested_scopes) ? s.suggested_scopes : [],
          position: Number.isFinite(s.position) ? s.position : i,
        } as any)
        .returning();
      sectionRows.push(row);
    }
    await db.insert(page_versions).values({
      page_id: page.id,
      body_md: bodyMd,
      version_no: 1,
      created_by: req.userId,
    } as any);
    await db.insert(audit_log).values({
      actor_user_id: req.userId,
      entity_type: "page",
      entity_id: page.id,
      action: "imported",
      detail: { title: page.title, sections: sectionRows.length },
    } as any);
    return NextResponse.json({ success: true, data: { page, sections: sectionRows } }, { status: 201 });
  } catch (err: any) {
    console.error("[API] POST /api/pages error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 400 });
  }
});

// Update page: title/cadence/owner reassignment (admin, or owner-of-page for
// non-ownership fields), or direct body edit (admin/owner-of-page only).
export const PUT = authMiddleware(async (req: any) => {
  try {
    const role = await getRole(req.userId, req.userEmail ?? "");
    const body = await req.json();
    if (!body.id) return NextResponse.json({ success: false, error: "id is required" }, { status: 400 });
    const db = getDb();
    const existingRows = await db.select().from(pages).where(eq(pages.id, body.id));
    const existing = existingRows[0];
    if (!existing) return NextResponse.json({ success: false, error: "Page not found" }, { status: 404 });

    const allowed = await isPageOwnerOrAdmin(req.userId, role, existing);
    if (!allowed) return NextResponse.json({ success: false, error: "Not authorized to edit this page" }, { status: 403 });

    if (body.owner_user_id !== undefined && role !== "admin") {
      return NextResponse.json({ success: false, error: "Only admins can reassign a page owner" }, { status: 403 });
    }

    const updates: Record<string, any> = {};
    if (typeof body.title === "string") updates.title = body.title;
    if (typeof body.cadence === "string") updates.cadence = body.cadence;
    if (body.owner_user_id !== undefined) updates.owner_user_id = body.owner_user_id || null;
    let bumpVersion = false;
    if (typeof body.body_md === "string" && body.body_md !== existing.body_md) {
      updates.body_md = body.body_md;
      bumpVersion = true;
    }

    const [row] = await db.update(pages).set(updates).where(eq(pages.id, body.id)).returning();

    if (bumpVersion) {
      const versions = await db.select().from(page_versions).where(eq(page_versions.page_id, body.id));
      const nextVersionNo = versions.reduce((m, v) => Math.max(m, v.version_no), 0) + 1;
      await db.insert(page_versions).values({
        page_id: body.id,
        body_md: body.body_md,
        version_no: nextVersionNo,
        created_by: req.userId,
      } as any);
    }

    await db.insert(audit_log).values({
      actor_user_id: req.userId,
      entity_type: "page",
      entity_id: body.id,
      action: bumpVersion ? "edited" : "updated",
      detail: updates,
    } as any);

    return NextResponse.json({ success: true, data: row });
  } catch (err: any) {
    console.error("[API] PUT /api/pages error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 400 });
  }
});
