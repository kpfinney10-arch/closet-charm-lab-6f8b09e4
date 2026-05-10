import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Check, PenLine, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { SignaturePad, type SignatureCapture } from "@/components/signature-pad";
import type { Database } from "@/integrations/supabase/types";

type SignatureType = Database["public"]["Enums"]["signature_type"];
type SignatureRow = Database["public"]["Tables"]["case_signatures"]["Row"];

export const SIGNATURE_SLOTS: {
  type: SignatureType;
  title: string;
  description: string;
}[] = [
  {
    type: "pickup_released",
    title: "Pickup — released by",
    description:
      "Signature of the person at pickup releasing the decedent (e.g. RN, hospital staff, family member).",
  },
  {
    type: "driver_received",
    title: "Driver — received custody",
    description: "Driver acknowledges taking the decedent into custody at pickup.",
  },
  {
    type: "driver_delivered",
    title: "Driver — delivered",
    description: "Driver acknowledges delivering the decedent at the dropoff facility.",
  },
  {
    type: "dropoff_received",
    title: "Dropoff — received by",
    description:
      "Signature of the person at dropoff accepting the decedent (e.g. funeral director, ME staff).",
  },
];

function getCurrentPosition(): Promise<GeolocationPosition | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 30000 },
    );
  });
}

export function useCaseSignatures(caseId: string | undefined) {
  return useQuery({
    queryKey: ["case-signatures", caseId],
    enabled: !!caseId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("case_signatures")
        .select("*")
        .eq("case_id", caseId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as SignatureRow[];
    },
  });
}

type Props = {
  caseId: string;
  /** When true, the signer's name defaults to the current user's full name. */
  driverDefaultName?: string;
  /** Read-only mode: only show captured signatures. */
  readOnly?: boolean;
};

export function CaseSignatures({ caseId, driverDefaultName, readOnly }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const sigs = useCaseSignatures(caseId);
  const [active, setActive] = useState<SignatureType | null>(null);

  const byType = new Map<SignatureType, SignatureRow>();
  for (const s of sigs.data ?? []) byType.set(s.signature_type, s);

  const save = useMutation({
    mutationFn: async (args: { type: SignatureType; capture: SignatureCapture }) => {
      const pos = await getCurrentPosition();
      const { error } = await supabase.from("case_signatures").insert({
        case_id: caseId,
        signature_type: args.type,
        signer_name: args.capture.signer_name,
        signer_title: args.capture.signer_title,
        signature_data: args.capture.signature_data,
        captured_by: user?.id ?? null,
        lat: pos?.coords.latitude ?? null,
        lng: pos?.coords.longitude ?? null,
      });
      if (error) throw error;
      // Best-effort event log (RLS allows assigned drivers/staff to insert)
      await supabase.from("case_events").insert({
        case_id: caseId,
        event_type: "signature_captured",
        notes: `Signature captured: ${args.capture.signer_name}`,
        lat: pos?.coords.latitude ?? null,
        lng: pos?.coords.longitude ?? null,
      });
    },
    onSuccess: () => {
      toast.success("Signature saved");
      setActive(null);
      void qc.invalidateQueries({ queryKey: ["case-signatures", caseId] });
      void qc.invalidateQueries({ queryKey: ["case-events", caseId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (sigs.isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {SIGNATURE_SLOTS.map((slot) => {
        const existing = byType.get(slot.type);
        const isDriverSlot =
          slot.type === "driver_received" || slot.type === "driver_delivered";
        return (
          <Card key={slot.type}>
            <CardContent className="flex items-start justify-between gap-3 p-3">
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{slot.title}</span>
                  {existing ? (
                    <Badge variant="secondary" className="gap-1">
                      <Check className="h-3 w-3" /> Signed
                    </Badge>
                  ) : null}
                </div>
                {existing ? (
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <div>
                      <span className="font-medium text-foreground">
                        {existing.signer_name}
                      </span>
                      {existing.signer_title ? `, ${existing.signer_title}` : ""}
                    </div>
                    <div>{new Date(existing.created_at).toLocaleString()}</div>
                    <img
                      src={existing.signature_data}
                      alt="Signature"
                      className="mt-1 max-h-20 rounded border bg-white"
                    />
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">{slot.description}</p>
                )}
              </div>
              {!readOnly && !existing ? (
                <Button size="sm" variant="outline" onClick={() => setActive(slot.type)}>
                  <PenLine className="h-4 w-4" /> Sign
                </Button>
              ) : null}
            </CardContent>
          </Card>
        );
      })}

      <Dialog open={!!active} onOpenChange={(o) => (o ? null : setActive(null))}>
        <DialogContent className="max-w-lg">
          {active ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {SIGNATURE_SLOTS.find((s) => s.type === active)?.title}
                </DialogTitle>
              </DialogHeader>
              <SignaturePad
                title=""
                description={SIGNATURE_SLOTS.find((s) => s.type === active)?.description}
                defaultName={
                  active === "driver_received" || active === "driver_delivered"
                    ? (driverDefaultName ?? "")
                    : ""
                }
                saving={save.isPending}
                onCancel={() => setActive(null)}
                onSave={(capture) => save.mutateAsync({ type: active, capture })}
              />
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
