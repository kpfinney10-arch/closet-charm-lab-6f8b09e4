import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCrm } from "@/contexts/crm-context";
import { listDecedentEvents, type DecedentEventType } from "@/lib/decedent-events.functions";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Activity,
  UserPlus,
  ArrowRight,
  StickyNote,
  FileText,
  Workflow,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/_crm/crm/updates")({
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

function UpdatesPage() {
  const { currentOrg } = useCrm();
  const orgId = currentOrg!.organization_id;
  const qc = useQueryClient();
  const fetchEvents = useServerFn(listDecedentEvents);

  const { data: events, isLoading } = useQuery({
    queryKey: ["crm", "updates", orgId],
    queryFn: () => fetchEvents({ data: { organizationId: orgId, limit: 100 } }),
    refetchInterval: 30_000,
  });

  // Realtime: refetch when new events land for this org
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

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Updates</h1>
        <p className="text-sm text-muted-foreground">
          Live activity feed across decedents in your organization.
        </p>
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
              <p className="font-medium">No activity yet</p>
              <p className="text-sm text-muted-foreground">
                Check-ins and status changes will appear here in real time.
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
          <Link
            to="/crm/decedents"
            className="font-medium truncate hover:underline"
          >
            {name}
          </Link>
          <Badge variant="secondary" className={cn("border-0 text-[10px]", meta.color)}>
            {meta.label}
          </Badge>
          <span className="ml-auto text-xs text-muted-foreground">
            {formatTime(e.created_at)}
          </span>
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {describeEvent(e)}
        </p>
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
