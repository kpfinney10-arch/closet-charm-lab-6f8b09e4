import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCrm } from "@/contexts/crm-context";
import { getCrmReports, type CrmReports } from "@/lib/crm-reports.functions";
import { listReleases } from "@/lib/decedent-releases.functions";
import { listCremationLogs } from "@/lib/cremation-logs.functions";
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
