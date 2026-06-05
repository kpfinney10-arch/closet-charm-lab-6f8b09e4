import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCremationLog } from "@/lib/cremation-logs.functions";
import { Loader2, Flame } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute(
  "/_authenticated/_crm/crm/cremation-logs/$logId/print",
)({
  component: PrintCremationLog,
  head: () => ({ meta: [{ title: "Cremation Record — CareOne CRM" }] }),
});

function PrintCremationLog() {
  const { logId } = Route.useParams();
  const fetchLog = useServerFn(getCremationLog);
  const { data: log, isLoading } = useQuery({
    queryKey: ["crm", "cremation-log", logId],
    queryFn: () => fetchLog({ data: { id: logId } }),
  });

  useEffect(() => {
    if (log && typeof window !== "undefined") {
      const t = setTimeout(() => window.print(), 350);
      return () => clearTimeout(t);
    }
  }, [log]);

  if (isLoading || !log) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const d = (log as any).decedents ?? {};
  const fh = d.funeral_homes?.name ?? "—";

  return (
    <div className="min-h-screen bg-background p-6 print:p-0">
      <div className="mx-auto max-w-3xl space-y-6 print:max-w-none">
        <div className="flex items-center justify-between print:hidden">
          <h1 className="text-xl font-semibold">Cremation Record</h1>
          <Button onClick={() => window.print()}>Print</Button>
        </div>

        <div className="rounded-md border bg-card p-6 print:border-0 print:p-0">
          <header className="mb-6 flex items-center justify-between border-b pb-4">
            <div className="flex items-center gap-2">
              <Flame className="h-6 w-6 text-primary" />
              <div>
                <p className="text-lg font-semibold">Cremation Record</p>
                <p className="text-xs text-muted-foreground">
                  Record ID: {log.id.slice(0, 8).toUpperCase()}
                </p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Generated {new Date().toLocaleString()}
            </p>
          </header>

          <Section title="Decedent">
            <Field label="Name" value={`${d.last_name ?? ""}, ${d.first_name ?? ""}`} />
            <Field label="Date of birth" value={fmt(d.date_of_birth)} />
            <Field label="Date of death" value={fmt(d.date_of_death)} />
            <Field label="Sex" value={d.sex ?? "—"} />
            <Field
              label="Body weight"
              value={d.weight_lbs ? `${d.weight_lbs} lbs` : "—"}
            />
            <Field label="Funeral home" value={fh} />
          </Section>

          <Section title="Cremation">
            <Field label="Retort" value={log.retort ?? "—"} />
            <Field label="Container" value={log.container_type ?? "—"} />
            <Field label="Operator" value={log.operator_name ?? "—"} />
            <Field
              label="Start weight"
              value={log.weight_lbs ? `${log.weight_lbs} lbs` : "—"}
            />
            <Field
              label="Ash weight"
              value={log.ash_weight_lbs ? `${log.ash_weight_lbs} lbs` : "—"}
            />
            <Field
              label="Duration"
              value={duration(log.start_time, log.end_time)}
            />
          </Section>

          <Section title="Times">
            <Field label="Start time" value={fmtDateTime(log.start_time)} />
            <Field label="End time" value={fmtDateTime(log.end_time)} />
          </Section>

          {log.comment ? (
            <div className="mt-6">
              <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                Notes
              </p>
              <p className="whitespace-pre-wrap text-sm">{log.comment}</p>
            </div>
          ) : null}

          <div className="mt-12 grid grid-cols-2 gap-8">
            <Signature label="Operator signature" />
            <Signature label="Witness signature" />
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">{children}</dl>
    </section>
  );
}
function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 border-b border-dashed py-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
function Signature({ label }: { label: string }) {
  return (
    <div>
      <div className="h-12 border-b" />
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
function fmt(iso?: string | null) {
  return iso ? new Date(iso).toLocaleDateString() : "—";
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
