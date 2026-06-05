import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const orgIdInput = z.object({ organizationId: z.string().uuid() });

export const listFuneralHomes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => orgIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("funeral_homes")
      .select("*")
      .eq("organization_id", data.organizationId)
      .order("name");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const createInput = z.object({
  organizationId: z.string().uuid(),
  name: z.string().min(1).max(200),
  contactName: z.string().max(200).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  email: z.string().email().max(200).optional().nullable().or(z.literal("")),
  address: z.string().max(500).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const createFuneralHome = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => createInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("funeral_homes")
      .insert({
        organization_id: data.organizationId,
        name: data.name,
        contact_name: data.contactName || null,
        phone: data.phone || null,
        email: data.email || null,
        address: data.address || null,
        notes: data.notes || null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const setFuneralHomeActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), active: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("funeral_homes")
      .update({ active: data.active })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const updateInput = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  contactName: z.string().max(200).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  email: z.string().email().max(200).optional().nullable().or(z.literal("")),
  address: z.string().max(500).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const updateFuneralHome = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => updateInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("funeral_homes")
      .update({
        name: data.name,
        contact_name: data.contactName || null,
        phone: data.phone || null,
        email: data.email || null,
        address: data.address || null,
        notes: data.notes || null,
      })
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const getFuneralHomeStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ id: z.string().uuid(), organizationId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { count: total } = await supabase
      .from("decedents")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", data.organizationId)
      .eq("funeral_home_id", data.id);
    const { count: active } = await supabase
      .from("decedents")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", data.organizationId)
      .eq("funeral_home_id", data.id)
      .neq("status", "checked_out");
    return { totalDecedents: total ?? 0, activeDecedents: active ?? 0 };
  });

