import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const filtersSchema = z
  .object({
    action: z.string().max(40).optional(),
    q: z.string().max(255).optional(),
    actor: z.string().max(255).optional(),
    from: z.string().max(40).optional(),
    to: z.string().max(40).optional(),
    size: z.number().int().min(1).max(500).optional(),
  })
  .strict();

export const listAuditViews = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("audit_log_views")
      .select("id, name, filters, updated_at, is_default")
      .order("name", { ascending: true });
    if (error) throw new Response(error.message, { status: 500 });
    return data ?? [];
  });


const saveSchema = z.object({
  name: z.string().trim().min(1).max(80),
  filters: filtersSchema,
});

export const saveAuditView = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => saveSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("audit_log_views")
      .upsert(
        {
          user_id: context.userId,
          name: data.name,
          filters: data.filters,
        },
        { onConflict: "user_id,name" },
      )
      .select("id, name, filters, updated_at")
      .single();
    if (error) throw new Response(error.message, { status: 500 });
    return row;
  });

const idSchema = z.object({ id: z.string().uuid() });

const renameSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
});

export const renameAuditView = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => renameSchema.parse(d))
  .handler(async ({ data, context }) => {
    // Prevent rename to an existing view name (case-insensitive, trimmed) for this user.
    // Use lower(name) equality to avoid ilike treating % and _ as wildcards.
    const normalized = data.name.toLowerCase();
    const { data: siblings, error: checkError } = await context.supabase
      .from("audit_log_views")
      .select("id, name")
      .eq("user_id", context.userId)
      .neq("id", data.id);
    if (checkError) throw new Response(checkError.message, { status: 500 });
    if ((siblings ?? []).some((s) => s.name.trim().toLowerCase() === normalized)) {
      throw new Response("A view with that name already exists.", { status: 409 });
    }

    const { data: row, error } = await context.supabase
      .from("audit_log_views")
      .update({ name: data.name })
      .eq("id", data.id)
      .select("id, name, filters, updated_at")
      .single();
    if (error) {
      const status = error.code === "23505" ? 409 : 400;
      const msg = status === 409 ? "A view with that name already exists." : error.message;
      throw new Response(msg, { status });
    }
    return row;
  });


export const deleteAuditView = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("audit_log_views")
      .delete()
      .eq("id", data.id);
    if (error) throw new Response(error.message, { status: 500 });
    return { ok: true };
  });

