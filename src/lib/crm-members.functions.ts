// CRM organization member management (admin-only).
// Uses supabaseAdmin to read profile names across the org because the
// default profiles RLS only exposes self + dispatch-staff rows.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CRM_ROLES = ["crm_admin", "crm_user", "crm_viewer"] as const;
export type CrmRole = (typeof CRM_ROLES)[number];

export type CrmMemberRow = {
  id: string;
  user_id: string;
  organization_id: string;
  crm_role: CrmRole;
  approved: boolean;
  created_at: string;
  full_name: string | null;
  email: string | null;
};

async function assertAdmin(
  supabase: any,
  userId: string,
  organizationId: string,
) {
  const { data, error } = await supabase
    .from("organization_members")
    .select("crm_role, approved")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.approved || data.crm_role !== "crm_admin") {
    throw new Error("Forbidden: CRM admin access required");
  }
}

export const listCrmMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ organizationId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<CrmMemberRow[]> => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId, data.organizationId);

    const { data: members, error } = await supabase
      .from("organization_members")
      .select("id, user_id, organization_id, crm_role, approved, created_at")
      .eq("organization_id", data.organizationId)
      .order("approved", { ascending: true })
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const ids = (members ?? []).map((m: any) => m.user_id);
    if (!ids.length) return [];

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [profilesRes, usersRes] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, full_name").in("id", ids),
      supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);
    const profMap = new Map(
      (profilesRes.data ?? []).map((p: any) => [p.id, p.full_name ?? null]),
    );
    const emailMap = new Map<string, string | null>();
    for (const u of usersRes.data?.users ?? []) {
      if (ids.includes(u.id)) emailMap.set(u.id, u.email ?? null);
    }

    return (members ?? []).map((m: any) => ({
      ...m,
      full_name: profMap.get(m.user_id) ?? null,
      email: emailMap.get(m.user_id) ?? null,
    }));
  });

export const setCrmMemberApproved = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        organizationId: z.string().uuid(),
        memberId: z.string().uuid(),
        approved: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId, data.organizationId);
    const { error } = await supabase
      .from("organization_members")
      .update({ approved: data.approved })
      .eq("id", data.memberId)
      .eq("organization_id", data.organizationId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setCrmMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        organizationId: z.string().uuid(),
        memberId: z.string().uuid(),
        role: z.enum(CRM_ROLES),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId, data.organizationId);
    const { error } = await supabase
      .from("organization_members")
      .update({ crm_role: data.role })
      .eq("id", data.memberId)
      .eq("organization_id", data.organizationId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeCrmMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        organizationId: z.string().uuid(),
        memberId: z.string().uuid(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId, data.organizationId);

    // Prevent removing the last admin
    const { data: admins, error: aErr } = await supabase
      .from("organization_members")
      .select("id")
      .eq("organization_id", data.organizationId)
      .eq("crm_role", "crm_admin")
      .eq("approved", true);
    if (aErr) throw new Error(aErr.message);

    const { data: target, error: tErr } = await supabase
      .from("organization_members")
      .select("crm_role, approved")
      .eq("id", data.memberId)
      .maybeSingle();
    if (tErr) throw new Error(tErr.message);

    if (
      target?.crm_role === "crm_admin" &&
      target.approved &&
      (admins?.length ?? 0) <= 1
    ) {
      throw new Error("Cannot remove the last CRM admin");
    }

    const { error } = await supabase
      .from("organization_members")
      .delete()
      .eq("id", data.memberId)
      .eq("organization_id", data.organizationId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const inviteCrmMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        organizationId: z.string().uuid(),
        email: z.string().email().max(200),
        role: z.enum(CRM_ROLES).default("crm_user"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId, data.organizationId);

    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );

    // Find existing user by email
    const { data: list, error: listErr } =
      await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listErr) throw new Error(listErr.message);
    const existing = list.users.find(
      (u: any) => u.email?.toLowerCase() === data.email.toLowerCase(),
    );
    if (!existing) {
      throw new Error(
        "No account found for that email. Ask them to sign up first, then invite again.",
      );
    }

    const { error } = await supabaseAdmin
      .from("organization_members")
      .upsert(
        {
          organization_id: data.organizationId,
          user_id: existing.id,
          crm_role: data.role,
          approved: true,
        },
        { onConflict: "organization_id,user_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
