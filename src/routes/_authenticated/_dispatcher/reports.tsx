import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  listExportPresets,
  upsertExportPreset,
  deleteExportPreset,
  renameExportPreset,
  type ExportPreset,
} from "@/lib/report-presets.functions";
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
  AreaChart,
  Area,
  Cell,
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

type ExportFormat = "csv" | "tsv";
type ExportOptions = {
  format: ExportFormat;
  includeHeader: boolean;
  includePercent: boolean;
  includeZeroRows: boolean;
  includeMetadata: boolean;
};

function downloadTable(
  baseName: string,
  header: string[],
  rows: (string | number | null | undefined)[][],
  opts: ExportOptions,
  meta: { range: string; filters: string },
) {
  const delim = opts.format === "tsv" ? "\t" : ",";
  const ext = opts.format === "tsv" ? "tsv" : "csv";
  const mime =
    opts.format === "tsv" ? "text/tab-separated-values;charset=utf-8" : "text/csv;charset=utf-8";

  const encodeCell = (cell: string | number | null | undefined) => {
    const v = String(cell ?? "");
    const needsQuote =
      v.includes(delim) || v.includes("\n") || v.includes('"');
    return needsQuote ? `"${v.replaceAll('"', '""')}"` : v;
  };

  const out: string[] = [];
  if (opts.includeMetadata) {
    out.push(`# Generated${delim}${new Date().toISOString()}`);
    out.push(`# Range${delim}${meta.range}`);
    out.push(`# Filters${delim}${meta.filters || "none"}`);
  }
  if (opts.includeHeader) {
    out.push(header.map(encodeCell).join(delim));
  }
  for (const r of rows) {
    out.push(r.map(encodeCell).join(delim));
  }

  const blob = new Blob([out.join("\n")], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${baseName}.${ext}`;
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

  // Daily case volume across the selected range, segmented by outcome
  const dailyCounts = useMemo(() => {
    const start = new Date(`${from}T00:00:00`);
    const end = new Date(`${to}T00:00:00`);
    const days: Array<{
      day: string;
      label: string;
      total: number;
      delivered: number;
      cancelled: number;
      inProgress: number;
    }> = [];
    const map = new Map<string, { delivered: number; cancelled: number; inProgress: number }>();
    for (const c of filteredCases) {
      const key = (c.createdAt ?? "").slice(0, 10);
      if (!key) continue;
      const bucket = map.get(key) ?? { delivered: 0, cancelled: 0, inProgress: 0 };
      if (c.status === "delivered" || c.status === "closed") bucket.delivered++;
      else if (c.status === "cancelled") bucket.cancelled++;
      else bucket.inProgress++;
      map.set(key, bucket);
    }
    const cursor = new Date(start);
    // Cap to ~120 buckets to keep chart legible
    const maxDays = 120;
    let count = 0;
    while (cursor <= end && count < maxDays) {
      const key = ymd(cursor);
      const b = map.get(key) ?? { delivered: 0, cancelled: 0, inProgress: 0 };
      const total = b.delivered + b.cancelled + b.inProgress;
      days.push({
        day: key,
        label: cursor.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        total,
        ...b,
      });
      cursor.setDate(cursor.getDate() + 1);
      count++;
    }
    return days;
  }, [filteredCases, from, to]);


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

  const [exportOpts, setExportOpts] = useState<ExportOptions>({
    format: "csv",
    includeHeader: true,
    includePercent: true,
    includeZeroRows: false,
    includeMetadata: false,
  });
  const toggleOpt = (k: keyof ExportOptions) =>
    setExportOpts((p) => ({ ...p, [k]: !p[k] }));

  type ColumnPreset = "minimal" | "standard" | "full";
  const COLUMN_PRESETS: Record<
    ColumnPreset,
    { label: string; desc: string; opts: Omit<ExportOptions, "format"> }
  > = {
    minimal: {
      label: "Minimal",
      desc: "Label + count only",
      opts: {
        includeHeader: true,
        includePercent: false,
        includeZeroRows: false,
        includeMetadata: false,
      },
    },
    standard: {
      label: "Standard",
      desc: "Label + count + % of total",
      opts: {
        includeHeader: true,
        includePercent: true,
        includeZeroRows: false,
        includeMetadata: false,
      },
    },
    full: {
      label: "Full",
      desc: "All columns, zero-count rows, and metadata header",
      opts: {
        includeHeader: true,
        includePercent: true,
        includeZeroRows: true,
        includeMetadata: true,
      },
    },
  };
  const activePreset: ColumnPreset | null = (() => {
    for (const name of Object.keys(COLUMN_PRESETS) as ColumnPreset[]) {
      const p = COLUMN_PRESETS[name].opts;
      if (
        p.includeHeader === exportOpts.includeHeader &&
        p.includePercent === exportOpts.includePercent &&
        p.includeZeroRows === exportOpts.includeZeroRows &&
        p.includeMetadata === exportOpts.includeMetadata
      ) {
        return name;
      }
    }
    return null;
  })();
  const applyPreset = (name: ColumnPreset) =>
    setExportOpts((p) => ({ ...p, ...COLUMN_PRESETS[name].opts }));

  // ---- Saved (team-shared) column presets, persisted server-side ----
  const queryClient = useQueryClient();
  const fetchPresets = useServerFn(listExportPresets);
  const savePresetFn = useServerFn(upsertExportPreset);
  const deletePresetFn = useServerFn(deleteExportPreset);
  const renamePresetFn = useServerFn(renameExportPreset);
  const [savingName, setSavingName] = useState("");

  const presetsQ = useQuery({
    queryKey: ["report-export-presets"],
    queryFn: () => fetchPresets(),
    staleTime: 60_000,
  });
  const savedPresets: ExportPreset[] = presetsQ.data ?? [];

  const saveMut = useMutation({
    mutationFn: (vars: { name: string; opts: Omit<ExportOptions, "format"> }) =>
      savePresetFn({ data: vars }),
    onSuccess: (p) => {
      toast.success(`Saved preset "${p.name}" for the team`);
      setSavingName("");
      queryClient.invalidateQueries({ queryKey: ["report-export-presets"] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Could not save preset"),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => deletePresetFn({ data: { id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["report-export-presets"] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Could not delete preset"),
  });
  const renameMut = useMutation({
    mutationFn: (vars: { id: string; name: string }) =>
      renamePresetFn({ data: vars }),
    onSuccess: (p) => {
      toast.success(`Renamed preset to "${p.name}"`);
      queryClient.invalidateQueries({ queryKey: ["report-export-presets"] });
    },
  });

  const saveCurrentAsPreset = () => {
    const name = savingName.trim();
    if (!name) return;
    saveMut.mutate({
      name,
      opts: {
        includeHeader: exportOpts.includeHeader,
        includePercent: exportOpts.includePercent,
        includeZeroRows: exportOpts.includeZeroRows,
        includeMetadata: exportOpts.includeMetadata,
      },
    });
  };

  const applySavedPreset = (id: string) => {
    const p = savedPresets.find((s) => s.id === id);
    if (!p) return;
    setExportOpts((prev) => ({ ...prev, ...p.opts }));
  };

  const deleteSavedPreset = (id: string) => deleteMut.mutate(id);

  // Parse the server's structured "name_taken" error, if present.
  const parseNameTaken = (
    e: unknown,
  ): { message: string; suggestion: string | null } | null => {
    const raw = e instanceof Error ? e.message : "";
    if (!raw.includes('"name_taken"')) return null;
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.code === "name_taken") {
        return {
          message: typeof parsed.message === "string" ? parsed.message : "Name already taken",
          suggestion:
            typeof parsed.suggestion === "string" ? parsed.suggestion : null,
        };
      }
    } catch {
      // fall through
    }
    return null;
  };

  const attemptRename = async (id: string, name: string) => {
    try {
      await renameMut.mutateAsync({ id, name });
    } catch (e) {
      const taken = parseNameTaken(e);
      if (taken) {
        if (taken.suggestion && typeof window !== "undefined") {
          const ok = window.confirm(
            `${taken.message}. Use "${taken.suggestion}" instead?`,
          );
          if (ok) {
            await attemptRename(id, taken.suggestion);
            return;
          }
        } else {
          toast.error(
            `${taken.message}. Try a different name.`,
          );
        }
        return;
      }
      toast.error(e instanceof Error ? e.message : "Could not rename preset");
    }
  };

  const renameSavedPreset = (p: ExportPreset) => {
    const next = typeof window !== "undefined"
      ? window.prompt(`Rename preset "${p.name}" to:`, p.name)
      : null;
    if (next == null) return;
    const trimmed = next.trim();
    if (!trimmed || trimmed === p.name) return;
    if (trimmed.length > 60) {
      toast.error("Preset name must be 60 characters or fewer");
      return;
    }
    void attemptRename(p.id, trimmed);
  };

  const activeSavedPreset = savedPresets.find(
    (p) =>
      p.opts.includeHeader === exportOpts.includeHeader &&
      p.opts.includePercent === exportOpts.includePercent &&
      p.opts.includeZeroRows === exportOpts.includeZeroRows &&
      p.opts.includeMetadata === exportOpts.includeMetadata,
  )?.id ?? null;

  const fileSuffix = `${from}_to_${to}${filtersActive ? "-filtered" : ""}`;

  const filterSummary = useMemo(() => {
    const parts: string[] = [];
    if (q) parts.push(`q=${q}`);
    if (status) parts.push(`status=${status}`);
    if (driver) parts.push(`driver=${driverById.get(driver) || driver}`);
    if (pickup) parts.push(`pickup=${facilityById.get(pickup) || pickup}`);
    return parts.join("; ");
  }, [q, status, driver, pickup, driverById, facilityById]);

  const meta = { range: `${from} to ${to}`, filters: filterSummary };

  const pct = (n: number, total: number) =>
    total > 0 ? `${((n / total) * 100).toFixed(1)}%` : "0.0%";

  const exportCounts = () => {
    const total = filteredCases.length;
    const map = new Map(statusCounts.map((s) => [s.status, s.count]));
    const sources = exportOpts.includeZeroRows
      ? ALL_STATUSES.map((s) => ({
          status: s,
          label: STATUS_LABEL[s] ?? s,
          count: map.get(s) ?? 0,
        }))
      : statusCounts;
    if (!sources.length) return;
    const header = exportOpts.includePercent
      ? ["status", "count", "percent"]
      : ["status", "count"];
    const rows = sources.map((r) =>
      exportOpts.includePercent
        ? [r.label, r.count, pct(r.count, total)]
        : [r.label, r.count],
    );
    downloadTable(`status-counts-${fileSuffix}`, header, rows, exportOpts, meta);
  };
  const exportDrivers = () => {
    const total = filteredCases.length;
    const map = new Map(perDriver.map((d) => [d.driverId, d.count]));
    const sources = exportOpts.includeZeroRows
      ? (data?.drivers ?? []).map((d) => ({
          driverId: d.id,
          name: d.name || "Unnamed",
          count: map.get(d.id) ?? 0,
        }))
      : perDriver;
    if (!sources.length) return;
    const header = exportOpts.includePercent
      ? ["driver", "runs", "percent"]
      : ["driver", "runs"];
    const rows = sources.map((r) =>
      exportOpts.includePercent
        ? [r.name, r.count, pct(r.count, total)]
        : [r.name, r.count],
    );
    downloadTable(`runs-per-driver-${fileSuffix}`, header, rows, exportOpts, meta);
  };
  const exportFacilities = () => {
    const total = filteredCases.length;
    const map = new Map(perPickupFacility.map((f) => [f.facilityId, f.count]));
    const sources = exportOpts.includeZeroRows
      ? (data?.facilities ?? []).map((f) => ({
          facilityId: f.id,
          name: f.name,
          count: map.get(f.id) ?? 0,
        }))
      : perPickupFacility;
    if (!sources.length) return;
    const header = exportOpts.includePercent
      ? ["facility", "runs", "percent"]
      : ["facility", "runs"];
    const rows = sources.map((r) =>
      exportOpts.includePercent
        ? [r.name, r.count, pct(r.count, total)]
        : [r.name, r.count],
    );
    downloadTable(
      `runs-per-pickup-facility-${fileSuffix}`,
      header,
      rows,
      exportOpts,
      meta,
    );
  };
  const exportTimeInCustody = () => {
    if (!timeInCustody.perFacility.length) return;
    downloadTable(
      `time-in-custody-${fileSuffix}`,
      ["pickup_facility", "sample_size", "avg_hours"],
      timeInCustody.perFacility.map((r) => [
        r.name,
        r.sampleSize,
        r.avgHours.toFixed(2),
      ]),
      exportOpts,
      meta,
    );
  };
  const exportReleases = () => {
    if (!releases.length) return;
    downloadTable(
      `release-log-${fileSuffix}`,
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
      releases.map((r) => [
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
      exportOpts,
      meta,
    );
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

      {/* CSV export options — apply to all downloads below */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 p-4">
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Columns</Label>
            <div className="flex rounded-md border" role="group" aria-label="Column preset">
              {(Object.keys(COLUMN_PRESETS) as Array<keyof typeof COLUMN_PRESETS>).map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => applyPreset(name)}
                  title={COLUMN_PRESETS[name].desc}
                  className={`px-3 py-1 text-xs ${activePreset === name ? "bg-primary text-primary-foreground" : "bg-background"}`}
                >
                  {COLUMN_PRESETS[name].label}
                </button>
              ))}
              <button
                type="button"
                disabled
                className={`px-3 py-1 text-xs ${activePreset === null ? "bg-muted text-muted-foreground" : "hidden"}`}
              >
                Custom
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Format</Label>
            <div className="flex rounded-md border">
              <button
                type="button"
                onClick={() => setExportOpts((p) => ({ ...p, format: "csv" }))}
                className={`px-3 py-1 text-xs ${exportOpts.format === "csv" ? "bg-primary text-primary-foreground" : "bg-background"}`}
              >
                CSV
              </button>
              <button
                type="button"
                onClick={() => setExportOpts((p) => ({ ...p, format: "tsv" }))}
                className={`px-3 py-1 text-xs ${exportOpts.format === "tsv" ? "bg-primary text-primary-foreground" : "bg-background"}`}
              >
                TSV
              </button>
            </div>
          </div>
          <Label className="flex items-center gap-2 text-xs">
            <Checkbox
              checked={exportOpts.includeHeader}
              onCheckedChange={() => toggleOpt("includeHeader")}
            />
            Header row
          </Label>
          <Label className="flex items-center gap-2 text-xs">
            <Checkbox
              checked={exportOpts.includePercent}
              onCheckedChange={() => toggleOpt("includePercent")}
            />
            % of total column
          </Label>
          <Label className="flex items-center gap-2 text-xs">
            <Checkbox
              checked={exportOpts.includeZeroRows}
              onCheckedChange={() => toggleOpt("includeZeroRows")}
            />
            Include zero-count rows
          </Label>
          <Label className="flex items-center gap-2 text-xs">
            <Checkbox
              checked={exportOpts.includeMetadata}
              onCheckedChange={() => toggleOpt("includeMetadata")}
            />
            Metadata header (range, filters)
          </Label>
          <span className="ml-auto text-xs text-muted-foreground">
            Options apply to all CSV/TSV downloads below.
          </span>

          {/* Saved (team-shared) presets */}
          <div className="mt-2 flex w-full flex-wrap items-center gap-2 border-t pt-3">
            <Label className="text-xs text-muted-foreground">
              Team presets
            </Label>
            {presetsQ.isLoading ? (
              <span className="text-xs text-muted-foreground">Loading…</span>
            ) : savedPresets.length === 0 ? (
              <span className="text-xs text-muted-foreground">
                None saved yet — name and save below to share with your team.
              </span>
            ) : (
              <div className="flex flex-wrap gap-1">
                {savedPresets.map((p) => (
                  <span
                    key={p.id}
                    className={`inline-flex items-center gap-1 rounded-md border text-xs ${
                      activeSavedPreset === p.id
                        ? "border-primary bg-primary/10"
                        : "bg-background"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => applySavedPreset(p.id)}
                      title={
                        p.createdByName
                          ? `Apply "${p.name}" (saved by ${p.createdByName})`
                          : `Apply "${p.name}"`
                      }
                      className="px-2 py-1"
                    >
                      {p.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => renameSavedPreset(p)}
                      title={`Rename "${p.name}"`}
                      aria-label={`Rename preset ${p.name}`}
                      disabled={renameMut.isPending}
                      className="px-1.5 py-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteSavedPreset(p.id)}
                      title={`Delete "${p.name}"`}
                      aria-label={`Delete preset ${p.name}`}
                      disabled={deleteMut.isPending}
                      className="px-1.5 py-1 text-muted-foreground hover:text-destructive disabled:opacity-50"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="ml-auto flex items-center gap-2">
              <Input
                value={savingName}
                onChange={(e) => setSavingName(e.target.value)}
                placeholder="Preset name"
                maxLength={60}
                className="h-8 w-[160px] text-xs"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    saveCurrentAsPreset();
                  }
                }}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={saveCurrentAsPreset}
                disabled={!savingName.trim() || saveMut.isPending}
              >
                {saveMut.isPending ? "Saving…" : "Save for team"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat icon={ClipboardList} label={filtersActive ? "Cases (filtered)" : "Cases in range"} value={totals.total} loading={loading} />
        <Stat icon={CheckCircle2} label="Delivered" value={totals.delivered} loading={loading} />
        <Stat icon={Activity} label="In progress" value={totals.inProgress} loading={loading} />
        <Stat icon={XCircle} label="Cancelled" value={totals.cancelled} loading={loading} />
      </div>

      {/* Cases over time */}
      <Card>
        <CardHeader className="space-y-0">
          <CardTitle className="text-base">Cases over time</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Daily case volume by outcome across the selected range.
          </p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : dailyCounts.every((d) => d.total === 0) ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No cases match the current selection.
            </p>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={dailyCounts}
                  margin={{ left: -16, right: 8, top: 8, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="gDelivered" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(142 70% 45%)" stopOpacity={0.55} />
                      <stop offset="100%" stopColor="hsl(142 70% 45%)" stopOpacity={0.05} />
                    </linearGradient>
                    <linearGradient id="gInProgress" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.55} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.05} />
                    </linearGradient>
                    <linearGradient id="gCancelled" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--destructive))" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="hsl(var(--destructive))" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={20} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 6,
                      fontSize: 12,
                    }}
                  />
                  <Area
                    type="monotone"
                    name="Delivered"
                    dataKey="delivered"
                    stackId="1"
                    stroke="hsl(142 70% 45%)"
                    fill="url(#gDelivered)"
                  />
                  <Area
                    type="monotone"
                    name="In progress"
                    dataKey="inProgress"
                    stackId="1"
                    stroke="hsl(var(--primary))"
                    fill="url(#gInProgress)"
                  />
                  <Area
                    type="monotone"
                    name="Cancelled"
                    dataKey="cancelled"
                    stackId="1"
                    stroke="hsl(var(--destructive))"
                    fill="url(#gCancelled)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

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
