import { useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import type { Corner, Quad } from "@/lib/scan";

type Props = {
  sourceDataUrl: string;
  sourceWidth: number;
  sourceHeight: number;
  quad: Quad | null;
  onCancel: () => void;
  onValidate: (quad: Quad) => void;
};

const VIEW_MAX = 480;
const LABELS = ["haut-gauche", "haut-droit", "bas-droit", "bas-gauche"];

/** Ajustement manuel des 4 coins du document (mobile-first, tactile). */
export function CropEditor({ sourceDataUrl, sourceWidth, sourceHeight, quad, onCancel, onValidate }: Props) {
  const scale = Math.min(1, VIEW_MAX / Math.max(sourceWidth, sourceHeight));
  const viewWidth = Math.round(sourceWidth * scale);
  const viewHeight = Math.round(sourceHeight * scale);

  const [corners, setCorners] = useState<Quad>(() =>
    quad
      ? (quad.map((corner) => ({ x: corner.x * scale, y: corner.y * scale })) as Quad)
      : ([
          { x: viewWidth * 0.08, y: viewHeight * 0.08 },
          { x: viewWidth * 0.92, y: viewHeight * 0.08 },
          { x: viewWidth * 0.92, y: viewHeight * 0.92 },
          { x: viewWidth * 0.08, y: viewHeight * 0.92 },
        ] as Quad),
  );
  const dragging = useRef<number | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function move(event: PointerEvent) {
      const index = dragging.current;
      const frame = frameRef.current;
      if (index === null || !frame) return;
      const rect = frame.getBoundingClientRect();
      const x = Math.min(viewWidth, Math.max(0, event.clientX - rect.left));
      const y = Math.min(viewHeight, Math.max(0, event.clientY - rect.top));
      setCorners((current) => current.map((corner, i) => (i === index ? { x, y } : corner)) as Quad);
      event.preventDefault();
    }
    function up() {
      dragging.current = null;
    }
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [viewWidth, viewHeight]);

  const polygon = corners.map((corner) => `${corner.x},${corner.y}`).join(" ");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4">
      <div className="sheet max-h-full w-full max-w-md overflow-auto p-4">
        <p className="font-mono text-[11px] text-ink-soft">Ajuster le recadrage</p>
        <p className="mb-3 text-xs text-ink-soft">
          Déplacez les quatre coins sur les bords de la feuille, puis validez pour rescanner la page.
        </p>

        <div
          ref={frameRef}
          className="relative mx-auto touch-none select-none"
          style={{ width: viewWidth, height: viewHeight }}
        >
          <img src={sourceDataUrl} alt="Photo d'origine" className="h-full w-full rounded border border-border" />
          <svg className="pointer-events-none absolute inset-0" width={viewWidth} height={viewHeight}>
            <polygon points={polygon} fill="rgba(138,58,36,0.15)" stroke="#8a3a24" strokeWidth={2} />
          </svg>
          {corners.map((corner, index) => (
            <button
              key={index}
              type="button"
              aria-label={`Coin ${LABELS[index]}`}
              onPointerDown={(event) => {
                dragging.current = index;
                event.currentTarget.setPointerCapture?.(event.pointerId);
              }}
              className="absolute size-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-brick bg-card/90"
              style={{ left: corner.x, top: corner.y }}
            />
          ))}
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => onValidate(corners.map((c) => ({ x: c.x / scale, y: c.y / scale })) as Quad)}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded border border-brick bg-brick px-3 py-2 text-sm font-medium text-primary-foreground"
          >
            <Check className="size-4" /> Rescanner
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center justify-center gap-2 rounded border border-border bg-card px-3 py-2 text-sm text-ink hover:bg-secondary"
          >
            <X className="size-4" /> Annuler
          </button>
        </div>
      </div>
    </div>
  );
}

export type { Corner };
