import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCrm } from "@/contexts/crm-context";
import { listCrmExportAudit } from "@/lib/export-audit.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/_crm/crm/export-audit")({
  component: ExportAuditPage,
  head: () => ({ meta: [{ title: "Export audit — CRM" }] }),
});

function ExportAuditPage() {
  const { currentOrg, isAdmin, loading } = useCrm();
  const fetchAudit = useServerFn(listCrmExportAudit);

  const { data, isLoading } = useQuery({
    queryKey: ["crm", "export-audit", currentOrg?.organization_id],
    queryFn: () =>
      fetchAudit({
        data: { organizationId: currentOrg!.organization_id, limit: 200 },
      }),
    enabled: !!currentOrg && isAdmin,
    refetchInterval: 30_000,
  });

  if (loading || !currentOrg) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!isAdmin) return <Navigate to="/crm/dashboard" />;

  const fmtRange = (from: string | null, to: string | null) => {
    const f = from ? new Date(from).toLocaleDateString() : null;
    const t = to ? new Date(to).toLocaleDateString() : null;
    if (f && t) return `${f} → ${t}`;
    if (f) return `from ${f}`;
    if (t) return `until ${t}`;
    return "All time";
  };

  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <ShieldCheck className="h-6 w-6 text-primary" />
          Export audit
        </h1>
        <p className="text-sm text-muted-foreground">
          Who downloaded which CRM data and when. Admin-only.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Recent exports{data ? ` (${data.length})` : ""}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : !data || data.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              No exports recorded yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>By</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Range</TableHead>
                  <TableHead className="text-right">Rows</TableHead>
                  <TableHead>File</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.user_name ?? r.user_id.slice(0, 8)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="capitalize">
                        {r.export_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {fmtRange(r.range_from, r.range_to)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.row_count}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {r.filename}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
