import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCrm } from "@/contexts/crm-context";
import {
  listCremationLogs,
  startCremationLog,
  stopCremationLog,
} from "@/lib/cremation-logs.functions";
import { listDecedents } from "@/lib/decedents.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Flame, Loader2, Play, Square, Printer } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/_crm/crm/cremation-logs")({
  component: CremationLogsPage,
  head: () => ({ meta: [{ title: "Cremation — CareOne CRM" }] }),
});

function CremationLogsPage() {
  const { currentOrg } = useCrm();
  const orgId = currentOrg!.organization_id;
  const qc = useQueryClient();

  const fetchLogs = useServerFn(listCremationLogs);
  const fetchDecedents = useServerFn(listDecedents);
  const startFn = useServerFn(startCremationLog);
  const stopFn = useServerFn(stopCremationLog);

  const { data: logs, isLoading } = useQuery({
    queryKey: ["crm", "cremation-logs", orgId],
    queryFn: () => fetchLogs({ data: { organizationId: orgId, scope: "all" } }),
  });

  const { data: decedents } = useQuery({
    queryKey: ["crm", "decedents", orgId, "for-cremation"],
    queryFn: () => fetchDecedents({ data: { organizationId: orgId } }),
  });

  const active = useMemo(() => (logs ?? []).filter((l: any) => !l.end_time), [logs]);
  const completed = useMemo(() => (logs ?? []).filter((l: any) => l.end_time), [logs]);

  const eligible = useMemo(
    () =>
      (decedents ?? []).filter(
        (d: any) =>
          d.status !== "released" &&
          d.status !== "checked_out" &&
          !active.some((l: any) => l.decedent_id === d.id),
      ),
    [decedents, active],
  );

  const [startOpen, setStartOpen] = useState(false);
  const [decedentId, setDecedentId] = useState<string>("");
  const [retort, setRetort] = useState("");
  const [container, setContainer] = useState("");
  const [weight, setWeight] = useState("");
  const [startComment, setStartComment] = useState("");

  const startMut = useMutation({
    mutationFn: () =>
      startFn({
        data: {
          organizationId: orgId,
          decedentId,
          retort: retort || null,
          containerType: container || null,
          weightLbs: weight ? Number(weight) : null,
          comment: startComment || null,
        },
      }),
    onSuccess: () => {
      toast.success("Cremation started");
      setStartOpen(false);
      setDecedentId("");
      setRetort("");
      setContainer("");
      setWeight("");
      setStartComment("");
      qc.invalidateQueries({ queryKey: ["crm", "cremation-logs", orgId] });
      qc.invalidateQueries({ queryKey: ["crm", "updates", orgId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not start"),
  });

  const [stopLog, setStopLog] = useState<any | null>(null);
  const [ashWeight, setAshWeight] = useState("");
  const [stopComment, setStopComment] = useState("");

  const stopMut = useMutation({
    mutationFn: () =>
      stopFn({
        data: {
          id: stopLog.id,
          ashWeightLbs: ashWeight ? Number(ashWeight) : null,
          comment: stopComment || null,
        },
      }),
    onSuccess: () => {
      toast.success("Cremation completed");
      setStopLog(null);
      setAshWeight("");
      setStopComment("");
      qc.invalidateQueries({ queryKey: ["crm", "cremation-logs", orgId] });
      qc.invalidateQueries({ queryKey: ["crm", "decedents", orgId] });
      qc.invalidateQueries({ queryKey: ["crm", "updates", orgId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not stop"),
  });

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Flame className="h-6 w-6 text-primary" /> Cremation
          </h1>
          <p className="text-sm text-muted-foreground">
            Start, stop, and review cremation runs.
          </p>
        </div>
        <Button onClick={() => setStartOpen(true)} disabled={!eligible.length}>
          <Play className="mr-2 h-4 w-4" /> Start cremation
        </Button>
      </div>

      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active">
            Active {active.length ? <Badge className="ml-2">{active.length}</Badge> : null}
          </TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-4">
          <ActiveView
            active={active}
            isLoading={isLoading}
            onStop={(l) => {
              setStopLog(l);
              setAshWeight("");
              setStopComment(l.comment ?? "");
            }}
          />
        </TabsContent>

        <TabsContent value="completed" className="mt-4">
          <CompletedView
            completed={completed}
            isLoading={isLoading}
          />
        </TabsContent>
      </Tabs>

      {/* Start dialog */}
      <Dialog open={startOpen} onOpenChange={setStartOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start cremation</DialogTitle>
            <DialogDescription>
              Records start time and operator. The decedent will move to "Cremated"
              when you stop the run.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Decedent</Label>
              <Select value={decedentId} onValueChange={setDecedentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select decedent" />
                </SelectTrigger>
                <SelectContent>
                  {eligible.map((d: any) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.last_name}, {d.first_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Retort</Label>
                <Input
                  value={retort}
                  onChange={(e) => setRetort(e.target.value)}
                  placeholder="e.g. R-1"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Container</Label>
                <Input
                  value={container}
                  onChange={(e) => setContainer(e.target.value)}
                  placeholder="e.g. cardboard"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Start weight (lbs)</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea
                value={startComment}
                onChange={(e) => setStartComment(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setStartOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => startMut.mutate()}
              disabled={!decedentId || startMut.isPending}
            >
              {startMut.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              Start
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stop dialog */}
      <Dialog open={!!stopLog} onOpenChange={(o) => !o && setStopLog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete cremation</DialogTitle>
            <DialogDescription>
              {stopLog
                ? `${decedentName(stopLog)} • started ${fmtDateTime(stopLog.start_time)}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Ash weight (lbs)</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={ashWeight}
                onChange={(e) => setAshWeight(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea
                value={stopComment}
                onChange={(e) => setStopComment(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setStopLog(null)}>
              Cancel
            </Button>
            <Button onClick={() => stopMut.mutate()} disabled={stopMut.isPending}>
              {stopMut.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Square className="mr-2 h-4 w-4" />
              )}
              Complete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CompletedView({ completed, isLoading }: { completed: any[]; isLoading: boolean }) {
  const [retortFilter, setRetortFilter] = useState<string>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const retorts = useMemo(() => {
    const s = new Set<string>();
    completed.forEach((l) => l.retort && s.add(l.retort));
    return Array.from(s).sort();
  }, [completed]);

  const filtered = useMemo(() => {
    return completed.filter((l) => {
      if (retortFilter !== "all" && (l.retort ?? "") !== retortFilter) return false;
      if (from && l.start_time && new Date(l.start_time) < new Date(from)) return false;
      if (to && l.start_time && new Date(l.start_time) > new Date(`${to}T23:59:59`)) return false;
      return true;
    });
  }, [completed, retortFilter, from, to]);

  if (isLoading) return <Loading />;

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Retort</Label>
            <Select value={retortFilter} onValueChange={setRetortFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All retorts</SelectItem>
                {retorts.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-[160px]" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-[160px]" />
          </div>
          {(retortFilter !== "all" || from || to) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setRetortFilter("all");
                setFrom("");
                setTo("");
              }}
            >
              Clear
            </Button>
          )}
          <div className="ml-auto text-xs text-muted-foreground">
            {filtered.length} of {completed.length}
          </div>
        </CardContent>
      </Card>

      {filtered.length === 0 ? (
        <EmptyState text="No completed runs match the filters." />
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Decedent</TableHead>
                  <TableHead>Retort</TableHead>
                  <TableHead>Operator</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>End</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead className="text-right">Record</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((l: any) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium">{decedentName(l)}</TableCell>
                    <TableCell>{l.retort ?? "—"}</TableCell>
                    <TableCell>{l.operator_name ?? "—"}</TableCell>
                    <TableCell>{fmtDateTime(l.start_time)}</TableCell>
                    <TableCell>{fmtDateTime(l.end_time)}</TableCell>
                    <TableCell>{duration(l.start_time, l.end_time)}</TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="outline">
                        <Link
                          to="/crm/cremation-logs/$logId/print"
                          params={{ logId: l.id }}
                          target="_blank"
                        >
                          <Printer className="mr-2 h-3.5 w-3.5" /> Print
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ActiveCard({ log, onStop }: { log: any; onStop: () => void }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between">
          <span className="truncate">{decedentName(log)}</span>
          <Badge variant="default" className="gap-1">
            <Flame className="h-3 w-3" /> Active
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <Row k="Retort" v={log.retort ?? "—"} />
        <Row k="Operator" v={log.operator_name ?? "—"} />
        <Row k="Started" v={fmtDateTime(log.start_time)} />
        <Row k="Elapsed" v={duration(log.start_time, new Date().toISOString())} />
        {log.weight_lbs ? <Row k="Start wt" v={`${log.weight_lbs} lbs`} /> : null}
        <div className="pt-2">
          <Button size="sm" variant="destructive" className="w-full" onClick={onStop}>
            <Square className="mr-2 h-4 w-4" /> Stop
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right">{v}</span>
    </div>
  );
}

function Loading() {
  return (
    <div className="flex justify-center py-12">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <Card>
      <CardContent className="py-12 text-center text-sm text-muted-foreground">
        {text}
      </CardContent>
    </Card>
  );
}

function decedentName(l: any) {
  return l.decedents ? `${l.decedents.last_name}, ${l.decedents.first_name}` : "Decedent";
}
function fmtDateTime(iso?: string | null) {
  return iso ? new Date(iso).toLocaleString() : "—";
}
function duration(startIso?: string | null, endIso?: string | null) {
  if (!startIso || !endIso) return "—";
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (ms < 0) return "—";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h ? `${h}h ${m}m` : `${m}m`;
}
