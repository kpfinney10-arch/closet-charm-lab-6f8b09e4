import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CrmMembership = {
  organization_id: string;
  organization_name: string;
  organization_slug: string;
  crm_role: "crm_admin" | "crm_user" | "crm_viewer";
  approved: boolean;
};

export const getMyCrmMemberships = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CrmMembership[]> => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("organization_members")
      .select("organization_id, crm_role, approved, organizations(name, slug)")
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return (data ?? []).map((row: any) => ({
      organization_id: row.organization_id,
      organization_name: row.organizations?.name ?? "Organization",
      organization_slug: row.organizations?.slug ?? "",
      crm_role: row.crm_role,
      approved: row.approved,
    }));
  });
