import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCrm } from "@/contexts/crm-context";
import {
  listDecedents,
  createDecedent,
  setDecedentStatus,
  type DecedentStatus,
} from "@/lib/decedents.functions";
import { listFuneralHomes } from "@/lib/funeral-homes.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, Loader2, UserSquare2, MoreVertical, HandHeart, LogOut } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ReleaseDialog } from "@/components/crm/release-dialog";
import { checkoutDecedent } from "@/lib/decedent-releases.functions";

export const Route = createFileRoute("/_authenticated/_crm/crm/decedents")({
  component: DecedentsPage,
  head: () => ({ meta: [{ title: "Decedents — CareOne CRM" }] }),
});

const STATUS_META: Record<
  DecedentStatus,
  { label: string; color: string; column: boolean }
> = {
  checked_in: { label: "Checked in", color: "bg-blue-500/15 text-blue-700 dark:text-blue-300", column: true },
  prepped: { label: "Prepped", color: "bg-amber-500/15 text-amber-700 dark:text-amber-300", column: true },
  cremated: { label: "Cremated", color: "bg-orange-500/15 text-orange-700 dark:text-orange-300", column: true },
  released: { label: "Released", color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", column: true },
  checked_out: { label: "Checked out", color: "bg-muted text-muted-foreground", column: false },
};

const BOARD_COLUMNS: DecedentStatus[] = ["checked_in", "prepped", "cremated", "released"];

function DecedentsPage() {
  const { currentOrg } = useCrm();
  const qc = useQueryClient();
  const orgId = currentOrg!.organization_id;

  const fetchList = useServerFn(listDecedents);
  const fetchHomes = useServerFn(listFuneralHomes);
  const createFn = useServerFn(createDecedent);
  const statusFn = useServerFn(setDecedentStatus);
  const checkoutFn = useServerFn(checkoutDecedent);

  const [releaseFor, setReleaseFor] = useState<any | null>(null);

  const [includeOut, setIncludeOut] = useState(false);
  const [view, setView] = useState<"board" | "list">("board");

  const { data: rows, isLoading } = useQuery({
    queryKey: ["crm", "decedents", orgId, includeOut],
    queryFn: () =>
      fetchList({ data: { organizationId: orgId, includeCheckedOut: includeOut } }),
  });

  const { data: homes } = useQuery({
    queryKey: ["crm", "funeral-homes", orgId],
    queryFn: () => fetchHomes({ data: { organizationId: orgId } }),
  });

  const [open, setOpen] = useState(false);
  const emptyForm = {
    firstName: "",
    lastName: "",
    dateOfBirth: "",
    dateOfDeath: "",
    sex: "",
    weightLbs: "",
    funeralHomeId: "",
    location: "",
    rack: "",
    notes: "",
  };
  const [form, setForm] = useState(emptyForm);

  const createMut = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          organizationId: orgId,
          firstName: form.firstName,
          lastName: form.lastName,
          dateOfBirth: form.dateOfBirth || null,
          dateOfDeath: form.dateOfDeath || null,
          sex: form.sex || null,
          weightLbs: form.weightLbs ? Number(form.weightLbs) : null,
          funeralHomeId: form.funeralHomeId || null,
          location: form.location || null,
          rack: form.rack || null,
          notes: form.notes || null,
        },
      }),
    onSuccess: () => {
      toast.success("Decedent checked in");
      setOpen(false);
      setForm(emptyForm);
      qc.invalidateQueries({ queryKey: ["crm", "decedents", orgId] });
    },
    onError: (e: any) => toast.error(e.message ?? "Check-in failed"),
  });

  const statusMut = useMutation({
    mutationFn: (v: { id: string; status: DecedentStatus }) =>
      statusFn({ data: v }),
    onSuccess: (_d, v) => {
      toast.success(`Marked ${STATUS_META[v.status].label.toLowerCase()}`);
      qc.invalidateQueries({ queryKey: ["crm", "decedents", orgId] });
      qc.invalidateQueries({ queryKey: ["crm", "updates", orgId] });
    },
    onError: (e: any) => toast.error(e.message ?? "Update failed"),
  });

  const checkoutMut = useMutation({
    mutationFn: (id: string) => checkoutFn({ data: { decedentId: id } }),
    onSuccess: () => {
      toast.success("Checked out");
      qc.invalidateQueries({ queryKey: ["crm", "decedents", orgId] });
      qc.invalidateQueries({ queryKey: ["crm", "updates", orgId] });
    },
    onError: (e: any) => toast.error(e.message ?? "Checkout failed"),
  });

  const grouped = useMemo(() => {
    const g: Record<DecedentStatus, any[]> = {
      checked_in: [],
      prepped: [],
      cremated: [],
      released: [],
      checked_out: [],
    };
    (rows ?? []).forEach((r: any) => g[r.status as DecedentStatus]?.push(r));
    return g;
  }, [rows]);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Decedents</h1>
          <p className="text-sm text-muted-foreground">
            In-house roster, check-in/out, and workflow.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIncludeOut((v) => !v)}
          >
            {includeOut ? "Hide checked-out" : "Show checked-out"}
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1">
                <Plus className="h-4 w-4" /> Check in
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Check in decedent</DialogTitle>
                <DialogDescription>
                  Add a new decedent to the in-house board.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="fn">First name *</Label>
                    <Input
                      id="fn"
                      value={form.firstName}
                      onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="ln">Last name *</Label>
                    <Input
                      id="ln"
                      value={form.lastName}
                      onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="dob">Date of birth</Label>
                    <Input
                      id="dob"
                      type="date"
                      value={form.dateOfBirth}
                      onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="dod">Date of death</Label>
                    <Input
                      id="dod"
                      type="date"
                      value={form.dateOfDeath}
                      onChange={(e) => setForm({ ...form, dateOfDeath: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="sex">Sex</Label>
                    <Select
                      value={form.sex}
                      onValueChange={(v) => setForm({ ...form, sex: v })}
                    >
                      <SelectTrigger id="sex">
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="M">Male</SelectItem>
                        <SelectItem value="F">Female</SelectItem>
                        <SelectItem value="X">Other / unknown</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="w">Weight (lbs)</Label>
                    <Input
                      id="w"
                      type="number"
                      inputMode="decimal"
                      value={form.weightLbs}
                      onChange={(e) => setForm({ ...form, weightLbs: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="fh">Funeral home</Label>
                  <Select
                    value={form.funeralHomeId}
                    onValueChange={(v) => setForm({ ...form, funeralHomeId: v })}
                  >
                    <SelectTrigger id="fh">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      {(homes ?? []).filter((h: any) => h.active).map((h: any) => (
                        <SelectItem key={h.id} value={h.id}>
                          {h.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="loc">Location</Label>
                    <Input
                      id="loc"
                      placeholder="Cooler A"
                      value={form.location}
                      onChange={(e) => setForm({ ...form, location: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="rack">Rack / shelf</Label>
                    <Input
                      id="rack"
                      placeholder="3-Top"
                      value={form.rack}
                      onChange={(e) => setForm({ ...form, rack: e.target.value })}
                    />
                  </div>
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
                  disabled={!form.firstName || !form.lastName || createMut.isPending}
                >
                  {createMut.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Check in"
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs value={view} onValueChange={(v) => setView(v as "board" | "list")}>
        <TabsList>
          <TabsTrigger value="board">Board</TabsTrigger>
          <TabsTrigger value="list">List</TabsTrigger>
        </TabsList>

        <TabsContent value="board" className="mt-4">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !rows || rows.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              {BOARD_COLUMNS.map((status) => (
                <div key={status} className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <h3 className="text-sm font-semibold">{STATUS_META[status].label}</h3>
                    <Badge variant="secondary" className="text-xs">
                      {grouped[status].length}
                    </Badge>
                  </div>
                  <div className="space-y-2">
                    {grouped[status].map((d: any) => (
                      <DecedentCard
                        key={d.id}
                        d={d}
                        onStatus={(s) => statusMut.mutate({ id: d.id, status: s })}
                        onRelease={() => setReleaseFor(d)}
                        onCheckout={() => checkoutMut.mutate(d.id)}
                      />
                    ))}
                    {grouped[status].length === 0 ? (
                      <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
                        Empty
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="list" className="mt-4">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !rows || rows.length === 0 ? (
            <EmptyState />
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="divide-y">
                  {rows.map((d: any) => (
                    <div
                      key={d.id}
                      className="flex flex-wrap items-center justify-between gap-3 p-3"
                    >
                      <div className="min-w-0">
                        <div className="font-medium truncate">
                          {d.last_name}, {d.first_name}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {[d.location, d.rack].filter(Boolean).join(" · ") ||
                            d.funeral_homes?.name ||
                            "—"}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          className={cn("border-0", STATUS_META[d.status as DecedentStatus].color)}
                        >
                          {STATUS_META[d.status as DecedentStatus].label}
                        </Badge>
                        <StatusMenu
                          current={d.status}
                          onSelect={(s) => statusMut.mutate({ id: d.id, status: s })}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function EmptyState() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <UserSquare2 className="h-10 w-10 text-muted-foreground" />
        <div>
          <p className="font-medium">No decedents</p>
          <p className="text-sm text-muted-foreground">
            Check someone in or send a case from dispatch.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function DecedentCard({
  d,
  onStatus,
}: {
  d: any;
  onStatus: (s: DecedentStatus) => void;
}) {
  return (
    <Card className="hover:shadow-sm transition-shadow">
      <CardContent className="space-y-1.5 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-medium truncate">
              {d.last_name}, {d.first_name}
            </div>
            {d.funeral_homes?.name ? (
              <div className="text-xs text-muted-foreground truncate">
                {d.funeral_homes.name}
              </div>
            ) : null}
          </div>
          <StatusMenu current={d.status} onSelect={onStatus} />
        </div>
        {(d.location || d.rack) ? (
          <div className="text-xs text-muted-foreground">
            {[d.location, d.rack].filter(Boolean).join(" · ")}
          </div>
        ) : null}
        {d.dispatch_case_id ? (
          <Link
            to="/cases/$caseId"
            params={{ caseId: d.dispatch_case_id }}
            className="text-xs text-primary hover:underline"
          >
            View dispatch case →
          </Link>
        ) : null}
      </CardContent>
    </Card>
  );
}

function StatusMenu({
  current,
  onSelect,
}: {
  current: DecedentStatus;
  onSelect: (s: DecedentStatus) => void;
}) {
  const options: DecedentStatus[] = [
    "checked_in",
    "prepped",
    "cremated",
    "released",
    "checked_out",
  ];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7">
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {options
          .filter((s) => s !== current)
          .map((s) => (
            <DropdownMenuItem key={s} onClick={() => onSelect(s)}>
              Mark {STATUS_META[s].label.toLowerCase()}
            </DropdownMenuItem>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
