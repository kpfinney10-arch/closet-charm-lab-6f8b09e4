import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Loader2,
  Download,
  ClipboardList,
  CheckCircle2,
  XCircle,
  Activity,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  getDispatchReports,
  type DispatchCaseRow,
  type DispatchReports,
} from "@/lib/dispatch-reports.functions";

const STATUS_LABEL: Record<string, string> = {
  new: "New",
  assigned: "Assigned",
  en_route_pickup: "En route pickup",
  on_scene: "On scene",
  in_custody: "In custody",
  en_route_dropoff: "En route dropoff",
  delivered: "Delivered",
  closed: "Closed",
  cancelled: "Cancelled",
};

const ALL_STATUSES = [
  "new",
  "assigned",
  "en_route_pickup",
  "on_scene",
  "in_custody",
  "en_route_dropoff",
  "delivered",
  "closed",
  "cancelled",
] as const;

function isoStart(d: string) {
  return new Date(`${d}T00:00:00`).toISOString();
}
function isoEnd(d: string) {
  return new Date(`${d}T23:59:59.999`).toISOString();
}
function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}
function defaultFrom() {
  const d = new Date();
  d.setDate(d.getDate() - 29);
  return ymd(d);
}
function defaultTo() {
  return ymd(new Date());
}

const searchSchema = z.object({
  from: fallback(z.string(), defaultFrom()).default(defaultFrom()),
  to: fallback(z.string(), defaultTo()).default(defaultTo()),
  q: fallback(z.string(), "").default(""),
  status: fallback(z.string(), "").default(""),
  driver: fallback(z.string(), "").default(""),
  pickup: fallback(z.string(), "").default(""),
});
type ReportsSearch = z.infer<typeof searchSchema>;

export const Route = createFileRoute("/_authenticated/_dispatcher/reports")({
  validateSearch: zodValidator(searchSchema),
  component: ReportsPage,
  head: () => ({
    meta: [
      { title: "Reports — Transport Dispatch" },
      {
        name: "description",
        content:
          "Operational reports: counts, time-in-custody, and monthly release logs.",
      },
    ],
  }),
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive">
      Could not load reports: {error.message}
    </div>
  ),
  notFoundComponent: () => <div className="p-6 text-sm">Reports not found.</div>,
});

function fmtDateTime(s: string | null | undefined) {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString();
  } catch {
    return s;
  }
}

function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  const csv = rows
    .map((r) =>
      r
        .map((cell) => {
          const v = String(cell ?? "");
          return /[",\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v;
        })
        .join(","),
    )
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function ReportsPage() {
  const { from, to, q, status, driver, pickup } = Route.useSearch();
  const navigate = useNavigate({ from: "/reports" });
  const fetchReports = useServerFn(getDispatchReports);

  const fromIso = useMemo(() => isoStart(from), [from]);
  const toIso = useMemo(() => isoEnd(to), [to]);

  const reportsQ = useQuery({
    queryKey: ["dispatch-reports", fromIso, toIso],
    queryFn: () => fetchReports({ data: { from: fromIso, to: toIso } }),
  });

  const data = reportsQ.data as DispatchReports | undefined;
  const loading = reportsQ.isLoading;

  const facilityById = useMemo(() => {
    const m = new Map<string, string>();
    (data?.facilities ?? []).forEach((f) => m.set(f.id, f.name));
    return m;
  }, [data]);
  const driverById = useMemo(() => {
    const m = new Map<string, string>();
    (data?.drivers ?? []).forEach((d) => m.set(d.id, d.name));
    return m;
  }, [data]);

  // Apply filters to per-case rows; all aggregates derive from this list.
  const filteredCases = useMemo<DispatchCaseRow[]>(() => {
    const rows = data?.cases ?? [];
    const needle = q.trim().toLowerCase();
    return rows.filter((c) => {
      if (status && c.status !== status) return false;
      if (driver && c.primaryDriverId !== driver && c.secondaryDriverId !== driver)
        return false;
      if (pickup && c.pickupFacilityId !== pickup) return false;
      if (needle) {
        const hay = [
          c.caseNumber,
          c.decedentName,
          c.releasedBy,
          c.releasedByTitle,
          facilityById.get(c.pickupFacilityId ?? "") ?? "",
          facilityById.get(c.dropoffFacilityId ?? "") ?? "",
          driverById.get(c.primaryDriverId ?? "") ?? "",
          driverById.get(c.secondaryDriverId ?? "") ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [data, q, status, driver, pickup, facilityById, driverById]);

  const filtersActive = Boolean(q || status || driver || pickup);

  // Totals
  const totals = useMemo(() => {
    let delivered = 0;
    let cancelled = 0;
    let inProgress = 0;
    for (const c of filteredCases) {
      if (c.status === "delivered" || c.status === "closed") delivered++;
      else if (c.status === "cancelled") cancelled++;
      else inProgress++;
    }
    return { total: filteredCases.length, delivered, cancelled, inProgress };
  }, [filteredCases]);

  // Status counts (in canonical order; only non-zero buckets shown)
  const statusCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of filteredCases) map.set(c.status, (map.get(c.status) ?? 0) + 1);
    return ALL_STATUSES.filter((s) => (map.get(s) ?? 0) > 0).map((s) => ({
      status: s,
      label: STATUS_LABEL[s] ?? s,
      count: map.get(s) ?? 0,
    }));
  }, [filteredCases]);

  // Runs per driver
  const perDriver = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of filteredCases) {
      if (c.primaryDriverId) {
        map.set(c.primaryDriverId, (map.get(c.primaryDriverId) ?? 0) + 1);
      }
    }
    return Array.from(map.entries())
      .map(([driverId, count]) => ({
        driverId,
        name: driverById.get(driverId) || "Unknown",
        count,
      }))
      .sort((a, b) => b.count - a.count);
  }, [filteredCases, driverById]);

  // Runs per pickup facility
  const perPickupFacility = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of filteredCases) {
      if (c.pickupFacilityId) {
        map.set(c.pickupFacilityId, (map.get(c.pickupFacilityId) ?? 0) + 1);
      }
    }
    return Array.from(map.entries())
      .map(([facilityId, count]) => ({
        facilityId,
        name: facilityById.get(facilityId) || "Unknown",
        count,
      }))
      .sort((a, b) => b.count - a.count);
  }, [filteredCases, facilityById]);

  // Time in custody
  const timeInCustody = useMemo(() => {
    const durations: number[] = [];
    const perFacility = new Map<string, number[]>();
    for (const c of filteredCases) {
      if (!c.inCustodyAt || !c.deliveredAt) continue;
      const hrs =
        (new Date(c.deliveredAt).getTime() - new Date(c.inCustodyAt).getTime()) /
        3_600_000;
      if (hrs <= 0) continue;
      durations.push(hrs);
      if (c.pickupFacilityId) {
        const arr = perFacility.get(c.pickupFacilityId) ?? [];
        arr.push(hrs);
        perFacility.set(c.pickupFacilityId, arr);
      }
    }
    const avg = durations.length
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : null;
    return {
      sampleSize: durations.length,
      avgHours: avg,
      medianHours: median(durations),
      perFacility: Array.from(perFacility.entries())
        .map(([facilityId, arr]) => ({
          facilityId,
          name: facilityById.get(facilityId) || "Unknown",
          sampleSize: arr.length,
          avgHours: arr.reduce((a, b) => a + b, 0) / arr.length,
        }))
        .sort((a, b) => b.sampleSize - a.sampleSize),
    };
  }, [filteredCases, facilityById]);

  // Release log = filtered cases that are delivered/closed
  const releases = useMemo(
    () =>
      filteredCases
        .filter((c) => c.status === "delivered" || c.status === "closed")
        .sort((a, b) => (b.deliveredAt ?? "").localeCompare(a.deliveredAt ?? "")),
    [filteredCases],
  );

  const fileSuffix = `${from}_to_${to}${filtersActive ? "-filtered" : ""}`;

  const exportCounts = () => {
    if (!statusCounts.length) return;
    downloadCsv(`status-counts-${fileSuffix}.csv`, [
      ["status", "count"],
      ...statusCounts.map((r) => [r.label, r.count]),
    ]);
  };
  const exportDrivers = () => {
    if (!perDriver.length) return;
    downloadCsv(`runs-per-driver-${fileSuffix}.csv`, [
      ["driver", "runs"],
      ...perDriver.map((r) => [r.name, r.count]),
    ]);
  };
  const exportFacilities = () => {
    if (!perPickupFacility.length) return;
    downloadCsv(`runs-per-pickup-facility-${fileSuffix}.csv`, [
      ["facility", "runs"],
      ...perPickupFacility.map((r) => [r.name, r.count]),
    ]);
  };
  const exportTimeInCustody = () => {
    if (!timeInCustody.perFacility.length) return;
    downloadCsv(`time-in-custody-${fileSuffix}.csv`, [
      ["pickup_facility", "sample_size", "avg_hours"],
      ...timeInCustody.perFacility.map((r) => [
        r.name,
        r.sampleSize,
        r.avgHours.toFixed(2),
      ]),
    ]);
  };
  const exportReleases = () => {
    if (!releases.length) return;
    downloadCsv(`release-log-${fileSuffix}.csv`, [
      [
        "case_number",
        "decedent",
        "delivered_at",
        "pickup_facility",
        "dropoff_facility",
        "primary_driver",
        "secondary_driver",
        "released_at",
        "released_by",
        "released_by_title",
      ],
      ...releases.map((r) => [
        r.caseNumber,
        r.decedentName,
        r.deliveredAt ?? "",
        facilityById.get(r.pickupFacilityId ?? "") ?? "",
        facilityById.get(r.dropoffFacilityId ?? "") ?? "",
        driverById.get(r.primaryDriverId ?? "") ?? "",
        driverById.get(r.secondaryDriverId ?? "") ?? "",
        r.releasedAt ?? "",
        r.releasedBy,
        r.releasedByTitle,
      ]),
    ]);
  };

  const updateSearch = (next: Partial<ReportsSearch>) => {
    navigate({ search: (prev: ReportsSearch) => ({ ...prev, ...next }) });
  };
  const setRange = (next: { from?: string; to?: string }) => updateSearch(next);
  const setPreset = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - (days - 1));
    setRange({ from: ymd(start), to: ymd(end) });
  };
  const setThisMonth = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    setRange({ from: ymd(start), to: ymd(now) });
  };
  const clearFilters = () =>
    updateSearch({ q: "", status: "", driver: "", pickup: "" });

  // Driver/facility options (use full lists from server so filters work even
  // when a driver/facility has no runs in the current selection).
  const driverOptions = data?.drivers ?? [];
  const facilityOptions = data?.facilities ?? [];

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Reports</h1>
          <p className="text-sm text-muted-foreground">
            Operational counts, time-in-custody, and release logs.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="from" className="text-xs">From</Label>
            <Input
              id="from"
              type="date"
              value={from}
              max={to}
              onChange={(e) => setRange({ from: e.target.value })}
              className="h-9 w-[160px]"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="to" className="text-xs">To</Label>
            <Input
              id="to"
              type="date"
              value={to}
              min={from}
              onChange={(e) => setRange({ to: e.target.value })}
              className="h-9 w-[160px]"
            />
          </div>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" onClick={() => setPreset(7)}>7d</Button>
            <Button variant="outline" size="sm" onClick={() => setPreset(30)}>30d</Button>
            <Button variant="outline" size="sm" onClick={setThisMonth}>This month</Button>
            <Button variant="outline" size="sm" onClick={() => setPreset(90)}>90d</Button>
          </div>
        </div>
      </div>

      {/* Global filters — apply to ALL aggregates and CSV exports */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-2 p-4">
          <div className="space-y-1">
            <Label htmlFor="f-q" className="text-xs">Search</Label>
            <Input
              id="f-q"
              value={q}
              onChange={(e) => updateSearch({ q: e.target.value })}
              placeholder="Case #, decedent, released to…"
              className="h-9 w-[240px]"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="f-status" className="text-xs">Status</Label>
            <select
              id="f-status"
              value={status}
              onChange={(e) => updateSearch({ status: e.target.value })}
              className="h-9 w-[180px] rounded-md border bg-background px-2 text-sm"
            >
              <option value="">All statuses</option>
              {ALL_STATUSES.map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="f-driver" className="text-xs">Driver</Label>
            <select
              id="f-driver"
              value={driver}
              onChange={(e) => updateSearch({ driver: e.target.value })}
              className="h-9 w-[200px] rounded-md border bg-background px-2 text-sm"
            >
              <option value="">All drivers</option>
              {driverOptions.map((d) => (
                <option key={d.id} value={d.id}>{d.name || "Unnamed"}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="f-pickup" className="text-xs">Pickup facility</Label>
            <select
              id="f-pickup"
              value={pickup}
              onChange={(e) => updateSearch({ pickup: e.target.value })}
              className="h-9 w-[220px] rounded-md border bg-background px-2 text-sm"
            >
              <option value="">All facilities</option>
              {facilityOptions.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>
          {filtersActive && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
          {filtersActive && (
            <span className="ml-auto text-xs text-muted-foreground">
              Filters apply to all charts, tables, and CSV exports below.
            </span>
          )}
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat icon={ClipboardList} label={filtersActive ? "Cases (filtered)" : "Cases in range"} value={totals.total} loading={loading} />
        <Stat icon={CheckCircle2} label="Delivered" value={totals.delivered} loading={loading} />
        <Stat icon={Activity} label="In progress" value={totals.inProgress} loading={loading} />
        <Stat icon={XCircle} label="Cancelled" value={totals.cancelled} loading={loading} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Cases by status */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Cases by status</CardTitle>
            <Button size="sm" variant="ghost" onClick={exportCounts} disabled={statusCounts.length === 0}>
              <Download className="h-4 w-4" />
              CSV
            </Button>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : statusCounts.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No cases match the current selection.
              </p>
            ) : (
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={statusCounts} margin={{ left: -16, right: 8, top: 8, bottom: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="label" angle={-30} textAnchor="end" height={60} tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 6,
                        fontSize: 12,
                      }}
                    />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Time in custody */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Time in custody</CardTitle>
            <Button size="sm" variant="ghost" onClick={exportTimeInCustody} disabled={timeInCustody.perFacility.length === 0}>
              <Download className="h-4 w-4" />
              CSV
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              <Mini label="Samples" value={timeInCustody.sampleSize} />
              <Mini label="Avg hours" value={timeInCustody.avgHours == null ? "—" : timeInCustody.avgHours.toFixed(1)} />
              <Mini label="Median hours" value={timeInCustody.medianHours == null ? "—" : timeInCustody.medianHours.toFixed(1)} />
            </div>
            <div className="text-xs text-muted-foreground">
              Measured from in-custody event to delivered event.
            </div>
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : timeInCustody.perFacility.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No completed custody-to-delivery cycles in this selection.
              </p>
            ) : (
              <div className="max-h-60 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr className="border-b">
                      <th className="py-2 text-left font-medium">Pickup facility</th>
                      <th className="py-2 text-right font-medium">Samples</th>
                      <th className="py-2 text-right font-medium">Avg hrs</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {timeInCustody.perFacility.map((r) => (
                      <tr key={r.facilityId}>
                        <td className="py-2">{r.name}</td>
                        <td className="py-2 text-right tabular-nums">{r.sampleSize}</td>
                        <td className="py-2 text-right tabular-nums">{r.avgHours.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Runs per driver */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Runs per driver</CardTitle>
            <Button size="sm" variant="ghost" onClick={exportDrivers} disabled={perDriver.length === 0}>
              <Download className="h-4 w-4" />
              CSV
            </Button>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : perDriver.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No driver-assigned runs in this selection.
              </p>
            ) : (
              <ul className="divide-y">
                {perDriver.map((r) => (
                  <li key={r.driverId} className="flex items-center justify-between py-2 text-sm">
                    <span className="font-medium">{r.name}</span>
                    <span className="tabular-nums text-muted-foreground">{r.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Runs per pickup facility */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Runs per pickup facility</CardTitle>
            <Button size="sm" variant="ghost" onClick={exportFacilities} disabled={perPickupFacility.length === 0}>
              <Download className="h-4 w-4" />
              CSV
            </Button>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : perPickupFacility.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No pickup facilities recorded in this selection.
              </p>
            ) : (
              <ul className="divide-y">
                {perPickupFacility.map((r) => (
                  <li key={r.facilityId} className="flex items-center justify-between py-2 text-sm">
                    <span className="font-medium">{r.name}</span>
                    <span className="tabular-nums text-muted-foreground">{r.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Release log */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Release log</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Delivered cases with chain-of-custody release details.
              {filtersActive && <> Showing {releases.length} delivery records.</>}
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={exportReleases} disabled={releases.length === 0}>
            <Download className="h-4 w-4" />
            {filtersActive ? "Download filtered CSV" : "Download CSV"}
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : releases.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No deliveries in this selection.
            </p>
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th className="px-2 py-2 text-left font-medium">Case #</th>
                    <th className="px-2 py-2 text-left font-medium">Decedent</th>
                    <th className="px-2 py-2 text-left font-medium">Delivered</th>
                    <th className="px-2 py-2 text-left font-medium">Pickup</th>
                    <th className="px-2 py-2 text-left font-medium">Dropoff</th>
                    <th className="px-2 py-2 text-left font-medium">Driver</th>
                    <th className="px-2 py-2 text-left font-medium">Released to</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {releases.map((r) => (
                    <tr key={r.id}>
                      <td className="px-2 py-2 font-mono text-xs">{r.caseNumber}</td>
                      <td className="px-2 py-2">{r.decedentName}</td>
                      <td className="px-2 py-2 whitespace-nowrap">{fmtDateTime(r.deliveredAt)}</td>
                      <td className="px-2 py-2">
                        {facilityById.get(r.pickupFacilityId ?? "") || "—"}
                      </td>
                      <td className="px-2 py-2">
                        {facilityById.get(r.dropoffFacilityId ?? "") || "—"}
                      </td>
                      <td className="px-2 py-2">
                        {driverById.get(r.primaryDriverId ?? "") || "—"}
                      </td>
                      <td className="px-2 py-2">
                        {r.releasedBy ? (
                          <>
                            <div>{r.releasedBy}</div>
                            {r.releasedByTitle && (
                              <div className="text-xs text-muted-foreground">{r.releasedByTitle}</div>
                            )}
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  loading,
}: {
  icon: typeof ClipboardList;
  label: string;
  value: number | string;
  loading: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-2xl font-semibold tabular-nums">
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : value}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Mini({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md border bg-muted/30 p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
