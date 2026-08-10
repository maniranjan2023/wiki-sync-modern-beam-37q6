import { NextResponse } from "next/server";
import { authMiddleware, getDb } from "lyzr-architect-pg";
import { ensureProfile } from "@/lib/roles";

// Ensures a user_profiles row exists (first user becomes admin). No fake
// pages/sources are seeded — the PRD's onboarding empty states cover that
// experience for a brand-new workspace.
export const POST = authMiddleware(async (req: any) => {
  try {
    const profile = await ensureProfile(req.userId, req.userEmail ?? "");
    return NextResponse.json({ success: true, data: profile });
  } catch (err: any) {
    console.error("[API] POST /api/seed error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 400 });
  }
});
