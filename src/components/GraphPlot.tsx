import { useEffect, useRef } from "react";
import { compile } from "mathjs";
import type { GraphSpec } from "@/lib/markdown";

const COLORS: string[] = ["#1f77b4", "#d62728", "#2ca02c", "#ff7f0e"];
const color = (i: number) => COLORS[i % COLORS.length] ?? "#1f77b4";

const PAD = { top: 14, right: 16, bottom: 46, left: 66 };

/** Trace les courbes d'un bloc `graphique` (rendu type document imprimé). */
export function GraphPlot({ spec, width = 620, height = 380 }: { spec: GraphSpec; width?: number; height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(2, typeof window === "undefined" ? 1 : window.devicePixelRatio || 1);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    const xmin = num(spec.xmin, -5);
    const xmax = num(spec.xmax, 5);
    const ymin = num(spec.ymin, -5);
    const ymax = num(spec.ymax, 5);

    const plotW = width - PAD.left - PAD.right;
    const plotH = height - PAD.top - PAD.bottom;
    const px = (x: number) => PAD.left + ((x - xmin) / (xmax - xmin)) * plotW;
    const py = (y: number) => PAD.top + plotH - ((y - ymin) / (ymax - ymin)) * plotH;

    const stepX = niceStep(xmax - xmin);
    const stepY = niceStep(ymax - ymin);
    const ticksX = ticks(xmin, xmax, stepX);
    const ticksY = ticks(ymin, ymax, stepY);

    // grille légère
    ctx.strokeStyle = "#e8e8e8";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ticksX.forEach((x) => {
      ctx.moveTo(px(x), PAD.top);
      ctx.lineTo(px(x), PAD.top + plotH);
    });
    ticksY.forEach((y) => {
      ctx.moveTo(PAD.left, py(y));
      ctx.lineTo(PAD.left + plotW, py(y));
    });
    ctx.stroke();

    // axes internes (x = 0, y = 0) si visibles
    ctx.strokeStyle = "#4a6079";
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    if (xmin < 0 && xmax > 0) {
      ctx.moveTo(px(0), PAD.top);
      ctx.lineTo(px(0), PAD.top + plotH);
    }
    if (ymin < 0 && ymax > 0) {
      ctx.moveTo(PAD.left, py(0));
      ctx.lineTo(PAD.left + plotW, py(0));
    }
    ctx.stroke();

    // courbes (clip sur la zone de tracé)
    const curves = spec.courbes ?? [];
    ctx.save();
    ctx.beginPath();
    ctx.rect(PAD.left, PAD.top, plotW, plotH);
    ctx.clip();
    curves.forEach((curve, index) => {
      let evaluate: (scope: { x: number }) => unknown;
      try {
        const node = compile(curve.expr);
        evaluate = (scope) => node.evaluate(scope);
      } catch {
        return;
      }
      ctx.strokeStyle = color(index);
      ctx.lineWidth = 2;
      ctx.beginPath();
      let drawing = false;
      const steps = 800;
      for (let i = 0; i <= steps; i++) {
        const x = xmin + ((xmax - xmin) * i) / steps;
        let y: number;
        try {
          const raw = evaluate({ x });
          y = typeof raw === "number" ? raw : Number(raw);
        } catch {
          y = NaN;
        }
        if (!Number.isFinite(y)) {
          drawing = false;
          continue;
        }
        if (!drawing) {
          ctx.moveTo(px(x), py(y));
          drawing = true;
        } else {
          ctx.lineTo(px(x), py(y));
        }
      }
      ctx.stroke();
    });

    // points remarquables
    (spec.points ?? []).forEach((point) => {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
      ctx.fillStyle = "#d62728";
      ctx.beginPath();
      ctx.arc(px(point.x), py(point.y), 3.5, 0, Math.PI * 2);
      ctx.fill();
      if (point.label) {
        ctx.font = "12px Inter, system-ui, sans-serif";
        ctx.fillText(point.label, px(point.x) + 6, py(point.y) - 6);
      }
    });
    ctx.restore();

    // cadre
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 1.2;
    ctx.strokeRect(PAD.left, PAD.top, plotW, plotH);

    // graduations et étiquettes hors du cadre
    ctx.strokeStyle = "#1a1a1a";
    ctx.fillStyle = "#1a1a1a";
    ctx.font = "11px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ticksX.forEach((x) => {
      ctx.beginPath();
      ctx.moveTo(px(x), PAD.top + plotH);
      ctx.lineTo(px(x), PAD.top + plotH + 4);
      ctx.stroke();
      ctx.fillText(format(x), px(x), PAD.top + plotH + 7);
    });
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ticksY.forEach((y) => {
      ctx.beginPath();
      ctx.moveTo(PAD.left, py(y));
      ctx.lineTo(PAD.left - 4, py(y));
      ctx.stroke();
      ctx.fillText(format(y), PAD.left - 7, py(y));
    });

    // titres des axes
    ctx.font = "12px Inter, system-ui, sans-serif";
    if (spec.xlabel) {
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(spec.xlabel, PAD.left + plotW / 2, height - 6);
    }
    if (spec.ylabel) {
      ctx.save();
      ctx.translate(12, PAD.top + plotH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(spec.ylabel, 0, 0);
      ctx.restore();
    }
  }, [spec, width, height]);

  const legend = (spec.courbes ?? []).filter((c) => c.label);

  return (
    <figure className="my-4 max-w-2xl">
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "auto", aspectRatio: `${width} / ${height}` }}
        className="bg-white"
      />
      {legend.length ? (
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
          {legend.map((curve, index) => (
            <div key={index} className="flex items-center gap-2">
              <span
                className="inline-block h-[2px] w-5 rounded-full"
                style={{ backgroundColor: color(index) }}
              />
              <span className="text-[11px] text-ink">{curve.label}</span>
            </div>
          ))}
        </div>
      ) : null}
      {spec.titre ? (
        <figcaption className="mt-1 text-[11px] text-ink-soft">{spec.titre}</figcaption>
      ) : null}
    </figure>
  );
}

function ticks(min: number, max: number, step: number) {
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-6; v += step) {
    out.push(Math.round(v * 1e6) / 1e6);
  }
  return out;
}

function num(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function niceStep(range: number) {
  const rough = range / 8;
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  const rel = rough / pow;
  const mult = rel >= 5 ? 5 : rel >= 2 ? 2 : 1;
  return mult * pow;
}

function format(value: number) {
  if (Math.abs(value) < 1e-9) return "0";
  const rounded = Math.round(value * 1000) / 1000;
  return String(rounded).replace("-", "\u2212").replace(".", ",");
}
