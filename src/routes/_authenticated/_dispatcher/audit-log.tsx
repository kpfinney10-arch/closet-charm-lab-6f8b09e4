import { createFileRoute, redirect } from "@tanstack/react-router";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useInfiniteQuery } from "@tanstack/react-query";
import { exportAdminAuditLogs, listAdminAuditLogs } from "@/lib/admin-users.functions";
import { toast } from "sonner";

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
import {
  Loader2,
  ScrollText,
  Download,
  Search,
  CalendarIcon,
  X,
  User,
  AlertTriangle,
} from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/_dispatcher/audit-log")({
  beforeLoad: async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw redirect({ to: "/login" });
    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) throw redirect({ to: "/dashboard" });
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
  "user_approved",
  "user_unapproved",
  "role_changed",
  "password_reset",
] as const;
type ActionFilter = (typeof ACTIONS)[number] | "all";

const PAGE_SIZE = 50;

type AuditRow = {
  id: string;
  created_at: string;
  action: string;
  target_email: string | null;
  target_user_id: string | null;
  actor_email: string | null;
  actor_id: string;
  details: Record<string, unknown> | null;
};

function actionLabel(a: string) {
  switch (a) {
    case "user_created": return "User created";
    case "user_disabled": return "User disabled";
    case "user_enabled": return "User enabled";
    case "user_deleted": return "User deleted";
    case "user_approved": return "User approved";
    case "user_unapproved": return "Approval revoked";
    case "role_changed": return "Role changed";
    case "password_reset": return "Password reset";
    default: return a;
  }
}

function actionVariant(a: string): "default" | "secondary" | "destructive" | "outline" {
  if (a === "user_deleted" || a === "user_disabled" || a === "user_unapproved") return "destructive";
  if (a === "user_created" || a === "user_enabled" || a === "user_approved") return "default";
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

function parseExportError(err: unknown): {
  message: string;
  detail?: string;
  status?: number;
} {
  // TanStack server fns reject with a Response when handlers throw `new Response(...)`.
  if (err instanceof Response) {
    const status = err.status;
    const friendly =
      status === 401 || status === 403
        ? "You don't have permission to export the audit log."
        : status === 429
          ? "Too many export requests — wait a moment and try again."
          : status >= 500
            ? "The server failed to build the export."
            : "The export request was rejected.";
    return {
      message: friendly,
      detail: `HTTP ${status}${err.statusText ? ` ${err.statusText}` : ""}`,
      status,
    };
  }
  if (err instanceof TypeError && /fetch|network/i.test(err.message)) {
    return {
      message: "Network error — check your connection and try again.",
      detail: err.message,
    };
  }
  if (err instanceof Error) {
    return { message: "Export failed", detail: err.message };
  }
  return { message: "Export failed", detail: String(err) };
}

function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function AuditLogPage() {
  const [filter, setFilter] = useState<ActionFilter>("all");
  const [search, setSearch] = useState("");
  const [actor, setActor] = useState("");
  const [range, setRange] = useState<DateRange | undefined>(undefined);
  const [selectedRow, setSelectedRow] = useState<AuditRow | null>(null);

  const debouncedSearch = useDebounced(search);
  const debouncedActor = useDebounced(actor);

  const fromIso = useMemo(
    () => (range?.from ? new Date(new Date(range.from).setHours(0, 0, 0, 0)).toISOString() : null),
    [range?.from],
  );
  const toIso = useMemo(() => {
    const end = range?.to ?? range?.from;
    return end ? new Date(new Date(end).setHours(23, 59, 59, 999)).toISOString() : null;
  }, [range?.to, range?.from]);

  const fetchLogs = useServerFn(listAdminAuditLogs);
  const exportLogs = useServerFn(exportAdminAuditLogs);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStatus, setExportStatus] = useState("");
  const [exportLimit, setExportLimit] = useState<string>("10000");
  const [exportError, setExportError] = useState<{
    message: string;
    detail?: string;
    status?: number;
    at: string;
  } | null>(null);

  const handleExport = async () => {
    setExportError(null);
    setIsExporting(true);
    setExportProgress(8);
    setExportStatus("Querying audit log…");
    const toastId = toast.loading("Querying audit log…");

    // Indeterminate creep while the server query runs — caps at 70%.
    const creep = window.setInterval(() => {
      setExportProgress((p) => (p < 70 ? p + Math.max(1, (70 - p) * 0.08) : p));
    }, 200);

    try {
      const result = await exportLogs({
        data: {
          action: filter === "all" ? null : filter,
          search: debouncedSearch.trim() || null,
          actor: debouncedActor.trim() || null,
          from: fromIso,
          to: toIso,
          max: Number(exportLimit),
        },
      });
      window.clearInterval(creep);

      setExportProgress(80);
      setExportStatus("Building CSV…");
      toast.loading(`Building CSV (${result.rows.length.toLocaleString()} rows)…`, {
        id: toastId,
      });

      if (!result.rows.length) {
        setExportProgress(100);
        toast.info("No matching audit entries to export.", { id: toastId });
        return;
      }

      // Yield a frame so the "Building CSV" state can paint before blocking work.
      await new Promise((r) => setTimeout(r, 30));
      try {
        downloadCsv(result.rows as unknown as Array<Record<string, unknown>>);
      } catch (downloadErr) {
        throw new Error(
          downloadErr instanceof Error
            ? `Couldn't trigger download: ${downloadErr.message}`
            : "Couldn't trigger download in this browser.",
        );
      }
      setExportProgress(100);
      setExportStatus("Download started");
      toast.success(
        result.truncated
          ? `Download started — ${result.rows.length.toLocaleString()} rows (capped at ${result.cap.toLocaleString()}). Narrow filters for more.`
          : `Download started — ${result.rows.length.toLocaleString()} row${result.rows.length === 1 ? "" : "s"}.`,
        { id: toastId },
      );
    } catch (err) {
      window.clearInterval(creep);
      const parsed = parseExportError(err);
      setExportStatus("Export failed");
      setExportError({ ...parsed, at: new Date().toLocaleTimeString() });
      toast.error(parsed.message, {
        id: toastId,
        description: parsed.detail,
        duration: 8000,
        action: { label: "Retry", onClick: () => handleExport() },
      });
    } finally {
      window.clearInterval(creep);
      // Let the completed bar linger briefly before resetting.
      window.setTimeout(() => {
        setIsExporting(false);
        setExportProgress(0);
        setExportStatus("");
      }, 600);
    }
  };

  const queryKey = [
    "admin-audit-logs",
    filter,
    debouncedSearch.trim(),
    debouncedActor.trim(),
    fromIso,
    toIso,
  ] as const;

  const {
    data,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetching,
  } = useInfiniteQuery({
    queryKey,
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      fetchLogs({
        data: {
          action: filter === "all" ? null : filter,
          search: debouncedSearch.trim() || null,
          actor: debouncedActor.trim() || null,
          from: fromIso,
          to: toIso,
          limit: PAGE_SIZE,
          offset: pageParam,
        },
      }),
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((n, p) => n + (p?.rows?.length ?? 0), 0);
      return loaded < (lastPage?.total ?? 0) ? loaded : undefined;
    },
  });

  const rows = useMemo(
    () => (data?.pages ?? []).flatMap((p) => p?.rows ?? []),
    [data],
  );
  const total = data?.pages?.[0]?.total ?? 0;

  const hasAnyFilter =
    filter !== "all" || !!debouncedSearch.trim() || !!debouncedActor.trim() || !!range;

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
              placeholder="Search email or action…"
              className="w-[240px] pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="relative">
            <User className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Actor email or id"
              className="w-[200px] pl-8"
              value={actor}
              onChange={(e) => setActor(e.target.value)}
            />
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "justify-start text-left font-normal",
                  !range && "text-muted-foreground",
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {range?.from ? (
                  range.to ? (
                    <>
                      {format(range.from, "LLL d, y")} – {format(range.to, "LLL d, y")}
                    </>
                  ) : (
                    format(range.from, "LLL d, y")
                  )
                ) : (
                  <span>Date range</span>
                )}
                {range && (
                  <X
                    className="ml-2 h-3.5 w-3.5 opacity-60 hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      setRange(undefined);
                    }}
                  />
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <div className="flex flex-wrap gap-1 border-b p-2">
                {[
                  { label: "Today", days: 0 },
                  { label: "Last 7 days", days: 6 },
                  { label: "Last 30 days", days: 29 },
                ].map((p) => (
                  <Button
                    key={p.label}
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => {
                      const to = new Date();
                      const from = new Date();
                      from.setDate(to.getDate() - p.days);
                      setRange({ from, to });
                    }}
                  >
                    {p.label}
                  </Button>
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => {
                    const now = new Date();
                    setRange({
                      from: new Date(now.getFullYear(), now.getMonth(), 1),
                      to: now,
                    });
                  }}
                >
                  This month
                </Button>
              </div>
              <Calendar
                mode="range"
                numberOfMonths={2}
                selected={range}
                onSelect={setRange}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
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
          {hasAnyFilter && (
            <Button
              variant="ghost"
              onClick={() => {
                setFilter("all");
                setSearch("");
                setActor("");
                setRange(undefined);
              }}
            >
              Clear
            </Button>
          )}
          <Select value={exportLimit} onValueChange={setExportLimit} disabled={isExporting}>
            <SelectTrigger className="w-[140px]" aria-label="CSV row limit">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1000">Up to 1,000 rows</SelectItem>
              <SelectItem value="5000">Up to 5,000 rows</SelectItem>
              <SelectItem value="10000">Up to 10,000 rows</SelectItem>
              <SelectItem value="25000">Up to 25,000 rows</SelectItem>
              <SelectItem value="50000">Up to 50,000 rows</SelectItem>
              <SelectItem value="100000">Up to 100,000 rows</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={handleExport}
            disabled={isExporting || total === 0}
          >
            {isExporting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Export CSV{total > 0 ? ` (${total.toLocaleString()})` : ""}
          </Button>
        </div>
      </div>


      {isExporting && (
        <div
          role="status"
          aria-live="polite"
          className="space-y-1.5 rounded-md border bg-muted/40 p-3"
        >
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{exportStatus}</span>
            <span className="font-mono tabular-nums text-muted-foreground">
              {Math.round(exportProgress)}%
            </span>
          </div>
          <Progress value={exportProgress} className="h-1.5" />
        </div>
      )}

      {!isExporting && exportError && (
        <Alert
          variant="destructive"
          role="alert"
          aria-live="assertive"
          className="flex items-start gap-3"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1 space-y-1">
            <AlertTitle>CSV export failed</AlertTitle>
            <AlertDescription className="space-y-1">
              <p>{exportError.message}</p>
              {exportError.detail && (
                <p className="font-mono text-xs opacity-80">
                  {exportError.status ? `[${exportError.status}] ` : ""}
                  {exportError.detail}
                </p>
              )}
              <p className="text-xs opacity-70">Failed at {exportError.at}</p>
            </AlertDescription>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleExport}
              disabled={isExporting}
            >
              Retry
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setExportError(null)}
              aria-label="Dismiss error"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Recent activity
            {!isLoading ? (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                ({rows.length.toLocaleString()} of {total.toLocaleString()})
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
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {hasAnyFilter
                ? "No entries match your filters."
                : "No audit entries yet."}
            </p>
          ) : (
            <>
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
                    {rows.map((row) => (
                      <TableRow
                        key={row.id}
                        className="cursor-pointer"
                        onClick={() => setSelectedRow(row as AuditRow)}
                      >
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
              <div className="mt-4 flex items-center justify-center">
                {hasNextPage ? (
                  <Button
                    variant="outline"
                    onClick={() => fetchNextPage()}
                    disabled={isFetchingNextPage}
                  >
                    {isFetchingNextPage ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    Load more
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {isFetching ? "Refreshing…" : "End of results"}
                  </span>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <AuditDetailSheet
        row={selectedRow}
        onClose={() => setSelectedRow(null)}
      />
    </div>
  );
}

function AuditDetailSheet({
  row,
  onClose,
}: {
  row: AuditRow | null;
  onClose: () => void;
}) {
  const open = !!row;
  const detailEntries =
    row?.details && typeof row.details === "object"
      ? Object.entries(row.details as Record<string, unknown>)
      : [];

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {row && (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <Badge variant={actionVariant(row.action)}>
                  {actionLabel(row.action)}
                </Badge>
                <span className="text-sm font-normal text-muted-foreground">
                  {new Date(row.created_at).toLocaleString()}
                </span>
              </SheetTitle>
              <SheetDescription>
                Entry ID <code className="font-mono text-xs">{row.id}</code>
              </SheetDescription>
            </SheetHeader>

            <div className="mt-6 space-y-5 text-sm">
              <DetailField label="Target">
                <div className="space-y-0.5">
                  <div>{row.target_email ?? "—"}</div>
                  {row.target_user_id && (
                    <code className="block break-all font-mono text-xs text-muted-foreground">
                      {row.target_user_id}
                    </code>
                  )}
                </div>
              </DetailField>

              <DetailField label="Performed by">
                <div className="space-y-0.5">
                  <div>{row.actor_email ?? "—"}</div>
                  <code className="block break-all font-mono text-xs text-muted-foreground">
                    {row.actor_id}
                  </code>
                </div>
              </DetailField>

              <DetailField label="Details">
                {detailEntries.length === 0 ? (
                  <span className="text-muted-foreground">No additional details.</span>
                ) : (
                  <dl className="divide-y rounded-md border bg-muted/30">
                    {detailEntries.map(([k, v]) => (
                      <div
                        key={k}
                        className="grid grid-cols-[120px_1fr] gap-3 px-3 py-2"
                      >
                        <dt className="font-mono text-xs text-muted-foreground">
                          {k}
                        </dt>
                        <dd className="break-words font-mono text-xs">
                          {typeof v === "string" ? v : JSON.stringify(v)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </DetailField>

              <DetailField label="Raw JSON">
                <pre className="max-h-64 overflow-auto rounded-md border bg-muted/30 p-3 font-mono text-xs">
                  {JSON.stringify(row, null, 2)}
                </pre>
              </DetailField>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function DetailField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      {children}
    </div>
  );
}
