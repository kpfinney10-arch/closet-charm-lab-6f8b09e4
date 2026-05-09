import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Download, ClipboardList, Truck, Timer, CheckCircle2 } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/_dispatcher/reports")({
  component: ReportsPage,
  head: () => ({
    meta: [
      { title: "Reports — Transport Dispatch" },
      { name: "description", content: "Operational reports: cases by status, time-to-delivery, runs per driver." },
    ],
  }),
});

type CaseRow = Database["public"]["Tables"]["cases"]["Row"];
type CaseStatus = Database["public"]["Enums"]["case_status"];

const STATUS_LABEL: Record<CaseStatus, string> = {
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

const ALL_STATUSES: CaseStatus[] = [
  "new",
  "assigned",
  "en_route_pickup",
  "on_scene",
  "in_custody",
  "en_route_dropoff",
  "delivered",
  "closed",
  "cancelled",
];

function startOfWeek(d = new Date()) {
  const x = new Date(d);
  const day = x.getDay(); // 0 = Sun
  const diff = (day + 6) % 7; // make Monday start
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - diff);
  return x;
}

function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function ReportsPage() {
  const weekStart = useMemo(() => startOfWeek(), []);
  const monthStart = useMemo(() => startOfMonth(), []);

  const casesQ = useQuery({
    queryKey: ["reports", "cases-30d"],
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const { data, error } = await supabase
        .from("cases")
        .select("*")
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CaseRow[];
    },
  });

  const driversQ = useQuery({
    queryKey: ["reports", "drivers"],
    queryFn: async () => {
      const { data: roleRows, error } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "driver");
      if (error) throw error;
      const ids = (roleRows ?? []).map((r) => r.user_id);
      if (ids.length === 0) return [] as { id: string; full_name: string | null }[];
      const { data, error: e2 } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", ids);
      if (e2) throw e2;
      return data ?? [];
    },
  });

  const cases = casesQ.data ?? [];

  const statusCounts = useMemo(() => {
    const m: Record<CaseStatus, number> = {
      new: 0, assigned: 0, en_route_pickup: 0, on_scene: 0,
      in_custody: 0, en_route_dropoff: 0, delivered: 0, closed: 0, cancelled: 0,
    };
    cases.forEach((c) => { m[c.status] += 1; });
    return ALL_STATUSES.map((s) => ({ status: STATUS_LABEL[s], count: m[s] }));
  }, [cases]);

  const delivered = useMemo(
    () => cases.filter((c) => c.status === "delivered" || c.status === "closed"),
    [cases],
  );

  const avgTtdHours = useMemo(() => {
    if (delivered.length === 0) return null;
    const ms = delivered.reduce(
      (acc, c) => acc + (new Date(c.updated_at).getTime() - new Date(c.created_at).getTime()),
      0,
    );
    return ms / delivered.length / 3600_000;
  }, [delivered]);

  const driverNameById = useMemo(() => {
    const m = new Map<string, string>();
    (driversQ.data ?? []).forEach((d) => m.set(d.id, d.full_name ?? "Unnamed"));
    return m;
  }, [driversQ.data]);

  const runsPerDriverWeek = useMemo(() => {
    const m = new Map<string, number>();
    cases
      .filter((c) => new Date(c.created_at) >= weekStart && c.primary_driver_id)
      .forEach((c) => {
        const id = c.primary_driver_id!;
        m.set(id, (m.get(id) ?? 0) + 1);
      });
    return Array.from(m.entries())
      .map(([id, count]) => ({
        driver: driverNameById.get(id) ?? "Unknown",
        count,
      }))
      .sort((a, b) => b.count - a.count);
  }, [cases, driverNameById, weekStart]);

  const monthDelivered = useMemo(
    () => delivered.filter((c) => new Date(c.updated_at) >= monthStart).length,
    [delivered, monthStart],
  );

  const exportCsv = () => {
    const headers = [
      "case_number", "status", "decedent_first_name", "decedent_last_name",
      "pickup_city", "pickup_state", "dropoff_city", "dropoff_state",
      "primary_driver", "scheduled_at", "created_at", "updated_at",
    ];
    const rows = cases.map((c) => [
      c.case_number,
      c.status,
      c.decedent_first_name ?? "",
      c.decedent_last_name ?? "",
      c.pickup_city ?? "",
      c.pickup_state ?? "",
      c.dropoff_city ?? "",
      c.dropoff_state ?? "",
      c.primary_driver_id ? driverNameById.get(c.primary_driver_id) ?? "" : "",
      c.scheduled_at ?? "",
      c.created_at,
      c.updated_at,
    ]);
    const csv = [headers, ...rows]
      .map((r) =>
        r.map((cell) => {
          const v = String(cell ?? "");
          return /[",\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v;
        }).join(","),
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cases-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const loading = casesQ.isLoading || driversQ.isLoading;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Reports</h1>
          <p className="text-sm text-muted-foreground">Last 30 days of activity.</p>
        </div>
        <Button variant="outline" onClick={exportCsv} disabled={cases.length === 0}>
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat icon={ClipboardList} label="Cases (30d)" value={cases.length} loading={loading} />
        <Stat icon={CheckCircle2} label="Delivered (mo)" value={monthDelivered} loading={loading} />
        <Stat
          icon={Timer}
          label="Avg time to deliver"
          value={avgTtdHours == null ? "—" : `${avgTtdHours.toFixed(1)}h`}
          loading={loading}
        />
        <Stat
          icon={Truck}
          label="Active drivers (wk)"
          value={runsPerDriverWeek.length}
          loading={loading}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cases by status</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : (
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={statusCounts} margin={{ left: -16, right: 8, top: 8, bottom: 24 }}>
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

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Runs per driver (this week)</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : runsPerDriverWeek.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No driver-assigned runs this week yet.
              </p>
            ) : (
              <ul className="divide-y">
                {runsPerDriverWeek.map((r) => (
                  <li key={r.driver} className="flex items-center justify-between py-2 text-sm">
                    <span className="font-medium">{r.driver}</span>
                    <span className="tabular-nums text-muted-foreground">{r.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
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
