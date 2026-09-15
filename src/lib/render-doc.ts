/**
 * Rendu partagé (spec §23 — l'aperçu DOIT être exactement le PDF).
 * `blocksToHtml` produit le HTML utilisé à la fois par l'aperçu iframe et par
 * l'export PDF. Le rendu React éditable (`DocRenderer`) réutilise ce HTML pour
 * tout sauf les graphes, qu'il affiche en direct.
 */

import { renderInline, renderMath } from "./markdown";
import { graphCurveColor, graphToDataUrl } from "./graph-draw";
import { frenchNumber } from "./structure";
import type { Block, DocMode, GraphSpec } from "./doc-model";
import { graphLabel } from "./markdown";

export type RenderOptions = {
  mode: DocMode;
  /** true → surligne les blocs incertains (aperçu). false → neutre (PDF). */
  highlightUncertain: boolean;
};

const NUMBERED = /^(\d+[.)°]?|exercice\b|ex\.?\b|partie\b|question\b|[IVXLC]+[.)])/i;

export function blocksToHtml(blocks: Block[], options: RenderOptions): string {
  const parts: string[] = [];
  let i = 0;

  while (i < blocks.length) {
    const block = blocks[i]!;

    if (block.type === "calcul") {
      const group: Block[] = [];
      while (i < blocks.length && blocks[i]!.type === "calcul") group.push(blocks[i++]!);
      parts.push(
        `<div class="calc-group">${group
          .map((b) =>
            wrap(
              b,
              `<div class="calc">${renderMath(b.type === "calcul" ? b.latex : "", true)}</div>`,
              options,
            ),
          )
          .join("")}</div>`,
      );
      continue;
    }

    if (block.type === "tableau") {
      const group: Block[] = [];
      while (i < blocks.length && blocks[i]!.type === "tableau") group.push(blocks[i++]!);
      parts.push(
        `<div class="tables">${group.map((b) => wrap(b, tableHtml(b), options)).join("")}</div>`,
      );
      continue;
    }

    parts.push(wrap(block, blockInner(block, options), options));
    i += 1;
  }

  return parts.join("\n");
}

function wrap(block: Block, inner: string, options: RenderOptions): string {
  const flagged = options.highlightUncertain && (block.incertain || block.confiance < 0.85);
  const cls = flagged ? ` class="blk uncertain"` : ` class="blk"`;
  const title = flagged && block.raison ? ` title="À vérifier : ${escapeAttr(block.raison)}"` : "";
  return `<div data-bid="${block.id}"${cls}${title}>${inner}</div>`;
}

function blockInner(block: Block, options: RenderOptions): string {
  switch (block.type) {
    case "titre": {
      const level = block.niveau === 1 ? 1 : block.niveau === 3 ? 3 : 2;
      return `<h${level} class="doc-h doc-h${level}">${renderInline(block.texte)}</h${level}>`;
    }
    case "paragraphe":
      return `<p>${renderInline(applyMode(block.texte, options.mode))}</p>`;
    case "question": {
      const indent = block.profondeur > 0 ? ` style="margin-left:${block.profondeur * 1.1}em"` : "";
      const text = renderInline(applyMode(block.texte, options.mode));
      if (!block.repere) return `<p class="q"${indent}>${text}</p>`;
      if (NUMBERED.test(block.repere)) {
        return `<p class="q q-num"${indent}><strong>${escapeHtml(block.repere)}</strong> ${text}</p>`;
      }
      return `<div class="q q-let"${indent}><span class="q-mark">${escapeHtml(block.repere)}</span> ${text}</div>`;
    }
    case "formule":
      return block.display
        ? `<div class="katex-display">${renderMath(block.latex, true)}</div>`
        : `<p class="f-inline">${renderMath(block.latex, false)}</p>`;
    case "calcul":
      return `<div class="calc">${renderMath(block.latex, true)}</div>`;
    case "tableau":
      return tableHtml(block);
    case "graphe":
      return graphHtml(block.graphe);
    case "annotation": {
      const mark = ANNOT_MARK[block.genre] ?? "✎";
      return `<p class="annot annot-${block.genre}"><span class="annot-mark">${mark}</span> ${renderInline(
        block.texte,
      )}</p>`;
    }
    case "encadre":
      return `<blockquote class="encadre">${renderInline(applyMode(block.texte, options.mode))}</blockquote>`;
    default:
      return "";
  }
}

const ANNOT_MARK: Record<string, string> = {
  fleche: "→",
  coche: "✓",
  croix: "✗",
  note: "✎",
  correction: "✎",
};

function tableHtml(block: Block): string {
  if (block.type !== "tableau") return "";
  const head = block.colonnes.length
    ? `<thead><tr>${block.colonnes.map((c) => `<th>${renderInline(c)}</th>`).join("")}</tr></thead>`
    : "";
  const body = `<tbody>${block.lignes
    .map((row) => `<tr>${row.map((cell) => `<td>${renderInline(cell)}</td>`).join("")}</tr>`)
    .join("")}</tbody>`;
  return `<table class="doc-table">${head}${body}</table>`;
}

function graphHtml(spec: GraphSpec): string {
  const src = graphToDataUrl(spec);
  const legend = spec.legende ? [] : (spec.courbes ?? []).filter((c) => graphLabel(c.label));
  const caption = spec.titre ? `<figcaption>${escapeHtml(spec.titre)}</figcaption>` : "";
  const legendHtml = legend.length
    ? `<div class="graph-legend">${legend
        .map((c, index) => {
          const latex = graphLabel(c.label).replace(/^\$|\$$/g, "").replace(/(\d),(\d)/g, "$1{,}$2");
          return `<span class="graph-legend-item"><i class="graph-legend-line" style="border-top-color:${graphCurveColor(c, index)}"></i><span>${renderMath(latex, false)}</span></span>`;
        })
        .join("")}</div>`
    : "";
  const img = src
    ? `<img src="${src}" alt="${escapeAttr(spec.titre ?? "graphique")}" />`
    : `<p class="graph-missing">Graphique non reconstruit — vérifier la source.</p>`;
  return `<figure class="doc-graph" data-graph-spec="${escapeAttr(JSON.stringify(spec))}">${img}${legendHtml}${caption}</figure>`;
}

/** Mode « propre » : espace fine pour les milliers, à l'affichage uniquement. */
function applyMode(text: string, mode: DocMode): string {
  return mode === "propre" ? frenchNumber(text) : text;
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/"/g, "&quot;");
}
