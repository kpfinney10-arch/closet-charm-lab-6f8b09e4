import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Loader2, Users, MapPin, Phone, Truck, Gauge, AlertTriangle, ExternalLink, Search, X, ArrowDown, ArrowUp } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  getDriverPerformance,
  getDriverDrillDown,
  type DriverPerf,
  type DriverCaseTimeline,
} from "@/lib/driver-performance.functions";

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
        .in("status", [...ACTIVE_STATUSES])
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
            Roster, duty status, current vehicle, active runs, and performance.
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

      <Tabs defaultValue="roster">
        <TabsList>
          <TabsTrigger value="roster">
            <Users className="h-4 w-4" /> Roster
          </TabsTrigger>
          <TabsTrigger value="performance">
            <Gauge className="h-4 w-4" /> Performance
          </TabsTrigger>
        </TabsList>

        <TabsContent value="roster" className="mt-4">
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
        </TabsContent>

        <TabsContent value="performance" className="mt-4">
          <PerformanceTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

const RANGE_OPTIONS = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
];
const GRACE_OPTIONS = [
  { value: "0", label: "Strict (no grace)" },
  { value: "15", label: "15 min grace" },
  { value: "30", label: "30 min grace" },
];

function PerformanceTab() {
  const [days, setDays] = useState("30");
  const [grace, setGrace] = useState("15");
  const [drillDriver, setDrillDriver] = useState<DriverPerf | null>(null);
  const range = useMemo(() => {
    const to = new Date();
    const from = new Date(to.getTime() - Number(days) * 86400_000);
    return { from: from.toISOString(), to: to.toISOString() };
  }, [days]);

  const fetchPerf = useServerFn(getDriverPerformance);
  const perfQ = useQuery({
    queryKey: ["driver-performance", range.from, range.to, grace],
    queryFn: () =>
      fetchPerf({
        data: {
          from: range.from,
          to: range.to,
          onTimeGraceMinutes: Number(grace),
        },
      }),
  });

  const drivers = perfQ.data?.drivers ?? [];
  const totals = drivers.reduce(
    (acc, d) => {
      acc.runs += d.runs;
      acc.completed += d.completed;
      acc.scheduled += d.scheduledRuns;
      acc.onTime += d.onTimePickups;
      acc.late += d.lateLegs;
      return acc;
    },
    { runs: 0, completed: 0, scheduled: 0, onTime: 0, late: 0 },
  );
  const fleetOnTimePct =
    totals.scheduled > 0 ? (totals.onTime / totals.scheduled) * 100 : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            {RANGE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={grace} onValueChange={setGrace}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            {GRACE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto flex flex-wrap gap-2 text-xs">
          <Badge variant="secondary">Runs {totals.runs}</Badge>
          <Badge variant="secondary">Completed {totals.completed}</Badge>
          <Badge variant={totals.late > 0 ? "destructive" : "secondary"}>
            Late legs {totals.late}
          </Badge>
          <Badge>
            Fleet on-time {fleetOnTimePct == null ? "—" : `${fleetOnTimePct.toFixed(0)}%`}
          </Badge>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Per-driver performance</CardTitle>
          <p className="text-xs text-muted-foreground">
            Click any row to see that driver&rsquo;s case list, late legs, and per-leg timelines for the selected range.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {perfQ.isLoading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : drivers.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No driver-assigned runs in this window.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Driver</TableHead>
                  <TableHead className="text-right">Runs</TableHead>
                  <TableHead className="text-right">Completed</TableHead>
                  <TableHead className="text-right">On-time pickup</TableHead>
                  <TableHead className="text-right">Late legs</TableHead>
                  <TableHead className="text-right">Med. to pickup</TableHead>
                  <TableHead className="text-right">Med. on-scene</TableHead>
                  <TableHead className="text-right">Med. transport</TableHead>
                  <TableHead className="text-right">Med. total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {drivers.map((d) => (
                  <DriverPerfRow
                    key={d.driverId}
                    d={d}
                    onClick={() => setDrillDriver(d)}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <DriverDrillDownDialog
        driver={drillDriver}
        range={range}
        graceMinutes={Number(grace)}
        onOpenChange={(o) => !o && setDrillDriver(null)}
      />
    </div>
  );
}

function DriverPerfRow({ d, onClick }: { d: DriverPerf; onClick: () => void }) {
  return (
    <TableRow
      className="cursor-pointer hover:bg-muted/40"
      onClick={onClick}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <TableCell className="font-medium">{d.name}</TableCell>
      <TableCell className="text-right tabular-nums">{d.runs}</TableCell>
      <TableCell className="text-right tabular-nums">{d.completed}</TableCell>
      <TableCell className="text-right">
        {d.onTimePickupPct == null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span
            className={
              d.onTimePickupPct >= 90
                ? "text-emerald-600 dark:text-emerald-400"
                : d.onTimePickupPct >= 75
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-destructive"
            }
          >
            {d.onTimePickupPct.toFixed(0)}%
            <span className="ml-1 text-xs text-muted-foreground">
              ({d.onTimePickups}/{d.scheduledRuns})
            </span>
          </span>
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {d.lateLegs > 0 ? (
          <Badge variant="destructive" className="font-mono">{d.lateLegs}</Badge>
        ) : (
          <span className="text-muted-foreground">0</span>
        )}
      </TableCell>
      <TableCell className="text-right">{fmtMin(d.medianTimeToPickupMin)}</TableCell>
      <TableCell className="text-right">{fmtMin(d.medianOnSceneMin)}</TableCell>
      <TableCell className="text-right">{fmtMin(d.medianTransportMin)}</TableCell>
      <TableCell className="text-right">{fmtMin(d.medianTotalMin)}</TableCell>
    </TableRow>
  );
}

const STATUS_LABEL: Record<string, string> = {
  new: "New",
  assigned: "Assigned",
  en_route_pickup: "En route pickup",
  on_scene: "On scene",
  in_custody: "In custody",
  en_route_dropoff: "En route dropoff",
  delivered: "Delivered",
  released: "Released",
  cancelled: "Cancelled",
};

function DriverDrillDownDialog({
  driver,
  range,
  graceMinutes,
  onOpenChange,
}: {
  driver: DriverPerf | null;
  range: { from: string; to: string };
  graceMinutes: number;
  onOpenChange: (open: boolean) => void;
}) {
  const fetchDrill = useServerFn(getDriverDrillDown);
  const [tab, setTab] = useState<"all" | "late">("all");
  const [filter, setFilter] = useState("");
  const [debouncedFilter, setDebouncedFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("scheduledAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedFilter(filter), 200);
    return () => clearTimeout(t);
  }, [filter]);

  const drillQ = useQuery({
    enabled: !!driver,
    queryKey: [
      "driver-drilldown",
      driver?.driverId,
      range.from,
      range.to,
      graceMinutes,
    ],
    queryFn: () =>
      fetchDrill({
        data: {
          driverId: driver!.driverId,
          from: range.from,
          to: range.to,
          onTimeGraceMinutes: graceMinutes,
        },
      }),
  });

  const cases = drillQ.data?.cases ?? [];
  const lateCases = cases.filter((c) => c.isLate);
  const base = tab === "late" ? lateCases : cases;
  const q = debouncedFilter.trim().toLowerCase();
  const filtered = q
    ? base.filter(
        (c) =>
          c.caseNumber?.toLowerCase().includes(q) ||
          c.decedentName?.toLowerCase().includes(q),
      )
    : base;
  const visible = useMemo(
    () => sortCases(filtered, sortKey, sortDir),
    [filtered, sortKey, sortDir],
  );


  return (
    <Dialog
      open={!!driver}
      onOpenChange={(open) => {
        if (!open) {
          setFilter("");
          setDebouncedFilter("");
        }
        onOpenChange(open);
      }}
    >
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>{driver?.name ?? "Driver"} — performance detail</DialogTitle>
          <DialogDescription>
            {new Date(range.from).toLocaleDateString()} → {new Date(range.to).toLocaleDateString()}
            {" · "}
            {cases.length} run{cases.length === 1 ? "" : "s"}
            {lateCases.length > 0 && (
              <span className="ml-1 text-destructive">
                · {lateCases.length} late
              </span>
            )}
            {" · "}grace {graceMinutes}m
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "all" | "late")}>
          <TabsList>
            <TabsTrigger value="all">All runs ({cases.length})</TabsTrigger>
            <TabsTrigger value="late">
              <AlertTriangle className="h-3.5 w-3.5" />
              Late legs ({lateCases.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value={tab} className="mt-3 space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter by case number or decedent name…"
                className="pl-8 pr-8"
                aria-label="Filter cases"
              />
              {filter && (
                <button
                  type="button"
                  onClick={() => setFilter("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Clear filter"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {drillQ.isLoading ? (
              <div className="flex h-40 items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : visible.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                {q
                  ? "No matching cases."
                  : tab === "late"
                    ? "No late legs in this range."
                    : "No runs in this range."}
              </div>
            ) : (
              <div className="max-h-[60vh] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Case</TableHead>
                      <TableHead>Decedent</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Late by</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visible.map((c) => (
                      <DrillCaseRow key={c.id} c={c} onNavigate={() => onOpenChange(false)} />
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function DrillCaseRow({
  c,
  onNavigate,
}: {
  c: DriverCaseTimeline;
  onNavigate: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <TableRow
        className="cursor-pointer hover:bg-muted/40"
        onClick={() => setOpen((o) => !o)}
      >
        <TableCell className="font-mono text-xs">{c.caseNumber}</TableCell>
        <TableCell>{c.decedentName}</TableCell>
        <TableCell className="text-sm">{STATUS_LABEL[c.status] ?? c.status}</TableCell>
        <TableCell>
          <Badge variant={c.role === "primary" ? "default" : "outline"}>
            {c.role}
          </Badge>
        </TableCell>
        <TableCell>
          {c.isLate && c.lateByMinutes != null ? (
            <Badge variant="destructive" className="font-mono">
              +{fmtMin(c.lateByMinutes)}
            </Badge>
          ) : c.lateByMinutes != null ? (
            <span className="text-xs text-emerald-600 dark:text-emerald-400">on time</span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </TableCell>
        <TableCell className="text-sm tabular-nums">{fmtMin(c.totalMin)}</TableCell>
        <TableCell className="text-right">
          <Button
            asChild
            size="sm"
            variant="ghost"
            className="h-7 px-2"
            onClick={(e) => {
              e.stopPropagation();
              onNavigate();
            }}
          >
            <Link to="/cases/$caseId" params={{ caseId: c.id }}>
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </TableCell>
      </TableRow>
      {open && (
        <TableRow className="bg-muted/30">
          <TableCell colSpan={7} className="py-3">
            <Timeline c={c} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function Timeline({ c }: { c: DriverCaseTimeline }) {
  const steps: Array<{ label: string; at: string | null; emphasize?: boolean }> = [
    { label: "Scheduled", at: c.scheduledAt, emphasize: true },
    { label: "Assigned", at: c.assignedAt },
    { label: "En route pickup", at: c.enRoutePickupAt },
    { label: "On scene", at: c.onSceneAt, emphasize: true },
    { label: "In custody", at: c.inCustodyAt },
    { label: "En route dropoff", at: c.enRouteDropoffAt },
    { label: "Delivered", at: c.deliveredAt, emphasize: true },
  ];
  return (
    <ol className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs md:grid-cols-4 lg:grid-cols-7">
      {steps.map((s, i) => (
        <li key={i} className="flex flex-col">
          <span className={s.emphasize ? "font-medium" : "text-muted-foreground"}>
            {s.label}
          </span>
          <span
            className={
              s.at
                ? "tabular-nums"
                : "text-muted-foreground/60"
            }
          >
            {s.at ? new Date(s.at).toLocaleString() : "—"}
          </span>
        </li>
      ))}
    </ol>
  );
}

function fmtMin(m: number | null): string {
  if (m == null) return "—";
  const abs = Math.abs(m);
  if (abs < 60) return `${Math.round(m)}m`;
  const h = Math.floor(abs / 60);
  const rem = Math.round(abs % 60);
  const sign = m < 0 ? "-" : "";
  return rem === 0 ? `${sign}${h}h` : `${sign}${h}h ${rem}m`;
}
