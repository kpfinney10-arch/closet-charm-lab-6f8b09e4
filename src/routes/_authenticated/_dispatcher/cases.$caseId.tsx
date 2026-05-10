import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft,
  Loader2,
  MapPin,
  User as UserIcon,
  Phone,
  Calendar,
  FileText,
  Trash2,
  History,
  StickyNote,
} from "lucide-react";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/_dispatcher/cases/$caseId")({
  component: CaseDetail,
  head: () => ({
    meta: [{ title: "Case detail — Transport Dispatch" }],
  }),
});

type CaseRow = Database["public"]["Tables"]["cases"]["Row"];
type CaseEvent = Database["public"]["Tables"]["case_events"]["Row"];
type CaseStatus = Database["public"]["Enums"]["case_status"];

const NONE = "__none__";

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

function formatDateTime(s: string | null | undefined) {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString();
  } catch {
    return s;
  }
}
function formatDate(s: string | null | undefined) {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString();
  } catch {
    return s;
  }
}

function CaseDetail() {
  const { caseId } = Route.useParams();
  const navigate = useNavigate();
  const { hasRole, hasAnyRole } = useAuth();
  const qc = useQueryClient();
  const canEdit = hasAnyRole(["admin", "dispatcher"]);
  const isAdmin = hasRole("admin");

  const caseQ = useQuery({
    queryKey: ["case", caseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cases")
        .select("*")
        .eq("id", caseId)
        .maybeSingle();
      if (error) throw error;
      return data as CaseRow | null;
    },
  });

  const eventsQ = useQuery({
    queryKey: ["case-events", caseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("case_events")
        .select("*")
        .eq("case_id", caseId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CaseEvent[];
    },
  });

  const driversQ = useQuery({
    queryKey: ["drivers-for-assignment"],
    enabled: canEdit,
    queryFn: async () => {
      const { data: roleRows, error: rErr } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "driver");
      if (rErr) throw rErr;
      const ids = (roleRows ?? []).map((r) => r.user_id);
      if (ids.length === 0) return [] as { id: string; full_name: string | null; on_duty: boolean }[];
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, on_duty")
        .in("id", ids);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Active workload per driver (excluding the current case) — drives sort order
  // and the double-booking warning.
  const driverWorkloadQ = useQuery({
    queryKey: ["driver-workload", caseId],
    enabled: canEdit,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cases")
        .select("id, primary_driver_id, secondary_driver_id, case_number, status")
        .in("status", [
          "new",
          "assigned",
          "en_route_pickup",
          "on_scene",
          "in_custody",
          "en_route_dropoff",
        ])
        .neq("id", caseId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const vehiclesQ = useQuery({
    queryKey: ["vehicles-active"],
    enabled: canEdit,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicles")
        .select("id, name, license_plate, active")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const docsQ = useQuery({
    queryKey: ["case-docs", caseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("case_documents")
        .select("*")
        .eq("case_id", caseId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Realtime updates for this case
  useEffect(() => {
    const ch = supabase
      .channel(`case-${caseId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cases", filter: `id=eq.${caseId}` },
        () => void caseQ.refetch(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "case_events", filter: `case_id=eq.${caseId}` },
        () => void eventsQ.refetch(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  const updateCase = useMutation({
    mutationFn: async (patch: Partial<CaseRow>) => {
      const { error } = await supabase.from("cases").update(patch).eq("id", caseId);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["case", caseId] });
      void qc.invalidateQueries({ queryKey: ["case-events", caseId] });
      void qc.invalidateQueries({ queryKey: ["cases", "active"] });
      void qc.invalidateQueries({ queryKey: ["driver-workload", caseId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Build conflict map: driver_id -> array of other active case numbers
  const conflictsByDriver = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const row of driverWorkloadQ.data ?? []) {
      for (const id of [row.primary_driver_id, row.secondary_driver_id]) {
        if (!id) continue;
        const arr = m.get(id) ?? [];
        arr.push(row.case_number);
        m.set(id, arr);
      }
    }
    return m;
  }, [driverWorkloadQ.data]);

  // Assignment-aware updater: warns on double-booking, auto-toggles status,
  // and shows assignment toasts. The DB trigger already logs the event.
  const assignDriver = (
    field: "primary_driver_id" | "secondary_driver_id",
    nextDriverId: string | null,
  ) => {
    const c = caseQ.data;
    if (!c) return;

    // Double-booking warning
    if (nextDriverId) {
      const conflicts = conflictsByDriver.get(nextDriverId) ?? [];
      if (conflicts.length > 0) {
        const name =
          driversQ.data?.find((d) => d.id === nextDriverId)?.full_name ??
          "This driver";
        const ok = confirm(
          `${name} is already assigned to ${conflicts.length} other active ${
            conflicts.length === 1 ? "case" : "cases"
          } (${conflicts.join(", ")}).\n\nAssign anyway?`,
        );
        if (!ok) return;
      }
    }

    // Compute resulting driver state for auto-status
    const otherField =
      field === "primary_driver_id" ? "secondary_driver_id" : "primary_driver_id";
    const otherDriver = c[otherField];
    const willHaveDriver = !!nextDriverId || !!otherDriver;

    const patch: Partial<CaseRow> = { [field]: nextDriverId };
    if (willHaveDriver && c.status === "new") {
      patch.status = "assigned";
    } else if (!willHaveDriver && c.status === "assigned") {
      patch.status = "new";
    }

    const driverName =
      nextDriverId
        ? driversQ.data?.find((d) => d.id === nextDriverId)?.full_name ??
          "Driver"
        : null;
    const labelPrefix = field === "primary_driver_id" ? "Primary" : "Secondary";

    updateCase.mutate(patch, {
      onSuccess: () => {
        if (driverName) {
          toast.success(`${labelPrefix} driver assigned: ${driverName}`);
        } else {
          toast.success(`${labelPrefix} driver removed`);
        }
      },
    });
  };

  const deleteCase = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("cases").delete().eq("id", caseId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Case deleted");
      navigate({ to: "/dashboard" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [note, setNote] = useState("");
  const addNote = useMutation({
    mutationFn: async (text: string) => {
      const { error } = await supabase.from("case_events").insert({
        case_id: caseId,
        event_type: "note_added",
        notes: text,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNote("");
      toast.success("Note added");
      void eventsQ.refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const driverNameById = useMemo(() => {
    const m = new Map<string, string>();
    (driversQ.data ?? []).forEach((d) => m.set(d.id, d.full_name ?? "Unnamed driver"));
    return m;
  }, [driversQ.data]);

  if (caseQ.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!caseQ.data) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="space-y-3 py-12 text-center">
            <p className="font-medium">Case not found</p>
            <Button asChild variant="outline">
              <Link to="/dashboard">Back to dispatch</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const c = caseQ.data;
  const decedentName =
    [c.decedent_first_name, c.decedent_last_name].filter(Boolean).join(" ") ||
    "Unnamed decedent";

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Button asChild variant="ghost" size="sm" className="-ml-2 h-7">
            <Link to="/dashboard">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold">{decedentName}</h1>
            <Badge className={STATUS_COLOR[c.status]} variant="secondary">
              {STATUS_LABEL[c.status]}
            </Badge>
          </div>
          <p className="font-mono text-xs text-muted-foreground">{c.case_number}</p>
        </div>

        {canEdit && (
          <div className="flex items-center gap-2">
            <Select
              value={c.status}
              onValueChange={(v) => updateCase.mutate({ status: v as CaseStatus })}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALL_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isAdmin && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="icon" aria-label="Delete case">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this case?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This permanently removes case {c.case_number} and its events. This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => deleteCase.mutate()}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Left column */}
        <div className="space-y-4 lg:col-span-2">
          {/* Decedent */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <UserIcon className="h-4 w-4" /> Decedent
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <Field label="Name" value={decedentName} />
              <Field label="Sex" value={c.decedent_sex ?? "—"} />
              <Field label="Date of birth" value={formatDate(c.decedent_dob)} />
              <Field label="Date of death" value={formatDateTime(c.decedent_dod)} />
              <Field label="Weight" value={c.decedent_weight_lbs ? `${c.decedent_weight_lbs} lbs` : "—"} />
              <Field label="Special handling" value={c.special_handling ?? "—"} className="sm:col-span-2" />
            </CardContent>
          </Card>

          {/* Pickup / Dropoff */}
          <div className="grid gap-4 md:grid-cols-2">
            <LocationCard
              title="Pickup"
              address={c.pickup_address}
              city={c.pickup_city}
              state={c.pickup_state}
              zip={c.pickup_zip}
              contact={c.pickup_contact_name}
              phone={c.pickup_contact_phone}
              notes={c.pickup_notes}
            />
            <LocationCard
              title="Dropoff"
              address={c.dropoff_address}
              city={c.dropoff_city}
              state={c.dropoff_state}
              zip={c.dropoff_zip}
              notes={c.dropoff_notes}
            />
          </div>

          {/* Authorizing party */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Phone className="h-4 w-4" /> Authorizing party
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-3">
              <Field label="Name" value={c.authorizing_party_name ?? "—"} />
              <Field label="Relation" value={c.authorizing_party_relation ?? "—"} />
              <Field label="Phone" value={c.authorizing_party_phone ?? "—"} />
            </CardContent>
          </Card>

          {/* Documents */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-4 w-4" /> Documents
              </CardTitle>
            </CardHeader>
            <CardContent>
              {docsQ.isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : (docsQ.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No documents uploaded yet.</p>
              ) : (
                <ul className="divide-y">
                  {(docsQ.data ?? []).map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{d.caption || d.file_path.split("/").pop()}</div>
                        <div className="text-xs text-muted-foreground capitalize">
                          {String(d.doc_type).replaceAll("_", " ")} · {formatDateTime(d.created_at)}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          const { data, error } = await supabase.storage
                            .from("case-documents")
                            .createSignedUrl(d.file_path, 60);
                          if (error || !data?.signedUrl) {
                            toast.error("Could not open document");
                            return;
                          }
                          window.open(data.signedUrl, "_blank");
                        }}
                      >
                        Open
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Assignment */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Calendar className="h-4 w-4" /> Assignment
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">Scheduled</label>
                <div className="text-sm">{formatDateTime(c.scheduled_at)}</div>
              </div>

              {canEdit ? (
                <>
                  <AssignSelect
                    label="Primary driver"
                    value={c.primary_driver_id}
                    drivers={driversQ.data ?? []}
                    onChange={(v) => updateCase.mutate({ primary_driver_id: v })}
                  />
                  <AssignSelect
                    label="Secondary driver"
                    value={c.secondary_driver_id}
                    drivers={driversQ.data ?? []}
                    onChange={(v) => updateCase.mutate({ secondary_driver_id: v })}
                  />
                  <div>
                    <label className="text-xs text-muted-foreground">Vehicle</label>
                    <Select
                      value={c.vehicle_id ?? NONE}
                      onValueChange={(v) =>
                        updateCase.mutate({ vehicle_id: v === NONE ? null : v })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Unassigned" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Unassigned</SelectItem>
                        {(vehiclesQ.data ?? []).map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            {v.name}
                            {v.license_plate ? ` · ${v.license_plate}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              ) : (
                <>
                  <Field
                    label="Primary driver"
                    value={c.primary_driver_id ? driverNameById.get(c.primary_driver_id) ?? "Assigned" : "—"}
                  />
                  <Field
                    label="Secondary driver"
                    value={c.secondary_driver_id ? driverNameById.get(c.secondary_driver_id) ?? "Assigned" : "—"}
                  />
                </>
              )}
            </CardContent>
          </Card>

          {/* Notes */}
          {canEdit && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <StickyNote className="h-4 w-4" /> Add note
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Textarea
                  rows={3}
                  placeholder="Note for the case timeline…"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
                <Button
                  size="sm"
                  disabled={!note.trim() || addNote.isPending}
                  onClick={() => addNote.mutate(note.trim())}
                >
                  {addNote.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add note"}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Timeline */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <History className="h-4 w-4" /> Timeline
              </CardTitle>
            </CardHeader>
            <CardContent>
              {eventsQ.isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : (eventsQ.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No events yet.</p>
              ) : (
                <ol className="space-y-3">
                  {(eventsQ.data ?? []).map((e) => (
                    <li key={e.id} className="border-l-2 border-muted pl-3">
                      <div className="text-xs text-muted-foreground">
                        {formatDateTime(e.created_at)}
                      </div>
                      <div className="text-sm font-medium capitalize">
                        {String(e.event_type).replaceAll("_", " ")}
                        {e.from_status && e.to_status && (
                          <span className="ml-1 font-normal text-muted-foreground">
                            ({STATUS_LABEL[e.from_status]} → {STATUS_LABEL[e.to_status]})
                          </span>
                        )}
                      </div>
                      {e.notes && <div className="mt-0.5 text-sm">{e.notes}</div>}
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  className,
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm">{value}</div>
    </div>
  );
}

function LocationCard({
  title,
  address,
  city,
  state,
  zip,
  contact,
  phone,
  notes,
}: {
  title: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  contact?: string | null;
  phone?: string | null;
  notes?: string | null;
}) {
  const line2 = [city, state].filter(Boolean).join(", ");
  const line = [line2, zip].filter(Boolean).join(" ");
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MapPin className="h-4 w-4" /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div>{address || "—"}</div>
        {line && <div className="text-muted-foreground">{line}</div>}
        {(contact || phone) && (
          <div className="pt-1 text-muted-foreground">
            {contact ?? ""}
            {contact && phone ? " · " : ""}
            {phone ?? ""}
          </div>
        )}
        {notes && <div className="border-t pt-2 text-muted-foreground">{notes}</div>}
      </CardContent>
    </Card>
  );
}

function AssignSelect({
  label,
  value,
  drivers,
  onChange,
}: {
  label: string;
  value: string | null;
  drivers: { id: string; full_name: string | null; on_duty: boolean }[];
  onChange: (v: string | null) => void;
}) {
  return (
    <div>
      <label className="text-xs text-muted-foreground">{label}</label>
      <Select
        value={value ?? NONE}
        onValueChange={(v) => onChange(v === NONE ? null : v)}
      >
        <SelectTrigger>
          <SelectValue placeholder="Unassigned" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Unassigned</SelectItem>
          {drivers.map((d) => (
            <SelectItem key={d.id} value={d.id}>
              {d.full_name ?? "Unnamed driver"}
              {d.on_duty ? " · on duty" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
