// Dispatcher operational reports — returns per-case rows so the client
// can re-aggregate based on UI filters (status, driver, pickup facility).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const input = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
});

export type DispatchCaseRow = {
  id: string;
  caseNumber: string;
  status: string;
  decedentName: string;
  primaryDriverId: string | null;
  secondaryDriverId: string | null;
  pickupFacilityId: string | null;
  dropoffFacilityId: string | null;
  inCustodyAt: string | null;
  deliveredAt: string | null;
  releasedAt: string | null;
  releasedBy: string;
  releasedByTitle: string;
  createdAt: string;
};

export type DispatchReports = {
  range: { from: string; to: string };
  facilities: Array<{ id: string; name: string }>;
  drivers: Array<{ id: string; name: string }>;
  cases: DispatchCaseRow[];
};

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
    const facilities = (facilitiesRes.data ?? []).map((f: any) => ({
      id: f.id as string,
      name: (f.name as string) ?? "",
    }));
    const drivers = (profilesRes.data ?? []).map((p: any) => ({
      id: p.id as string,
      name: (p.full_name as string) ?? "",
    }));

    const caseIds = cases.map((c: any) => c.id);

    const [eventsRes, sigsRes] = await Promise.all([
      caseIds.length
        ? supabase
            .from("case_events")
            .select("case_id, to_status, created_at")
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

    type Ev = { case_id: string; to_status: string | null; created_at: string };
    const eventsByCase = new Map<string, Ev[]>();
    for (const ev of (eventsRes.data ?? []) as Ev[]) {
      const arr = eventsByCase.get(ev.case_id) ?? [];
      arr.push(ev);
      eventsByCase.set(ev.case_id, arr);
    }

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

    const rows: DispatchCaseRow[] = (cases as any[]).map((c) => {
      const evs = eventsByCase.get(c.id) ?? [];
      const inCustody = evs.find((e) => e.to_status === "in_custody");
      const deliveredEv = evs.find((e) => e.to_status === "delivered");
      const sigs = sigsByCase.get(c.id) ?? [];
      const dropoff =
        sigs.find((s) => s.signature_type === "dropoff_received") ??
        sigs.find((s) => s.signature_type === "driver_delivered");
      const decedentName =
        [c.decedent_first_name, c.decedent_last_name].filter(Boolean).join(" ") || "—";
      return {
        id: c.id,
        caseNumber: c.case_number,
        status: c.status,
        decedentName,
        primaryDriverId: c.primary_driver_id ?? null,
        secondaryDriverId: c.secondary_driver_id ?? null,
        pickupFacilityId: c.pickup_facility_id ?? null,
        dropoffFacilityId: c.dropoff_facility_id ?? null,
        inCustodyAt: inCustody?.created_at ?? null,
        deliveredAt: deliveredEv?.created_at ?? null,
        releasedAt: dropoff?.created_at ?? null,
        releasedBy: dropoff?.signer_name ?? "",
        releasedByTitle: dropoff?.signer_title ?? "",
        createdAt: c.created_at,
      };
    });

    return {
      range: { from, to },
      facilities,
      drivers,
      cases: rows,
    };
  });
