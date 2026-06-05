// Decedent releases (chain-of-custody) + checkout.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listReleases = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        organizationId: z.string().uuid(),
        decedentId: z.string().uuid().optional(),
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        limit: z.number().int().min(1).max(2000).optional().default(100),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("decedent_releases")
      .select(
        "id, decedent_id, item_type, released_to_name, released_to_relation, released_to_phone, id_type, id_number, signer_name, witnessed_by, released_at, notes, decedents(first_name, last_name, status)",
      )
      .eq("organization_id", data.organizationId)
      .order("released_at", { ascending: false })
      .limit(data.limit);
    if (data.decedentId) q = q.eq("decedent_id", data.decedentId);
    if (data.from) q = q.gte("released_at", data.from);
    if (data.to) q = q.lte("released_at", data.to);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const releaseInput = z.object({
  organizationId: z.string().uuid(),
  decedentId: z.string().uuid(),
  itemType: z.enum(["body", "cremains"]),
  releasedToName: z.string().min(1).max(200),
  releasedToRelation: z.string().max(100).optional().nullable(),
  releasedToPhone: z.string().max(50).optional().nullable(),
  idType: z.string().max(50).optional().nullable(),
  idNumber: z.string().max(100).optional().nullable(),
  signerName: z.string().min(1).max(200),
  signatureData: z.string().min(20).max(500_000),
  witnessedBy: z.string().max(200).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const recordRelease = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => releaseInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("decedent_releases")
      .insert({
        organization_id: data.organizationId,
        decedent_id: data.decedentId,
        item_type: data.itemType,
        released_to_name: data.releasedToName,
        released_to_relation: data.releasedToRelation || null,
        released_to_phone: data.releasedToPhone || null,
        id_type: data.idType || null,
        id_number: data.idNumber || null,
        signer_name: data.signerName,
        signature_data: data.signatureData,
        witnessed_by: data.witnessedBy || null,
        notes: data.notes || null,
        released_by: userId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const checkoutDecedent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ decedentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("decedents")
      .update({
        status: "checked_out",
        check_out_at: new Date().toISOString(),
      } as never)
      .eq("id", data.decedentId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });
