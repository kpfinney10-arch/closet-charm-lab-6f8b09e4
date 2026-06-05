import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCrm } from "@/contexts/crm-context";
import {
  listCremationLogs,
  listCremationLogsPaged,
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
import { Flame, Loader2, Play, Square, Printer, Search, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { toast } from "sonner";

const sortKeySchema = z.enum(["name", "retort", "operator", "start", "end", "duration"]);
const sortDirSchema = z.enum(["asc", "desc"]);

const searchSchema = z.object({
  tab: fallback(z.enum(["active", "completed"]), "active").default("active"),
  sort: fallback(sortKeySchema, "start").default("start"),
  dir: fallback(sortDirSchema, "desc").default("desc"),
  page: fallback(z.number().int().min(1), 1).default(1),
  q: fallback(z.string(), "").default(""),
  retort: fallback(z.string(), "all").default("all"),
  from: fallback(z.string(), "").default(""),
  to: fallback(z.string(), "").default(""),
});

export const Route = createFileRoute("/_authenticated/_crm/crm/cremation-logs")({
  component: CremationLogsPage,
  head: () => ({ meta: [{ title: "Cremation — CareOne CRM" }] }),
  validateSearch: zodValidator(searchSchema),
});

function CremationLogsPage() {
  const { currentOrg } = useCrm();
  const orgId = currentOrg!.organization_id;
  const qc = useQueryClient();
  const { tab } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const fetchLogs = useServerFn(listCremationLogs);
  const fetchDecedents = useServerFn(listDecedents);
  const startFn = useServerFn(startCremationLog);
  const stopFn = useServerFn(stopCremationLog);

  // Lightweight query just to compute the eligible-decedent set (excludes those with an active log).
  const { data: activeAll } = useQuery({
    queryKey: ["crm", "cremation-logs", orgId, "active-ids"],
    queryFn: () => fetchLogs({ data: { organizationId: orgId, scope: "active", limit: 500 } }),
  });

  const { data: decedents } = useQuery({
    queryKey: ["crm", "decedents", orgId, "for-cremation"],
    queryFn: () => fetchDecedents({ data: { organizationId: orgId } }),
  });

  const activeCount = (activeAll ?? []).length;

  const eligible = useMemo(
    () =>
      (decedents ?? []).filter(
        (d: any) =>
          d.status !== "released" &&
          d.status !== "checked_out" &&
          !(activeAll ?? []).some((l: any) => l.decedent_id === d.id),
      ),
    [decedents, activeAll],
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

      <Tabs
        value={tab}
        onValueChange={(v) =>
          navigate({ search: (prev: any) => ({ ...prev, tab: v as "active" | "completed", page: 1 }), replace: true })
        }
      >
        <TabsList>
          <TabsTrigger value="active">
            Active {activeCount ? <Badge className="ml-2">{activeCount}</Badge> : null}
          </TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-4">
          <ActiveView
            orgId={orgId}
            onStop={(l) => {
              setStopLog(l);
              setAshWeight("");
              setStopComment(l.comment ?? "");
            }}
          />
        </TabsContent>

        <TabsContent value="completed" className="mt-4">
          <CompletedView orgId={orgId} />
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

const PAGE_SIZE_ACTIVE = 12;
const PAGE_SIZE_COMPLETED = 25;

type SortKey = "name" | "retort" | "operator" | "start" | "end" | "duration";
type SortDir = "asc" | "desc";

// Sorting and filtering are performed server-side; see list_cremation_logs RPC.

function SortHead({
  label,
  sortKey,
  active,
  dir,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  active: SortKey;
  dir: SortDir;
  onSort: (k: SortKey) => void;
  className?: string;
}) {
  const isActive = active === sortKey;
  const Icon = isActive ? (dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1 font-medium hover:text-foreground"
      >
        {label}
        <Icon className={`h-3.5 w-3.5 ${isActive ? "text-foreground" : "text-muted-foreground/60"}`} />
      </button>
    </TableHead>
  );
}

function useDebounced<T>(value: T, delay = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

function ActiveView({
  orgId,
  onStop,
}: {
  orgId: string;
  onStop: (l: any) => void;
}) {
  const fetchPaged = useServerFn(listCremationLogsPaged);
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const sortKey = search.sort;
  const sortDir = search.dir;
  const page = search.page;
  const [query, setQuery] = useState(search.q);
  const debouncedQuery = useDebounced(query, 300);

  // Sync URL when debounced query settles.
  useEffect(() => {
    if (debouncedQuery === search.q) return;
    navigate({ search: (prev: any) => ({ ...prev, q: debouncedQuery, page: 1 }), replace: true });
  }, [debouncedQuery]);

  const setSort = (sort: SortKey, dir: SortDir) =>
    navigate({ search: (prev: any) => ({ ...prev, sort, dir, page: 1 }), replace: true });
  const setPage = (p: number) =>
    navigate({ search: (prev: any) => ({ ...prev, page: p }), replace: true });

  const { data, isLoading } = useQuery({
    queryKey: [
      "crm",
      "cremation-logs",
      orgId,
      "paged",
      "active",
      { q: debouncedQuery, sort: sortKey, dir: sortDir, page },
    ],
    queryFn: () =>
      fetchPaged({
        data: {
          organizationId: orgId,
          scope: "active",
          search: debouncedQuery || null,
          sort: sortKey,
          dir: sortDir,
          page,
          pageSize: PAGE_SIZE_ACTIVE,
        },
      }),
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE_ACTIVE));
  const safePage = Math.min(page, totalPages);

  if (isLoading && !data) return <Loading />;

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search name, retort, or operator…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-8"
            />
          </div>
          <Select
            value={`${sortKey}:${sortDir}`}
            onValueChange={(v) => {
              const [k, d] = v.split(":") as [SortKey, SortDir];
              setSort(k, d);
            }}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name:asc">Name (A–Z)</SelectItem>
              <SelectItem value="name:desc">Name (Z–A)</SelectItem>
              <SelectItem value="retort:asc">Retort (A–Z)</SelectItem>
              <SelectItem value="retort:desc">Retort (Z–A)</SelectItem>
              <SelectItem value="operator:asc">Operator (A–Z)</SelectItem>
              <SelectItem value="operator:desc">Operator (Z–A)</SelectItem>
              <SelectItem value="start:desc">Started (newest)</SelectItem>
              <SelectItem value="start:asc">Started (oldest)</SelectItem>
            </SelectContent>
          </Select>
          <div className="text-xs text-muted-foreground">{total} total</div>
        </CardContent>
      </Card>

      {rows.length === 0 ? (
        <EmptyState text={debouncedQuery ? "No active cremations match your search." : "No active cremations."} />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((l: any) => (
            <ActiveCard key={l.id} log={l} onStop={() => onStop(l)} />
          ))}
        </div>
      )}

      <Pagination
        page={safePage}
        totalPages={totalPages}
        total={total}
        pageSize={PAGE_SIZE_ACTIVE}
        onChange={setPage}
      />
    </div>
  );
}

function CompletedView({ orgId }: { orgId: string }) {
  const fetchPaged = useServerFn(listCremationLogsPaged);
  const [retortFilter, setRetortFilter] = useState<string>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounced(query, 300);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("start");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const handleSort = (k: SortKey) => {
    if (sortKey === k) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(k);
      setSortDir(k === "start" || k === "end" || k === "duration" ? "desc" : "asc");
    }
    setPage(1);
  };

  const fromIso = from ? new Date(`${from}T00:00:00`).toISOString() : null;
  const toIso = to ? new Date(`${to}T23:59:59`).toISOString() : null;

  const { data, isLoading } = useQuery({
    queryKey: [
      "crm",
      "cremation-logs",
      orgId,
      "paged",
      "completed",
      {
        q: debouncedQuery,
        retort: retortFilter,
        from: fromIso,
        to: toIso,
        sort: sortKey,
        dir: sortDir,
        page,
      },
    ],
    queryFn: () =>
      fetchPaged({
        data: {
          organizationId: orgId,
          scope: "completed",
          search: debouncedQuery || null,
          retort: retortFilter === "all" ? null : retortFilter,
          from: fromIso,
          to: toIso,
          sort: sortKey,
          dir: sortDir,
          page,
          pageSize: PAGE_SIZE_COMPLETED,
        },
      }),
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE_COMPLETED));
  const safePage = Math.min(page, totalPages);

  // Distinct retort options come from a lightweight unfiltered query.
  const { data: retortSource } = useQuery({
    queryKey: ["crm", "cremation-logs", orgId, "retorts"],
    queryFn: () =>
      fetchPaged({
        data: {
          organizationId: orgId,
          scope: "completed",
          page: 1,
          pageSize: 200,
          sort: "start",
          dir: "desc",
        },
      }),
  });
  const retorts = useMemo(() => {
    const s = new Set<string>();
    (retortSource?.rows ?? []).forEach((l: any) => l.retort && s.add(l.retort));
    return Array.from(s).sort();
  }, [retortSource]);

  if (isLoading && !data) return <Loading />;

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-3">
          <div className="relative min-w-[220px] flex-1 space-y-1.5">
            <Label className="text-xs">Search</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Name, retort, operator…"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                className="pl-8"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Retort</Label>
            <Select
              value={retortFilter}
              onValueChange={(v) => {
                setRetortFilter(v);
                setPage(1);
              }}
            >
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
            <Input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(1);
              }}
              className="w-[160px]"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">To</Label>
            <Input
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(1);
              }}
              className="w-[160px]"
            />
          </div>
          {(retortFilter !== "all" || from || to || query) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setRetortFilter("all");
                setFrom("");
                setTo("");
                setQuery("");
                setPage(1);
              }}
            >
              Clear
            </Button>
          )}
          <div className="ml-auto text-xs text-muted-foreground">{total} total</div>
        </CardContent>
      </Card>

      {rows.length === 0 ? (
        <EmptyState text="No completed runs match the filters." />
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortHead label="Decedent" sortKey="name" active={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortHead label="Retort" sortKey="retort" active={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortHead label="Operator" sortKey="operator" active={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortHead label="Start" sortKey="start" active={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortHead label="End" sortKey="end" active={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortHead label="Duration" sortKey="duration" active={sortKey} dir={sortDir} onSort={handleSort} />
                  <TableHead className="text-right">Record</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((l: any) => (
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

      <Pagination
        page={safePage}
        totalPages={totalPages}
        total={total}
        pageSize={PAGE_SIZE_COMPLETED}
        onChange={setPage}
      />
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  onChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onChange: (p: number) => void;
}) {
  if (total === 0 || totalPages <= 1) return null;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  return (
    <div className="flex items-center justify-between gap-3 px-1 text-sm text-muted-foreground">
      <div>
        Showing {start}–{end} of {total}
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => onChange(Math.max(1, page - 1))}
          disabled={page <= 1}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="tabular-nums">
          Page {page} of {totalPages}
        </span>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
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
