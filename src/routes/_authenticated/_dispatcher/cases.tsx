import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Search, Plus, X } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type CaseRow = Database["public"]["Tables"]["cases"]["Row"];
type CaseStatus = Database["public"]["Enums"]["case_status"];

const ALL_STATUSES: CaseStatus[] = [
  "new",
  "assigned",
  "en_route_pickup",
  "on_scene",
  "in_custody",
  "en_route_dropoff",
  "delivered",
  "closed",
  "cancelled",
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

const STATUS_COLOR: Record<CaseStatus, string> = {
  new: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  assigned: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
  en_route_pickup: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  on_scene: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  in_custody: "bg-purple-500/15 text-purple-700 dark:text-purple-300",
  en_route_dropoff: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  delivered: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  closed: "bg-muted text-muted-foreground",
  cancelled: "bg-destructive/15 text-destructive",
};

const ALL_FILTER = "all";
const ACTIVE_FILTER = "active";
const ACTIVE_SET = new Set<CaseStatus>([
  "new", "assigned", "en_route_pickup", "on_scene", "in_custody", "en_route_dropoff",
]);

type Search = { q: string; status: string };

export const Route = createFileRoute("/_authenticated/_dispatcher/cases")({
  validateSearch: (raw: Record<string, unknown>): Search => ({
    q: typeof raw.q === "string" ? raw.q : "",
    status: typeof raw.status === "string" ? raw.status : ACTIVE_FILTER,
  }),
  component: CasesListPage,
  head: () => ({
    meta: [
      { title: "Cases — Transport Dispatch" },
      { name: "description", content: "Search and filter all transport cases." },
    ],
  }),
});

function formatDateTime(s: string | null | undefined) {
  if (!s) return "—";
  try { return new Date(s).toLocaleString(); } catch { return s; }
}

function CasesListPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  // Local debounced search input
  const [qInput, setQInput] = useState(search.q);
  useEffect(() => setQInput(search.q), [search.q]);
  useEffect(() => {
    const t = setTimeout(() => {
      if (qInput !== search.q) {
        void navigate({ search: (prev: Search) => ({ ...prev, q: qInput }) });
      }
    }, 250);
    return () => clearTimeout(t);
  }, [qInput, search.q, navigate]);

  const casesQ = useQuery({
    queryKey: ["cases", "list", search.status],
    queryFn: async () => {
      let query = supabase
        .from("cases")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (search.status === ACTIVE_FILTER) {
        query = query.in("status", Array.from(ACTIVE_SET));
      } else if (search.status !== ALL_FILTER) {
        query = query.eq("status", search.status as CaseStatus);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as CaseRow[];
    },
  });

  // Realtime: refetch on any case change
  useEffect(() => {
    const ch = supabase
      .channel("cases-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "cases" }, () => {
        void casesQ.refetch();
      })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = search.q.trim().toLowerCase();
    if (!q) return casesQ.data ?? [];
    return (casesQ.data ?? []).filter((c) => {
      const name = `${c.decedent_first_name ?? ""} ${c.decedent_last_name ?? ""}`.toLowerCase();
      const place = `${c.pickup_city ?? ""} ${c.pickup_address ?? ""} ${c.dropoff_city ?? ""} ${c.dropoff_address ?? ""}`.toLowerCase();
      return (
        c.case_number.toLowerCase().includes(q) ||
        name.includes(q) ||
        place.includes(q)
      );
    });
  }, [casesQ.data, search.q]);

  const hasFilter = search.q !== "" || search.status !== ACTIVE_FILTER;

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Cases</h1>
          <p className="text-sm text-muted-foreground">
            {casesQ.isLoading
              ? "Loading…"
              : `${filtered.length} of ${casesQ.data?.length ?? 0} shown`}
          </p>
        </div>
        <Button asChild>
          <Link to="/cases/new">
            <Plus className="h-4 w-4" />
            New case
          </Link>
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="Search case #, name, or city…"
            className="pl-8"
          />
        </div>
        <Select
          value={search.status}
          onValueChange={(v) => navigate({ search: (prev: Search) => ({ ...prev, status: v }) })}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ACTIVE_FILTER}>Active</SelectItem>
            <SelectItem value={ALL_FILTER}>All statuses</SelectItem>
            {ALL_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hasFilter && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate({ search: () => ({ q: "", status: ACTIVE_FILTER }) })}
          >
            <X className="h-4 w-4" />
            Clear
          </Button>
        )}
      </div>

      {/* List */}
      <Card>
        <CardContent className="p-0">
          {casesQ.isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              {hasFilter ? "No cases match those filters." : "No cases yet."}
            </div>
          ) : (
            <ul className="divide-y">
              {filtered.map((c) => {
                const decedent =
                  [c.decedent_first_name, c.decedent_last_name].filter(Boolean).join(" ") ||
                  "Unnamed decedent";
                return (
                  <li key={c.id}>
                    <Link
                      to="/cases/$caseId"
                      params={{ caseId: c.id }}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 transition-colors hover:bg-accent/40"
                    >
                      <span className="font-mono text-xs text-muted-foreground w-20">
                        {c.case_number}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium">{decedent}</span>
                      <Badge className={STATUS_COLOR[c.status]} variant="secondary">
                        {STATUS_LABEL[c.status]}
                      </Badge>
                      <span className="hidden truncate text-xs text-muted-foreground sm:inline-block sm:max-w-[280px]">
                        {(c.pickup_city ?? c.pickup_address ?? "—")} → {(c.dropoff_city ?? c.dropoff_address ?? "—")}
                      </span>
                      <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                        {formatDateTime(c.scheduled_at ?? c.created_at)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
