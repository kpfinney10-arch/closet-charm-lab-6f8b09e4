import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SignaturePad, type SignatureCapture } from "@/components/signature-pad";
import { recordRelease } from "@/lib/decedent-releases.functions";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  organizationId: string;
  decedent: { id: string; first_name: string; last_name: string } | null;
  onReleased?: () => void;
};

export function ReleaseDialog({
  open,
  onOpenChange,
  organizationId,
  decedent,
  onReleased,
}: Props) {
  const recordFn = useServerFn(recordRelease);

  const [step, setStep] = useState<"form" | "sign">("form");
  const [itemType, setItemType] = useState<"body" | "cremains">("cremains");
  const [name, setName] = useState("");
  const [relation, setRelation] = useState("");
  const [phone, setPhone] = useState("");
  const [idType, setIdType] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [witness, setWitness] = useState("");
  const [notes, setNotes] = useState("");

  const reset = () => {
    setStep("form");
    setItemType("cremains");
    setName("");
    setRelation("");
    setPhone("");
    setIdType("");
    setIdNumber("");
    setWitness("");
    setNotes("");
  };

  const mut = useMutation({
    mutationFn: (sig: SignatureCapture) =>
      recordFn({
        data: {
          organizationId,
          decedentId: decedent!.id,
          itemType,
          releasedToName: name,
          releasedToRelation: relation || null,
          releasedToPhone: phone || null,
          idType: idType || null,
          idNumber: idNumber || null,
          signerName: sig.signer_name,
          signatureData: sig.signature_data,
          witnessedBy: witness || null,
          notes: notes || null,
        },
      }),
    onSuccess: () => {
      toast.success("Release recorded");
      reset();
      onOpenChange(false);
      onReleased?.();
    },
    onError: (e: any) => toast.error(e?.message ?? "Release failed"),
  });

  const close = (o: boolean) => {
    if (!o) reset();
    onOpenChange(o);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Release remains</DialogTitle>
          <DialogDescription>
            {decedent
              ? `${decedent.last_name}, ${decedent.first_name} — chain-of-custody handoff.`
              : ""}
          </DialogDescription>
        </DialogHeader>

        {step === "form" ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>What is being released *</Label>
                <Select value={itemType} onValueChange={(v) => setItemType(v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cremains">Cremains</SelectItem>
                    <SelectItem value="body">Body</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Relationship</Label>
                <Input
                  value={relation}
                  onChange={(e) => setRelation(e.target.value)}
                  placeholder="e.g. spouse, son"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Released to (full name) *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  type="tel"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Witnessed by</Label>
                <Input
                  value={witness}
                  onChange={(e) => setWitness(e.target.value)}
                  placeholder="Staff name"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>ID type</Label>
                <Input
                  value={idType}
                  onChange={(e) => setIdType(e.target.value)}
                  placeholder="Driver's license"
                />
              </div>
              <div className="space-y-1.5">
                <Label>ID number</Label>
                <Input value={idNumber} onChange={(e) => setIdNumber(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => close(false)}>
                Cancel
              </Button>
              <Button onClick={() => setStep("sign")} disabled={!name.trim()}>
                Next: signature
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-3">
            <SignaturePad
              title="Recipient signature"
              description="Sign below to acknowledge receipt of the remains."
              defaultName={name}
              saving={mut.isPending}
              onSave={(sig) => mut.mutate(sig)}
              onCancel={() => setStep("form")}
            />
            {mut.isPending ? (
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving release…
              </div>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
