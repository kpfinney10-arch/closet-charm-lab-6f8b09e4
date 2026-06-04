// Decedent events feed for the CRM Updates page.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type DecedentEventType =
  | "created"
  | "status_changed"
  | "note"
  | "document"
  | "workflow";

export const listDecedentEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        organizationId: z.string().uuid(),
        limit: z.number().int().min(1).max(200).optional().default(100),
        decedentId: z.string().uuid().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("decedent_events")
      .select(
        "id, event_type, from_status, to_status, message, actor_id, created_at, decedent_id, decedents(first_name, last_name, status)",
      )
      .eq("organization_id", data.organizationId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.decedentId) q = q.eq("decedent_id", data.decedentId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const actorIds = Array.from(
      new Set((rows ?? []).map((r: any) => r.actor_id).filter(Boolean)),
    ) as string[];
    let profiles: Record<string, string> = {};
    if (actorIds.length) {
      const { data: pr } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", actorIds);
      profiles = Object.fromEntries((pr ?? []).map((p: any) => [p.id, p.full_name]));
    }
    return (rows ?? []).map((r: any) => ({
      ...r,
      actor_name: r.actor_id ? profiles[r.actor_id] ?? null : null,
    }));
  });

export const addDecedentNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        organizationId: z.string().uuid(),
        decedentId: z.string().uuid(),
        message: z.string().min(1).max(2000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("decedent_events")
      .insert({
        organization_id: data.organizationId,
        decedent_id: data.decedentId,
        event_type: "note",
        message: data.message,
        actor_id: userId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });
