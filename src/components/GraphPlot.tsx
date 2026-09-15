import { useEffect, useRef } from "react";
import { drawGraph, graphCurveColor } from "@/lib/graph-draw";
import type { GraphSpec } from "@/lib/markdown";
import { graphLabel, renderMath } from "@/lib/markdown";

/** Aperçu React d'un bloc `graphe` (même tracé que l'export PDF). */
export function GraphPlot({
  spec,
  width = 620,
  height = 380,
}: {
  spec: GraphSpec;
  width?: number;
  height?: number;
}) {
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
    drawGraph(ctx, spec, width, height);
  }, [spec, width, height]);

  const legend = spec.legende ? [] : (spec.courbes ?? []).filter((c) => graphLabel(c.label));

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
                style={{ backgroundColor: graphCurveColor(curve, index) }}
              />
              <span className="text-[11px] text-ink">
                <MathFormulaLabel text={graphLabel(curve.label)} />
              </span>
            </div>
          ))}
        </div>
      ) : null}
      {spec.titre ? (
        <figcaption className="mt-1 text-[11px] text-ink-soft">
          <MathLabel text={spec.titre} />
        </figcaption>
      ) : null}
    </figure>
  );
}

/** Étiquette mathématique simple : `4^x`, `x^{2}`, `*` → exposants et ×. */
function MathLabel({ text }: { text: string }) {
  return (
    <>
      {parseLabel(text).map((part, index) =>
        part.sup ? <sup key={index}>{part.text}</sup> : <span key={index}>{part.text}</span>,
      )}
    </>
  );
}

function MathFormulaLabel({ text }: { text: string }) {
  const latex = text.replace(/^\$|\$$/g, "").replace(/(\d),(\d)/g, "$1{,}$2");
  return <span dangerouslySetInnerHTML={{ __html: renderMath(latex, false) }} />;
}

type LabelPart = { text: string; sup?: boolean };

function parseLabel(source: string): LabelPart[] {
  const parts: LabelPart[] = [];
  let buffer = "";
  let i = 0;
  const flush = () => {
    if (buffer) parts.push({ text: buffer });
    buffer = "";
  };

  while (i < source.length) {
    const char = source[i]!;
    if (char === "^") {
      i++;
      let exponent = "";
      if (source[i] === "{" || source[i] === "(") {
        const close = source[i] === "{" ? "}" : ")";
        i++;
        while (i < source.length && source[i] !== close) exponent += source[i++];
        i++;
      } else {
        while (i < source.length && /[A-Za-z0-9+\-.,]/.test(source[i]!)) exponent += source[i++];
      }
      if (exponent) {
        flush();
        parts.push({ text: exponent, sup: true });
      } else {
        buffer += "^";
      }
      continue;
    }
    if (char === "*") {
      buffer += "×";
      i++;
      continue;
    }
    buffer += char;
    i++;
  }
  flush();
  return parts;
}
