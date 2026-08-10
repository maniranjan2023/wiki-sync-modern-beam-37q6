import { NextRequest, NextResponse } from "next/server";
import { authMiddleware } from "lyzr-architect-pg";
import { ensureProfile } from "@/lib/roles";
import { scopedRepo } from "lyzr-architect-pg";
import { user_profiles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const GET = authMiddleware(async (req: any) => {
  try {
    const profile = await ensureProfile(req.userId, req.userEmail ?? "");
    return NextResponse.json({ success: true, data: profile });
  } catch (err: any) {
    console.error("[API] GET /api/profile error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 400 });
  }
});

export const PUT = authMiddleware(async (req: NextRequest & { userId: string }) => {
  try {
    const body = await req.json();
    const repo = scopedRepo(user_profiles, (req as any).userId);
    const updates: Record<string, any> = {};
    if (typeof body.default_cadence === "string") updates.default_cadence = body.default_cadence;
    if (typeof body.notify_on_drift === "boolean") updates.notify_on_drift = body.notify_on_drift;
    if (typeof body.notify_digest === "boolean") updates.notify_digest = body.notify_digest;
    const [row] = await repo.update(eq(user_profiles.owner_user_id, (req as any).userId), updates);
    if (!row) return NextResponse.json({ success: false, error: "Profile not found" }, { status: 404 });
    return NextResponse.json({ success: true, data: row });
  } catch (err: any) {
    console.error("[API] PUT /api/profile error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 400 });
  }
});
