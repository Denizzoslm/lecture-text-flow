import { useEffect, useRef } from "react";
import { compile } from "mathjs";
import type { GraphSpec } from "@/lib/markdown";

const COLORS: string[] = ["#8a3a24", "#2d3f63", "#5c7a55", "#a97b2a"];
const color = (i: number) => COLORS[i % COLORS.length] ?? "#8a3a24";

/** Trace les courbes d'un bloc `graphique` sur un canvas (compatible export PDF). */
export function GraphPlot({ spec, width = 480, height = 300 }: { spec: GraphSpec; width?: number; height?: number }) {
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

    const xmin = num(spec.xmin, -5);
    const xmax = num(spec.xmax, 5);
    const ymin = num(spec.ymin, -5);
    const ymax = num(spec.ymax, 5);
    const px = (x: number) => ((x - xmin) / (xmax - xmin)) * width;
    const py = (y: number) => height - ((y - ymin) / (ymax - ymin)) * height;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    // grille
    ctx.strokeStyle = "rgba(45,63,99,0.14)";
    ctx.lineWidth = 1;
    const stepX = niceStep(xmax - xmin);
    const stepY = niceStep(ymax - ymin);
    ctx.beginPath();
    for (let x = Math.ceil(xmin / stepX) * stepX; x <= xmax; x += stepX) {
      ctx.moveTo(px(x), 0);
      ctx.lineTo(px(x), height);
    }
    for (let y = Math.ceil(ymin / stepY) * stepY; y <= ymax; y += stepY) {
      ctx.moveTo(0, py(y));
      ctx.lineTo(width, py(y));
    }
    ctx.stroke();

    // axes + graduations
    ctx.strokeStyle = "#2d3f63";
    ctx.fillStyle = "#2d3f63";
    ctx.lineWidth = 1.4;
    ctx.font = "11px ui-monospace, monospace";
    ctx.beginPath();
    if (ymin <= 0 && ymax >= 0) {
      ctx.moveTo(0, py(0));
      ctx.lineTo(width, py(0));
    }
    if (xmin <= 0 && xmax >= 0) {
      ctx.moveTo(px(0), 0);
      ctx.lineTo(px(0), height);
    }
    ctx.stroke();
    const baseY = ymin <= 0 && ymax >= 0 ? py(0) : height - 2;
    for (let x = Math.ceil(xmin / stepX) * stepX; x <= xmax; x += stepX) {
      if (Math.abs(x) < 1e-9) continue;
      ctx.fillText(format(x), px(x) + 2, Math.min(height - 2, baseY + 12));
    }
    const baseX = xmin <= 0 && xmax >= 0 ? px(0) : 2;
    for (let y = Math.ceil(ymin / stepY) * stepY; y <= ymax; y += stepY) {
      if (Math.abs(y) < 1e-9) continue;
      ctx.fillText(format(y), baseX + 4, py(y) - 3);
    }

    // courbes
    const curves = spec.courbes ?? [];
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
      const steps = 600;
      for (let i = 0; i <= steps; i++) {
        const x = xmin + ((xmax - xmin) * i) / steps;
        let y: number;
        try {
          const raw = evaluate({ x });
          y = typeof raw === "number" ? raw : Number(raw);
        } catch {
          y = NaN;
        }
        if (!Number.isFinite(y) || y < ymin - (ymax - ymin) || y > ymax + (ymax - ymin)) {
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
      ctx.fillStyle = "#8a3a24";
      ctx.beginPath();
      ctx.arc(px(point.x), py(point.y), 3.5, 0, Math.PI * 2);
      ctx.fill();
      if (point.label) {
        ctx.font = "12px ui-monospace, monospace";
        ctx.fillText(point.label, px(point.x) + 6, py(point.y) - 6);
      }
    });
  }, [spec, width, height]);

  const legend = (spec.courbes ?? []).filter((c) => c.label);

  return (
    <figure className="my-4 max-w-xl">
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "auto", aspectRatio: `${width} / ${height}` }}
        className="rounded border border-border bg-card"
      />
      {legend.length ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 rounded border border-border bg-card px-3 py-2">
          {legend.map((curve, index) => (
            <div key={index} className="flex items-center gap-2">
              <span
                className="inline-block h-[2px] w-5 rounded-full"
                style={{ backgroundColor: color(index) }}
              />
              <span className="font-mono text-[11px] text-ink">{curve.label}</span>
            </div>
          ))}
        </div>
      ) : null}
      {spec.titre ? (
        <figcaption className="mt-1 font-mono text-[11px] text-ink-soft">{spec.titre}</figcaption>
      ) : null}
    </figure>
  );
}

function num(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function niceStep(range: number) {
  const rough = range / 6;
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  const rel = rough / pow;
  const mult = rel >= 5 ? 5 : rel >= 2 ? 2 : 1;
  return mult * pow;
}

function format(value: number) {
  return Math.abs(value) < 1e-9 ? "0" : String(Math.round(value * 1000) / 1000);
}
