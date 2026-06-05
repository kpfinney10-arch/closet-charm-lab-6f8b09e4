// Centralized server functions for case-level dispatcher and driver actions.
//
// All authorization is enforced at three layers:
//   1. requireSupabaseAuth middleware (valid bearer token)
//   2. Role assertions via assertAnyRole (cached server-side role lookup)
//   3. RLS on the underlying tables (final backstop)
//
// Status changes go through these functions so we can:
//   - keep auto-status logic (driver assignment toggles new <-> assigned)
//   - validate driver forward-only transitions in one place
//   - add audit notes / GPS stamps next to the mutation
//   - send push notifications atomically with the action
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAnyRole, getUserRoles } from "@/lib/roles.server";
import type { Database } from "@/integrations/supabase/types";

type CaseStatus = Database["public"]["Enums"]["case_status"];
type SignatureType = Database["public"]["Enums"]["signature_type"];

const STATUS_VALUES = [
  "new",
  "assigned",
  "en_route_pickup",
  "on_scene",
  "in_custody",
  "en_route_dropoff",
  "delivered",
  "closed",
  "cancelled",
] as const satisfies readonly CaseStatus[];

const SIGNATURE_VALUES = [
  "pickup_released",
  "driver_received",
  "driver_delivered",
  "dropoff_received",
] as const satisfies readonly SignatureType[];

// Driver-allowed forward transitions. Mirrors the DB trigger
// restrict_driver_case_updates() so the UI fails fast with a clean error.
const DRIVER_NEXT: Partial<Record<CaseStatus, CaseStatus>> = {
  new: "en_route_pickup",
  assigned: "en_route_pickup",
  en_route_pickup: "on_scene",
  on_scene: "in_custody",
  in_custody: "en_route_dropoff",
  en_route_dropoff: "delivered",
};

const STATUS_LABEL: Record<CaseStatus, string> = {
  new: "New",
  assigned: "Assigned",
  en_route_pickup: "En route to pickup",
  on_scene: "On scene",
  in_custody: "In custody",
  en_route_dropoff: "En route to dropoff",
  delivered: "Delivered",
  closed: "Closed",
  cancelled: "Cancelled",
};

function bad(message: string, status = 400): never {
  throw new Response(message, { status });
}

// ---------- Assignment ----------

const AssignInput = z.object({
  caseId: z.string().uuid(),
  slot: z.enum(["primary", "secondary"]),
  driverId: z.string().uuid().nullable(),
});

export const assignCaseDriver = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => AssignInput.parse(data))
  .handler(async ({ data, context }) => {
    await assertAnyRole(context.userId, ["admin", "dispatcher"]);
    const { supabase } = context;

    const { data: current, error: rErr } = await supabase
      .from("cases")
      .select("status, primary_driver_id, secondary_driver_id, case_number, pickup_city, pickup_state")
      .eq("id", data.caseId)
      .maybeSingle();
    if (rErr) bad(rErr.message, 500);
    if (!current) bad("Case not found", 404);

    const field = data.slot === "primary" ? "primary_driver_id" : "secondary_driver_id";
    const otherField =
      data.slot === "primary" ? "secondary_driver_id" : "primary_driver_id";
    const otherDriver = current[otherField];
    const previousDriver = current[field] as string | null;
    const willHaveDriver = !!data.driverId || !!otherDriver;

    const patch: Database["public"]["Tables"]["cases"]["Update"] = {
      [field]: data.driverId,
    };
    if (willHaveDriver && current.status === "new") {
      patch.status = "assigned";
    } else if (!willHaveDriver && current.status === "assigned") {
      patch.status = "new";
    }

    const { error } = await supabase.from("cases").update(patch).eq("id", data.caseId);
    if (error) bad(error.message, 400);

    const region =
      [current.pickup_city, current.pickup_state].filter(Boolean).join(", ") ||
      "Pickup TBD";

    // Notify the previously-assigned driver that they were removed/replaced.
    // PII minimization: push payload omits decedent name and street address.
    if (previousDriver && previousDriver !== data.driverId) {
      void sendPushToUserInternalSafe(previousDriver, {
        title: `Run ${current.case_number} reassigned`,
        body: data.driverId
          ? "This run was reassigned to another driver."
          : "You were unassigned from this run.",
        url: "/driver",
        tag: `case-${data.caseId}`,
      });
    }

    // Notify the newly-assigned driver.
    if (data.driverId && data.driverId !== previousDriver) {
      void sendPushToUserInternalSafe(data.driverId, {
        title: `New run assigned — ${current.case_number}`,
        body: `Pickup: ${region}. Open the driver app for details.`,
        url: "/driver",
        tag: `case-${data.caseId}`,
        requireInteraction: true,
      });
    }

    return { ok: true as const, status: (patch.status ?? current.status) as CaseStatus };
  });

// Inline import keeps push.server out of the assignment hot path's static
// import graph if it ever needs to live behind a flag.
async function sendPushToUserInternalSafe(
  userId: string,
  payload: { title: string; body: string; url?: string; tag?: string; requireInteraction?: boolean },
) {
  try {
    const { sendPushToUserInternal } = await import("@/lib/push.server");
    await sendPushToUserInternal(userId, payload);
  } catch (e) {
    console.error("Push failed during assignment:", e);
  }
}

// ---------- Vehicle ----------

const SetVehicleInput = z.object({
  caseId: z.string().uuid(),
  vehicleId: z.string().uuid().nullable(),
});

export const setCaseVehicle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => SetVehicleInput.parse(data))
  .handler(async ({ data, context }) => {
    await assertAnyRole(context.userId, ["admin", "dispatcher"]);
    const { error } = await context.supabase
      .from("cases")
      .update({ vehicle_id: data.vehicleId })
      .eq("id", data.caseId);
    if (error) bad(error.message, 400);
    return { ok: true as const };
  });

// ---------- Status (staff: any transition) ----------

const SetStatusInput = z.object({
  caseId: z.string().uuid(),
  status: z.enum(STATUS_VALUES),
});

export const setCaseStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => SetStatusInput.parse(data))
  .handler(async ({ data, context }) => {
    await assertAnyRole(context.userId, ["admin", "dispatcher"]);
    const { error } = await context.supabase
      .from("cases")
      .update({ status: data.status })
      .eq("id", data.caseId);
    if (error) bad(error.message, 400);
    return { ok: true as const };
  });

// ---------- Cancel (staff only) ----------

const CancelInput = z.object({
  caseId: z.string().uuid(),
  reason: z.string().min(1).max(500).optional(),
});

export const cancelCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => CancelInput.parse(data))
  .handler(async ({ data, context }) => {
    await assertAnyRole(context.userId, ["admin", "dispatcher"]);
    const { supabase, userId } = context;

    const { error } = await supabase
      .from("cases")
      .update({ status: "cancelled" })
      .eq("id", data.caseId);
    if (error) bad(error.message, 400);

    // Record reason in the timeline. Status change itself is logged by trigger.
    if (data.reason) {
      const { error: nErr } = await supabase.from("case_events").insert({
        case_id: data.caseId,
        event_type: "cancelled",
        actor_id: userId,
        notes: data.reason,
      });
      if (nErr) console.error("Failed to log cancel reason:", nErr);
    }

    return { ok: true as const };
  });

// ---------- Delete (admin only) ----------

const DeleteInput = z.object({ caseId: z.string().uuid() });

export const deleteCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => DeleteInput.parse(data))
  .handler(async ({ data, context }) => {
    await assertAnyRole(context.userId, ["admin"]);
    const { error } = await context.supabase
      .from("cases")
      .delete()
      .eq("id", data.caseId);
    if (error) bad(error.message, 400);
    return { ok: true as const };
  });

// ---------- Notes (staff) ----------

const NoteInput = z.object({
  caseId: z.string().uuid(),
  text: z.string().min(1).max(2000),
});

export const addCaseNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => NoteInput.parse(data))
  .handler(async ({ data, context }) => {
    await assertAnyRole(context.userId, ["admin", "dispatcher"]);
    const { error } = await context.supabase.from("case_events").insert({
      case_id: data.caseId,
      event_type: "note_added",
      actor_id: context.userId,
      notes: data.text,
    });
    if (error) bad(error.message, 400);
    return { ok: true as const };
  });

// ---------- Driver: advance status with optional GPS stamp ----------

const DriverAdvanceInput = z.object({
  caseId: z.string().uuid(),
  next: z.enum(STATUS_VALUES),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
});

export const driverAdvanceCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => DriverAdvanceInput.parse(data))
  .handler(async ({ data, context }) => {
    const roles = await getUserRoles(context.userId);
    if (!roles.includes("driver")) bad("Forbidden: driver role required", 403);

    const { supabase, userId } = context;

    // Confirm the case + assignment, and pre-validate the transition so the UI
    // gets a clean error instead of the raw DB trigger message.
    const { data: row, error: rErr } = await supabase
      .from("cases")
      .select("status, primary_driver_id, secondary_driver_id")
      .eq("id", data.caseId)
      .maybeSingle();
    if (rErr) bad(rErr.message, 500);
    if (!row) bad("Case not found", 404);
    if (row.primary_driver_id !== userId && row.secondary_driver_id !== userId) {
      bad("You are not assigned to this case", 403);
    }
    const expected = DRIVER_NEXT[row.status];
    if (!expected || expected !== data.next) {
      bad(
        `Cannot advance from "${STATUS_LABEL[row.status]}" to "${STATUS_LABEL[data.next]}"`,
        400,
      );
    }

    const { error } = await supabase
      .from("cases")
      .update({ status: data.next })
      .eq("id", data.caseId);
    if (error) bad(error.message, 400);

    if (data.lat != null && data.lng != null) {
      const { error: eErr } = await supabase.from("case_events").insert({
        case_id: data.caseId,
        event_type: "note_added",
        actor_id: userId,
        notes: `Driver location at ${STATUS_LABEL[data.next]}`,
        lat: data.lat,
        lng: data.lng,
      });
      if (eErr) console.error("Failed to log GPS stamp:", eErr);
    }

    return { ok: true as const };
  });

// ---------- Signatures (drivers on assigned cases + staff) ----------

const SignatureInput = z.object({
  caseId: z.string().uuid(),
  signature_type: z.enum(SIGNATURE_VALUES),
  signer_name: z.string().min(1).max(200),
  signer_title: z.string().max(200).nullable().optional(),
  // data:image/png;base64,...  — capped to roughly 1.5MB encoded.
  signature_data: z.string().min(50).max(2_000_000),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
});

export const captureCaseSignature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => SignatureInput.parse(data))
  .handler(async ({ data, context }) => {
    const roles = await getUserRoles(context.userId);
    const isStaff = roles.includes("admin") || roles.includes("dispatcher");
    const isDriver = roles.includes("driver");
    if (!isStaff && !isDriver) bad("Forbidden", 403);

    const { supabase, userId } = context;

    if (!isStaff && isDriver) {
      // Driver must be assigned to the case.
      const { data: row, error: cErr } = await supabase
        .from("cases")
        .select("primary_driver_id, secondary_driver_id")
        .eq("id", data.caseId)
        .maybeSingle();
      if (cErr) bad(cErr.message, 500);
      if (!row) bad("Case not found", 404);
      if (row.primary_driver_id !== userId && row.secondary_driver_id !== userId) {
        bad("You are not assigned to this case", 403);
      }
    }

    const { error } = await supabase.from("case_signatures").insert({
      case_id: data.caseId,
      signature_type: data.signature_type,
      signer_name: data.signer_name,
      signer_title: data.signer_title ?? null,
      signature_data: data.signature_data,
      captured_by: userId,
      lat: data.lat ?? null,
      lng: data.lng ?? null,
    });
    if (error) bad(error.message, 400);

    const { error: eErr } = await supabase.from("case_events").insert({
      case_id: data.caseId,
      event_type: "signature_captured",
      actor_id: userId,
      notes: `Signature captured: ${data.signer_name}`,
      lat: data.lat ?? null,
      lng: data.lng ?? null,
    });
    if (eErr) console.error("Failed to log signature event:", eErr);

    return { ok: true as const };
  });
