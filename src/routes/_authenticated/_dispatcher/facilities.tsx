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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Search,
  Building2,
  Phone,
} from "lucide-react";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/_dispatcher/facilities")({
  component: FacilitiesPage,
  head: () => ({
    meta: [{ title: "Facilities — Transport Dispatch" }],
  }),
});

type FacilityRow = Database["public"]["Tables"]["facilities"]["Row"];
type FacilityType = Database["public"]["Enums"]["facility_type"];

const FACILITY_TYPES: { value: FacilityType; label: string }[] = [
  { value: "hospital", label: "Hospital" },
  { value: "nursing_home", label: "Nursing home" },
  { value: "hospice", label: "Hospice" },
  { value: "residence", label: "Residence" },
  { value: "medical_examiner", label: "Medical examiner" },
  { value: "funeral_home", label: "Funeral home" },
  { value: "crematory", label: "Crematory" },
  { value: "embalmer", label: "Embalmer" },
  { value: "other", label: "Other" },
];
const TYPE_LABEL = Object.fromEntries(FACILITY_TYPES.map((t) => [t.value, t.label])) as Record<
  FacilityType,
  string
>;

type FormState = {
  name: string;
  type: FacilityType;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  contact_name: string;
  notes: string;
  active: boolean;
};
const EMPTY: FormState = {
  name: "",
  type: "hospital",
  address: "",
  city: "",
  state: "",
  zip: "",
  phone: "",
  contact_name: "",
  notes: "",
  active: true,
};

function FacilitiesPage() {
  const { hasAnyRole } = useAuth();
  const qc = useQueryClient();
  const canEdit = hasAnyRole(["admin", "dispatcher"]);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<FacilityType | "all">("all");
  const [editing, setEditing] = useState<FacilityRow | null>(null);
  const [creating, setCreating] = useState(false);

  const facilitiesQ = useQuery({
    queryKey: ["facilities-admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("facilities")
        .select("*")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as FacilityRow[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (facilitiesQ.data ?? []).filter((f) => {
      if (typeFilter !== "all" && f.type !== typeFilter) return false;
      if (!q) return true;
      return (
        f.name.toLowerCase().includes(q) ||
        (f.city ?? "").toLowerCase().includes(q) ||
        (f.address ?? "").toLowerCase().includes(q)
      );
    });
  }, [facilitiesQ.data, search, typeFilter]);

  const upsertMut = useMutation({
    mutationFn: async (vars: { id?: string; values: FormState }) => {
      const payload = {
        name: vars.values.name.trim(),
        type: vars.values.type,
        address: vars.values.address.trim() || null,
        city: vars.values.city.trim() || null,
        state: vars.values.state.trim() || null,
        zip: vars.values.zip.trim() || null,
        phone: vars.values.phone.trim() || null,
        contact_name: vars.values.contact_name.trim() || null,
        notes: vars.values.notes.trim() || null,
        active: vars.values.active,
      };
      if (vars.id) {
        const { error } = await supabase.from("facilities").update(payload).eq("id", vars.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("facilities").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: (_d, vars) => {
      toast.success(vars.id ? "Facility updated" : "Facility added");
      setEditing(null);
      setCreating(false);
      void qc.invalidateQueries({ queryKey: ["facilities-admin"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("facilities").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Facility deleted");
      void qc.invalidateQueries({ queryKey: ["facilities-admin"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Facilities</h1>
          <p className="text-sm text-muted-foreground">
            Hospitals, residences, funeral homes, and other locations used in cases.
          </p>
        </div>
        {canEdit && (
          <Dialog
            open={creating}
            onOpenChange={(o) => {
              setCreating(o);
              if (!o) setEditing(null);
            }}
          >
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4" /> New facility
              </Button>
            </DialogTrigger>
            {creating && (
              <FacilityForm
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
            {facilitiesQ.data?.length ?? 0} facilities
          </CardTitle>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, city…"
              className="h-8 w-56 pl-7"
            />
          </div>
          <Select
            value={typeFilter}
            onValueChange={(v) => setTypeFilter(v as FacilityType | "all")}
          >
            <SelectTrigger className="h-8 w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {FACILITY_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="p-0">
          {facilitiesQ.isLoading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-10 text-center text-sm text-muted-foreground">
              <Building2 className="h-8 w-8" />
              {facilitiesQ.data?.length === 0
                ? "No facilities yet — add your first one."
                : "No matches."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="font-medium">
                      {f.name}
                      {f.contact_name ? (
                        <div className="text-xs text-muted-foreground">{f.contact_name}</div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{TYPE_LABEL[f.type]}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {[f.address, f.city, f.state, f.zip].filter(Boolean).join(", ") || "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {f.phone ? (
                        <a
                          href={`tel:${f.phone}`}
                          className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                        >
                          <Phone className="h-3 w-3" /> {f.phone}
                        </a>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      {f.active ? (
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
                            onClick={() => setEditing(f)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant="ghost" className="text-destructive">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete {f.name}?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Existing cases referencing this facility will keep their
                                  data, but it won't be selectable for new cases.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteMut.mutate(f.id)}
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
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => (o ? null : setEditing(null))}>
        {editing && (
          <FacilityForm
            initial={{
              name: editing.name,
              type: editing.type,
              address: editing.address ?? "",
              city: editing.city ?? "",
              state: editing.state ?? "",
              zip: editing.zip ?? "",
              phone: editing.phone ?? "",
              contact_name: editing.contact_name ?? "",
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

function FacilityForm({
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
    try {
      await onSubmit(v);
    } catch {
      /* handled */
    }
  };

  return (
    <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{initial.name ? "Edit facility" : "New facility"}</DialogTitle>
      </DialogHeader>
      <div className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
          <div className="grid gap-1.5">
            <Label>Name *</Label>
            <Input value={v.name} onChange={(e) => set("name", e.target.value)} maxLength={200} />
          </div>
          <div className="grid gap-1.5">
            <Label>Type</Label>
            <Select value={v.type} onValueChange={(val) => set("type", val as FacilityType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FACILITY_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label>Street address</Label>
          <Input value={v.address} onChange={(e) => set("address", e.target.value)} maxLength={200} />
        </div>
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
          <div className="grid gap-1.5">
            <Label>City</Label>
            <Input value={v.city} onChange={(e) => set("city", e.target.value)} maxLength={100} />
          </div>
          <div className="grid gap-1.5">
            <Label>State</Label>
            <Input value={v.state} onChange={(e) => set("state", e.target.value)} maxLength={20} />
          </div>
          <div className="grid gap-1.5">
            <Label>ZIP</Label>
            <Input value={v.zip} onChange={(e) => set("zip", e.target.value)} maxLength={20} />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label>Phone</Label>
            <Input value={v.phone} onChange={(e) => set("phone", e.target.value)} maxLength={40} />
          </div>
          <div className="grid gap-1.5">
            <Label>Contact name</Label>
            <Input
              value={v.contact_name}
              onChange={(e) => set("contact_name", e.target.value)}
              maxLength={120}
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
