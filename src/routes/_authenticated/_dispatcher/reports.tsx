import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  Download,
  ClipboardList,
  Truck,
  Timer,
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
import { getDispatchReports, type DispatchReports } from "@/lib/dispatch-reports.functions";

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
});

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

function ReportsPage() {
  const { from, to } = Route.useSearch();
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

  const exportCounts = () => {
    if (!data) return;
    downloadCsv(`status-counts-${from}_to_${to}.csv`, [
      ["status", "count"],
      ...data.statusCounts.map((r) => [STATUS_LABEL[r.status] ?? r.status, r.count]),
    ]);
  };
  const exportDrivers = () => {
    if (!data) return;
    downloadCsv(`runs-per-driver-${from}_to_${to}.csv`, [
      ["driver", "runs"],
      ...data.perDriver.map((r) => [r.name, r.count]),
    ]);
  };
  const exportFacilities = () => {
    if (!data) return;
    downloadCsv(`runs-per-pickup-facility-${from}_to_${to}.csv`, [
      ["facility", "runs"],
      ...data.perPickupFacility.map((r) => [r.name, r.count]),
    ]);
  };
  const exportTimeInCustody = () => {
    if (!data) return;
    downloadCsv(`time-in-custody-${from}_to_${to}.csv`, [
      ["pickup_facility", "sample_size", "avg_hours"],
      ...data.timeInCustody.perFacility.map((r) => [
        r.name,
        r.sampleSize,
        r.avgHours.toFixed(2),
      ]),
    ]);
  };
  const exportReleases = () => {
    if (!data) return;
    downloadCsv(`release-log-${from}_to_${to}.csv`, [
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
      ...data.releases.map((r) => [
        r.caseNumber,
        r.decedentName,
        r.deliveredAt ?? "",
        r.pickupFacility,
        r.dropoffFacility,
        r.primaryDriver,
        r.secondaryDriver,
        r.releasedAt ?? "",
        r.releasedBy,
        r.releasedByTitle,
      ]),
    ]);
  };

  const setRange = (next: { from?: string; to?: string }) => {
    navigate({ search: (prev: { from: string; to: string }) => ({ ...prev, ...next }) });
  };

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

  const statusChart =
    data?.statusCounts.map((r) => ({
      status: STATUS_LABEL[r.status] ?? r.status,
      count: r.count,
    })) ?? [];

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
            <Label htmlFor="from" className="text-xs">
              From
            </Label>
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
            <Label htmlFor="to" className="text-xs">
              To
            </Label>
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
            <Button variant="outline" size="sm" onClick={() => setPreset(7)}>
              7d
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPreset(30)}>
              30d
            </Button>
            <Button variant="outline" size="sm" onClick={setThisMonth}>
              This month
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPreset(90)}>
              90d
            </Button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          icon={ClipboardList}
          label="Cases in range"
          value={data?.totals.cases ?? 0}
          loading={loading}
        />
        <Stat
          icon={CheckCircle2}
          label="Delivered"
          value={data?.totals.delivered ?? 0}
          loading={loading}
        />
        <Stat
          icon={Activity}
          label="In progress"
          value={data?.totals.inProgress ?? 0}
          loading={loading}
        />
        <Stat
          icon={XCircle}
          label="Cancelled"
          value={data?.totals.cancelled ?? 0}
          loading={loading}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Cases by status chart */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Cases by status</CardTitle>
            <Button
              size="sm"
              variant="ghost"
              onClick={exportCounts}
              disabled={!data || data.statusCounts.length === 0}
            >
              <Download className="h-4 w-4" />
              CSV
            </Button>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : statusChart.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No cases in this range.
              </p>
            ) : (
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={statusChart}
                    margin={{ left: -16, right: 8, top: 8, bottom: 24 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis
                      dataKey="status"
                      angle={-30}
                      textAnchor="end"
                      height={60}
                      tick={{ fontSize: 11 }}
                    />
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
            <Button
              size="sm"
              variant="ghost"
              onClick={exportTimeInCustody}
              disabled={!data || data.timeInCustody.perFacility.length === 0}
            >
              <Download className="h-4 w-4" />
              CSV
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              <Mini label="Samples" value={data?.timeInCustody.sampleSize ?? 0} />
              <Mini
                label="Avg hours"
                value={
                  data?.timeInCustody.avgHours == null
                    ? "—"
                    : data.timeInCustody.avgHours.toFixed(1)
                }
              />
              <Mini
                label="Median hours"
                value={
                  data?.timeInCustody.medianHours == null
                    ? "—"
                    : data.timeInCustody.medianHours.toFixed(1)
                }
              />
            </div>
            <div className="text-xs text-muted-foreground">
              Measured from in-custody event to delivered event.
            </div>
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : (data?.timeInCustody.perFacility.length ?? 0) === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No completed custody-to-delivery cycles in this range.
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
                    {data!.timeInCustody.perFacility.map((r) => (
                      <tr key={r.facilityId}>
                        <td className="py-2">{r.name}</td>
                        <td className="py-2 text-right tabular-nums">{r.sampleSize}</td>
                        <td className="py-2 text-right tabular-nums">
                          {r.avgHours.toFixed(1)}
                        </td>
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
            <Button
              size="sm"
              variant="ghost"
              onClick={exportDrivers}
              disabled={!data || data.perDriver.length === 0}
            >
              <Download className="h-4 w-4" />
              CSV
            </Button>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : (data?.perDriver.length ?? 0) === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No driver-assigned runs in this range.
              </p>
            ) : (
              <ul className="divide-y">
                {data!.perDriver.map((r) => (
                  <li
                    key={r.driverId}
                    className="flex items-center justify-between py-2 text-sm"
                  >
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
            <Button
              size="sm"
              variant="ghost"
              onClick={exportFacilities}
              disabled={!data || data.perPickupFacility.length === 0}
            >
              <Download className="h-4 w-4" />
              CSV
            </Button>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : (data?.perPickupFacility.length ?? 0) === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No pickup facilities recorded in this range.
              </p>
            ) : (
              <ul className="divide-y">
                {data!.perPickupFacility.map((r) => (
                  <li
                    key={r.facilityId}
                    className="flex items-center justify-between py-2 text-sm"
                  >
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
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={exportReleases}
            disabled={!data || data.releases.length === 0}
          >
            <Download className="h-4 w-4" />
            Download CSV
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : (data?.releases.length ?? 0) === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No deliveries in this range.
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
                  {data!.releases.map((r) => (
                    <tr key={r.caseId}>
                      <td className="px-2 py-2 font-mono text-xs">{r.caseNumber}</td>
                      <td className="px-2 py-2">{r.decedentName}</td>
                      <td className="px-2 py-2 whitespace-nowrap">
                        {fmtDateTime(r.deliveredAt)}
                      </td>
                      <td className="px-2 py-2">{r.pickupFacility || "—"}</td>
                      <td className="px-2 py-2">{r.dropoffFacility || "—"}</td>
                      <td className="px-2 py-2">{r.primaryDriver || "—"}</td>
                      <td className="px-2 py-2">
                        {r.releasedBy ? (
                          <>
                            <div>{r.releasedBy}</div>
                            {r.releasedByTitle && (
                              <div className="text-xs text-muted-foreground">
                                {r.releasedByTitle}
                              </div>
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
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
