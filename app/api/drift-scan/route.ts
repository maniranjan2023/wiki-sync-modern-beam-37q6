import { NextResponse } from "next/server";
import { authMiddleware, getDb } from "lyzr-architect-pg";
import { page_sections, pages, findings, proposals, source_cursors, sources, audit_log } from "@/lib/db/schema";
import { getRole } from "@/lib/roles";
import { eq, and } from "drizzle-orm";

/**
 * Persists the (already agent-parsed, client-side) Drift Scan Coordinator
 * output deterministically: dedups by finding_key, supersedes any prior open
 * proposal for the same section, writes findings + proposals with
 * state=pending_review, advances source_cursors, recomputes page state, and
 * writes audit_log rows. No LLM call happens here — pure DB transaction.
 */
function makeFindingKey(sectionId: string, claim: string, evidenceUrls: string[]) {
  const norm = claim.toLowerCase().trim().slice(0, 120);
  const ev = evidenceUrls.slice().sort().join("|");
  return `${sectionId}::${norm}::${ev}`.slice(0, 500);
}

export const POST = authMiddleware(async (req: any) => {
  try {
    const role = await getRole(req.userId, req.userEmail ?? "");
    if (role === "viewer") return NextResponse.json({ success: false, error: "Viewers cannot run a drift scan" }, { status: 403 });

    const body = await req.json();
    const scanId: string = body.scan_id ?? `scan_${Date.now()}`;
    const rawProposals: any[] = Array.isArray(body.proposals) ? body.proposals : [];
    const rawConflicts: any[] = Array.isArray(body.conflicts) ? body.conflicts : [];
    console.log(`[drift-scan] input scan_id=${scanId} proposals=${rawProposals.length} conflicts=${rawConflicts.length}`);

    const db = getDb();
    let createdFindings = 0;
    let createdProposals = 0;
    let mergedFindings = 0;
    let supersededProposals = 0;
    const touchedPageIds = new Set<string>();

    for (const p of rawProposals) {
      const sectionId = String(p?.section_id ?? "");
      if (!sectionId) continue;
      const sectionRows = await db.select().from(page_sections).where(eq(page_sections.id, sectionId));
      const section = sectionRows[0];
      if (!section) continue;
      const pageRows = await db.select().from(pages).where(eq(pages.id, section.page_id));
      const page = pageRows[0];
      if (!page) continue;

      // Server-side role scoping: owners may only persist findings for pages they own (or unowned).
      if (role === "owner" && page.owner_user_id && page.owner_user_id !== req.userId) continue;

      const claim = String(p?.rationale ?? p?.citation?.snippet ?? "Drift detected");
      const citation = p?.citation ?? {};
      const evidenceUrls = [String(citation?.url ?? "")].filter(Boolean);
      const findingKey = makeFindingKey(sectionId, claim, evidenceUrls);

      const existingFinding = (await db.select().from(findings).where(eq(findings.finding_key, findingKey)))[0];

      if (existingFinding && ["detected", "pending_review"].includes(existingFinding.state)) {
        // Merge new evidence into the existing open finding rather than duplicating.
        const mergedEvidence = Array.isArray(existingFinding.evidence) ? [...existingFinding.evidence, citation] : [citation];
        await db.update(findings).set({ evidence: mergedEvidence }).where(eq(findings.id, existingFinding.id));
        mergedFindings++;
        touchedPageIds.add(page.id);
        continue;
      }

      // Supersede any other still-open proposal for this same section (one open proposal per section).
      const openForSection = await db
        .select()
        .from(proposals)
        .where(and(eq(proposals.section_id, sectionId), eq(proposals.state, "pending_review")));
      for (const op of openForSection) {
        await db.update(proposals).set({ state: "superseded", resolved_at: new Date() }).where(eq(proposals.id, op.id));
        await db.update(findings).set({ state: "superseded" }).where(eq(findings.id, op.finding_id));
        await db.insert(audit_log).values({
          actor_user_id: req.userId,
          entity_type: "proposal",
          entity_id: op.id,
          action: "superseded",
          detail: { reason: "newer finding for same section", scan_id: scanId },
        } as any);
        supersededProposals++;
      }

      const [finding] = await db
        .insert(findings)
        .values({
          finding_key: findingKey,
          section_id: sectionId,
          kind: p?.needs_human_input ? "contradiction" : "staleness",
          confidence: 0.75,
          claim,
          evidence: [citation],
          state: "pending_review",
        } as any)
        .returning();
      createdFindings++;

      const conflictForSection = rawConflicts.find((c: any) => c?.section_id === sectionId) ?? null;

      const [proposal] = await db
        .insert(proposals)
        .values({
          finding_id: finding.id,
          page_id: page.id,
          section_id: sectionId,
          current_md: String(p?.current_md ?? section.body_md ?? ""),
          proposed_md: String(p?.proposed_md ?? ""),
          rationale: claim.slice(0, 140),
          source_kind: String(citation?.source_kind ?? ""),
          source_url: String(citation?.url ?? ""),
          source_snippet: String(citation?.snippet ?? ""),
          conflict: conflictForSection,
          state: "pending_review",
          owner_user_id: page.owner_user_id,
        } as any)
        .returning();
      createdProposals++;
      touchedPageIds.add(page.id);

      await db.insert(audit_log).values({
        actor_user_id: req.userId,
        entity_type: "proposal",
        entity_id: proposal.id,
        action: "drafted",
        detail: { scan_id: scanId, section_id: sectionId, source_kind: citation?.source_kind },
      } as any);
    }

    // Advance cursors for every connected source touched by this scan.
    const connectedSources = await db.select().from(sources).where(eq(sources.status, "connected"));
    for (const src of connectedSources) {
      const existingCursor = (await db.select().from(source_cursors).where(and(eq(source_cursors.source_id, src.id), eq(source_cursors.scope_key, "default"))))[0];
      if (existingCursor) {
        await db.update(source_cursors).set({ last_run_at: new Date(), last_status: "success", cursor_ts: new Date() }).where(eq(source_cursors.id, existingCursor.id));
      } else {
        await db.insert(source_cursors).values({
          source_id: src.id,
          scope_key: "default",
          cursor_ts: new Date(),
          last_run_at: new Date(),
          last_status: "success",
        } as any);
      }
      await db.update(sources).set({ last_synced_at: new Date() }).where(eq(sources.id, src.id));
    }

    // Recompute open_finding_count + status for every touched page.
    for (const pageId of touchedPageIds) {
      const openFindings = await db
        .select()
        .from(findings)
        .innerJoin(page_sections, eq(findings.section_id, page_sections.id))
        .where(and(eq(page_sections.page_id, pageId), eq(findings.state, "pending_review")));
      const count = openFindings.length;
      await db.update(pages).set({ open_finding_count: count, status: count > 0 ? "drift_detected" : "verified" }).where(eq(pages.id, pageId));
    }

    await db.insert(audit_log).values({
      actor_user_id: req.userId,
      entity_type: "scan",
      entity_id: scanId,
      action: "drift_scan_completed",
      detail: { created_findings: createdFindings, created_proposals: createdProposals, merged_findings: mergedFindings, superseded_proposals: supersededProposals },
    } as any);

    console.log(
      `[drift-scan] output scan_id=${scanId} findings_created=${createdFindings} findings_merged=${mergedFindings} proposals_created=${createdProposals} proposals_superseded=${supersededProposals}`
    );

    return NextResponse.json({
      success: true,
      data: { scan_id: scanId, created_findings: createdFindings, created_proposals: createdProposals, merged_findings: mergedFindings, superseded_proposals: supersededProposals },
    });
  } catch (err: any) {
    console.error("[API] POST /api/drift-scan error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 400 });
  }
});
