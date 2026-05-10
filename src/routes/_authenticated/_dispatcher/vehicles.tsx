import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { Loader2, Plus, Pencil, Trash2, Search, Truck } from "lucide-react";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/_dispatcher/vehicles")({
  component: VehiclesPage,
  head: () => ({
    meta: [{ title: "Vehicles — Transport Dispatch" }],
  }),
});

type VehicleRow = Database["public"]["Tables"]["vehicles"]["Row"];

type FormState = {
  name: string;
  make: string;
  model: string;
  year: string;
  license_plate: string;
  capacity: string;
  notes: string;
  active: boolean;
};
const EMPTY: FormState = {
  name: "",
  make: "",
  model: "",
  year: "",
  license_plate: "",
  capacity: "1",
  notes: "",
  active: true,
};

function VehiclesPage() {
  const { hasAnyRole } = useAuth();
  const qc = useQueryClient();
  const canEdit = hasAnyRole(["admin", "dispatcher"]);

  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<VehicleRow | null>(null);
  const [creating, setCreating] = useState(false);

  const vehiclesQ = useQuery({
    queryKey: ["vehicles-admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicles")
        .select("*")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as VehicleRow[];
    },
  });

  // Active assignments count per vehicle
  const usageQ = useQuery({
    queryKey: ["vehicles-usage"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cases")
        .select("vehicle_id")
        .not("vehicle_id", "is", null)
        .in("status", [
          "new",
          "assigned",
          "en_route_pickup",
          "on_scene",
          "in_custody",
          "en_route_dropoff",
        ]);
      if (error) throw error;
      const m = new Map<string, number>();
      for (const r of data ?? []) {
        if (!r.vehicle_id) continue;
        m.set(r.vehicle_id, (m.get(r.vehicle_id) ?? 0) + 1);
      }
      return m;
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return vehiclesQ.data ?? [];
    return (vehiclesQ.data ?? []).filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        (v.license_plate ?? "").toLowerCase().includes(q) ||
        (v.make ?? "").toLowerCase().includes(q) ||
        (v.model ?? "").toLowerCase().includes(q),
    );
  }, [vehiclesQ.data, search]);

  const upsertMut = useMutation({
    mutationFn: async (vars: { id?: string; values: FormState }) => {
      const yr = vars.values.year.trim();
      const cap = vars.values.capacity.trim();
      const payload = {
        name: vars.values.name.trim(),
        make: vars.values.make.trim() || null,
        model: vars.values.model.trim() || null,
        year: yr ? Number(yr) : null,
        license_plate: vars.values.license_plate.trim() || null,
        capacity: cap ? Number(cap) : 1,
        notes: vars.values.notes.trim() || null,
        active: vars.values.active,
      };
      if (vars.id) {
        const { error } = await supabase.from("vehicles").update(payload).eq("id", vars.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("vehicles").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: (_d, vars) => {
      toast.success(vars.id ? "Vehicle updated" : "Vehicle added");
      setEditing(null);
      setCreating(false);
      void qc.invalidateQueries({ queryKey: ["vehicles-admin"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("vehicles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Vehicle deleted");
      void qc.invalidateQueries({ queryKey: ["vehicles-admin"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Vehicles</h1>
          <p className="text-sm text-muted-foreground">
            Fleet roster. Assign a vehicle to a case from the case detail page.
          </p>
        </div>
        {canEdit && (
          <Dialog open={creating} onOpenChange={setCreating}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4" /> New vehicle
              </Button>
            </DialogTrigger>
            {creating && (
              <VehicleForm
                initial={EMPTY}
                pending={upsertMut.isPending}
                onSubmit={(values) => upsertMut.mutateAsync({ values })}
                onCancel={() => setCreating(false)}
              />
            )}
          </Dialog>
        )}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center gap-2 pb-3">
          <CardTitle className="flex-1 text-base">
            {vehiclesQ.data?.length ?? 0} vehicles
          </CardTitle>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, plate, make…"
              className="h-8 w-64 pl-7"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {vehiclesQ.isLoading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-10 text-center text-sm text-muted-foreground">
              <Truck className="h-8 w-8" />
              {vehiclesQ.data?.length === 0
                ? "No vehicles yet — add your first one."
                : "No matches."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Make / Model</TableHead>
                  <TableHead>Year</TableHead>
                  <TableHead>Plate</TableHead>
                  <TableHead>Capacity</TableHead>
                  <TableHead>Active runs</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((v) => {
                  const inUse = usageQ.data?.get(v.id) ?? 0;
                  return (
                    <TableRow key={v.id}>
                      <TableCell className="font-medium">{v.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {[v.make, v.model].filter(Boolean).join(" ") || "—"}
                      </TableCell>
                      <TableCell className="text-sm">{v.year ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {v.license_plate ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm">{v.capacity ?? 1}</TableCell>
                      <TableCell>
                        {inUse > 0 ? (
                          <Badge variant="secondary">{inUse}</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {v.active ? (
                          <Badge>Active</Badge>
                        ) : (
                          <Badge variant="outline">Inactive</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {canEdit ? (
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setEditing(v)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-destructive"
                                  disabled={inUse > 0}
                                  title={
                                    inUse > 0
                                      ? "Vehicle is assigned to active runs"
                                      : undefined
                                  }
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete {v.name}?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Past cases that referenced this vehicle keep their
                                    record. It will no longer be selectable.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deleteMut.mutate(v.id)}
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => (o ? null : setEditing(null))}>
        {editing && (
          <VehicleForm
            initial={{
              name: editing.name,
              make: editing.make ?? "",
              model: editing.model ?? "",
              year: editing.year != null ? String(editing.year) : "",
              license_plate: editing.license_plate ?? "",
              capacity: String(editing.capacity ?? 1),
              notes: editing.notes ?? "",
              active: editing.active,
            }}
            pending={upsertMut.isPending}
            onSubmit={(values) => upsertMut.mutateAsync({ id: editing.id, values })}
            onCancel={() => setEditing(null)}
          />
        )}
      </Dialog>
    </div>
  );
}

function VehicleForm({
  initial,
  pending,
  onSubmit,
  onCancel,
}: {
  initial: FormState;
  pending: boolean;
  onSubmit: (values: FormState) => Promise<unknown>;
  onCancel: () => void;
}) {
  const [v, setV] = useState<FormState>(initial);
  const set = <K extends keyof FormState>(k: K, val: FormState[K]) =>
    setV((s) => ({ ...s, [k]: val }));

  const submit = async () => {
    if (!v.name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (v.year && (!/^\d{4}$/.test(v.year) || Number(v.year) < 1950 || Number(v.year) > 2100)) {
      toast.error("Year must be a valid 4-digit year");
      return;
    }
    try {
      await onSubmit(v);
    } catch {
      /* handled */
    }
  };

  return (
    <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{initial.name ? "Edit vehicle" : "New vehicle"}</DialogTitle>
      </DialogHeader>
      <div className="grid gap-3">
        <div className="grid gap-1.5">
          <Label>Name / unit number *</Label>
          <Input
            value={v.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="e.g. Unit 1, Van A"
            maxLength={100}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label>Make</Label>
            <Input value={v.make} onChange={(e) => set("make", e.target.value)} maxLength={60} />
          </div>
          <div className="grid gap-1.5">
            <Label>Model</Label>
            <Input value={v.model} onChange={(e) => set("model", e.target.value)} maxLength={60} />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="grid gap-1.5">
            <Label>Year</Label>
            <Input
              inputMode="numeric"
              value={v.year}
              onChange={(e) => set("year", e.target.value.replace(/\D/g, "").slice(0, 4))}
              maxLength={4}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>License plate</Label>
            <Input
              value={v.license_plate}
              onChange={(e) => set("license_plate", e.target.value.toUpperCase())}
              maxLength={20}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Capacity</Label>
            <Input
              inputMode="numeric"
              value={v.capacity}
              onChange={(e) => set("capacity", e.target.value.replace(/\D/g, "").slice(0, 2))}
              maxLength={2}
            />
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label>Notes</Label>
          <Textarea
            value={v.notes}
            onChange={(e) => set("notes", e.target.value)}
            maxLength={1000}
            rows={3}
          />
        </div>
        <div className="flex items-center gap-3">
          <Switch checked={v.active} onCheckedChange={(val) => set("active", val)} />
          <Label className="cursor-pointer" onClick={() => set("active", !v.active)}>
            Active (selectable on new cases)
          </Label>
        </div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={pending}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />} Save
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
