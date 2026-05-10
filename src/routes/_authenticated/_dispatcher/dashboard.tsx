import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { ClipboardList, MapPin, UserRound, Plus, Loader2, Bell } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type CaseRow = Database["public"]["Tables"]["cases"]["Row"];
type CaseStatus = Database["public"]["Enums"]["case_status"];

export const Route = createFileRoute("/_authenticated/_dispatcher/dashboard")({
  component: DashboardPage,
  head: () => ({
    meta: [
      { title: "Dispatch board — Transport Dispatch" },
      { name: "description", content: "Live dispatch board with active cases and on-duty drivers." },
    ],
  }),
});

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

const STATUS_COLOR: Record<CaseStatus, string> = {
  new: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  assigned: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
  en_route_pickup: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  on_scene: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  in_custody: "bg-purple-500/15 text-purple-700 dark:text-purple-300",
  en_route_dropoff: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  delivered: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  closed: "bg-muted text-muted-foreground",
  cancelled: "bg-destructive/15 text-destructive",
};

const ACTIVE_STATUSES: CaseStatus[] = [
  "new",
  "assigned",
  "en_route_pickup",
  "on_scene",
  "in_custody",
  "en_route_dropoff",
];

function DashboardPage() {
  const cases = useQuery({
    queryKey: ["cases", "active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cases")
        .select("*")
        .in("status", ACTIVE_STATUSES)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CaseRow[];
    },
  });

  const driversOnDuty = useQuery({
    queryKey: ["drivers", "on_duty"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, on_duty")
        .eq("on_duty", true);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Distinct drivers (or any users) who have at least one push subscription registered.
  const pushEnabled = useQuery({
    queryKey: ["push-subscriptions", "distinct-users"],
    queryFn: async () => {
      const { data, error } = await supabase.from("push_subscriptions").select("user_id");
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.user_id)).size;
    },
  });

  // Realtime: refetch on any case change
  useEffect(() => {
    const ch = supabase
      .channel("cases-dashboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "cases" }, () => {
        void cases.refetch();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const grouped = (cases.data ?? []).reduce<Record<string, CaseRow[]>>((acc, c) => {
    (acc[c.status] ||= []).push(c);
    return acc;
  }, {});

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Dispatch board</h1>
          <p className="text-sm text-muted-foreground">
            Active cases and on-duty drivers, updated live.
          </p>
        </div>
        <Button asChild>
          <Link to="/cases/new">
            <Plus className="h-4 w-4" />
            New case
          </Link>
        </Button>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard
          icon={ClipboardList}
          label="Active cases"
          value={cases.data?.length ?? 0}
          loading={cases.isLoading}
        />
        <StatCard
          icon={UserRound}
          label="Drivers on duty"
          value={driversOnDuty.data?.length ?? 0}
          loading={driversOnDuty.isLoading}
        />
        <StatCard
          icon={Bell}
          label="Notifications on"
          value={pushEnabled.data ?? 0}
          loading={pushEnabled.isLoading}
        />
        <StatCard
          icon={MapPin}
          label="In custody"
          value={grouped.in_custody?.length ?? 0}
          loading={cases.isLoading}
        />
        <StatCard
          icon={ClipboardList}
          label="Awaiting assignment"
          value={grouped.new?.length ?? 0}
          loading={cases.isLoading}
        />
      </div>

      {/* Active cases by status */}
      <Card>
        <CardHeader>
          <CardTitle>Active cases</CardTitle>
        </CardHeader>
        <CardContent>
          {cases.isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (cases.data?.length ?? 0) === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm text-muted-foreground">No active cases. Create one to get started.</p>
              <Button asChild className="mt-4">
                <Link to="/cases/new">
                  <Plus className="h-4 w-4" />
                  New case
                </Link>
              </Button>
            </div>
          ) : (
            <div className="divide-y">
              {(cases.data ?? []).map((c) => (
                <Link
                  key={c.id}
                  to="/cases/$caseId"
                  params={{ caseId: c.id }}
                  className="flex flex-wrap items-center gap-3 py-3 transition-colors hover:bg-accent/40"
                >
                  <span className="font-mono text-xs text-muted-foreground">{c.case_number}</span>
                  <span className="font-medium">
                    {[c.decedent_first_name, c.decedent_last_name].filter(Boolean).join(" ") || "Unnamed decedent"}
                  </span>
                  <Badge className={STATUS_COLOR[c.status]} variant="secondary">
                    {STATUS_LABEL[c.status]}
                  </Badge>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {c.pickup_city ?? c.pickup_address ?? "—"}
                    {" → "}
                    {c.dropoff_city ?? c.dropoff_address ?? "—"}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  loading,
}: {
  icon: typeof ClipboardList;
  label: string;
  value: number;
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
