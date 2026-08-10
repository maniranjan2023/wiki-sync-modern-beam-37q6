import { NextResponse } from "next/server";
import { authMiddleware, getDb } from "lyzr-architect-pg";
import { user_profiles } from "@/lib/db/schema";
import { getRole, ensureProfile } from "@/lib/roles";
import { eq } from "drizzle-orm";

export const GET = authMiddleware(async (req: any) => {
  try {
    const role = await getRole(req.userId, req.userEmail ?? "");
    if (role !== "admin") return NextResponse.json({ success: false, error: "Admin access required" }, { status: 403 });
    const db = getDb();
    const rows = await db.select().from(user_profiles);
    return NextResponse.json({ success: true, data: rows });
  } catch (err: any) {
    console.error("[API] GET /api/members error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 400 });
  }
});

// Change a member's role, or create a pending "invited" placeholder profile.
export const POST = authMiddleware(async (req: any) => {
  try {
    const role = await getRole(req.userId, req.userEmail ?? "");
    if (role !== "admin") return NextResponse.json({ success: false, error: "Admin access required" }, { status: 403 });
    const body = await req.json();
    const db = getDb();

    if (body.action === "invite") {
      const email = String(body.email ?? "").trim();
      if (!email) return NextResponse.json({ success: false, error: "Email is required" }, { status: 400 });
      const pendingId = `pending_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      const [row] = await db
        .insert(user_profiles)
        .values({ owner_user_id: pendingId, email, role: body.role ?? "viewer", invited: true } as any)
        .returning();
      return NextResponse.json({ success: true, data: row });
    }

    if (body.action === "set_role") {
      const targetOwnerUserId = String(body.owner_user_id ?? "");
      const newRole = String(body.role ?? "");
      if (!targetOwnerUserId || !["admin", "owner", "viewer"].includes(newRole)) {
        return NextResponse.json({ success: false, error: "owner_user_id and a valid role are required" }, { status: 400 });
      }
      const [row] = await db
        .update(user_profiles)
        .set({ role: newRole })
        .where(eq(user_profiles.owner_user_id, targetOwnerUserId))
        .returning();
      if (!row) return NextResponse.json({ success: false, error: "Member not found" }, { status: 404 });
      return NextResponse.json({ success: true, data: row });
    }

    return NextResponse.json({ success: false, error: "Unknown action" }, { status: 400 });
  } catch (err: any) {
    console.error("[API] POST /api/members error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 400 });
  }
});
