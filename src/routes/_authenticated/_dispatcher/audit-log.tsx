import { createFileRoute, redirect } from "@tanstack/react-router";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useInfiniteQuery } from "@tanstack/react-query";
import { exportAdminAuditLogs, listAdminAuditLogs } from "@/lib/admin-users.functions";
import {
  deleteAuditView,
  listAuditViews,
  renameAuditView,
  saveAuditView,
  setDefaultAuditView,
} from "@/lib/audit-views.functions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";

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
  Bookmark,
  Trash2,
  Pencil,
  Check,
  Star,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
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

const ACTION_VALUES = [
  "user_created",
  "user_disabled",
  "user_enabled",
  "user_deleted",
  "user_approved",
  "user_unapproved",
  "role_changed",
  "password_reset",
] as const;

const PAGE_SIZE_VALUES = [25, 50, 100, 200] as const;

const searchSchema = z.object({
  action: fallback(z.enum(["all", "user_created", "user_disabled", "user_enabled", "user_deleted", "user_approved", "user_unapproved", "role_changed", "password_reset"]), "all").default("all"),
  q: fallback(z.string(), "").default(""),
  actor: fallback(z.string(), "").default(""),
  from: fallback(z.string(), "").default(""),
  to: fallback(z.string(), "").default(""),
  size: fallback(z.coerce.number().int().refine((n) => (PAGE_SIZE_VALUES as readonly number[]).includes(n)), 50).default(50),
  pages: fallback(z.coerce.number().int().min(1).max(50), 1).default(1),
});

export const Route = createFileRoute("/_authenticated/_dispatcher/audit-log")({
  validateSearch: zodValidator(searchSchema),
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

const ACTIONS = ACTION_VALUES;
type ActionFilter = (typeof ACTIONS)[number] | "all";



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
  const urlSearch = Route.useSearch();
  const navigate = Route.useNavigate();

  const [filter, setFilter] = useState<ActionFilter>(urlSearch.action as ActionFilter);
  const [search, setSearch] = useState(urlSearch.q);
  const [actor, setActor] = useState(urlSearch.actor);
  const [range, setRange] = useState<DateRange | undefined>(() => {
    const from = urlSearch.from ? new Date(urlSearch.from) : undefined;
    const to = urlSearch.to ? new Date(urlSearch.to) : undefined;
    if (!from && !to) return undefined;
    return { from, to };
  });
  const [selectedRow, setSelectedRow] = useState<AuditRow | null>(null);
  const [pageSize, setPageSize] = useState<number>(urlSearch.size);
  const [targetPages, setTargetPages] = useState<number>(urlSearch.pages);

  const debouncedSearch = useDebounced(search);
  const debouncedActor = useDebounced(actor);

  // Persist filters + pagination in the URL so refresh/share preserves context.
  useEffect(() => {
    const next = {
      action: filter,
      q: debouncedSearch.trim(),
      actor: debouncedActor.trim(),
      from: range?.from ? range.from.toISOString().slice(0, 10) : "",
      to: (range?.to ?? range?.from)
        ? (range?.to ?? range?.from)!.toISOString().slice(0, 10)
        : "",
      size: pageSize,
      pages: targetPages,
    };
    navigate({
      search: () => next,
      replace: true,
      resetScroll: false,
    });
  }, [filter, debouncedSearch, debouncedActor, range, pageSize, targetPages, navigate]);

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
    pageSize,
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
          limit: pageSize,
          offset: pageParam,
        },
      }),
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((n, p) => n + (p?.rows?.length ?? 0), 0);
      return loaded < (lastPage?.total ?? 0) ? loaded : undefined;
    },
  });

  const loadedPages = data?.pages?.length ?? 0;

  // Restore paginated state on refresh: keep loading next pages until we hit
  // the target page count from the URL (or run out of results).
  useEffect(() => {
    if (
      !isLoading &&
      !isFetchingNextPage &&
      hasNextPage &&
      loadedPages > 0 &&
      loadedPages < targetPages
    ) {
      fetchNextPage();
    }
  }, [isLoading, isFetchingNextPage, hasNextPage, loadedPages, targetPages, fetchNextPage]);

  // Keep targetPages in sync as the user loads more, and reset to 1 when
  // filters or page size change.
  useEffect(() => {
    setTargetPages(1);
  }, [filter, debouncedSearch, debouncedActor, fromIso, toIso, pageSize]);

  useEffect(() => {
    if (loadedPages > targetPages) setTargetPages(loadedPages);
  }, [loadedPages, targetPages]);

  const rows = useMemo(
    () => (data?.pages ?? []).flatMap((p) => p?.rows ?? []),
    [data],
  );
  const total = data?.pages?.[0]?.total ?? 0;

  const hasAnyFilter =
    filter !== "all" || !!debouncedSearch.trim() || !!debouncedActor.trim() || !!range;
  const isNonDefault = hasAnyFilter || pageSize !== 50 || targetPages !== 1;

  const resetAll = () => {
    setFilter("all");
    setSearch("");
    setActor("");
    setRange(undefined);
    setPageSize(50);
    setTargetPages(1);
  };

  // Saved views
  const queryClient = useQueryClient();
  const listViewsFn = useServerFn(listAuditViews);
  const saveViewFn = useServerFn(saveAuditView);
  const deleteViewFn = useServerFn(deleteAuditView);
  const renameViewFn = useServerFn(renameAuditView);
  const setDefaultViewFn = useServerFn(setDefaultAuditView);


  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      renameViewFn({ data: { id, name } }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["audit-log-views"] });
      toast.success(`Renamed to "${vars.name}"`);
      setRenamingId(null);
      setRenameDraft("");
    },
    onError: (err) =>
      toast.error("Couldn't rename view", {
        description: err instanceof Error ? err.message : String(err),
      }),
  });

  const viewsQuery = useQuery({
    queryKey: ["audit-log-views"],
    queryFn: () => listViewsFn(),
  });

  const saveMutation = useMutation({
    mutationFn: (name: string) =>
      saveViewFn({
        data: {
          name,
          filters: {
            action: filter,
            q: debouncedSearch.trim(),
            actor: debouncedActor.trim(),
            from: range?.from ? range.from.toISOString().slice(0, 10) : "",
            to: (range?.to ?? range?.from)
              ? (range?.to ?? range?.from)!.toISOString().slice(0, 10)
              : "",
            size: pageSize,
          },
        },
      }),
    onSuccess: (_, name) => {
      queryClient.invalidateQueries({ queryKey: ["audit-log-views"] });
      toast.success(`Saved view "${name}"`);
    },
    onError: (err) =>
      toast.error("Couldn't save view", {
        description: err instanceof Error ? err.message : String(err),
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id }: { id: string; name: string }) => deleteViewFn({ data: { id } }),
    onMutate: ({ name }) => {
      const toastId = toast.loading(`Deleting "${name}"…`);
      return { toastId };
    },
    onSuccess: (_data, vars, ctx) => {
      queryClient.invalidateQueries({ queryKey: ["audit-log-views"] });
      toast.success(`Deleted view "${vars.name}"`, { id: ctx?.toastId });
    },
    onError: (err, vars, ctx) =>
      toast.error(`Couldn't delete "${vars.name}"`, {
        id: ctx?.toastId,
        description: err instanceof Error ? err.message : String(err),
      }),
  });

  const setDefaultMutation = useMutation({
    mutationFn: ({ id, isDefault }: { id: string; isDefault: boolean; name: string }) =>
      setDefaultViewFn({ data: { id, isDefault } }),
    onMutate: ({ isDefault, name }) => {
      const toastId = toast.loading(
        isDefault ? `Setting "${name}" as default…` : `Clearing default on "${name}"…`,
      );
      return { toastId };
    },
    onSuccess: (_data, vars, ctx) => {
      queryClient.invalidateQueries({ queryKey: ["audit-log-views"] });
      toast.success(
        vars.isDefault
          ? `"${vars.name}" is now your default view`
          : `Cleared default on "${vars.name}"`,
        { id: ctx?.toastId },
      );
    },
    onError: (err, vars, ctx) =>
      toast.error(
        vars.isDefault
          ? `Couldn't set "${vars.name}" as default`
          : `Couldn't clear default on "${vars.name}"`,
        {
          id: ctx?.toastId,
          description: err instanceof Error ? err.message : String(err),
        },
      ),
  });



  const applyView = (filters: Record<string, unknown>) => {
    const f = filters ?? {};
    const action = typeof f.action === "string" ? f.action : "all";
    setFilter((ACTION_VALUES as readonly string[]).includes(action) || action === "all"
      ? (action as ActionFilter)
      : "all");
    setSearch(typeof f.q === "string" ? f.q : "");
    setActor(typeof f.actor === "string" ? f.actor : "");
    const fromStr = typeof f.from === "string" && f.from ? f.from : null;
    const toStr = typeof f.to === "string" && f.to ? f.to : null;
    setRange(
      fromStr || toStr
        ? {
            from: fromStr ? new Date(fromStr) : undefined,
            to: toStr ? new Date(toStr) : undefined,
          }
        : undefined,
    );
    setPageSize(typeof f.size === "number" ? f.size : 50);
    setTargetPages(1);
  };

  // Auto-apply the user's default saved view on a fresh page load
  // (only when no filter params are present in the URL).
  const defaultAppliedRef = useRef(false);
  useEffect(() => {
    if (defaultAppliedRef.current) return;
    if (typeof window === "undefined") return;
    if (window.location.search.length > 0) {
      defaultAppliedRef.current = true;
      return;
    }
    const views = viewsQuery.data;
    if (!views) return;
    const def = views.find((v) => v.is_default);
    defaultAppliedRef.current = true;
    if (def) applyView((def.filters ?? {}) as Record<string, unknown>);
  }, [viewsQuery.data]);



  // Detect which saved view (if any) matches current filters.
  const currentMatchId = useMemo(() => {
    const current = {
      action: filter,
      q: debouncedSearch.trim(),
      actor: debouncedActor.trim(),
      from: range?.from ? range.from.toISOString().slice(0, 10) : "",
      to: (range?.to ?? range?.from)
        ? (range?.to ?? range?.from)!.toISOString().slice(0, 10)
        : "",
      size: pageSize,
    };
    return (viewsQuery.data ?? []).find((v) => {
      const f = (v.filters ?? {}) as Record<string, unknown>;
      return (
        (f.action ?? "all") === current.action &&
        (f.q ?? "") === current.q &&
        (f.actor ?? "") === current.actor &&
        (f.from ?? "") === current.from &&
        (f.to ?? "") === current.to &&
        (f.size ?? 50) === current.size
      );
    })?.id ?? null;
  }, [viewsQuery.data, filter, debouncedSearch, debouncedActor, range, pageSize]);

  const [saveOpen, setSaveOpen] = useState(false);
  const [newViewName, setNewViewName] = useState("");

  const handleSave = () => {
    const name = newViewName.trim();
    if (!name) return;
    saveMutation.mutate(name, { onSettled: () => { setSaveOpen(false); setNewViewName(""); } });
  };


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
          {isNonDefault && (
            <Button variant="ghost" onClick={resetAll} title="Reset filters, page, and page size">
              <X className="mr-1.5 h-3.5 w-3.5" />
              Reset
            </Button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-1.5">
                <Bookmark className="h-4 w-4" />
                {currentMatchId
                  ? (viewsQuery.data ?? []).find((v) => v.id === currentMatchId)?.name
                  : "Saved views"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                Your saved views
              </DropdownMenuLabel>
              {viewsQuery.isLoading ? (
                <div className="px-2 py-3 text-xs text-muted-foreground">Loading…</div>
              ) : (viewsQuery.data ?? []).length === 0 ? (
                <div className="px-2 py-3 text-xs text-muted-foreground">
                  No saved views yet.
                </div>
              ) : (
                (viewsQuery.data ?? []).map((v) =>
                  renamingId === v.id ? (
                    (() => {
                      const trimmed = renameDraft.trim();
                      const duplicate =
                        trimmed.length > 0 &&
                        trimmed.toLowerCase() !== v.name.toLowerCase() &&
                        (viewsQuery.data ?? []).some(
                          (o) =>
                            o.id !== v.id &&
                            o.name.toLowerCase() === trimmed.toLowerCase(),
                        );
                      const canSave =
                        !!trimmed &&
                        trimmed !== v.name &&
                        !duplicate &&
                        !renameMutation.isPending;
                      const commit = () => {
                        if (!trimmed) return;
                        if (trimmed === v.name) {
                          setRenamingId(null);
                          return;
                        }
                        if (duplicate) return;
                        renameMutation.mutate({ id: v.id, name: trimmed });
                      };
                      return (
                        <div key={v.id} className="space-y-1.5 px-2 py-1.5">
                          <Input
                            autoFocus
                            value={renameDraft}
                            onChange={(e) => setRenameDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                commit();
                              }
                              if (e.key === "Escape") {
                                setRenamingId(null);
                                setRenameDraft("");
                              }
                            }}
                            aria-invalid={duplicate || !trimmed}
                            className="h-8"
                          />
                          {duplicate ? (
                            <p className="text-xs text-destructive">
                              A view with that name already exists.
                            </p>
                          ) : !trimmed ? (
                            <p className="text-xs text-destructive">
                              Name can't be empty or just whitespace.
                            </p>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              Name can't be empty or just whitespace.
                            </p>
                          )}

                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => { setRenamingId(null); setRenameDraft(""); }}
                            >
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              onClick={commit}
                              disabled={!canSave}
                            >
                              Save
                            </Button>
                          </div>
                        </div>
                      );
                    })()

                  ) : (
                    <DropdownMenuItem
                      key={v.id}
                      onSelect={(e) => {
                        e.preventDefault();
                        applyView((v.filters ?? {}) as Record<string, unknown>);
                      }}
                      onKeyDown={(e) => {
                        // Keyboard shortcuts while the menu item is focused.
                        // Radix's roving tabindex prevents tabbing into child
                        // icon buttons, so we surface the actions here.
                        if (e.key === "s" || e.key === "S") {
                          e.preventDefault();
                          if (!v.is_default && !setDefaultMutation.isPending) {
                            setDefaultMutation.mutate({
                              id: v.id,
                              isDefault: true,
                              name: v.name,
                            });
                          }
                        } else if (
                          e.key === "Delete" ||
                          e.key === "Backspace"
                        ) {
                          e.preventDefault();
                          if (confirm(`Delete view "${v.name}"?`)) {
                            deleteMutation.mutate({ id: v.id, name: v.name });
                          }
                        } else if (e.key === "r" || e.key === "R") {
                          e.preventDefault();
                          setRenamingId(v.id);
                          setRenameDraft(v.name);
                        }
                      }}
                      aria-keyshortcuts="Enter S R Delete"
                      title="Enter: apply  ·  S: set default  ·  R: rename  ·  Delete: remove"
                      className="group flex items-center justify-between gap-2 rounded-sm transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
                    >
                      <span className="flex items-center gap-2 truncate">
                        {currentMatchId === v.id ? (
                          <Check className="h-3.5 w-3.5 text-primary" />
                        ) : (
                          <span className="w-3.5" />
                        )}
                        <span className="truncate">{v.name}</span>
                        {v.is_default && (
                          <span
                            className="ml-1 inline-flex items-center gap-1 rounded-sm bg-amber-100 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
                            title="Default view — auto-applies when opening the audit log"
                          >
                            <Star className="h-2.5 w-2.5" fill="currentColor" />
                            Default
                          </span>
                        )}
                      </span>
                      <span className="flex items-center gap-1">
                        <button
                          type="button"
                          tabIndex={-1}
                          disabled={v.is_default || setDefaultMutation.isPending}
                          className={cn(
                            "inline-flex h-6 w-6 items-center justify-center rounded-sm transition-colors hover:bg-amber-100/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 dark:hover:bg-amber-500/10",
                            v.is_default
                              ? "cursor-default text-amber-500 opacity-100"
                              : "opacity-0 hover:text-amber-500 group-hover:opacity-100 group-focus-visible:opacity-100",
                            "disabled:cursor-default",
                          )}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (v.is_default) return;
                            setDefaultMutation.mutate({ id: v.id, isDefault: true, name: v.name });
                          }}
                          aria-label={
                            v.is_default
                              ? `${v.name} is the default view`
                              : `Set view ${v.name} as default (shortcut: S)`
                          }
                          aria-pressed={v.is_default}
                          title={
                            v.is_default
                              ? "This is your default view"
                              : "Set as default (S)"
                          }
                        >
                          <Star
                            className="h-3.5 w-3.5"
                            fill={v.is_default ? "currentColor" : "none"}
                          />
                        </button>

                        <button
                          type="button"
                          tabIndex={-1}
                          className="rounded-sm opacity-0 transition hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100 group-focus-visible:opacity-100"
                          onClick={(e) => {
                            e.stopPropagation();
                            setRenamingId(v.id);
                            setRenameDraft(v.name);
                          }}
                          aria-label={`Rename view ${v.name} (shortcut: R)`}
                          title="Rename (R)"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          tabIndex={-1}
                          className="rounded-sm opacity-0 transition hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100 group-focus-visible:opacity-100"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`Delete view "${v.name}"?`)) deleteMutation.mutate({ id: v.id, name: v.name });
                          }}
                          aria-label={`Delete view ${v.name} (shortcut: Delete)`}
                          title="Delete (Delete)"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </span>


                    </DropdownMenuItem>
                  ),
                )
              )}
              <DropdownMenuSeparator />
              <div className="space-y-2 px-2 py-2">
                {saveOpen ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="view-name" className="text-xs">
                      View name
                    </Label>
                    <Input
                      id="view-name"
                      autoFocus
                      placeholder="e.g. Role changes last 7 days"
                      value={newViewName}
                      onChange={(e) => setNewViewName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSave();
                        if (e.key === "Escape") {
                          setSaveOpen(false);
                          setNewViewName("");
                        }
                      }}
                      className="h-8"
                    />
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => { setSaveOpen(false); setNewViewName(""); }}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleSave}
                        disabled={!newViewName.trim() || saveMutation.isPending}
                      >
                        Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="w-full justify-start"
                    onClick={() => setSaveOpen(true)}
                    disabled={!isNonDefault}
                  >
                    <Bookmark className="mr-2 h-3.5 w-3.5" />
                    Save current filters…
                  </Button>
                )}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

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
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Rows per page</span>
                  <Select
                    value={String(pageSize)}
                    onValueChange={(v) => setPageSize(Number(v))}
                  >
                    <SelectTrigger className="h-8 w-[80px]" aria-label="Rows per page">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAGE_SIZE_VALUES.map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
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
  children: ReactNode;
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
