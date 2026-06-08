import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, Printer, ArrowLeft, Download } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/cases/$caseId/print")({
  component: PrintRunSheet,
  head: () => ({
    meta: [{ title: "Run sheet — Transport Dispatch" }],
  }),
});

type CaseRow = Database["public"]["Tables"]["cases"]["Row"];
type Profile = { id: string; full_name: string | null; phone: string | null };
type Facility = { id: string; name: string; phone: string | null };
type SignatureRow = Database["public"]["Tables"]["case_signatures"]["Row"];

const SIGNATURE_LABELS: Record<string, string> = {
  pickup_released: "Released by (pickup)",
  driver_received: "Received by driver",
  driver_delivered: "Delivered by driver",
  dropoff_received: "Received by (dropoff)",
};
const SIGNATURE_ORDER = [
  "pickup_released",
  "driver_received",
  "driver_delivered",
  "dropoff_received",
] as const;

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

function fmtDateTime(s: string | null | undefined) {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString();
  } catch {
    return s;
  }
}
function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString();
  } catch {
    return s;
  }
}
function joinAddress(...parts: (string | null | undefined)[]) {
  return parts.filter(Boolean).join(", ") || "—";
}

function PrintRunSheet() {
  const { caseId } = Route.useParams();

  const caseQ = useQuery({
    queryKey: ["case-print", caseId],
    queryFn: async () => {
      const { data, error } = await supabase.from("cases").select("*").eq("id", caseId).single();
      if (error) throw error;
      return data as CaseRow;
    },
  });

  const driverIds = [caseQ.data?.primary_driver_id, caseQ.data?.secondary_driver_id].filter(
    Boolean,
  ) as string[];
  const facilityIds = [caseQ.data?.pickup_facility_id, caseQ.data?.dropoff_facility_id].filter(
    Boolean,
  ) as string[];

  const driversQ = useQuery({
    queryKey: ["case-print-drivers", driverIds.sort().join(",")],
    enabled: driverIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, phone")
        .in("id", driverIds);
      if (error) throw error;
      return (data ?? []) as Profile[];
    },
  });

  const facilitiesQ = useQuery({
    queryKey: ["case-print-facilities", facilityIds.sort().join(",")],
    enabled: facilityIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("facilities")
        .select("id, name, phone")
        .in("id", facilityIds);
      if (error) throw error;
      return (data ?? []) as Facility[];
    },
  });

  const signaturesQ = useQuery({
    queryKey: ["case-print-signatures", caseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("case_signatures")
        .select("*")
        .eq("case_id", caseId);
      if (error) throw error;
      return (data ?? []) as SignatureRow[];
    },
  });

  const eventsQ = useQuery({
    queryKey: ["case-print-events", caseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("case_events")
        .select("id, event_type, from_status, to_status, notes, created_at")
        .eq("case_id", caseId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Data loads on mount; user explicitly clicks Print or Download PDF.

  const sheetRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  async function handleDownloadPdf() {
    if (!sheetRef.current || !caseQ.data) return;
    setDownloading(true);
    try {
      const mod = (await import("html2pdf.js")) as unknown as { default: any };
      const html2pdf = mod.default;
      const filename = `run-sheet-${caseQ.data.case_number ?? "case"}.pdf`;
      await html2pdf()
        .set({
          margin: 0.5,
          filename,
          image: { type: "jpeg", quality: 0.95 },
          html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
          jsPDF: { unit: "in", format: "letter", orientation: "portrait" },
          pagebreak: { mode: ["css", "legacy"] },
        })
        .from(sheetRef.current)
        .save();
    } finally {
      setDownloading(false);
    }
  }

  if (caseQ.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (caseQ.error || !caseQ.data) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm text-destructive">Could not load case.</p>
      </div>
    );
  }

  const c = caseQ.data;
  const driversById = new Map((driversQ.data ?? []).map((d) => [d.id, d]));
  const facilitiesById = new Map((facilitiesQ.data ?? []).map((f) => [f.id, f]));
  const primary = c.primary_driver_id ? driversById.get(c.primary_driver_id) : null;
  const secondary = c.secondary_driver_id ? driversById.get(c.secondary_driver_id) : null;
  const pickupFac = c.pickup_facility_id ? facilitiesById.get(c.pickup_facility_id) : null;
  const dropoffFac = c.dropoff_facility_id ? facilitiesById.get(c.dropoff_facility_id) : null;

  const decedentName =
    [c.decedent_first_name, c.decedent_last_name].filter(Boolean).join(" ") || "Unnamed decedent";

  return (
    <div className="bg-white text-black">
      {/* Print-only styles */}
      <style>{`
        @media print {
          @page { size: letter; margin: 0.5in; }
          body { background: white !important; }
          .no-print { display: none !important; }
          .print-page { padding: 0 !important; max-width: none !important; }
        }
        .print-page { font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; color: #111; }
        .print-page h1, .print-page h2, .print-page h3 { color: #111; }
        .sheet-section { border: 1px solid #d4d4d8; border-radius: 6px; padding: 12px 14px; margin-top: 10px; }
        .sheet-section h2 { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #52525b; margin: 0 0 8px; }
        .sheet-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; }
        .sheet-grid > div { font-size: 12px; }
        .sheet-label { color: #71717a; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; }
        .sheet-value { font-weight: 500; }
        .sig-line { border-bottom: 1px solid #111; height: 38px; margin-top: 4px; }
      `}</style>

      {/* Toolbar (screen only) */}
      <div className="no-print sticky top-0 z-10 flex items-center justify-between gap-2 border-b bg-white p-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/cases/$caseId" params={{ caseId }}>
            <ArrowLeft className="h-4 w-4" />
            Back to case
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            Print
          </Button>
          <Button size="sm" onClick={handleDownloadPdf} disabled={downloading}>
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Download PDF
          </Button>
        </div>
      </div>

      <div ref={sheetRef} className="print-page mx-auto max-w-3xl p-6">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-zinc-300 pb-3">
          <div>
            <h1 className="text-2xl font-bold">Transport Run Sheet</h1>
            <p className="mt-1 text-xs text-zinc-600">
              Printed {new Date().toLocaleString()}
            </p>
          </div>
          <div className="text-right">
            <div className="font-mono text-sm">{c.case_number}</div>
            <div className="mt-1 inline-block rounded border border-zinc-400 px-2 py-0.5 text-xs font-medium uppercase tracking-wide">
              {STATUS_LABEL[c.status] ?? c.status}
            </div>
          </div>
        </div>

        {/* Decedent */}
        <div className="sheet-section">
          <h2>Decedent</h2>
          <div className="sheet-grid">
            <div className="col-span-2">
              <div className="sheet-label">Name</div>
              <div className="sheet-value text-base">{decedentName}</div>
            </div>
            <div>
              <div className="sheet-label">Date of birth</div>
              <div className="sheet-value">{fmtDate(c.decedent_dob)}</div>
            </div>
            <div>
              <div className="sheet-label">Date of death</div>
              <div className="sheet-value">{fmtDateTime(c.decedent_dod)}</div>
            </div>
            <div>
              <div className="sheet-label">Sex</div>
              <div className="sheet-value">{c.decedent_sex || "—"}</div>
            </div>
            <div>
              <div className="sheet-label">Weight (lbs)</div>
              <div className="sheet-value">{c.decedent_weight_lbs ?? "—"}</div>
            </div>
            {c.special_handling && (
              <div className="col-span-2">
                <div className="sheet-label">Special handling</div>
                <div className="sheet-value">{c.special_handling}</div>
              </div>
            )}
          </div>
        </div>

        {/* Schedule + crew */}
        <div className="sheet-section">
          <h2>Assignment</h2>
          <div className="sheet-grid">
            <div>
              <div className="sheet-label">Scheduled</div>
              <div className="sheet-value">{fmtDateTime(c.scheduled_at)}</div>
            </div>
            <div>
              <div className="sheet-label">Created</div>
              <div className="sheet-value">{fmtDateTime(c.created_at)}</div>
            </div>
            <div>
              <div className="sheet-label">Primary driver</div>
              <div className="sheet-value">
                {primary?.full_name ?? "—"}
                {primary?.phone ? ` · ${primary.phone}` : ""}
              </div>
            </div>
            <div>
              <div className="sheet-label">Secondary driver</div>
              <div className="sheet-value">
                {secondary?.full_name ?? "—"}
                {secondary?.phone ? ` · ${secondary.phone}` : ""}
              </div>
            </div>
          </div>
        </div>

        {/* Pickup */}
        <div className="sheet-section">
          <h2>Pickup</h2>
          <div className="sheet-grid">
            <div className="col-span-2">
              <div className="sheet-label">Facility / location</div>
              <div className="sheet-value">{pickupFac?.name ?? "—"}</div>
            </div>
            <div className="col-span-2">
              <div className="sheet-label">Address</div>
              <div className="sheet-value">
                {joinAddress(c.pickup_address, c.pickup_city, c.pickup_state, c.pickup_zip)}
              </div>
            </div>
            <div>
              <div className="sheet-label">Contact</div>
              <div className="sheet-value">{c.pickup_contact_name || "—"}</div>
            </div>
            <div>
              <div className="sheet-label">Phone</div>
              <div className="sheet-value">
                {c.pickup_contact_phone || pickupFac?.phone || "—"}
              </div>
            </div>
            {c.pickup_notes && (
              <div className="col-span-2">
                <div className="sheet-label">Notes</div>
                <div className="sheet-value whitespace-pre-wrap">{c.pickup_notes}</div>
              </div>
            )}
          </div>
        </div>

        {/* Dropoff */}
        <div className="sheet-section">
          <h2>Dropoff</h2>
          <div className="sheet-grid">
            <div className="col-span-2">
              <div className="sheet-label">Facility / location</div>
              <div className="sheet-value">{dropoffFac?.name ?? "—"}</div>
            </div>
            <div className="col-span-2">
              <div className="sheet-label">Address</div>
              <div className="sheet-value">
                {joinAddress(c.dropoff_address, c.dropoff_city, c.dropoff_state, c.dropoff_zip)}
              </div>
            </div>
            {dropoffFac?.phone && (
              <div>
                <div className="sheet-label">Facility phone</div>
                <div className="sheet-value">{dropoffFac.phone}</div>
              </div>
            )}
            {c.dropoff_notes && (
              <div className="col-span-2">
                <div className="sheet-label">Notes</div>
                <div className="sheet-value whitespace-pre-wrap">{c.dropoff_notes}</div>
              </div>
            )}
          </div>
        </div>

        {/* Authorization */}
        {(c.authorizing_party_name || c.authorizing_party_phone) && (
          <div className="sheet-section">
            <h2>Authorizing party</h2>
            <div className="sheet-grid">
              <div>
                <div className="sheet-label">Name</div>
                <div className="sheet-value">{c.authorizing_party_name || "—"}</div>
              </div>
              <div>
                <div className="sheet-label">Relation</div>
                <div className="sheet-value">{c.authorizing_party_relation || "—"}</div>
              </div>
              <div>
                <div className="sheet-label">Phone</div>
                <div className="sheet-value">{c.authorizing_party_phone || "—"}</div>
              </div>
            </div>
          </div>
        )}

        {/* Timeline */}
        {(eventsQ.data?.length ?? 0) > 0 && (
          <div className="sheet-section" style={{ pageBreakInside: "avoid" }}>
            <h2>Timeline</h2>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "#71717a" }}>
                  <th style={{ padding: "4px 6px", borderBottom: "1px solid #e4e4e7", fontWeight: 600, width: "38%" }}>
                    Timestamp
                  </th>
                  <th style={{ padding: "4px 6px", borderBottom: "1px solid #e4e4e7", fontWeight: 600 }}>
                    Event
                  </th>
                </tr>
              </thead>
              <tbody>
                {(eventsQ.data ?? []).map((ev) => {
                  const label = EVENT_LABEL[ev.event_type] ?? ev.event_type;
                  const statusBit =
                    ev.event_type === "status_changed" && ev.to_status
                      ? `${ev.from_status ? `${STATUS_LABEL[ev.from_status] ?? ev.from_status} → ` : ""}${STATUS_LABEL[ev.to_status] ?? ev.to_status}`
                      : "";
                  return (
                    <tr key={ev.id} style={{ verticalAlign: "top" }}>
                      <td style={{ padding: "4px 6px", borderBottom: "1px solid #f4f4f5", whiteSpace: "nowrap" }}>
                        {fmtDateTime(ev.created_at)}
                      </td>
                      <td style={{ padding: "4px 6px", borderBottom: "1px solid #f4f4f5" }}>
                        <div style={{ fontWeight: 500 }}>{label}</div>
                        {statusBit && (
                          <div style={{ color: "#52525b", fontSize: 10 }}>{statusBit}</div>
                        )}
                        {ev.notes && (
                          <div style={{ color: "#3f3f46", fontSize: 10, whiteSpace: "pre-wrap" }}>
                            {ev.notes}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}


        {/* Signatures */}
        {(() => {
          const byType = new Map(
            (signaturesQ.data ?? []).map((s) => [s.signature_type, s] as const),
          );
          return (
            <div className="sheet-section" style={{ pageBreakInside: "avoid" }}>
              <h2>Chain of custody — signatures</h2>
              <div className="sheet-grid" style={{ gap: "16px" }}>
                {SIGNATURE_ORDER.map((t) => {
                  const sig = byType.get(t);
                  return (
                    <div key={t}>
                      <div className="sheet-label">{SIGNATURE_LABELS[t]}</div>
                      {sig ? (
                        <>
                          <img
                            src={sig.signature_data}
                            alt="Signature"
                            style={{
                              maxHeight: 56,
                              borderBottom: "1px solid #111",
                              marginTop: 4,
                            }}
                          />
                          <div className="mt-1 text-[10px] text-zinc-700">
                            <strong>{sig.signer_name}</strong>
                            {sig.signer_title ? `, ${sig.signer_title}` : ""}
                            {" · "}
                            {fmtDateTime(sig.created_at)}
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="sig-line" />
                          <div className="mt-1 text-[10px] text-zinc-500">
                            Print name & sign · Date / time
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        <div className="mt-6 text-center text-[10px] text-zinc-500">
          Case {c.case_number} · Generated by Transport Dispatch
        </div>
      </div>
    </div>
  );
}
