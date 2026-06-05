import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useCrm } from "@/contexts/crm-context";
import {
  listDecedentEvents,
  listFeedFilterOptions,
  type DecedentEventType,
} from "@/lib/decedent-events.functions";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  Activity,
  UserPlus,
  ArrowRight,
  StickyNote,
  FileText,
  Workflow,
  Filter,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const EVENT_TYPES = ["created", "status_changed", "note", "document", "workflow"] as const;
const RANGES = ["all", "today", "7d", "30d"] as const;

const searchSchema = z.object({
  types: fallback(z.array(z.enum(EVENT_TYPES)), []).default([]),
  decedent: fallback(z.string(), "").default(""),
  actor: fallback(z.string(), "").default(""),
  range: fallback(z.enum(RANGES), "all").default("all"),
});

export const Route = createFileRoute("/_authenticated/_crm/crm/updates")({
  validateSearch: zodValidator(searchSchema),
  component: UpdatesPage,
  head: () => ({ meta: [{ title: "Updates — CareOne CRM" }] }),
});

const STATUS_LABEL: Record<string, string> = {
  checked_in: "Checked in",
  prepped: "Prepped",
  cremated: "Cremated",
  released: "Released",
  checked_out: "Checked out",
};

const TYPE_META: Record<
  DecedentEventType,
  { label: string; icon: React.ComponentType<{ className?: string }>; color: string }
> = {
  created: { label: "Check-in", icon: UserPlus, color: "bg-blue-500/15 text-blue-700 dark:text-blue-300" },
  status_changed: { label: "Status", icon: ArrowRight, color: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  note: { label: "Note", icon: StickyNote, color: "bg-muted text-foreground" },
  document: { label: "Document", icon: FileText, color: "bg-purple-500/15 text-purple-700 dark:text-purple-300" },
  workflow: { label: "Workflow", icon: Workflow, color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
};

function rangeToSinceIso(range: (typeof RANGES)[number]): string | undefined {
  const now = new Date();
  if (range === "today") {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }
  if (range === "7d") return new Date(now.getTime() - 7 * 86_400_000).toISOString();
  if (range === "30d") return new Date(now.getTime() - 30 * 86_400_000).toISOString();
  return undefined;
}

function UpdatesPage() {
  const { currentOrg } = useCrm();
  const orgId = currentOrg!.organization_id;
  const qc = useQueryClient();
  const navigate = useNavigate({ from: "/crm/updates" });
  const search = Route.useSearch();

  const fetchEvents = useServerFn(listDecedentEvents);
  const fetchOptions = useServerFn(listFeedFilterOptions);

  const sinceIso = rangeToSinceIso(search.range);

  const queryArgs = {
    organizationId: orgId,
    limit: 100,
    ...(search.types.length ? { eventTypes: search.types } : {}),
    ...(search.decedent ? { decedentId: search.decedent } : {}),
    ...(search.actor ? { actorId: search.actor } : {}),
    ...(sinceIso ? { sinceIso } : {}),
  };

  const { data: events, isLoading } = useQuery({
    queryKey: ["crm", "updates", orgId, search],
    queryFn: () => fetchEvents({ data: queryArgs }),
    refetchInterval: 30_000,
  });

  const { data: options } = useQuery({
    queryKey: ["crm", "updates", "options", orgId],
    queryFn: () => fetchOptions({ data: { organizationId: orgId } }),
    staleTime: 60_000,
  });

  useEffect(() => {
    const channel = supabase
      .channel(`crm-updates-${orgId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "decedent_events",
          filter: `organization_id=eq.${orgId}`,
        },
        () => qc.invalidateQueries({ queryKey: ["crm", "updates", orgId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, qc]);

  const grouped = useMemo(() => {
    const groups = new Map<string, any[]>();
    (events ?? []).forEach((e: any) => {
      const key = new Date(e.created_at).toDateString();
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(e);
    });
    return Array.from(groups.entries());
  }, [events]);

  const activeCount =
    search.types.length +
    (search.decedent ? 1 : 0) +
    (search.actor ? 1 : 0) +
    (search.range !== "all" ? 1 : 0);

  const setSearch = (patch: Partial<typeof search>) =>
    navigate({ search: (prev) => ({ ...prev, ...patch }) });

  const clearAll = () =>
    navigate({ search: () => ({ types: [], decedent: "", actor: "", range: "all" as const }) });

  const toggleType = (t: DecedentEventType) => {
    const next = search.types.includes(t)
      ? search.types.filter((x) => x !== t)
      : [...search.types, t];
    setSearch({ types: next });
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Updates</h1>
          <p className="text-sm text-muted-foreground">
            Live activity feed across decedents in your organization.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={search.range}
            onValueChange={(v) => setSearch({ range: v as (typeof RANGES)[number] })}
          >
            <SelectTrigger className="h-9 w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All time</SelectItem>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={search.decedent || "all"}
            onValueChange={(v) => setSearch({ decedent: v === "all" ? "" : v })}
          >
            <SelectTrigger className="h-9 w-[180px]">
              <SelectValue placeholder="Decedent" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All decedents</SelectItem>
              {(options?.decedents ?? []).map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.last_name}, {d.first_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={search.actor || "all"}
            onValueChange={(v) => setSearch({ actor: v === "all" ? "" : v })}
          >
            <SelectTrigger className="h-9 w-[160px]">
              <SelectValue placeholder="Actor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actors</SelectItem>
              {(options?.actors ?? []).map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.full_name ?? "Unknown"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 gap-2">
                <Filter className="h-4 w-4" />
                Types
                {search.types.length ? (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
                    {search.types.length}
                  </Badge>
                ) : null}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-56 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Event types</p>
              {EVENT_TYPES.map((t) => (
                <label key={t} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={search.types.includes(t)}
                    onCheckedChange={() => toggleType(t)}
                  />
                  <Label className="cursor-pointer font-normal">{TYPE_META[t].label}</Label>
                </label>
              ))}
            </PopoverContent>
          </Popover>

          {activeCount > 0 ? (
            <Button variant="ghost" size="sm" className="h-9 gap-1" onClick={clearAll}>
              <X className="h-4 w-4" />
              Clear
            </Button>
          ) : null}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !events || events.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <Activity className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="font-medium">
                {activeCount > 0 ? "No activity matches your filters" : "No activity yet"}
              </p>
              <p className="text-sm text-muted-foreground">
                {activeCount > 0
                  ? "Try clearing some filters."
                  : "Check-ins and status changes will appear here in real time."}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {grouped.map(([day, items]) => (
            <div key={day}>
              <div className="sticky top-0 z-10 bg-background/80 backdrop-blur py-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {formatDayLabel(day)}
                </h3>
              </div>
              <Card>
                <CardContent className="p-0">
                  <ol className="divide-y">
                    {items.map((e: any) => (
                      <EventRow key={e.id} e={e} />
                    ))}
                  </ol>
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EventRow({ e }: { e: any }) {
  const meta = TYPE_META[e.event_type as DecedentEventType] ?? TYPE_META.workflow;
  const Icon = meta.icon;
  const name = e.decedents
    ? `${e.decedents.last_name}, ${e.decedents.first_name}`
    : "Decedent";

  return (
    <li className="flex gap-3 p-3 sm:p-4">
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
          meta.color,
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <Link to="/crm/decedents" className="font-medium truncate hover:underline">
            {name}
          </Link>
          <Badge variant="secondary" className={cn("border-0 text-[10px]", meta.color)}>
            {meta.label}
          </Badge>
          <span className="ml-auto text-xs text-muted-foreground">
            {formatTime(e.created_at)}
          </span>
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">{describeEvent(e)}</p>
        {e.actor_name ? (
          <p className="mt-0.5 text-xs text-muted-foreground">by {e.actor_name}</p>
        ) : null}
      </div>
    </li>
  );
}

function describeEvent(e: any): string {
  switch (e.event_type) {
    case "created":
      return e.message || "Checked in to facility";
    case "status_changed":
      return `${STATUS_LABEL[e.from_status] ?? e.from_status ?? "—"} → ${
        STATUS_LABEL[e.to_status] ?? e.to_status ?? "—"
      }`;
    case "note":
      return e.message ?? "Note added";
    case "document":
      return e.message ?? "Document updated";
    default:
      return e.message ?? "Workflow event";
  }
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatDayLabel(day: string): string {
  const d = new Date(day);
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86_400_000).toDateString();
  if (d.toDateString() === today) return "Today";
  if (d.toDateString() === yesterday) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
}
