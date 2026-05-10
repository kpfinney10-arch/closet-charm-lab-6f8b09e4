import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Users, MapPin, Phone, Truck } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/_dispatcher/drivers")({
  component: DriversPage,
  head: () => ({
    meta: [{ title: "Drivers — Transport Dispatch" }],
  }),
});

const ACTIVE_STATUSES = [
  "new",
  "assigned",
  "en_route_pickup",
  "on_scene",
  "in_custody",
  "en_route_dropoff",
] as const;

function DriversPage() {
  const { hasRole } = useAuth();
  const qc = useQueryClient();
  const isAdmin = hasRole("admin");

  const driversQ = useQuery({
    queryKey: ["drivers-roster"],
    queryFn: async () => {
      const { data: roleRows, error: rErr } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "driver");
      if (rErr) throw rErr;
      const ids = Array.from(new Set((roleRows ?? []).map((r) => r.user_id)));
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, phone, on_duty, current_vehicle_id")
        .in("id", ids)
        .order("full_name", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const driverIds = (driversQ.data ?? []).map((d) => d.id);

  const workloadQ = useQuery({
    queryKey: ["drivers-workload", driverIds.sort().join(",")],
    enabled: driverIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cases")
        .select("id, primary_driver_id, secondary_driver_id, case_number, status")
        .in("status", ACTIVE_STATUSES as unknown as string[])
        .or(
          `primary_driver_id.in.(${driverIds.join(",")}),secondary_driver_id.in.(${driverIds.join(",")})`,
        );
      if (error) throw error;
      return data ?? [];
    },
  });

  const locationsQ = useQuery({
    queryKey: ["drivers-locations", driverIds.sort().join(",")],
    enabled: driverIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("driver_locations")
        .select("user_id, lat, lng, updated_at")
        .in("user_id", driverIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  const vehiclesQ = useQuery({
    queryKey: ["vehicles-for-roster"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicles")
        .select("id, name, license_plate");
      if (error) throw error;
      return data ?? [];
    },
  });

  const setDuty = useMutation({
    mutationFn: async (vars: { id: string; on_duty: boolean }) => {
      const { error } = await supabase
        .from("profiles")
        .update({ on_duty: vars.on_duty })
        .eq("id", vars.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Updated");
      void qc.invalidateQueries({ queryKey: ["drivers-roster"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const workloadByDriver = new Map<string, { id: string; case_number: string }[]>();
  for (const c of workloadQ.data ?? []) {
    for (const id of [c.primary_driver_id, c.secondary_driver_id]) {
      if (!id) continue;
      const arr = workloadByDriver.get(id) ?? [];
      arr.push({ id: c.id, case_number: c.case_number });
      workloadByDriver.set(id, arr);
    }
  }
  const lastByDriver = new Map(
    (locationsQ.data ?? []).map((l) => [l.user_id, l] as const),
  );
  const vehicleById = new Map(
    (vehiclesQ.data ?? []).map((v) => [v.id, v] as const),
  );

  const onDutyCount = (driversQ.data ?? []).filter((d) => d.on_duty).length;

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Drivers</h1>
          <p className="text-sm text-muted-foreground">
            Roster of all drivers, on/off duty, current vehicle, and active runs.
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant="secondary" className="gap-1">
            <Users className="h-3 w-3" /> {driversQ.data?.length ?? 0} total
          </Badge>
          <Badge className="gap-1">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            {onDutyCount} on duty
          </Badge>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Roster</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {driversQ.isLoading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (driversQ.data ?? []).length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No drivers yet. Add a user with the <span className="font-mono">driver</span> role from{" "}
              <Link to="/users" className="underline">Users</Link>.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>On duty</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Active runs</TableHead>
                  <TableHead>Last location</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(driversQ.data ?? []).map((d) => {
                  const runs = workloadByDriver.get(d.id) ?? [];
                  const loc = lastByDriver.get(d.id);
                  const veh = d.current_vehicle_id
                    ? vehicleById.get(d.current_vehicle_id)
                    : null;
                  return (
                    <TableRow key={d.id}>
                      <TableCell className="font-medium">
                        {d.full_name || <span className="text-muted-foreground">Unnamed</span>}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {d.phone ? (
                          <a href={`tel:${d.phone}`} className="inline-flex items-center gap-1 hover:text-foreground">
                            <Phone className="h-3 w-3" /> {d.phone}
                          </a>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>
                        {isAdmin ? (
                          <Switch
                            checked={d.on_duty}
                            onCheckedChange={(v) => setDuty.mutate({ id: d.id, on_duty: v })}
                          />
                        ) : d.on_duty ? (
                          <Badge>On</Badge>
                        ) : (
                          <Badge variant="outline">Off</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {veh ? (
                          <span className="inline-flex items-center gap-1">
                            <Truck className="h-3 w-3 text-muted-foreground" />
                            {veh.name}
                            {veh.license_plate ? (
                              <span className="text-xs text-muted-foreground">· {veh.license_plate}</span>
                            ) : null}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {runs.length === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {runs.map((r) => (
                              <Button
                                key={r.id}
                                asChild
                                size="sm"
                                variant="outline"
                                className="h-6 px-2 font-mono text-[11px]"
                              >
                                <Link to="/cases/$caseId" params={{ caseId: r.id }}>
                                  {r.case_number}
                                </Link>
                              </Button>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {loc ? (
                          <a
                            className="inline-flex items-center gap-1 hover:text-foreground"
                            href={`https://www.google.com/maps?q=${loc.lat},${loc.lng}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <MapPin className="h-3 w-3" />
                            {new Date(loc.updated_at).toLocaleString()}
                          </a>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
