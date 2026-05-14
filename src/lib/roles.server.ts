// Server-only role lookups with a small in-process TTL cache.
// Reduces repeated user_roles SELECTs across server function calls on a warm
// worker instance. Authorization is still enforced — the cache only avoids
// re-querying the same user's roles within the TTL window.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";

export type AppRole = Database["public"]["Enums"]["app_role"];

const TTL_MS = 60_000; // 1 minute — short enough to pick up role changes quickly
const MAX_ENTRIES = 500;

type Entry = { roles: AppRole[]; expiresAt: number };
const cache = new Map<string, Entry>();

function evictIfNeeded() {
  if (cache.size <= MAX_ENTRIES) return;
  // Drop the oldest ~10% (Map preserves insertion order).
  const drop = Math.ceil(MAX_ENTRIES * 0.1);
  let i = 0;
  for (const k of cache.keys()) {
    cache.delete(k);
    if (++i >= drop) break;
  }
}

export async function getUserRoles(userId: string): Promise<AppRole[]> {
  const now = Date.now();
  const hit = cache.get(userId);
  if (hit && hit.expiresAt > now) return hit.roles;

  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) {
    console.error("getUserRoles failed:", error);
    throw new Response("Forbidden", { status: 403 });
  }
  const roles = (data ?? []).map((r) => r.role as AppRole);
  cache.set(userId, { roles, expiresAt: now + TTL_MS });
  evictIfNeeded();
  return roles;
}

export async function userHasAnyRole(
  userId: string,
  allowed: readonly AppRole[],
): Promise<boolean> {
  const roles = await getUserRoles(userId);
  return roles.some((r) => allowed.includes(r));
}

export async function assertAnyRole(
  userId: string,
  allowed: readonly AppRole[],
): Promise<void> {
  if (!(await userHasAnyRole(userId, allowed))) {
    throw new Response("Forbidden", { status: 403 });
  }
}

// Optional: invalidate after a known role change (e.g. admin grants/revokes).
export function invalidateUserRoles(userId: string) {
  cache.delete(userId);
}
