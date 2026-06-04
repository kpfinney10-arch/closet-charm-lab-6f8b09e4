// Decedents CRUD + workflow transitions for the CRM module.
// All access is scoped via RLS to the user's organization_id.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const orgIdInput = z.object({ organizationId: z.string().uuid() });

export type DecedentStatus =
  | "checked_in"
  | "prepped"
  | "cremated"
  | "released"
  | "checked_out";

export const listDecedents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    orgIdInput
      .extend({
        includeCheckedOut: z.boolean().optional().default(false),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("decedents")
      .select(
        "id, first_name, last_name, date_of_birth, date_of_death, sex, weight_lbs, status, location, rack, check_in_at, check_out_at, funeral_home_id, dispatch_case_id, notes, created_at, updated_at, funeral_homes(name)",
      )
      .eq("organization_id", data.organizationId)
      .order("check_in_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (!data.includeCheckedOut) {
      q = q.neq("status", "checked_out");
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getDecedent = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("decedents")
      .select("*, funeral_homes(id, name)")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Decedent not found");
    return row;
  });

const createInput = z.object({
  organizationId: z.string().uuid(),
  firstName: z.string().min(1).max(120),
  lastName: z.string().min(1).max(120),
  dateOfBirth: z.string().optional().nullable(),
  dateOfDeath: z.string().optional().nullable(),
  sex: z.string().max(20).optional().nullable(),
  weightLbs: z.number().positive().max(2000).optional().nullable(),
  funeralHomeId: z.string().uuid().optional().nullable(),
  location: z.string().max(200).optional().nullable(),
  rack: z.string().max(50).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const createDecedent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => createInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("decedents")
      .insert({
        organization_id: data.organizationId,
        first_name: data.firstName,
        last_name: data.lastName,
        date_of_birth: data.dateOfBirth || null,
        date_of_death: data.dateOfDeath || null,
        sex: data.sex || null,
        weight_lbs: data.weightLbs ?? null,
        funeral_home_id: data.funeralHomeId || null,
        location: data.location || null,
        rack: data.rack || null,
        notes: data.notes || null,
        status: "checked_in",
        check_in_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

const updateInput = z.object({
  id: z.string().uuid(),
  firstName: z.string().min(1).max(120).optional(),
  lastName: z.string().min(1).max(120).optional(),
  dateOfBirth: z.string().optional().nullable(),
  dateOfDeath: z.string().optional().nullable(),
  sex: z.string().max(20).optional().nullable(),
  weightLbs: z.number().positive().max(2000).optional().nullable(),
  funeralHomeId: z.string().uuid().optional().nullable(),
  location: z.string().max(200).optional().nullable(),
  rack: z.string().max(50).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const updateDecedent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => updateInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const patch: Record<string, unknown> = {};
    if (data.firstName !== undefined) patch.first_name = data.firstName;
    if (data.lastName !== undefined) patch.last_name = data.lastName;
    if (data.dateOfBirth !== undefined) patch.date_of_birth = data.dateOfBirth || null;
    if (data.dateOfDeath !== undefined) patch.date_of_death = data.dateOfDeath || null;
    if (data.sex !== undefined) patch.sex = data.sex || null;
    if (data.weightLbs !== undefined) patch.weight_lbs = data.weightLbs ?? null;
    if (data.funeralHomeId !== undefined) patch.funeral_home_id = data.funeralHomeId || null;
    if (data.location !== undefined) patch.location = data.location || null;
    if (data.rack !== undefined) patch.rack = data.rack || null;
    if (data.notes !== undefined) patch.notes = data.notes || null;

    const { data: row, error } = await supabase
      .from("decedents")
      .update(patch)
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

const ALLOWED_STATUSES: DecedentStatus[] = [
  "checked_in",
  "prepped",
  "cremated",
  "released",
  "checked_out",
];

export const setDecedentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum([
          "checked_in",
          "prepped",
          "cremated",
          "released",
          "checked_out",
        ] as const),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    if (!ALLOWED_STATUSES.includes(data.status)) {
      throw new Error("Invalid status");
    }
    const patch: Record<string, unknown> = { status: data.status };
    if (data.status === "checked_out") {
      patch.check_out_at = new Date().toISOString();
    }
    const { data: row, error } = await supabase
      .from("decedents")
      .update(patch)
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });
