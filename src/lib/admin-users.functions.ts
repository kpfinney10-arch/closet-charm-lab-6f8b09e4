import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

type AppRole = "admin" | "dispatcher" | "driver" | "viewer";
type AuditAction =
  | "user_created"
  | "user_disabled"
  | "user_enabled"
  | "user_deleted"
  | "role_changed"
  | "password_reset";

function getAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Response("Server misconfigured", { status: 500 });
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function assertAdmin(supabase: ReturnType<typeof getAdmin>, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Response(error.message, { status: 500 });
  if (!data) throw new Response("Forbidden: admin role required", { status: 403 });
}

async function writeAudit(
  supabase: ReturnType<typeof getAdmin>,
  params: {
    action: AuditAction;
    actor_id: string;
    target_user_id?: string | null;
    target_email?: string | null;
    details?: Record<string, unknown>;
  }
) {
  const { data: actor } = await supabase.auth.admin.getUserById(params.actor_id);
  await supabase.from("admin_audit_logs").insert({
    action: params.action,
    actor_id: params.actor_id,
    actor_email: actor?.user?.email ?? null,
    target_user_id: params.target_user_id ?? null,
    target_email: params.target_email ?? null,
    details: (params.details ?? {}) as never,
  });
}

export const listAdminUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = getAdmin();
    await assertAdmin(admin, context.userId);

    const { data: list, error } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (error) throw new Response(error.message, { status: 500 });

    const ids = list.users.map((u) => u.id);
    const [{ data: profiles }, { data: roles }] = await Promise.all([
      admin.from("profiles").select("id, full_name, phone, on_duty").in("id", ids),
      admin.from("user_roles").select("user_id, role").in("user_id", ids),
    ]);

    const profMap = new Map((profiles ?? []).map((p) => [p.id, p]));
    const roleMap = new Map<string, AppRole[]>();
    (roles ?? []).forEach((r) => {
      const arr = roleMap.get(r.user_id) ?? [];
      arr.push(r.role as AppRole);
      roleMap.set(r.user_id, arr);
    });

    return list.users.map((u) => ({
      id: u.id,
      email: u.email ?? "",
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at,
      banned_until: (u as unknown as { banned_until?: string | null }).banned_until ?? null,
      email_confirmed_at: u.email_confirmed_at ?? null,
      profile: profMap.get(u.id) ?? null,
      roles: roleMap.get(u.id) ?? [],
    }));
  });

const createSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(72),
  full_name: z.string().trim().max(120).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  role: z.enum(["admin", "dispatcher", "driver", "viewer"]),
});

export const createAdminUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createSchema.parse(d))
  .handler(async ({ data, context }) => {
    const admin = getAdmin();
    await assertAdmin(admin, context.userId);

    const { data: created, error } = await admin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name ?? data.email, phone: data.phone ?? null },
    });
    if (error || !created.user) throw new Response(error?.message ?? "Failed", { status: 400 });

    const { error: rErr } = await admin
      .from("user_roles")
      .insert({ user_id: created.user.id, role: data.role });
    if (rErr) throw new Response(rErr.message, { status: 500 });

    await writeAudit(admin, {
      action: "user_created",
      actor_id: context.userId,
      target_user_id: created.user.id,
      target_email: created.user.email ?? data.email,
      details: { role: data.role, full_name: data.full_name ?? null },
    });

    return { id: created.user.id };
  });

const idSchema = z.object({ user_id: z.string().uuid() });

export const disableAdminUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idSchema.parse(d))
  .handler(async ({ data, context }) => {
    const admin = getAdmin();
    await assertAdmin(admin, context.userId);
    if (data.user_id === context.userId)
      throw new Response("You cannot disable your own account", { status: 400 });
    const { data: target } = await admin.auth.admin.getUserById(data.user_id);
    const { error } = await admin.auth.admin.updateUserById(data.user_id, {
      ban_duration: "876000h",
    });
    if (error) throw new Response(error.message, { status: 500 });
    await writeAudit(admin, {
      action: "user_disabled",
      actor_id: context.userId,
      target_user_id: data.user_id,
      target_email: target?.user?.email ?? null,
    });
    return { ok: true };
  });

export const enableAdminUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idSchema.parse(d))
  .handler(async ({ data, context }) => {
    const admin = getAdmin();
    await assertAdmin(admin, context.userId);
    const { data: target } = await admin.auth.admin.getUserById(data.user_id);
    const { error } = await admin.auth.admin.updateUserById(data.user_id, {
      ban_duration: "none",
    });
    if (error) throw new Response(error.message, { status: 500 });
    await writeAudit(admin, {
      action: "user_enabled",
      actor_id: context.userId,
      target_user_id: data.user_id,
      target_email: target?.user?.email ?? null,
    });
    return { ok: true };
  });

const resetSchema = z.object({
  user_id: z.string().uuid(),
  new_password: z.string().min(8).max(72),
});

export const resetAdminUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => resetSchema.parse(d))
  .handler(async ({ data, context }) => {
    const admin = getAdmin();
    await assertAdmin(admin, context.userId);
    const { data: target } = await admin.auth.admin.getUserById(data.user_id);
    const { error } = await admin.auth.admin.updateUserById(data.user_id, {
      password: data.new_password,
    });
    if (error) throw new Response(error.message, { status: 500 });
    await writeAudit(admin, {
      action: "password_reset",
      actor_id: context.userId,
      target_user_id: data.user_id,
      target_email: target?.user?.email ?? null,
    });
    return { ok: true };
  });

const roleSchema = z.object({
  user_id: z.string().uuid(),
  role: z.enum(["admin", "dispatcher", "driver", "viewer"]),
});

export const setAdminUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => roleSchema.parse(d))
  .handler(async ({ data, context }) => {
    const admin = getAdmin();
    await assertAdmin(admin, context.userId);
    const { data: target } = await admin.auth.admin.getUserById(data.user_id);
    const { data: prevRoles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user_id);
    const { error: dErr } = await admin
      .from("user_roles")
      .delete()
      .eq("user_id", data.user_id);
    if (dErr) throw new Response(dErr.message, { status: 500 });
    const { error: iErr } = await admin
      .from("user_roles")
      .insert({ user_id: data.user_id, role: data.role });
    if (iErr) throw new Response(iErr.message, { status: 500 });
    await writeAudit(admin, {
      action: "role_changed",
      actor_id: context.userId,
      target_user_id: data.user_id,
      target_email: target?.user?.email ?? null,
      details: {
        from: (prevRoles ?? []).map((r) => r.role),
        to: data.role,
      },
    });
    return { ok: true };
  });

export const deleteAdminUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idSchema.parse(d))
  .handler(async ({ data, context }) => {
    const admin = getAdmin();
    await assertAdmin(admin, context.userId);
    if (data.user_id === context.userId)
      throw new Response("You cannot delete your own account", { status: 400 });
    const { data: target } = await admin.auth.admin.getUserById(data.user_id);
    const { error } = await admin.auth.admin.deleteUser(data.user_id);
    if (error) throw new Response(error.message, { status: 500 });
    await writeAudit(admin, {
      action: "user_deleted",
      actor_id: context.userId,
      target_user_id: data.user_id,
      target_email: target?.user?.email ?? null,
    });
    return { ok: true };
  });

const auditQuerySchema = z.object({
  limit: z.number().int().min(1).max(500).optional(),
  action: z
    .enum([
      "user_created",
      "user_disabled",
      "user_enabled",
      "user_deleted",
      "role_changed",
      "password_reset",
    ])
    .optional()
    .nullable(),
});

export const listAdminAuditLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => auditQuerySchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const admin = getAdmin();
    await assertAdmin(admin, context.userId);
    let q = admin
      .from("admin_audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 200);
    if (data.action) q = q.eq("action", data.action);
    const { data: rows, error } = await q;
    if (error) throw new Response(error.message, { status: 500 });
    return rows ?? [];
  });
