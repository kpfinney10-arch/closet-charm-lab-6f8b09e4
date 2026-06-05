import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCrm } from "@/contexts/crm-context";
import { getCrmReports, type CrmReports } from "@/lib/crm-reports.functions";
import { listReleases } from "@/lib/decedent-releases.functions";
import { listCremationLogs } from "@/lib/cremation-logs.functions";
import { logCrmExport, listCrmExportAudit } from "@/lib/export-audit.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Loader2, Activity, Flame, PackageCheck, Clock, Download } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/_crm/crm/reports")({
  component: ReportsPage,
  head: () => ({ meta: [{ title: "Reports — CRM" }] }),
});

function toCsv(rows: Array<Record<string, unknown>>): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    if (v == null) return "";
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => esc(r[h])).join(",")),
  ].join("\n");
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const STATUS_LABELS: Record<string, string> = {
  checked_in: "Checked in",
  prepped: "Prepped",
  cremated: "Cremated",
  released: "Released",
  checked_out: "Checked out",
};

function ReportsPage() {
  const { currentOrg, loading } = useCrm();
  const [monthsBack, setMonthsBack] = useState(6);
  const fetchReports = useServerFn(getCrmReports);

  const { data, isLoading } = useQuery({
    queryKey: ["crm", "reports", currentOrg?.organization_id, monthsBack],
    queryFn: () =>
      fetchReports({
        data: { organizationId: currentOrg!.organization_id, monthsBack },
      }),
    enabled: !!currentOrg,
  });

  if (loading || !currentOrg) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Reports</h1>
          <p className="text-sm text-muted-foreground">
            Operational snapshot for {currentOrg.organization_name}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ExportButtons organizationId={currentOrg.organization_id} />
          <Select
            value={String(monthsBack)}
            onValueChange={(v) => setMonthsBack(Number(v))}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="3">Last 3 months</SelectItem>
              <SelectItem value="6">Last 6 months</SelectItem>
              <SelectItem value="12">Last 12 months</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </header>

      {isLoading || !data ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <ReportsBody data={data} />
      )}
    </div>
  );
}

function ReportsBody({ data }: { data: CrmReports }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          icon={<Activity className="h-4 w-4" />}
          label="In facility"
          value={data.activeCount}
        />
        <Stat
          icon={<Flame className="h-4 w-4" />}
          label="Active cremations"
          value={data.activeCremations}
          hint={`${data.cremationsThisMonth} completed this month`}
        />
        <Stat
          icon={<PackageCheck className="h-4 w-4" />}
          label="Releases this month"
          value={data.releasesThisMonth}
        />
        <Stat
          icon={<Clock className="h-4 w-4" />}
          label="Avg time in facility"
          value={fmtHours(data.avgTimeInFacilityHours)}
          hint={`Median ${fmtHours(data.medianTimeInFacilityHours)}`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">By status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {Object.keys(data.statusCounts).length === 0 ? (
              <p className="text-sm text-muted-foreground">No decedents on record.</p>
            ) : (
              Object.entries(data.statusCounts)
                .sort((a, b) => b[1] - a[1])
                .map(([status, count]) => (
                  <div
                    key={status}
                    className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                  >
                    <span>{STATUS_LABELS[status] ?? status}</span>
                    <Badge variant="secondary">{count}</Badge>
                  </div>
                ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Monthly activity</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Check-ins</TableHead>
                  <TableHead className="text-right">Cremations</TableHead>
                  <TableHead className="text-right">Releases</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.monthly.map((m) => (
                  <TableRow key={m.month}>
                    <TableCell className="font-medium">{fmtMonth(m.month)}</TableCell>
                    <TableCell className="text-right">{m.checkIns}</TableCell>
                    <TableCell className="text-right">{m.cremations}</TableCell>
                    <TableCell className="text-right">{m.releases}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent releases</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {data.recentReleases.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              No releases recorded in this window.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Decedent</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>Released to</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recentReleases.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">
                      {new Date(r.released_at).toLocaleString()}
                    </TableCell>
                    <TableCell>{r.decedent_name}</TableCell>
                    <TableCell className="capitalize">{r.item_type}</TableCell>
                    <TableCell>{r.released_to_name}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function Stat({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          {icon}
          {label}
        </div>
        <p className="mt-2 text-2xl font-semibold">{value}</p>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

function fmtHours(h: number | null) {
  if (h == null) return "—";
  if (h < 24) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}
function fmtMonth(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString(undefined, {
    month: "short",
    year: "numeric",
  });
}

function ExportButtons({ organizationId }: { organizationId: string }) {
  const fetchReleases = useServerFn(listReleases);
  const fetchLogs = useServerFn(listCremationLogs);
  const logExport = useServerFn(logCrmExport);
  const [busy, setBusy] = useState<"releases" | "cremations" | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const stamp = () => new Date().toISOString().slice(0, 10);

  const rangeIso = () => {
    const fromIso = from ? new Date(`${from}T00:00:00`).toISOString() : undefined;
    const toIso = to ? new Date(`${to}T23:59:59.999`).toISOString() : undefined;
    return { fromIso, toIso };
  };

  const rangeSuffix = () => {
    if (from && to) return `${from}_to_${to}`;
    if (from) return `from-${from}`;
    if (to) return `to-${to}`;
    return stamp();
  };

  const exportReleases = async () => {
    setBusy("releases");
    const toastId = toast.loading("Preparing releases export…");
    try {
      const { fromIso, toIso } = rangeIso();
      toast.loading("Fetching releases…", { id: toastId });
      const rows = await fetchReleases({
        data: { organizationId, limit: 2000, from: fromIso, to: toIso },
      });
      toast.loading(`Formatting ${rows.length} row${rows.length === 1 ? "" : "s"}…`, {
        id: toastId,
      });
      const mapped = (rows as any[]).map((r) => ({
        released_at: r.released_at,
        decedent_last_name: r.decedents?.last_name ?? "",
        decedent_first_name: r.decedents?.first_name ?? "",
        item_type: r.item_type,
        released_to_name: r.released_to_name,
        released_to_relation: r.released_to_relation ?? "",
        released_to_phone: r.released_to_phone ?? "",
        id_type: r.id_type ?? "",
        id_number: r.id_number ?? "",
        witnessed_by: r.witnessed_by ?? "",
        notes: r.notes ?? "",
      }));
      if (!mapped.length) {
        toast.info("No releases to export", { id: toastId });
        return;
      }
      const filename = `releases-${rangeSuffix()}.csv`;
      downloadCsv(filename, toCsv(mapped));
      await logExport({
        data: {
          organizationId,
          exportType: "releases",
          from: fromIso ?? null,
          to: toIso ?? null,
          rowCount: mapped.length,
          filename,
        },
      }).catch(() => {});
      toast.success(`Downloaded ${mapped.length} release${mapped.length === 1 ? "" : "s"}`, {
        id: toastId,
        description: filename,
      });
    } catch (e: any) {
      toast.error(e?.message ?? "Export failed", { id: toastId });
    } finally {
      setBusy(null);
    }
  };

  const exportCremations = async () => {
    setBusy("cremations");
    const toastId = toast.loading("Preparing cremations export…");
    try {
      const { fromIso, toIso } = rangeIso();
      toast.loading("Fetching cremation logs…", { id: toastId });
      const rows = await fetchLogs({
        data: { organizationId, scope: "all", limit: 2000, from: fromIso, to: toIso },
      });
      toast.loading(`Formatting ${rows.length} row${rows.length === 1 ? "" : "s"}…`, {
        id: toastId,
      });
      const mapped = (rows as any[]).map((r) => ({
        start_time: r.start_time ?? "",
        end_time: r.end_time ?? "",
        decedent_last_name: r.decedents?.last_name ?? "",
        decedent_first_name: r.decedents?.first_name ?? "",
        operator: r.operator_name ?? "",
        retort: r.retort ?? "",
        container_type: r.container_type ?? "",
        weight_lbs: r.weight_lbs ?? "",
        ash_weight_lbs: r.ash_weight_lbs ?? "",
        comment: r.comment ?? "",
      }));
      if (!mapped.length) {
        toast.info("No cremation logs to export", { id: toastId });
        return;
      }
      const filename = `cremations-${rangeSuffix()}.csv`;
      downloadCsv(filename, toCsv(mapped));
      await logExport({
        data: {
          organizationId,
          exportType: "cremations",
          from: fromIso ?? null,
          to: toIso ?? null,
          rowCount: mapped.length,
          filename,
        },
      }).catch(() => {});
      toast.success(`Downloaded ${mapped.length} log${mapped.length === 1 ? "" : "s"}`, {
        id: toastId,
        description: filename,
      });
    } catch (e: any) {
      toast.error(e?.message ?? "Export failed", { id: toastId });
    } finally {
      setBusy(null);
    }
  };

  const rangeLabel =
    from && to
      ? `${from} → ${to}`
      : from
        ? `from ${from}`
        : to
          ? `until ${to}`
          : "All time";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3">
        <div className="space-y-1">
          <p className="text-sm font-medium">Export range</p>
          <p className="text-xs text-muted-foreground">{rangeLabel}</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor="export-from" className="text-xs">
              From
            </Label>
            <Input
              id="export-from"
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="export-to" className="text-xs">
              To
            </Label>
            <Input
              id="export-to"
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        </div>
        {(from || to) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => {
              setFrom("");
              setTo("");
            }}
          >
            Clear dates
          </Button>
        )}
        <div className="flex flex-col gap-2 border-t pt-3">
          <Button
            variant="outline"
            size="sm"
            onClick={exportReleases}
            disabled={busy !== null}
          >
            {busy === "releases" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Releases CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={exportCremations}
            disabled={busy !== null}
          >
            {busy === "cremations" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Cremations CSV
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
