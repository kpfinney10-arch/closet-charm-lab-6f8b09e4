// Manual handoff from dispatch -> CRM. Creates (or reuses) a decedent record
// in the chosen organization, linked back to the dispatch case via
// decedents.dispatch_case_id. Idempotent: re-running for the same case + org
// returns the existing decedent.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAnyRole } from "@/lib/roles.server";

const Input = z.object({
  caseId: z.string().uuid(),
  organizationId: z.string().uuid(),
});

function bad(message: string, status = 400): never {
  throw new Response(message, { status });
}

export const sendCaseToCrm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    // Dispatch-side authorization: only admins can hand a case over.
    await assertAnyRole(context.userId, ["admin"]);
    const { supabase } = context;

    // Confirm CRM-side write role for this org (RLS would also block, but
    // we want a clean error before hitting it).
    const { data: member, error: mErr } = await supabase
      .from("organization_members")
      .select("crm_role, approved")
      .eq("organization_id", data.organizationId)
      .eq("user_id", context.userId)
      .eq("approved", true)
      .maybeSingle();
    if (mErr) bad(mErr.message, 500);
    if (!member || (member.crm_role !== "crm_admin" && member.crm_role !== "crm_user")) {
      bad("You don't have CRM write access to that organization", 403);
    }

    // Idempotency: if this case was already sent to this org, return it.
    const { data: existing, error: eErr } = await supabase
      .from("decedents")
      .select("id")
      .eq("organization_id", data.organizationId)
      .eq("dispatch_case_id", data.caseId)
      .maybeSingle();
    if (eErr) bad(eErr.message, 500);
    if (existing) {
      return { decedentId: existing.id, created: false as const };
    }

    const { data: c, error: cErr } = await supabase
      .from("cases")
      .select(
        "decedent_first_name, decedent_last_name, decedent_dob, decedent_dod, decedent_sex, decedent_weight_lbs, case_number, pickup_address, dropoff_address, special_handling",
      )
      .eq("id", data.caseId)
      .maybeSingle();
    if (cErr) bad(cErr.message, 500);
    if (!c) bad("Case not found", 404);

    const notesParts: string[] = [`Imported from dispatch case ${c.case_number}.`];
    if (c.pickup_address) notesParts.push(`Pickup: ${c.pickup_address}`);
    if (c.dropoff_address) notesParts.push(`Dropoff: ${c.dropoff_address}`);
    if (c.special_handling) notesParts.push(`Special handling: ${c.special_handling}`);

    const { data: ins, error: iErr } = await supabase
      .from("decedents")
      .insert({
        organization_id: data.organizationId,
        first_name: c.decedent_first_name || "Unknown",
        last_name: c.decedent_last_name || "Unknown",
        date_of_birth: c.decedent_dob,
        date_of_death: c.decedent_dod ? c.decedent_dod.slice(0, 10) : null,
        sex: c.decedent_sex,
        weight_lbs: c.decedent_weight_lbs,
        status: "checked_in",
        dispatch_case_id: data.caseId,
        notes: notesParts.join("\n"),
      })
      .select("id")
      .single();
    if (iErr) bad(iErr.message, 400);

    return { decedentId: ins.id, created: true as const };
  });
