import { NextResponse } from "next/server";
import { authMiddleware, getDb } from "lyzr-architect-pg";
import { proposals, findings, pages, page_sections, page_versions, audit_log } from "@/lib/db/schema";
import { getRole, isPageOwnerOrAdmin } from "@/lib/roles";
import { eq, and, desc } from "drizzle-orm";

export const GET = authMiddleware(async (req: any) => {
  try {
    const role = await getRole(req.userId, req.userEmail ?? "");
    const db = getDb();
    let rows = await db.select().from(proposals).orderBy(desc(proposals.created_at));
    if (role === "owner") {
      const myPages = await db.select().from(pages);
      const ownedIds = new Set(myPages.filter((p) => p.owner_user_id === req.userId || !p.owner_user_id).map((p) => p.id));
      rows = rows.filter((p) => ownedIds.has(p.page_id));
    } else if (role === "viewer") {
      return NextResponse.json({ success: false, error: "Viewers cannot access the review queue" }, { status: 403 });
    }
    return NextResponse.json({ success: true, data: rows });
  } catch (err: any) {
    console.error("[API] GET /api/proposals error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 400 });
  }
});

// Deterministic apply — NO agent/LLM call happens on approve/edit&approve/reject.
async function applyProposal(db: any, proposal: any, finalMd: string, actorId: string) {
  const [section] = await db.select().from(page_sections).where(eq(page_sections.id, proposal.section_id));
  if (!section) throw new Error("Section not found");
  await db.update(page_sections).set({ body_md: finalMd }).where(eq(page_sections.id, section.id));

  const [page] = await db.select().from(pages).where(eq(pages.id, proposal.page_id));
  if (!page) throw new Error("Page not found");

  // Rebuild full page body from all sections (verbatim concat, deterministic).
  const allSections = await db.select().from(page_sections).where(eq(page_sections.page_id, page.id));
  const bodyMd = allSections
    .sort((a: any, b: any) => a.position - b.position)
    .map((s: any) => `## ${s.heading}\n\n${s.id === section.id ? finalMd : s.body_md}`)
    .join("\n\n");

  const versions = await db.select().from(page_versions).where(eq(page_versions.page_id, page.id));
  const nextVersionNo = versions.reduce((m: number, v: any) => Math.max(m, v.version_no), 0) + 1;
  const [version] = await db
    .insert(page_versions)
    .values({ page_id: page.id, body_md: bodyMd, version_no: nextVersionNo, created_by: actorId })
    .returning();

  await db.update(findings).set({ state: "approved" }).where(eq(findings.id, proposal.finding_id));

  const [updatedProposal] = await db
    .update(proposals)
    .set({ state: "applied", resolved_at: new Date(), applied_version_id: version.id })
    .where(eq(proposals.id, proposal.id))
    .returning();

  const remainingOpen = await db
    .select()
    .from(findings)
    .innerJoin(page_sections, eq(findings.section_id, page_sections.id))
    .where(and(eq(page_sections.page_id, page.id), eq(findings.state, "pending_review")));
  const openCount = remainingOpen.length;

  await db
    .update(pages)
    .set({
      body_md: bodyMd,
      open_finding_count: openCount,
      status: openCount === 0 ? "verified" : "drift_detected",
      last_verified_at: openCount === 0 ? new Date() : page.last_verified_at,
    })
    .where(eq(pages.id, page.id));

  await db.insert(audit_log).values({
    actor_user_id: actorId,
    entity_type: "proposal",
    entity_id: proposal.id,
    action: "approved",
    detail: { page_id: page.id, section_id: section.id, version_no: nextVersionNo },
  });

  return updatedProposal;
}

export const POST = authMiddleware(async (req: any) => {
  try {
    const role = await getRole(req.userId, req.userEmail ?? "");
    if (role === "viewer") return NextResponse.json({ success: false, error: "Viewers cannot review proposals" }, { status: 403 });
    const body = await req.json();
    const action = String(body.action ?? "");
    const ids: string[] = Array.isArray(body.ids) ? body.ids : body.id ? [body.id] : [];
    if (ids.length === 0) return NextResponse.json({ success: false, error: "id or ids[] is required" }, { status: 400 });
    if (!["approve", "edit_approve", "reject"].includes(action)) {
      return NextResponse.json({ success: false, error: "Unknown action" }, { status: 400 });
    }

    const db = getDb();
    const results: any[] = [];
    for (const id of ids) {
      const [proposal] = await db.select().from(proposals).where(eq(proposals.id, id));
      if (!proposal) continue;
      if (proposal.state !== "pending_review") continue;

      const [page] = await db.select().from(pages).where(eq(pages.id, proposal.page_id));
      if (!page) continue;
      const allowed = await isPageOwnerOrAdmin(req.userId, role, page);
      if (!allowed) continue;

      if (action === "reject") {
        const [updated] = await db
          .update(proposals)
          .set({ state: "rejected", resolved_at: new Date() })
          .where(eq(proposals.id, id))
          .returning();
        await db.update(findings).set({ state: "rejected" }).where(eq(findings.id, proposal.finding_id));
        await db.insert(audit_log).values({
          actor_user_id: req.userId,
          entity_type: "proposal",
          entity_id: id,
          action: "rejected",
          detail: { page_id: page.id },
        });
        results.push(updated);
        continue;
      }

      const finalMd = action === "edit_approve" ? String(body.edited_md ?? proposal.proposed_md) : proposal.proposed_md;
      const updated = await applyProposal(db, proposal, finalMd, req.userId);
      results.push(updated);
    }

    return NextResponse.json({ success: true, data: results });
  } catch (err: any) {
    console.error("[API] POST /api/proposals error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 400 });
  }
});
