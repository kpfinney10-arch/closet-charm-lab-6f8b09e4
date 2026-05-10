import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, MapPin, X } from "lucide-react";
import type { DriverPin } from "@/components/driver-map";
import type { Database } from "@/integrations/supabase/types";

type CaseStatus = Database["public"]["Enums"]["case_status"];

const ACTIVE_STATUSES: CaseStatus[] = [
  "new",
  "assigned",
  "en_route_pickup",
  "on_scene",
  "in_custody",
  "en_route_dropoff",
];

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

const DriverMap = lazy(() =>
  import("@/components/driver-map").then((m) => ({ default: m.DriverMap })),
);

export const Route = createFileRoute("/_authenticated/_dispatcher/map")({
  component: LiveMapPage,
  head: () => ({
    meta: [
      { title: "Live driver map — Transport Dispatch" },
      { name: "description", content: "Real-time map of driver locations." },
    ],
  }),
});

const STALE_MINUTES = 15;

function LiveMapPage() {
  const [tick, setTick] = useState(0);
  const [statusFilter, setStatusFilter] = useState<Set<CaseStatus>>(new Set());

  const locationsQ = useQuery({
    queryKey: ["driver-locations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("driver_locations")
        .select("user_id, lat, lng, updated_at, speed, accuracy");
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 30000,
  });

  const profilesQ = useQuery({
    queryKey: ["driver-profiles-all"],
    queryFn: async () => {
      const { data: roleRows, error: rErr } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "driver");
      if (rErr) throw rErr;
      const ids = (roleRows ?? []).map((r) => r.user_id);
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, on_duty")
        .in("id", ids);
      if (error) throw error;
      return data ?? [];
    },
  });

  const activeCasesQ = useQuery({
    queryKey: ["driver-active-cases"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cases")
        .select(
          "id, case_number, status, decedent_first_name, decedent_last_name, pickup_city, dropoff_city, primary_driver_id, secondary_driver_id",
        )
        .in("status", [
          "new",
          "assigned",
          "en_route_pickup",
          "on_scene",
          "in_custody",
          "en_route_dropoff",
        ]);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 30000,
  });

  // Realtime
  useEffect(() => {
    const ch = supabase
      .channel("driver-locations-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "driver_locations" },
        () => void locationsQ.refetch(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles" },
        () => void profilesQ.refetch(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cases" },
        () => void activeCasesQ.refetch(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tick to refresh "X min ago" labels
  useEffect(() => {
    const i = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(i);
  }, []);

  const pins: DriverPin[] = useMemo(() => {
    const profMap = new Map(
      (profilesQ.data ?? []).map((p) => [p.id, p]),
    );
    const casesByDriver = new Map<string, NonNullable<DriverPin["cases"]>>();
    for (const c of activeCasesQ.data ?? []) {
      const decedent =
        [c.decedent_first_name, c.decedent_last_name].filter(Boolean).join(" ") ||
        "Unnamed decedent";
      const route = [c.pickup_city, c.dropoff_city].filter(Boolean).join(" → ");
      const entry = {
        id: c.id,
        case_number: c.case_number,
        status: c.status as string,
        decedent,
        route,
      };
      for (const driverId of [c.primary_driver_id, c.secondary_driver_id]) {
        if (!driverId) continue;
        const arr = casesByDriver.get(driverId) ?? [];
        arr.push(entry);
        casesByDriver.set(driverId, arr);
      }
    }

    return (locationsQ.data ?? [])
      .filter((l) => profMap.has(l.user_id))
      .map((l) => {
        const prof = profMap.get(l.user_id)!;
        return {
          user_id: l.user_id,
          name: prof.full_name ?? "Unnamed driver",
          on_duty: prof.on_duty,
          lat: l.lat,
          lng: l.lng,
          updated_at: l.updated_at,
          speed: l.speed,
          accuracy: l.accuracy,
          cases: casesByDriver.get(l.user_id) ?? [],
        };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationsQ.data, profilesQ.data, activeCasesQ.data, tick]);

  const filteredPins = useMemo(() => {
    if (statusFilter.size === 0) return pins;
    return pins
      .map((p) => ({
        ...p,
        cases: (p.cases ?? []).filter((c) =>
          statusFilter.has(c.status as CaseStatus),
        ),
      }))
      .filter((p) => (p.cases ?? []).length > 0);
  }, [pins, statusFilter]);

  const onDutyCount = filteredPins.filter((p) => p.on_duty).length;
  const staleCutoff = Date.now() - STALE_MINUTES * 60 * 1000;
  const freshCount = filteredPins.filter(
    (p) => new Date(p.updated_at).getTime() > staleCutoff,
  ).length;

  const loading = locationsQ.isLoading || profilesQ.isLoading;
  const filterActive = statusFilter.size > 0;

  function toggleStatus(s: CaseStatus) {
    setStatusFilter((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Live driver map</h1>
          <p className="text-sm text-muted-foreground">
            Real-time positions of drivers sharing GPS while on duty.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{onDutyCount} on duty</Badge>
          <Badge variant="outline">{freshCount} active &lt; {STALE_MINUTES}m</Badge>
          <Badge variant="outline">{filteredPins.length} shown</Badge>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-2 p-3">
          <div className="rounded-md border border-border bg-muted/40 p-2 text-xs text-muted-foreground">
            {filterActive ? (
              <>
                Showing only drivers who have at least one active case in:{" "}
                <span className="font-medium text-foreground">
                  {Array.from(statusFilter)
                    .map((s) => STATUS_LABEL[s])
                    .join(", ")}
                </span>
                . Drivers without a matching case are hidden from the map.
              </>
            ) : (
              <>
                No status selected — showing <span className="font-medium text-foreground">all drivers</span>{" "}
                sharing GPS, regardless of whether they have an active case. Click one or more
                statuses below to narrow down.
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            Show drivers with cases in:
          </span>
          {ACTIVE_STATUSES.map((s) => {
            const on = statusFilter.has(s);
            return (
              <Button
                key={s}
                size="sm"
                variant={on ? "default" : "outline"}
                className="h-7 text-xs"
                onClick={() => toggleStatus(s)}
              >
                {STATUS_LABEL[s]}
              </Button>
            );
          })}
          {filterActive ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => setStatusFilter(new Set())}
            >
              <X className="h-3 w-3" />
              Clear
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">
              (none selected — showing all drivers)
            </span>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="relative h-[70vh] w-full">
            {loading ? (
              <div className="flex h-full w-full items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filteredPins.length === 0 ? (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-center">
                <MapPin className="h-10 w-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {filterActive
                    ? "No drivers match the selected case statuses."
                    : "No driver locations yet. Drivers must turn on duty and allow location access."}
                </p>
              </div>
            ) : (
              <Suspense fallback={<div className="h-full w-full bg-muted" />}>
                <DriverMap pins={filteredPins} />
              </Suspense>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
