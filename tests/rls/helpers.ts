// Helpers for RLS tests. Spins up a service-role client for seeding/teardown,
// and signs in real test users to get role-scoped clients that exercise RLS.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const URL = process.env.STAGING_SUPABASE_URL!;
const ANON = process.env.STAGING_SUPABASE_PUBLISHABLE_KEY!;
const SERVICE = process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY!;

export type Role = "admin" | "dispatcher" | "driver" | "viewer";

export const admin: SupabaseClient<Database> = createClient<Database>(URL, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export function anonClient(): SupabaseClient<Database> {
  return createClient<Database>(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Create (or reuse) a confirmed auth user and assign roles + approval. */
export async function ensureUser(opts: {
  email: string;
  password: string;
  fullName: string;
  roles: Role[];
  approved?: boolean;
}): Promise<{ userId: string }> {
  const { data: list } = await admin.auth.admin.listUsers();
  let userId = list.users.find((u) => u.email === opts.email)?.id;

  if (!userId) {
    const { data, error } = await admin.auth.admin.createUser({
      email: opts.email,
      password: opts.password,
      email_confirm: true,
      user_metadata: { full_name: opts.fullName },
    });
    if (error) throw error;
    userId = data.user!.id;
  }

  // Profile may be created by handle_new_user trigger. Ensure approval state.
  await admin
    .from("profiles")
    .upsert({ id: userId, full_name: opts.fullName, approved: opts.approved ?? true });

  // Reset roles to the exact set requested.
  await admin.from("user_roles").delete().eq("user_id", userId);
  if (opts.roles.length) {
    await admin
      .from("user_roles")
      .insert(opts.roles.map((role) => ({ user_id: userId!, role })));
  }

  return { userId };
}

/** Sign in as a user and return an RLS-bound client. */
export async function signInAs(email: string, password: string): Promise<SupabaseClient<Database>> {
  const client = createClient<Database>(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Sign-in failed for ${email}: ${error.message}`);
  return client;
}

/** Delete all test rows created with the test- prefix. Safe to call between suites. */
export async function resetFixtures() {
  await admin.from("cases").delete().like("case_number", "TEST-%");
}
