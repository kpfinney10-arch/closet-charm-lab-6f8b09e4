// Cremation logs: start/stop, list, get. Triggers auto-log workflow events
// and advance decedents to "cremated" on stop.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SELECT =
  "id, organization_id, decedent_id, operator_id, retort, container_type, weight_lbs, ash_weight_lbs, start_time, end_time, comment, created_at, updated_at, decedents(first_name, last_name, status)";

export const listCremationLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        organizationId: z.string().uuid(),
        scope: z.enum(["all", "active", "completed"]).optional().default("all"),
        limit: z.number().int().min(1).max(500).optional().default(200),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("cremation_logs")
      .select(SELECT)
      .eq("organization_id", data.organizationId)
      .order("start_time", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.scope === "active") q = q.is("end_time", null);
    if (data.scope === "completed") q = q.not("end_time", "is", null);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const operatorIds = Array.from(
      new Set((rows ?? []).map((r: any) => r.operator_id).filter(Boolean)),
    ) as string[];
    let operators: Record<string, string | null> = {};
    if (operatorIds.length) {
      const { data: pr } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", operatorIds);
      operators = Object.fromEntries(
        (pr ?? []).map((p: any) => [p.id, p.full_name ?? null]),
      );
    }
    return (rows ?? []).map((r: any) => ({
      ...r,
      operator_name: r.operator_id ? operators[r.operator_id] ?? null : null,
    }));
  });

export const getCremationLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("cremation_logs")
      .select(
        SELECT +
          ", decedents(first_name, last_name, date_of_birth, date_of_death, sex, weight_lbs, dispatch_case_id, funeral_homes(name))",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Cremation log not found");

    let operator_name: string | null = null;
    if ((row as any).operator_id) {
      const { data: pr } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", (row as any).operator_id)
        .maybeSingle();
      operator_name = pr?.full_name ?? null;
    }
    return { ...(row as any), operator_name };
  });

const startInput = z.object({
  organizationId: z.string().uuid(),
  decedentId: z.string().uuid(),
  retort: z.string().min(1).max(50).optional().nullable(),
  containerType: z.string().max(100).optional().nullable(),
  weightLbs: z.number().positive().max(2000).optional().nullable(),
  comment: z.string().max(2000).optional().nullable(),
});

export const startCremationLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => startInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Block double-start: refuse if an active (no end_time) log already exists.
    const { data: existing, error: exErr } = await supabase
      .from("cremation_logs")
      .select("id")
      .eq("decedent_id", data.decedentId)
      .is("end_time", null)
      .limit(1);
    if (exErr) throw new Error(exErr.message);
    if (existing && existing.length) {
      throw new Error("A cremation is already in progress for this decedent");
    }

    const { data: row, error } = await supabase
      .from("cremation_logs")
      .insert({
        organization_id: data.organizationId,
        decedent_id: data.decedentId,
        operator_id: userId,
        retort: data.retort || null,
        container_type: data.containerType || null,
        weight_lbs: data.weightLbs ?? null,
        comment: data.comment || null,
        start_time: new Date().toISOString(),
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

const stopInput = z.object({
  id: z.string().uuid(),
  ashWeightLbs: z.number().positive().max(500).optional().nullable(),
  comment: z.string().max(2000).optional().nullable(),
});

export const stopCremationLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => stopInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const patch: Record<string, unknown> = { end_time: new Date().toISOString() };
    if (data.ashWeightLbs !== undefined && data.ashWeightLbs !== null) {
      patch.ash_weight_lbs = data.ashWeightLbs;
    }
    if (data.comment !== undefined && data.comment !== null) patch.comment = data.comment;
    const { data: row, error } = await supabase
      .from("cremation_logs")
      .update(patch as never)
      .eq("id", data.id)
      .is("end_time", null)
      .select()
      .single();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Log already completed or not found");
    return row;
  });
