import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listAdminAuditLogs } from "@/lib/admin-users.functions";
import { useAuth } from "@/contexts/auth-context";
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
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, ScrollText, Download, Search, CalendarIcon, X } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/_dispatcher/audit-log")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/login" });
  },
  component: AuditLogPage,
  head: () => ({
    meta: [{ title: "Audit log — Transport Dispatch" }],
  }),
});

const ACTIONS = [
  "user_created",
  "user_disabled",
  "user_enabled",
  "user_deleted",
  "role_changed",
  "password_reset",
] as const;
type ActionFilter = (typeof ACTIONS)[number] | "all";

function actionLabel(a: string) {
  switch (a) {
    case "user_created": return "User created";
    case "user_disabled": return "User disabled";
    case "user_enabled": return "User enabled";
    case "user_deleted": return "User deleted";
    case "role_changed": return "Role changed";
    case "password_reset": return "Password reset";
    default: return a;
  }
}

function actionVariant(a: string): "default" | "secondary" | "destructive" | "outline" {
  if (a === "user_deleted" || a === "user_disabled") return "destructive";
  if (a === "user_created" || a === "user_enabled") return "default";
  return "secondary";
}

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(rows: Array<Record<string, unknown>>) {
  const header = ["created_at", "action", "target_email", "target_user_id", "actor_email", "actor_id", "details"];
  const body = rows.map((r) =>
    header.map((h) => csvEscape((r as Record<string, unknown>)[h])).join(",")
  );
  const csv = [header.join(","), ...body].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function AuditLogPage() {
  const { hasRole } = useAuth();
  const [filter, setFilter] = useState<ActionFilter>("all");
  const [search, setSearch] = useState("");
  const [range, setRange] = useState<DateRange | undefined>(undefined);
  const fetchLogs = useServerFn(listAdminAuditLogs);

  useEffect(() => {
    if (!hasRole("admin")) {
      window.location.replace("/dashboard");
    }
  }, [hasRole]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-audit-logs", filter],
    queryFn: () =>
      fetchLogs({ data: { action: filter === "all" ? null : filter, limit: 200 } }),
    enabled: hasRole("admin"),
  });

  const fromTs = range?.from ? new Date(range.from).setHours(0, 0, 0, 0) : null;
  const toTs = range?.to
    ? new Date(range.to).setHours(23, 59, 59, 999)
    : range?.from
    ? new Date(range.from).setHours(23, 59, 59, 999)
    : null;

  const filtered = (data ?? []).filter((row) => {
    const ts = new Date(row.created_at).getTime();
    if (fromTs !== null && ts < fromTs) return false;
    if (toTs !== null && ts > toTs) return false;
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return [
      row.target_email,
      row.target_user_id,
      row.actor_email,
      row.actor_id,
      row.action,
      row.details ? JSON.stringify(row.details) : "",
    ]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q));
  });

  return (
    <div className="container mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <ScrollText className="h-6 w-6" /> Audit log
          </h1>
          <p className="text-sm text-muted-foreground">
            Record of administrative changes to user accounts.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search email, user, details…"
              className="w-[260px] pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={filter} onValueChange={(v) => setFilter(v as ActionFilter)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              {ACTIONS.map((a) => (
                <SelectItem key={a} value={a}>
                  {actionLabel(a)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={() => downloadCsv(filtered as unknown as Array<Record<string, unknown>>)}
            disabled={filtered.length === 0}
          >
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Recent activity
            {!isLoading && data ? (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                ({filtered.length}{filtered.length !== data.length ? ` of ${data.length}` : ""})
              </span>
            ) : null}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <p className="text-sm text-destructive">Failed to load audit log.</p>
          ) : !data || data.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No audit entries yet.
            </p>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No entries match your search.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>By</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {new Date(row.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Badge variant={actionVariant(row.action)}>
                          {actionLabel(row.action)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {row.target_email ?? row.target_user_id ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {row.actor_email ?? row.actor_id}
                      </TableCell>
                      <TableCell className="max-w-xs">
                        {row.details && Object.keys(row.details).length > 0 ? (
                          <code className="block truncate text-xs text-muted-foreground">
                            {JSON.stringify(row.details)}
                          </code>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
