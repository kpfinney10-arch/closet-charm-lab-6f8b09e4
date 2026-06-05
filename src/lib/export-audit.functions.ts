// Audit logging for CRM CSV exports.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const logInput = z.object({
  organizationId: z.string().uuid(),
  exportType: z.enum(["releases", "cremations"]),
  from: z.string().datetime().nullable().optional(),
  to: z.string().datetime().nullable().optional(),
  rowCount: z.number().int().min(0).max(1_000_000),
  filename: z.string().min(1).max(255),
});

export const logCrmExport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => logInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("crm_export_audit").insert({
      organization_id: data.organizationId,
      user_id: userId,
      export_type: data.exportType,
      range_from: data.from ?? null,
      range_to: data.to ?? null,
      row_count: data.rowCount,
      filename: data.filename,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const listInput = z.object({
  organizationId: z.string().uuid(),
  limit: z.number().int().min(1).max(200).optional().default(50),
});

export type CrmExportAuditRow = {
  id: string;
  created_at: string;
  user_id: string;
  user_name: string | null;
  export_type: "releases" | "cremations";
  range_from: string | null;
  range_to: string | null;
  row_count: number;
  filename: string;
};

export const listCrmExportAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => listInput.parse(d))
  .handler(async ({ data, context }): Promise<CrmExportAuditRow[]> => {
    const { supabase, userId } = context;

    const { data: membership, error: memErr } = await supabase
      .from("organization_members")
      .select("crm_role, approved")
      .eq("organization_id", data.organizationId)
      .eq("user_id", userId)
      .maybeSingle();
    if (memErr) throw new Error(memErr.message);
    if (!membership?.approved || membership.crm_role !== "crm_admin") {
      throw new Error("Forbidden: admin access required");
    }

    const { data: rows, error } = await supabase
      .from("crm_export_audit")
      .select(
        "id, created_at, user_id, export_type, range_from, range_to, row_count, filename, profiles:user_id(full_name)",
      )
      .eq("organization_id", data.organizationId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r: any) => ({
      id: r.id,
      created_at: r.created_at,
      user_id: r.user_id,
      user_name: r.profiles?.full_name ?? null,
      export_type: r.export_type,
      range_from: r.range_from,
      range_to: r.range_to,
      row_count: r.row_count,
      filename: r.filename,
    }));
  });
