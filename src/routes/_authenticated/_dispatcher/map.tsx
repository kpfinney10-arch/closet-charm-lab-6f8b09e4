import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, MapPin } from "lucide-react";
import { DriverMap, type DriverPin } from "@/components/driver-map";

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
        };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationsQ.data, profilesQ.data, tick]);

  const onDutyCount = pins.filter((p) => p.on_duty).length;
  const staleCutoff = Date.now() - STALE_MINUTES * 60 * 1000;
  const freshCount = pins.filter((p) => new Date(p.updated_at).getTime() > staleCutoff).length;

  const loading = locationsQ.isLoading || profilesQ.isLoading;

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
          <Badge variant="outline">{pins.length} total</Badge>
        </div>
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="relative h-[70vh] w-full">
            {loading ? (
              <div className="flex h-full w-full items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : pins.length === 0 ? (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-center">
                <MapPin className="h-10 w-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  No driver locations yet. Drivers must turn on duty and allow location access.
                </p>
              </div>
            ) : (
              <DriverMap pins={pins} />
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
