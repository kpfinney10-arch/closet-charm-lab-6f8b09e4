import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, MapPin, ArrowRight, Inbox } from "lucide-react";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type CaseRow = Database["public"]["Tables"]["cases"]["Row"];

export const Route = createFileRoute("/_authenticated/driver/")({
  component: DriverQueue,
  head: () => ({
    meta: [{ title: "My runs — Transport Dispatch" }],
  }),
});

const ACTIVE: Database["public"]["Enums"]["case_status"][] = [
  "new",
  "assigned",
  "en_route_pickup",
  "on_scene",
  "in_custody",
  "en_route_dropoff",
];

function DriverQueue() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const profile = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("on_duty")
        .eq("id", user!.id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const cases = useQuery({
    queryKey: ["driver-cases", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cases")
        .select("*")
        .or(`primary_driver_id.eq.${user!.id},secondary_driver_id.eq.${user!.id}`)
        .in("status", ACTIVE)
        .order("scheduled_at", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as CaseRow[];
    },
  });

  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel(`driver-cases-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "cases" }, () => {
        void cases.refetch();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const toggleOnDuty = useMutation({
    mutationFn: async (next: boolean) => {
      const { error } = await supabase
        .from("profiles")
        .update({ on_duty: next })
        .eq("id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["profile", user?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4 p-4">
      {/* On-duty toggle */}
      <Card>
        <CardContent className="flex items-center justify-between gap-3 py-4">
          <div>
            <div className="font-semibold">On duty</div>
            <div className="text-xs text-muted-foreground">
              When on, dispatch can assign you new runs.
            </div>
          </div>
          {profile.isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Switch
              checked={profile.data?.on_duty ?? false}
              onCheckedChange={(v) => toggleOnDuty.mutate(v)}
            />
          )}
        </CardContent>
      </Card>

      {/* Queue */}
      <div>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">My active runs</h2>
        {cases.isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (cases.data?.length ?? 0) === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <Inbox className="h-10 w-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No active runs assigned.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {(cases.data ?? []).map((c) => (
              <Card key={c.id} className="transition-shadow hover:shadow-md">
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{c.case_number}</span>
                    <Badge variant="secondary" className="capitalize">
                      {c.status.replaceAll("_", " ")}
                    </Badge>
                  </div>
                  <div className="font-medium">
                    {[c.decedent_first_name, c.decedent_last_name].filter(Boolean).join(" ") || "Unnamed decedent"}
                  </div>
                  <div className="flex items-start gap-2 text-sm text-muted-foreground">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                    <div className="min-w-0">
                      <div className="truncate">
                        <span className="font-medium text-foreground">Pickup:</span>{" "}
                        {c.pickup_address || c.pickup_city || "—"}
                      </div>
                      <div className="my-1 flex items-center gap-1 text-xs">
                        <ArrowRight className="h-3 w-3" />
                      </div>
                      <div className="truncate">
                        <span className="font-medium text-foreground">Dropoff:</span>{" "}
                        {c.dropoff_address || c.dropoff_city || "—"}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
