// CRM operational reports — counts, time-in-facility, monthly logs.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const input = z.object({
  organizationId: z.string().uuid(),
  monthsBack: z.number().int().min(1).max(24).optional().default(6),
});

export type CrmReports = {
  statusCounts: Record<string, number>;
  activeCount: number;
  avgTimeInFacilityHours: number | null;
  medianTimeInFacilityHours: number | null;
  activeCremations: number;
  cremationsThisMonth: number;
  releasesThisMonth: number;
  monthly: Array<{
    month: string; // YYYY-MM
    checkIns: number;
    cremations: number;
    releases: number;
  }>;
  recentReleases: Array<{
    id: string;
    released_at: string;
    item_type: string;
    released_to_name: string;
    decedent_name: string;
  }>;
};

export const getCrmReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => input.parse(d))
  .handler(async ({ data, context }): Promise<CrmReports> => {
    const { supabase } = context;
    const since = new Date();
    since.setMonth(since.getMonth() - (data.monthsBack - 1));
    since.setDate(1);
    since.setHours(0, 0, 0, 0);
    const sinceIso = since.toISOString();

    const [decedentsRes, cremRes, relRes] = await Promise.all([
      supabase
        .from("decedents")
        .select("id, status, check_in_at, check_out_at, first_name, last_name")
        .eq("organization_id", data.organizationId),
      supabase
        .from("cremation_logs")
        .select("id, start_time, end_time")
        .eq("organization_id", data.organizationId)
        .gte("start_time", sinceIso),
      supabase
        .from("decedent_releases")
        .select("id, released_at, item_type, released_to_name, decedent_id, decedents(first_name, last_name)")
        .eq("organization_id", data.organizationId)
        .gte("released_at", sinceIso)
        .order("released_at", { ascending: false }),
    ]);
    if (decedentsRes.error) throw new Error(decedentsRes.error.message);
    if (cremRes.error) throw new Error(cremRes.error.message);
    if (relRes.error) throw new Error(relRes.error.message);

    const decedents = decedentsRes.data ?? [];
    const cremations = cremRes.data ?? [];
    const releases = relRes.data ?? [];

    const statusCounts: Record<string, number> = {};
    for (const d of decedents) {
      const s = (d as any).status ?? "unknown";
      statusCounts[s] = (statusCounts[s] ?? 0) + 1;
    }
    const activeCount = decedents.filter(
      (d: any) => d.status !== "checked_out",
    ).length;

    // Time in facility (hours) for those with both timestamps
    const durations: number[] = [];
    for (const d of decedents as any[]) {
      if (d.check_in_at && d.check_out_at) {
        const ms = new Date(d.check_out_at).getTime() - new Date(d.check_in_at).getTime();
        if (ms > 0) durations.push(ms / 3_600_000);
      }
    }
    const avg = durations.length
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : null;
    const median = (() => {
      if (!durations.length) return null;
      const sorted = [...durations].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    })();

    // Monthly buckets
    const months: string[] = [];
    for (let i = 0; i < data.monthsBack; i++) {
      const d = new Date(since);
      d.setMonth(since.getMonth() + i);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    const bucket = () =>
      Object.fromEntries(months.map((m) => [m, 0])) as Record<string, number>;
    const checkIns = bucket();
    const cremDone = bucket();
    const relCount = bucket();

    const key = (iso: string) => {
      const d = new Date(iso);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    };

    for (const d of decedents as any[]) {
      if (d.check_in_at && d.check_in_at >= sinceIso) {
        const k = key(d.check_in_at);
        if (k in checkIns) checkIns[k]++;
      }
    }
    for (const c of cremations as any[]) {
      if (c.end_time) {
        const k = key(c.end_time);
        if (k in cremDone) cremDone[k]++;
      }
    }
    for (const r of releases as any[]) {
      const k = key(r.released_at);
      if (k in relCount) relCount[k]++;
    }

    const monthly = months.map((m) => ({
      month: m,
      checkIns: checkIns[m],
      cremations: cremDone[m],
      releases: relCount[m],
    }));

    const thisMonthKey = key(new Date().toISOString());
    const activeCremations = (cremations as any[]).filter((c) => !c.end_time).length;
    const cremationsThisMonth = cremDone[thisMonthKey] ?? 0;
    const releasesThisMonth = relCount[thisMonthKey] ?? 0;

    const recentReleases = (releases as any[]).slice(0, 10).map((r) => ({
      id: r.id,
      released_at: r.released_at,
      item_type: r.item_type,
      released_to_name: r.released_to_name,
      decedent_name: r.decedents
        ? `${r.decedents.last_name ?? ""}, ${r.decedents.first_name ?? ""}`.trim()
        : "—",
    }));

    return {
      statusCounts,
      activeCount,
      avgTimeInFacilityHours: avg,
      medianTimeInFacilityHours: median,
      activeCremations,
      cremationsThisMonth,
      releasesThisMonth,
      monthly,
      recentReleases,
    };
  });
