/**
 * Tracé d'un graphe mathématique sur un canvas 2D — moteur partagé entre
 * l'aperçu React (`GraphPlot`) et l'export PDF (`graphToDataUrl`).
 *
 * Un graphe est un objet mathématique (spec §7) : on redessine axes, graduations,
 * courbes et points remarquables. On n'invente jamais une courbe absente du JSON.
 */

import { compile } from "mathjs";
import { graphLabel, type GraphCurve, type GraphSpec } from "./markdown";

const COLORS = ["#1f77b4", "#d62728", "#2ca02c", "#ff7f0e"] as const;
export const curveColor = (i: number): string => COLORS[i % COLORS.length] ?? "#1f77b4";
export const graphCurveColor = (curve: GraphCurve, i: number): string =>
  curve?.couleur || curveColor(i);

const PAD = { top: 16, right: 18, bottom: 48, left: 68 };

type Ctx = CanvasRenderingContext2D;

export function drawGraph(ctx: Ctx, spec: GraphSpec, width: number, height: number): void {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  const xmin = num(spec.xmin, -5);
  const xmax = num(spec.xmax, 5);
  const ymin = num(spec.ymin, -5);
  const ymax = num(spec.ymax, 5);
  const spanX = xmax - xmin || 1;
  const spanY = ymax - ymin || 1;

  const plotW = width - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;
  const px = (x: number) => PAD.left + ((x - xmin) / spanX) * plotW;
  const py = (y: number) => PAD.top + plotH - ((y - ymin) / spanY) * plotH;

  const ticksX = ticks(xmin, xmax, niceStep(spanX));
  const ticksY = ticks(ymin, ymax, niceStep(spanY));

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

  // axes internes x=0 / y=0 si visibles
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
    const kind = curve.type ?? "fonction";
    const sourcePoints = (curve.points ?? []).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
    ctx.strokeStyle = graphCurveColor(curve, index);
    ctx.fillStyle = graphCurveColor(curve, index);
    ctx.lineWidth = 2;
    if (kind === "nuage") {
      sourcePoints.forEach((point) => {
        ctx.beginPath();
        ctx.arc(px(point.x), py(point.y), 3.5, 0, Math.PI * 2);
        ctx.fill();
      });
      return;
    }
    if (kind !== "fonction" && sourcePoints.length) {
      const samples = curveSamples(kind, sourcePoints, xmin, xmax);
      if (!samples.length) return;
      ctx.beginPath();
      samples.forEach((point, pointIndex) => {
        if (pointIndex === 0) ctx.moveTo(px(point.x), py(point.y));
        else ctx.lineTo(px(point.x), py(point.y));
      });
      ctx.stroke();
      sourcePoints.forEach((point) => {
        ctx.beginPath();
        ctx.arc(px(point.x), py(point.y), 3, 0, Math.PI * 2);
        ctx.fill();
      });
      return;
    }
    if (!curve.expr) return;
    let evaluate: (scope: { x: number }) => unknown;
    try {
      const node = compile(curve.expr);
      evaluate = (scope) => node.evaluate(scope);
    } catch {
      return;
    }
    ctx.beginPath();
    let drawing = false;
    const steps = 800;
    for (let i = 0; i <= steps; i++) {
      const x = xmin + (spanX * i) / steps;
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

  (spec.points ?? []).forEach((point) => {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    ctx.fillStyle = "#d62728";
    ctx.beginPath();
    ctx.arc(px(point.x), py(point.y), 3.5, 0, Math.PI * 2);
    ctx.fill();
    if (point.label) {
      ctx.font = "12px Inter, system-ui, sans-serif";
      ctx.fillStyle = "#1a1a1a";
      ctx.fillText(point.label, px(point.x) + 6, py(point.y) - 6);
    }
  });
  ctx.restore();

  // Légende placée librement dans le graphique.
  if (spec.legende && curves.some((curve) => graphLabel(curve.label))) {
    const entries = curves.filter((curve) => graphLabel(curve.label));
    const lx = PAD.left + (Math.max(0, Math.min(100, spec.legende.x)) / 100) * plotW;
    const ly = PAD.top + (Math.max(0, Math.min(100, spec.legende.y)) / 100) * plotH;
    const boxWidth = Math.max(110, ...entries.map((curve) => 48 + readableMath(graphLabel(curve.label)).length * 7));
    const rowHeight = 28;
    const boxHeight = entries.length * rowHeight + 10;
    const bx = Math.min(PAD.left + plotW - boxWidth, Math.max(PAD.left, lx));
    const by = Math.min(PAD.top + plotH - boxHeight, Math.max(PAD.top, ly));
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fillRect(bx, by, boxWidth, boxHeight);
    ctx.strokeStyle = "#d8dbe2";
    ctx.strokeRect(bx, by, boxWidth, boxHeight);
    ctx.font = "12px Inter, system-ui, sans-serif";
    entries.forEach((curve, entryIndex) => {
      const originalIndex = curves.indexOf(curve);
      const y = by + 10 + entryIndex * rowHeight + rowHeight / 2;
      ctx.strokeStyle = graphCurveColor(curve, originalIndex);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(bx + 8, y);
      ctx.lineTo(bx + 28, y);
      ctx.stroke();
      ctx.fillStyle = "#1a1a1a";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      drawLegendMath(ctx, graphLabel(curve.label), bx + 34, y);
    });
  }

  // cadre
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 1.2;
  ctx.strokeRect(PAD.left, PAD.top, plotW, plotH);

  // graduations + valeurs
  ctx.fillStyle = "#1a1a1a";
  ctx.font = "11px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ticksX.forEach((x) => {
    ctx.beginPath();
    ctx.moveTo(px(x), PAD.top + plotH);
    ctx.lineTo(px(x), PAD.top + plotH + 4);
    ctx.stroke();
    ctx.fillText(formatTick(x), px(x), PAD.top + plotH + 7);
  });
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ticksY.forEach((y) => {
    ctx.beginPath();
    ctx.moveTo(PAD.left, py(y));
    ctx.lineTo(PAD.left - 4, py(y));
    ctx.stroke();
    ctx.fillText(formatTick(y), PAD.left - 7, py(y));
  });

  // titres des axes
  ctx.font = "12px Inter, system-ui, sans-serif";
  ctx.fillStyle = "#1a1a1a";
  if (spec.xlabel) {
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(spec.xlabel, PAD.left + plotW / 2, height - 6);
  }
  if (spec.ylabel) {
    ctx.save();
    ctx.translate(14, PAD.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(spec.ylabel, 0, 0);
    ctx.restore();
  }
}

function readableMath(source: string): string {
  return source
    .replace(/^\$+|\$+$/g, "")
    .replace(/\\d?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, "$1 / $2")
    .replace(/\{,\}/g, ",")
    .replace(/\\(?:,|;|!|quad|qquad)/g, " ")
    .replace(/\\(?:cdot|times)/g, "×")
    .replace(/[{}]/g, "")
    .trim();
}

/** Dessine une légende mathématique simple, avec une vraie barre de fraction. */
function drawLegendMath(ctx: Ctx, source: string, x: number, y: number): void {
  const clean = source.replace(/^\$+|\$+$/g, "").replace(/\{,\}/g, ",");
  const fraction = clean.match(/^(.*?)\\d?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}(.*)$/);
  ctx.fillStyle = "#1a1a1a";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  if (!fraction) {
    ctx.fillText(readableMath(source), x, y);
    return;
  }
  const prefix = readableMath(fraction[1] ?? "");
  const numerator = readableMath(fraction[2] ?? "");
  const denominator = readableMath(fraction[3] ?? "");
  const suffix = readableMath(fraction[4] ?? "");
  ctx.fillText(prefix, x, y);
  const prefixWidth = ctx.measureText(prefix).width;
  const fractionWidth = Math.max(ctx.measureText(numerator).width, ctx.measureText(denominator).width) + 7;
  const fx = x + prefixWidth + 3;
  ctx.textAlign = "center";
  ctx.font = "10px Inter, system-ui, sans-serif";
  ctx.fillText(numerator, fx + fractionWidth / 2, y - 7);
  ctx.fillText(denominator, fx + fractionWidth / 2, y + 7);
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(fx, y);
  ctx.lineTo(fx + fractionWidth, y);
  ctx.stroke();
  ctx.font = "12px Inter, system-ui, sans-serif";
  ctx.textAlign = "left";
  if (suffix) ctx.fillText(suffix, fx + fractionWidth + 3, y);
}

function curveSamples(
  kind: NonNullable<NonNullable<GraphSpec["courbes"]>[number]["type"]>,
  points: Array<{ x: number; y: number }>,
  xmin: number,
  xmax: number,
): Array<{ x: number; y: number }> {
  if (kind === "droite" && points.length >= 2) {
    const [a, b] = points;
    if (Math.abs(b.x - a.x) < 1e-9) return [{ x: a.x, y: -1e6 }, { x: a.x, y: 1e6 }];
    const slope = (b.y - a.y) / (b.x - a.x);
    return [{ x: xmin, y: a.y + slope * (xmin - a.x) }, { x: xmax, y: a.y + slope * (xmax - a.x) }];
  }
  if (kind === "parabole" && points.length >= 3) {
    const [a, b, c] = points;
    const denom = (a.x - b.x) * (a.x - c.x) * (b.x - c.x);
    if (Math.abs(denom) < 1e-9) return points;
    const aa = (c.x * (b.y - a.y) + b.x * (a.y - c.y) + a.x * (c.y - b.y)) / denom;
    const bb = (c.x * c.x * (a.y - b.y) + b.x * b.x * (c.y - a.y) + a.x * a.x * (b.y - c.y)) / denom;
    const cc = (b.x * c.x * (b.x - c.x) * a.y + c.x * a.x * (c.x - a.x) * b.y + a.x * b.x * (a.x - b.x) * c.y) / denom;
    return Array.from({ length: 301 }, (_, i) => { const x = xmin + ((xmax - xmin) * i) / 300; return { x, y: aa * x * x + bb * x + cc }; });
  }
  if (kind === "courbe" && points.length >= 2) {
    const sorted = [...points].sort((a, b) => a.x - b.x);
    const out: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      const p0 = sorted[Math.max(0, i - 1)]!, p1 = sorted[i]!, p2 = sorted[i + 1]!, p3 = sorted[Math.min(sorted.length - 1, i + 2)]!;
      for (let s = 0; s < 30; s++) {
        const t = s / 30, t2 = t * t, t3 = t2 * t;
        out.push({ x: .5 * ((2*p1.x)+(-p0.x+p2.x)*t+(2*p0.x-5*p1.x+4*p2.x-p3.x)*t2+(-p0.x+3*p1.x-3*p2.x+p3.x)*t3), y: .5 * ((2*p1.y)+(-p0.y+p2.y)*t+(2*p0.y-5*p1.y+4*p2.y-p3.y)*t2+(-p0.y+3*p1.y-3*p2.y+p3.y)*t3) });
      }
    }
    out.push(sorted.at(-1)!);
    return out;
  }
  return points;
}

/** Rendu hors-écran d'un graphe en PNG (utilisé par l'export PDF). */
export function graphToDataUrl(spec: GraphSpec, width = 640, height = 400): string {
  if (typeof document === "undefined") return "";
  const canvas = document.createElement("canvas");
  const dpr = Math.min(2, typeof window === "undefined" ? 1 : window.devicePixelRatio || 1);
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawGraph(ctx, spec, width, height);
  return canvas.toDataURL("image/png");
}

function ticks(min: number, max: number, step: number): number[] {
  if (!Number.isFinite(step) || step <= 0) return [min, max];
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-6; v += step) {
    out.push(Math.round(v * 1e6) / 1e6);
    if (out.length > 200) break;
  }
  return out;
}

function num(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function niceStep(range: number): number {
  const rough = Math.abs(range) / 8 || 1;
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  const rel = rough / pow;
  const mult = rel >= 5 ? 5 : rel >= 2 ? 2 : 1;
  return mult * pow;
}

function formatTick(value: number): string {
  if (Math.abs(value) < 1e-9) return "0";
  const rounded = Math.round(value * 1000) / 1000;
  return String(rounded).replace("-", "−").replace(".", ",");
}
