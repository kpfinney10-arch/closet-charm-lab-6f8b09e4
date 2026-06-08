// Dispatcher operational reports — counts, time-in-custody, monthly release logs.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const input = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
});

export type DispatchReports = {
  range: { from: string; to: string };
  totals: {
    cases: number;
    delivered: number;
    cancelled: number;
    inProgress: number;
  };
  statusCounts: Array<{ status: string; count: number }>;
  perDriver: Array<{ driverId: string; name: string; count: number }>;
  perPickupFacility: Array<{ facilityId: string; name: string; count: number }>;
  timeInCustody: {
    sampleSize: number;
    avgHours: number | null;
    medianHours: number | null;
    perFacility: Array<{
      facilityId: string;
      name: string;
      sampleSize: number;
      avgHours: number;
    }>;
  };
  releases: Array<{
    caseId: string;
    caseNumber: string;
    decedentName: string;
    deliveredAt: string | null;
    pickupFacility: string;
    dropoffFacility: string;
    primaryDriver: string;
    secondaryDriver: string;
    releasedAt: string | null;
    releasedBy: string;
    releasedByTitle: string;
  }>;
};

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export const getDispatchReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => input.parse(d))
  .handler(async ({ data, context }): Promise<DispatchReports> => {
    const { supabase } = context;
    const from = data.from;
    const to = data.to;

    const [casesRes, facilitiesRes, profilesRes] = await Promise.all([
      supabase
        .from("cases")
        .select(
          "id, case_number, status, decedent_first_name, decedent_last_name, pickup_facility_id, dropoff_facility_id, primary_driver_id, secondary_driver_id, created_at, updated_at",
        )
        .gte("created_at", from)
        .lte("created_at", to)
        .order("created_at", { ascending: false }),
      supabase.from("facilities").select("id, name"),
      supabase.from("profiles").select("id, full_name"),
    ]);
    if (casesRes.error) throw new Error(casesRes.error.message);
    if (facilitiesRes.error) throw new Error(facilitiesRes.error.message);
    if (profilesRes.error) throw new Error(profilesRes.error.message);

    const cases = casesRes.data ?? [];
    const facilityById = new Map(
      (facilitiesRes.data ?? []).map((f: any) => [f.id, f.name as string]),
    );
    const profileById = new Map(
      (profilesRes.data ?? []).map((p: any) => [p.id, (p.full_name as string) ?? ""]),
    );

    const caseIds = cases.map((c: any) => c.id);

    const [eventsRes, sigsRes] = await Promise.all([
      caseIds.length
        ? supabase
            .from("case_events")
            .select("case_id, to_status, created_at, event_type")
            .in("case_id", caseIds)
        : Promise.resolve({ data: [], error: null } as any),
      caseIds.length
        ? supabase
            .from("case_signatures")
            .select("case_id, signature_type, signer_name, signer_title, created_at")
            .in("case_id", caseIds)
            .in("signature_type", ["dropoff_received", "driver_delivered"])
        : Promise.resolve({ data: [], error: null } as any),
    ]);
    if (eventsRes.error) throw new Error(eventsRes.error.message);
    if (sigsRes.error) throw new Error(sigsRes.error.message);

    // Totals + status counts
    const statusMap = new Map<string, number>();
    let delivered = 0;
    let cancelled = 0;
    let inProgress = 0;
    for (const c of cases as any[]) {
      statusMap.set(c.status, (statusMap.get(c.status) ?? 0) + 1);
      if (c.status === "delivered" || c.status === "closed") delivered++;
      else if (c.status === "cancelled") cancelled++;
      else inProgress++;
    }
    const statusCounts = Array.from(statusMap.entries())
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);

    // Per driver
    const driverMap = new Map<string, number>();
    for (const c of cases as any[]) {
      if (c.primary_driver_id) {
        driverMap.set(c.primary_driver_id, (driverMap.get(c.primary_driver_id) ?? 0) + 1);
      }
    }
    const perDriver = Array.from(driverMap.entries())
      .map(([driverId, count]) => ({
        driverId,
        name: profileById.get(driverId) ?? "Unknown",
        count,
      }))
      .sort((a, b) => b.count - a.count);

    // Per pickup facility
    const pickupMap = new Map<string, number>();
    for (const c of cases as any[]) {
      if (c.pickup_facility_id) {
        pickupMap.set(c.pickup_facility_id, (pickupMap.get(c.pickup_facility_id) ?? 0) + 1);
      }
    }
    const perPickupFacility = Array.from(pickupMap.entries())
      .map(([facilityId, count]) => ({
        facilityId,
        name: facilityById.get(facilityId) ?? "Unknown",
        count,
      }))
      .sort((a, b) => b.count - a.count);

    // Time in custody: in_custody -> delivered, computed from events
    type Ev = { case_id: string; to_status: string | null; created_at: string };
    const eventsByCase = new Map<string, Ev[]>();
    for (const ev of (eventsRes.data ?? []) as Ev[]) {
      const arr = eventsByCase.get(ev.case_id) ?? [];
      arr.push(ev);
      eventsByCase.set(ev.case_id, arr);
    }
    const durations: number[] = [];
    const perFacilityDurations = new Map<string, number[]>();
    for (const c of cases as any[]) {
      const evs = (eventsByCase.get(c.id) ?? []).filter((e) => e.to_status);
      const inCustody = evs.find((e) => e.to_status === "in_custody");
      const deliveredEv = evs.find((e) => e.to_status === "delivered");
      if (!inCustody || !deliveredEv) continue;
      const hrs =
        (new Date(deliveredEv.created_at).getTime() -
          new Date(inCustody.created_at).getTime()) /
        3_600_000;
      if (hrs <= 0) continue;
      durations.push(hrs);
      if (c.pickup_facility_id) {
        const arr = perFacilityDurations.get(c.pickup_facility_id) ?? [];
        arr.push(hrs);
        perFacilityDurations.set(c.pickup_facility_id, arr);
      }
    }
    const avg = durations.length
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : null;
    const med = median(durations);
    const perFacility = Array.from(perFacilityDurations.entries())
      .map(([facilityId, arr]) => ({
        facilityId,
        name: facilityById.get(facilityId) ?? "Unknown",
        sampleSize: arr.length,
        avgHours: arr.reduce((a, b) => a + b, 0) / arr.length,
      }))
      .sort((a, b) => b.sampleSize - a.sampleSize);

    // Release log — delivered/closed cases with their dropoff_received signature
    type Sig = {
      case_id: string;
      signature_type: string;
      signer_name: string;
      signer_title: string | null;
      created_at: string;
    };
    const sigsByCase = new Map<string, Sig[]>();
    for (const s of (sigsRes.data ?? []) as Sig[]) {
      const arr = sigsByCase.get(s.case_id) ?? [];
      arr.push(s);
      sigsByCase.set(s.case_id, arr);
    }
    const releases = (cases as any[])
      .filter((c) => c.status === "delivered" || c.status === "closed")
      .map((c) => {
        const sigs = sigsByCase.get(c.id) ?? [];
        const dropoff =
          sigs.find((s) => s.signature_type === "dropoff_received") ??
          sigs.find((s) => s.signature_type === "driver_delivered");
        const evs = eventsByCase.get(c.id) ?? [];
        const deliveredEv = evs.find((e) => e.to_status === "delivered");
        const name =
          [c.decedent_first_name, c.decedent_last_name].filter(Boolean).join(" ") || "—";
        return {
          caseId: c.id as string,
          caseNumber: c.case_number as string,
          decedentName: name,
          deliveredAt: deliveredEv?.created_at ?? c.updated_at ?? null,
          pickupFacility: c.pickup_facility_id
            ? facilityById.get(c.pickup_facility_id) ?? ""
            : "",
          dropoffFacility: c.dropoff_facility_id
            ? facilityById.get(c.dropoff_facility_id) ?? ""
            : "",
          primaryDriver: c.primary_driver_id
            ? profileById.get(c.primary_driver_id) ?? ""
            : "",
          secondaryDriver: c.secondary_driver_id
            ? profileById.get(c.secondary_driver_id) ?? ""
            : "",
          releasedAt: dropoff?.created_at ?? null,
          releasedBy: dropoff?.signer_name ?? "",
          releasedByTitle: dropoff?.signer_title ?? "",
        };
      })
      .sort((a, b) =>
        (b.deliveredAt ?? "").localeCompare(a.deliveredAt ?? ""),
      );

    return {
      range: { from, to },
      totals: { cases: cases.length, delivered, cancelled, inProgress },
      statusCounts,
      perDriver,
      perPickupFacility,
      timeInCustody: {
        sampleSize: durations.length,
        avgHours: avg,
        medianHours: med,
        perFacility,
      },
      releases,
    };
  });
