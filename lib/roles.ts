/**
 * Role/permission helpers for Truewiki.
 * Roles: admin | owner | viewer. Stored in user_profiles.role, one row per
 * auth user (owner_user_id = auth user id).
 */
import { scopedRepo, getDb } from "lyzr-architect-pg";
import { user_profiles, pages } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export type Role = "admin" | "owner" | "viewer";

/** Ensure a user_profiles row exists for this auth user; first-ever user becomes admin. */
export async function ensureProfile(userId: string, email: string): Promise<{ id: string; role: Role; email: string; default_cadence: string; notify_on_drift: boolean; notify_digest: boolean }> {
  const repo = scopedRepo(user_profiles, userId);
  const existing = await repo.findOne();
  if (existing) {
    if (!existing.email && email) {
      const [updated] = await repo.update(eq(user_profiles.owner_user_id, userId), { email });
      return updated as any;
    }
    return existing as any;
  }
  const db = getDb();
  const allRows = await db.select().from(user_profiles);
  const isFirst = allRows.length === 0;
  const [created] = await repo.insert({ email, role: isFirst ? "admin" : "viewer" } as any);
  return created as any;
}

export async function getRole(userId: string, email: string): Promise<Role> {
  const profile = await ensureProfile(userId, email);
  return (profile.role as Role) ?? "viewer";
}

export async function isPageOwnerOrAdmin(userId: string, role: Role, page: { owner_user_id: string | null }): Promise<boolean> {
  if (role === "admin") return true;
  if (role === "owner" && (page.owner_user_id === userId || !page.owner_user_id)) return true;
  return false;
}

export async function getAllProfiles() {
  const db = getDb();
  return db.select().from(user_profiles);
}

export async function getPageById(pageId: string) {
  const db = getDb();
  const rows = await db.select().from(pages).where(eq(pages.id, pageId));
  return rows[0] ?? null;
}
