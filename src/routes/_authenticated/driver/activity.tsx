// Driver activity inbox — recent events on cases currently assigned to me.
// RLS on case_events allows drivers to read events only for their cases
// (see is_case_driver()), so we just query directly via the browser client.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Inbox, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/driver/activity")({
  component: DriverActivity,
  head: () => ({ meta: [{ title: "Activity — Driver" }] }),
});

const STATUS_LABEL: Record<string, string> = {
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

const EVENT_LABEL: Record<string, string> = {
  created: "Case created",
  assigned: "Driver assigned",
  reassigned: "Driver reassigned",
  status_changed: "Status changed",
  cancelled: "Cancelled",
  note_added: "Note added",
};

function DriverActivity() {
  const { user } = useAuth();
  const userId = user?.id;

  const { data, isLoading } = useQuery({
    queryKey: ["driver", "activity", userId],
    enabled: !!userId,
    queryFn: async () => {
      // Get my current cases first, then fetch their events. RLS will block
      // anything we shouldn't see anyway.
      const { data: cases, error: cErr } = await supabase
        .from("cases")
        .select("id, case_number, status, pickup_city, pickup_state")
        .or(`primary_driver_id.eq.${userId},secondary_driver_id.eq.${userId}`)
        .order("updated_at", { ascending: false })
        .limit(50);
      if (cErr) throw cErr;
      const caseIds = (cases ?? []).map((c) => c.id);
      if (!caseIds.length) return { cases: [], events: [] as any[] };

      const { data: events, error: eErr } = await supabase
        .from("case_events")
        .select("id, case_id, event_type, from_status, to_status, notes, created_at")
        .in("case_id", caseIds)
        .order("created_at", { ascending: false })
        .limit(100);
      if (eErr) throw eErr;
      return { cases: cases ?? [], events: events ?? [] };
    },
    refetchOnWindowFocus: true,
  });

  const caseMap = new Map((data?.cases ?? []).map((c) => [c.id, c]));

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <header className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/driver">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
        </Button>
        <div>
          <h1 className="text-xl font-semibold">Activity</h1>
          <p className="text-xs text-muted-foreground">
            Recent updates on your runs
          </p>
        </div>
      </header>

      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : !data || data.events.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
            <Inbox className="h-8 w-8" />
            <p className="text-sm">No recent activity.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {data.events.map((e) => {
            const c = caseMap.get(e.case_id);
            const label = EVENT_LABEL[e.event_type] ?? e.event_type;
            const statusBit =
              e.event_type === "status_changed" && e.to_status
                ? ` → ${STATUS_LABEL[e.to_status] ?? e.to_status}`
                : "";
            return (
              <Card key={e.id}>
                <CardContent className="space-y-1 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium">
                      {label}
                      {statusBit}
                    </div>
                    <span className="whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(e.created_at).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {c ? (
                      <>
                        <Badge variant="secondary">{c.case_number}</Badge>
                        <span>
                          {[c.pickup_city, c.pickup_state]
                            .filter(Boolean)
                            .join(", ") || "Pickup TBD"}
                        </span>
                      </>
                    ) : (
                      <span>Case</span>
                    )}
                  </div>
                  {e.notes && (
                    <p className="pt-1 text-sm">{e.notes}</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
