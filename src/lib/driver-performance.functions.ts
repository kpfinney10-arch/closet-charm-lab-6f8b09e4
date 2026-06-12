// Per-driver performance & SLA metrics across a date range.
// Joins cases with case_events to derive timing milestones, then aggregates per driver.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const input = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
  /** Grace window (minutes) for considering a pickup on-time vs scheduled_at. */
  onTimeGraceMinutes: z.number().int().min(0).max(240).default(15),
});

export type DriverPerf = {
  driverId: string;
  name: string;
  runs: number;
  completed: number;
  /** Cases with scheduled_at + on_scene event (used as the on-time denominator). */
  scheduledRuns: number;
  onTimePickups: number;
  onTimePickupPct: number | null;
  /** Median minutes from assignment → on-scene at pickup. */
  medianTimeToPickupMin: number | null;
  /** Median minutes on-scene (on_scene → in_custody). */
  medianOnSceneMin: number | null;
  /** Median minutes from in_custody → delivered. */
  medianTransportMin: number | null;
  /** Median minutes from assignment → delivered. */
  medianTotalMin: number | null;
  /** Pickups arriving more than grace minutes after scheduled_at. */
  lateLegs: number;
};

export type DriverPerformanceResponse = {
  range: { from: string; to: string };
  graceMinutes: number;
  drivers: DriverPerf[];
};

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

const minutesBetween = (a: string | null, b: string | null) => {
  if (!a || !b) return null;
  const diff = new Date(b).getTime() - new Date(a).getTime();
  if (!Number.isFinite(diff) || diff < 0) return null;
  return diff / 60000;
};

export const getDriverPerformance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => input.parse(d))
  .handler(async ({ data, context }): Promise<DriverPerformanceResponse> => {
    const { supabase } = context;

    const [casesRes, profilesRes] = await Promise.all([
      supabase
        .from("cases")
        .select(
          "id, status, scheduled_at, primary_driver_id, secondary_driver_id, created_at",
        )
        .gte("created_at", data.from)
        .lte("created_at", data.to),
      supabase.from("profiles").select("id, full_name"),
    ]);
    if (casesRes.error) throw new Error(casesRes.error.message);
    if (profilesRes.error) throw new Error(profilesRes.error.message);

    const cases = (casesRes.data ?? []) as Array<{
      id: string;
      status: string;
      scheduled_at: string | null;
      primary_driver_id: string | null;
      secondary_driver_id: string | null;
      created_at: string;
    }>;

    const caseIds = cases.map((c) => c.id);
    let events: Array<{ case_id: string; to_status: string | null; created_at: string }> = [];
    if (caseIds.length) {
      const evRes = await supabase
        .from("case_events")
        .select("case_id, to_status, created_at")
        .in("case_id", caseIds)
        .order("created_at", { ascending: true });
      if (evRes.error) throw new Error(evRes.error.message);
      events = (evRes.data ?? []) as typeof events;
    }

    // First-occurrence timestamp per (case, status).
    const firstByCaseStatus = new Map<string, Record<string, string>>();
    for (const ev of events) {
      if (!ev.to_status) continue;
      const bucket = firstByCaseStatus.get(ev.case_id) ?? {};
      if (!(ev.to_status in bucket)) bucket[ev.to_status] = ev.created_at;
      firstByCaseStatus.set(ev.case_id, bucket);
    }

    type Acc = {
      runs: number;
      completed: number;
      scheduledRuns: number;
      onTimePickups: number;
      lateLegs: number;
      timeToPickup: number[];
      onScene: number[];
      transport: number[];
      total: number[];
    };
    const empty = (): Acc => ({
      runs: 0,
      completed: 0,
      scheduledRuns: 0,
      onTimePickups: 0,
      lateLegs: 0,
      timeToPickup: [],
      onScene: [],
      transport: [],
      total: [],
    });

    const byDriver = new Map<string, Acc>();
    const driverIdsSeen = new Set<string>();

    for (const c of cases) {
      const drivers = [c.primary_driver_id, c.secondary_driver_id].filter(
        (x): x is string => !!x,
      );
      if (drivers.length === 0) continue;
      const ev = firstByCaseStatus.get(c.id) ?? {};
      const assignedAt =
        ev.assigned ?? ev.en_route_pickup ?? c.created_at ?? null;
      const onSceneAt = ev.on_scene ?? null;
      const inCustodyAt = ev.in_custody ?? null;
      const deliveredAt = ev.delivered ?? null;

      const ttp = minutesBetween(assignedAt, onSceneAt);
      const onScene = minutesBetween(onSceneAt, inCustodyAt);
      const transport = minutesBetween(inCustodyAt, deliveredAt);
      const total = minutesBetween(assignedAt, deliveredAt);

      let onTime: boolean | null = null;
      if (c.scheduled_at && onSceneAt) {
        const late =
          new Date(onSceneAt).getTime() -
          new Date(c.scheduled_at).getTime() -
          data.onTimeGraceMinutes * 60_000;
        onTime = late <= 0;
      }

      for (const did of drivers) {
        driverIdsSeen.add(did);
        const acc = byDriver.get(did) ?? empty();
        acc.runs += 1;
        if (deliveredAt || c.status === "delivered" || c.status === "released") {
          acc.completed += 1;
        }
        if (ttp != null) acc.timeToPickup.push(ttp);
        if (onScene != null) acc.onScene.push(onScene);
        if (transport != null) acc.transport.push(transport);
        if (total != null) acc.total.push(total);
        if (onTime != null) {
          acc.scheduledRuns += 1;
          if (onTime) acc.onTimePickups += 1;
          else acc.lateLegs += 1;
        }
        byDriver.set(did, acc);
      }
    }

    const nameById = new Map<string, string>(
      ((profilesRes.data ?? []) as Array<{ id: string; full_name: string | null }>).map(
        (p) => [p.id, p.full_name ?? ""],
      ),
    );

    const drivers: DriverPerf[] = Array.from(driverIdsSeen).map((id) => {
      const a = byDriver.get(id)!;
      return {
        driverId: id,
        name: nameById.get(id) || "—",
        runs: a.runs,
        completed: a.completed,
        scheduledRuns: a.scheduledRuns,
        onTimePickups: a.onTimePickups,
        onTimePickupPct:
          a.scheduledRuns > 0 ? (a.onTimePickups / a.scheduledRuns) * 100 : null,
        medianTimeToPickupMin: median(a.timeToPickup),
        medianOnSceneMin: median(a.onScene),
        medianTransportMin: median(a.transport),
        medianTotalMin: median(a.total),
        lateLegs: a.lateLegs,
      };
    });

    drivers.sort((a, b) => b.runs - a.runs || a.name.localeCompare(b.name));

    return {
      range: { from: data.from, to: data.to },
      graceMinutes: data.onTimeGraceMinutes,
      drivers,
    };
  });

// ─────────────────────────────────────────────────────────────────────────────
// Driver drill-down: per-case timelines for one driver within a date range.
// ─────────────────────────────────────────────────────────────────────────────

const drillInput = z.object({
  driverId: z.string().uuid(),
  from: z.string().datetime(),
  to: z.string().datetime(),
  onTimeGraceMinutes: z.number().int().min(0).max(240).default(15),
});

export type DriverCaseTimeline = {
  id: string;
  caseNumber: string;
  status: string;
  decedentName: string;
  role: "primary" | "secondary";
  scheduledAt: string | null;
  assignedAt: string | null;
  enRoutePickupAt: string | null;
  onSceneAt: string | null;
  inCustodyAt: string | null;
  enRouteDropoffAt: string | null;
  deliveredAt: string | null;
  /** Minutes on-scene was late vs scheduled_at + grace (null when not measurable). */
  lateByMinutes: number | null;
  isLate: boolean;
  /** Minutes from in_custody → delivered, when both present. */
  transportMin: number | null;
  /** Minutes from assignment → delivered, when both present. */
  totalMin: number | null;
};

export type DriverDrillDownResponse = {
  driverId: string;
  range: { from: string; to: string };
  graceMinutes: number;
  cases: DriverCaseTimeline[];
};

export const getDriverDrillDown = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => drillInput.parse(d))
  .handler(async ({ data, context }): Promise<DriverDrillDownResponse> => {
    const { supabase } = context;

    const casesRes = await supabase
      .from("cases")
      .select(
        "id, case_number, status, scheduled_at, primary_driver_id, secondary_driver_id, decedent_first_name, decedent_last_name, created_at",
      )
      .gte("created_at", data.from)
      .lte("created_at", data.to)
      .or(
        `primary_driver_id.eq.${data.driverId},secondary_driver_id.eq.${data.driverId}`,
      )
      .order("created_at", { ascending: false });
    if (casesRes.error) throw new Error(casesRes.error.message);

    const cases = (casesRes.data ?? []) as Array<{
      id: string;
      case_number: string;
      status: string;
      scheduled_at: string | null;
      primary_driver_id: string | null;
      secondary_driver_id: string | null;
      decedent_first_name: string | null;
      decedent_last_name: string | null;
      created_at: string;
    }>;

    const ids = cases.map((c) => c.id);
    let events: Array<{ case_id: string; to_status: string | null; created_at: string }> = [];
    if (ids.length) {
      const ev = await supabase
        .from("case_events")
        .select("case_id, to_status, created_at")
        .in("case_id", ids)
        .order("created_at", { ascending: true });
      if (ev.error) throw new Error(ev.error.message);
      events = (ev.data ?? []) as typeof events;
    }

    const firstByCaseStatus = new Map<string, Record<string, string>>();
    for (const e of events) {
      if (!e.to_status) continue;
      const b = firstByCaseStatus.get(e.case_id) ?? {};
      if (!(e.to_status in b)) b[e.to_status] = e.created_at;
      firstByCaseStatus.set(e.case_id, b);
    }

    const rows: DriverCaseTimeline[] = cases.map((c) => {
      const ev = firstByCaseStatus.get(c.id) ?? {};
      const assignedAt = ev.assigned ?? ev.en_route_pickup ?? c.created_at ?? null;
      const onSceneAt = ev.on_scene ?? null;
      const inCustodyAt = ev.in_custody ?? null;
      const deliveredAt = ev.delivered ?? null;

      let lateByMinutes: number | null = null;
      let isLate = false;
      if (c.scheduled_at && onSceneAt) {
        const diffMs =
          new Date(onSceneAt).getTime() -
          new Date(c.scheduled_at).getTime() -
          data.onTimeGraceMinutes * 60_000;
        lateByMinutes = diffMs / 60_000;
        isLate = diffMs > 0;
      }

      return {
        id: c.id,
        caseNumber: c.case_number,
        status: c.status,
        decedentName:
          [c.decedent_first_name, c.decedent_last_name].filter(Boolean).join(" ") || "—",
        role: c.primary_driver_id === data.driverId ? "primary" : "secondary",
        scheduledAt: c.scheduled_at,
        assignedAt,
        enRoutePickupAt: ev.en_route_pickup ?? null,
        onSceneAt,
        inCustodyAt,
        enRouteDropoffAt: ev.en_route_dropoff ?? null,
        deliveredAt,
        lateByMinutes,
        isLate,
        transportMin: minutesBetween(inCustodyAt, deliveredAt),
        totalMin: minutesBetween(assignedAt, deliveredAt),
      };
    });

    return {
      driverId: data.driverId,
      range: { from: data.from, to: data.to },
      graceMinutes: data.onTimeGraceMinutes,
      cases: rows,
    };
  });
