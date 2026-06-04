import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { useCrm } from "@/contexts/crm-context";
import {
  listFuneralHomes,
  createFuneralHome,
  setFuneralHomeActive,
} from "@/lib/funeral-homes.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Loader2, Building2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/_crm/crm/funeral-homes")({
  component: FuneralHomesPage,
  head: () => ({ meta: [{ title: "Funeral Homes — CareOne CRM" }] }),
});

function FuneralHomesPage() {
  const { currentOrg } = useCrm();
  const qc = useQueryClient();
  const orgId = currentOrg!.organization_id;

  const fetchList = useServerFn(listFuneralHomes);
  const createFn = useServerFn(createFuneralHome);
  const toggleFn = useServerFn(setFuneralHomeActive);

  const { data: homes, isLoading } = useQuery({
    queryKey: ["crm", "funeral-homes", orgId],
    queryFn: () => fetchList({ data: { organizationId: orgId } }),
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    contactName: "",
    phone: "",
    email: "",
    address: "",
    notes: "",
  });

  const createMut = useMutation({
    mutationFn: () => createFn({ data: { organizationId: orgId, ...form } }),
    onSuccess: () => {
      toast.success("Funeral home added");
      setOpen(false);
      setForm({ name: "", contactName: "", phone: "", email: "", address: "", notes: "" });
      qc.invalidateQueries({ queryKey: ["crm", "funeral-homes", orgId] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to add"),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      toggleFn({ data: { id, active } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm", "funeral-homes", orgId] }),
  });

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Funeral Homes</h1>
          <p className="text-sm text-muted-foreground">Partner directory.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1">
              <Plus className="h-4 w-4" /> Add
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New funeral home</DialogTitle>
              <DialogDescription>Add a partner funeral home to your directory.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="contact">Contact</Label>
                  <Input
                    id="contact"
                    value={form.contactName}
                    onChange={(e) => setForm({ ...form, contactName: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="address">Address</Label>
                <Input
                  id="address"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => createMut.mutate()}
                disabled={!form.name || createMut.isPending}
              >
                {createMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !homes || homes.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <Building2 className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No funeral homes yet. Add your first partner to get started.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {homes.map((h: any) => (
            <Card key={h.id}>
              <CardContent className="space-y-2 pt-4">
                <div className="flex items-start justify-between">
                  <div className="font-medium">{h.name}</div>
                  <Badge variant={h.active ? "default" : "secondary"}>
                    {h.active ? "Active" : "Archived"}
                  </Badge>
                </div>
                {h.contact_name ? (
                  <div className="text-sm text-muted-foreground">{h.contact_name}</div>
                ) : null}
                {h.phone ? <div className="text-sm">{h.phone}</div> : null}
                {h.email ? <div className="text-sm">{h.email}</div> : null}
                {h.address ? (
                  <div className="text-xs text-muted-foreground">{h.address}</div>
                ) : null}
                <div className="pt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => toggleMut.mutate({ id: h.id, active: !h.active })}
                  >
                    {h.active ? "Archive" : "Restore"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
