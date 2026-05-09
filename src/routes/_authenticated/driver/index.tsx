import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  MapPin,
  ArrowRight,
  Inbox,
  Navigation,
  Check,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type CaseRow = Database["public"]["Tables"]["cases"]["Row"];
type CaseStatus = Database["public"]["Enums"]["case_status"];

export const Route = createFileRoute("/_authenticated/driver/")({
  component: DriverQueue,
  head: () => ({
    meta: [{ title: "My runs — Transport Dispatch" }],
  }),
});

const ACTIVE: CaseStatus[] = [
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
  en_route_pickup: "En route to pickup",
  on_scene: "On scene",
  in_custody: "In custody",
  en_route_dropoff: "En route to dropoff",
  delivered: "Delivered",
  closed: "Closed",
  cancelled: "Cancelled",
};

// Forward step from current status (driver workflow)
const NEXT_STEP: Partial<Record<CaseStatus, { next: CaseStatus; label: string }>> = {
  assigned: { next: "en_route_pickup", label: "Start drive to pickup" },
  new: { next: "en_route_pickup", label: "Start drive to pickup" },
  en_route_pickup: { next: "on_scene", label: "Arrived on scene" },
  on_scene: { next: "in_custody", label: "Took into custody" },
  in_custody: { next: "en_route_dropoff", label: "Start drive to dropoff" },
  en_route_dropoff: { next: "delivered", label: "Mark delivered" },
};

function getCurrentPosition(): Promise<GeolocationPosition | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 30000 },
    );
  });
}

function DriverQueue() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);

  const profile = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("on_duty")
        .eq("id", user!.id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const cases = useQuery({
    queryKey: ["driver-cases", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cases")
        .select("*")
        .or(`primary_driver_id.eq.${user!.id},secondary_driver_id.eq.${user!.id}`)
        .in("status", ACTIVE)
        .order("scheduled_at", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as CaseRow[];
    },
  });

  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel(`driver-cases-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "cases" }, () => {
        void cases.refetch();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const toggleOnDuty = useMutation({
    mutationFn: async (next: boolean) => {
      const { error } = await supabase
        .from("profiles")
        .update({ on_duty: next })
        .eq("id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["profile", user?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const advance = useMutation({
    mutationFn: async ({ id, next }: { id: string; next: CaseStatus }) => {
      const pos = await getCurrentPosition();
      const { error } = await supabase.from("cases").update({ status: next }).eq("id", id);
      if (error) throw error;
      // Add a stamped event with GPS (status change itself is logged by trigger)
      if (pos) {
        await supabase.from("case_events").insert({
          case_id: id,
          event_type: "note_added",
          notes: `Driver location at ${STATUS_LABEL[next]}`,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      }
    },
    onMutate: ({ id }) => setBusyId(id),
    onSettled: () => setBusyId(null),
    onSuccess: () => {
      toast.success("Status updated");
      void cases.refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("cases").update({ status: "cancelled" }).eq("id", id);
      if (error) throw error;
    },
    onMutate: (id) => setBusyId(id),
    onSettled: () => setBusyId(null),
    onSuccess: () => {
      toast.success("Run cancelled");
      void cases.refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Background GPS ping while on duty
  useEffect(() => {
    if (!user?.id || !profile.data?.on_duty) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    const watch = navigator.geolocation.watchPosition(
      async (pos) => {
        await supabase.from("driver_locations").upsert({
          user_id: user.id,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          heading: pos.coords.heading ?? null,
          speed: pos.coords.speed ?? null,
          updated_at: new Date().toISOString(),
        });
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 15000 },
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, [user?.id, profile.data?.on_duty]);

  return (
    <div className="space-y-4 p-4">
      {/* On-duty toggle */}
      <Card>
        <CardContent className="flex items-center justify-between gap-3 py-4">
          <div>
            <div className="font-semibold">On duty</div>
            <div className="text-xs text-muted-foreground">
              When on, dispatch can assign you new runs and your location is shared.
            </div>
          </div>
          {profile.isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Switch
              checked={profile.data?.on_duty ?? false}
              onCheckedChange={(v) => toggleOnDuty.mutate(v)}
            />
          )}
        </CardContent>
      </Card>

      {/* Queue */}
      <div>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">My active runs</h2>
        {cases.isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (cases.data?.length ?? 0) === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <Inbox className="h-10 w-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No active runs assigned.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {(cases.data ?? []).map((c) => {
              const step = NEXT_STEP[c.status];
              const isBusy = busyId === c.id;
              const mapsHref = c.status === "in_custody" || c.status === "en_route_dropoff"
                ? buildMapsHref(c.dropoff_address, c.dropoff_city, c.dropoff_state, c.dropoff_zip)
                : buildMapsHref(c.pickup_address, c.pickup_city, c.pickup_state, c.pickup_zip);

              return (
                <Card key={c.id} className="transition-shadow hover:shadow-md">
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs text-muted-foreground">{c.case_number}</span>
                      <Badge variant="secondary">{STATUS_LABEL[c.status]}</Badge>
                    </div>
                    <div className="font-medium">
                      {[c.decedent_first_name, c.decedent_last_name].filter(Boolean).join(" ") ||
                        "Unnamed decedent"}
                    </div>
                    <div className="flex items-start gap-2 text-sm text-muted-foreground">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                      <div className="min-w-0">
                        <div className="truncate">
                          <span className="font-medium text-foreground">Pickup:</span>{" "}
                          {c.pickup_address || c.pickup_city || "—"}
                        </div>
                        <div className="my-1 flex items-center gap-1 text-xs">
                          <ArrowRight className="h-3 w-3" />
                        </div>
                        <div className="truncate">
                          <span className="font-medium text-foreground">Dropoff:</span>{" "}
                          {c.dropoff_address || c.dropoff_city || "—"}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 pt-1">
                      {step && (
                        <Button
                          size="sm"
                          disabled={isBusy}
                          onClick={() => advance.mutate({ id: c.id, next: step.next })}
                        >
                          {isBusy ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Check className="h-4 w-4" />
                          )}
                          {step.label}
                        </Button>
                      )}
                      {mapsHref && (
                        <Button asChild size="sm" variant="outline">
                          <a href={mapsHref} target="_blank" rel="noreferrer">
                            <Navigation className="h-4 w-4" />
                            Navigate
                          </a>
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        disabled={isBusy}
                        onClick={() => {
                          if (confirm("Cancel this run?")) cancel.mutate(c.id);
                        }}
                      >
                        <X className="h-4 w-4" />
                        Cancel
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function buildMapsHref(
  address: string | null,
  city: string | null,
  state: string | null,
  zip: string | null,
): string | null {
  const q = [address, city, state, zip].filter(Boolean).join(", ");
  if (!q) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}`;
}
