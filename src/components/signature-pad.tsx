import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eraser, Loader2 } from "lucide-react";

export type SignatureCapture = {
  signer_name: string;
  signer_title: string | null;
  signature_data: string; // PNG data URL
};

type Props = {
  title: string;
  description?: string;
  defaultName?: string;
  defaultTitle?: string;
  saving?: boolean;
  onSave: (capture: SignatureCapture) => void | Promise<void>;
  onCancel?: () => void;
};

export function SignaturePad({
  title,
  description,
  defaultName = "",
  defaultTitle = "",
  saving = false,
  onSave,
  onCancel,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const [hasInk, setHasInk] = useState(false);
  const [name, setName] = useState(defaultName);
  const [signerTitle, setSignerTitle] = useState(defaultTitle);

  // Resize canvas to its CSS size with proper DPR scaling
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#0a0a0a";
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  function pointFromEvent(e: PointerEvent | React.PointerEvent) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    drawingRef.current = true;
    lastRef.current = pointFromEvent(e);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx || !lastRef.current) return;
    const p = pointFromEvent(e);
    ctx.beginPath();
    ctx.moveTo(lastRef.current.x, lastRef.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastRef.current = p;
    if (!hasInk) setHasInk(true);
  }

  function handlePointerUp() {
    drawingRef.current = false;
    lastRef.current = null;
  }

  function clear() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
  }

  async function handleSave() {
    const canvas = canvasRef.current;
    if (!canvas || !hasInk || !name.trim()) return;
    const dataUrl = canvas.toDataURL("image/png");
    await onSave({
      signer_name: name.trim(),
      signer_title: signerTitle.trim() || null,
      signature_data: dataUrl,
    });
  }

  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-semibold">{title}</h3>
        {description ? (
          <p className="text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="sig-name">Printed name</Label>
          <Input
            id="sig-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full name"
            maxLength={120}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="sig-title">Title / role (optional)</Label>
          <Input
            id="sig-title"
            value={signerTitle}
            onChange={(e) => setSignerTitle(e.target.value)}
            placeholder="e.g. RN, Funeral Director"
            maxLength={120}
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label>Signature</Label>
        <div className="relative rounded-md border bg-background">
          <canvas
            ref={canvasRef}
            className="block h-44 w-full touch-none rounded-md"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onPointerLeave={handlePointerUp}
          />
          {!hasInk && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
              Sign here
            </div>
          )}
        </div>
        <div className="flex justify-between">
          <Button type="button" variant="ghost" size="sm" onClick={clear} disabled={!hasInk}>
            <Eraser className="h-4 w-4" /> Clear
          </Button>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        ) : null}
        <Button
          type="button"
          onClick={handleSave}
          disabled={!hasInk || !name.trim() || saving}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Save signature
        </Button>
      </div>
    </div>
  );
}
