/**
 * Génération PDF (spec §12–§19). Le document structuré est rendu en HTML par
 * `blocksToHtml` (le MÊME rendu que l'aperçu — spec §23), coulé dans un flux,
 * puis paginé bloc par bloc : aucune formule, question, tableau ni graphique
 * n'est coupé, aucun titre ne reste seul en bas de page. Pied de page discret
 * « Digital Math · Page X / Y ». L'utilisateur choisit « Enregistrer en PDF »
 * dans la boîte d'impression.
 */

import { blocksToHtml } from "./render-doc";
import type { DigitalDoc } from "./doc-model";

const PAGE_HEIGHT_MM = 297 - 40; // A4 moins marges 20 mm haut/bas
const CONTENT_WIDTH_MM = 210 - 40;

function stylesheetLinks(): string {
  return Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
    .map((link) => `<link rel="stylesheet" href="${(link as HTMLLinkElement).href}">`)
    .join("");
}

function docCss(): string {
  return `
  @page { size: A4; margin: 0; }
  html, body { background: #fff; margin: 0; padding: 0; }
  body {
    color: #16181d;
    font-family: Inter, "Noto Sans", "Helvetica Neue", Arial, sans-serif;
    font-size: 11px; line-height: 1.55;
    -webkit-font-smoothing: antialiased;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  #flow { width: ${CONTENT_WIDTH_MM}mm; }
  .page {
    position: relative; width: 210mm; min-height: 297mm;
    box-sizing: border-box; padding: 20mm 20mm 32mm;
    break-after: page; page-break-after: always;
  }
  .page-body { width: ${CONTENT_WIDTH_MM}mm; }
  .page:last-of-type { break-after: auto; page-break-after: auto; }
  .page-foot {
    position: absolute; left: 20mm; right: 20mm; bottom: 15mm;
    display: flex; justify-content: space-between;
    font-size: 8px; color: #8a909c;
    border-top: 1px solid #e6e8ec; padding-top: 2mm;
  }
  .doc-head { margin: 0 0 14px; }
  .doc-title { font-size: 20px; font-weight: 700; letter-spacing: -0.01em; margin: 0 0 3px; color: #16181d; }
  .doc-meta { font-size: 10px; color: #6b7180; margin: 0; }
  .page-body { color: #16181d; }
  .doc-h1 { font-weight: 700; font-size: 17px; margin: 2px 0 10px; }
  .doc-h2 { font-weight: 700; font-size: 14.5px; margin: 18px 0 7px; }
  .doc-h3 { font-weight: 600; font-size: 12px; margin: 13px 0 5px; }
  .page-body p { margin: 0 0 8px; }
  .q { margin: 0 0 7px; }
  .q-num strong { font-weight: 700; }
  .q-let .q-mark { font-weight: 600; margin-right: 2px; }
  .f-inline { text-align: center; margin: 8px 0; }
  .calc-group { margin: 6px 0 10px; }
  .calc { margin: 3px 0; }
  .katex { font-size: 1.05em; }
  .katex-display { margin: 9px 0; text-align: center; }
  .tables { display: flex; flex-wrap: wrap; gap: 0 16px; align-items: flex-start; margin: 8px 0 10px; }
  .doc-table { border-collapse: collapse; font-size: 10.5px; }
  .doc-table th, .doc-table td { border: 1px solid #b9bec9; padding: 4px 8px; text-align: center; line-height: 1.4; }
  .doc-table th { background: #f4f5f7; font-weight: 600; }
  .doc-graph { margin: 10px 0; page-break-inside: avoid; break-inside: avoid; }
  .doc-graph img { max-width: 100%; height: auto; }
  .doc-graph figcaption { color: #6b7180; font-size: 10px; margin-top: 2px; }
  .graph-legend { display: flex; flex-wrap: wrap; align-items: center; gap: 5px 16px; font-size: 9.5px; color: #444; margin-top: 4px; }
  .graph-legend-item { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
  .graph-legend-line { display: inline-block; width: 20px; height: 0; flex: 0 0 20px; border-top: 2px solid currentColor; }
  .encadre { border-left: 2px solid #cfd3da; margin: 9px 0; padding-left: 10px; color: #16181d; }
  .annot { color: #6b7180; font-size: 10.5px; margin: 5px 0; }
  .annot-mark { font-weight: 700; margin-right: 3px; }
  .blk.uncertain { background: transparent; }
  .doc-table, .doc-graph, .katex-display, .calc-group, .tables, .q, p, h1, h2, h3, blockquote, figure, li {
    break-inside: avoid; page-break-inside: avoid;
  }
  h1, h2, h3, .doc-h1, .doc-h2, .doc-h3, .q { break-after: avoid; page-break-after: avoid; }
  `;
}

/** HTML complet et autonome du document (flux non encore paginé). */
export function buildDocHtml(doc: DigitalDoc): string {
  const opts = { mode: doc.mode, highlightUncertain: false };
  const head =
    doc.titre || doc.meta.trim()
      ? `<div class="doc-head">${doc.titre ? `<h1 class="doc-title">${escapeHtml(doc.titre)}</h1>` : ""}${
          doc.meta.trim() ? `<p class="doc-meta">${escapeHtml(doc.meta)}</p>` : ""
        }</div>`
      : "";
  const body = doc.pages.map((page) => blocksToHtml(page.blocks, opts)).join("\n");
  const title = doc.titre?.trim() || "Digital Math";

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<title>${escapeHtml(title)}</title>${stylesheetLinks()}
<style>${docCss()}</style></head>
<body><div id="flow">${head}${body}</div></body></html>`;
}

/** Écrit le HTML dans un iframe déjà attaché au document, puis pagine. */
async function mountAndPaginate(
  iframe: HTMLIFrameElement,
  html: string,
  author = "",
): Promise<void> {
  const frameDoc = iframe.contentDocument;
  if (!frameDoc) throw new Error("Rendu du document indisponible.");
  frameDoc.open();
  frameDoc.write(html);
  frameDoc.close();

  await new Promise((resolve) => setTimeout(resolve, 60));
  try {
    if (frameDoc.fonts?.ready) await frameDoc.fonts.ready;
  } catch {
    /* polices non critiques */
  }
  await waitForImages(frameDoc);
  paginate(frameDoc, author);
}

/**
 * Écrit le document dans un iframe et le pagine. Utilisé par l'aperçu (iframe
 * visible) ET par l'export (iframe caché) → aperçu == PDF (spec §23).
 */
export async function mountPaginatedDoc(iframe: HTMLIFrameElement, doc: DigitalDoc): Promise<void> {
  await mountAndPaginate(iframe, buildDocHtml(doc), doc.author);
}

/** Rend le HTML hors écran, pagine, puis ouvre l'impression du navigateur. */
async function printHtml(html: string, title: string, author = ""): Promise<void> {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.title = title || "Digital Math";
  iframe.style.cssText =
    "position:fixed;right:0;bottom:0;width:210mm;height:297mm;border:0;opacity:0;";
  document.body.appendChild(iframe);

  try {
    await mountAndPaginate(iframe, html, author);
    await new Promise((resolve) => setTimeout(resolve, 200));
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
  } finally {
    setTimeout(() => iframe.remove(), 60_000);
  }
}

/** Export : rend le document structuré hors écran, pagine, puis ouvre l'impression. */
export async function exportDocToPdf(doc: DigitalDoc): Promise<void> {
  await printHtml(buildDocHtml(doc), doc.titre?.trim() || "Digital Math", doc.author);
}

/**
 * Export du contenu librement modifié dans l'éditeur type Word (`DocumentEditor`) :
 * le HTML n'est plus reconstruit depuis les blocs, mais imprimé tel quel.
 */
export async function printDocument(
  container: HTMLElement,
  title: string,
  meta: string,
  author = "",
): Promise<void> {
  const trimmedTitle = title.trim();
  const trimmedMeta = meta.trim();
  const head =
    trimmedTitle || trimmedMeta
      ? `<div class="doc-head">${trimmedTitle ? `<h1 class="doc-title">${escapeHtml(trimmedTitle)}</h1>` : ""}${
          trimmedMeta ? `<p class="doc-meta">${escapeHtml(trimmedMeta)}</p>` : ""
        }</div>`
      : "";
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<title>${escapeHtml(trimmedTitle || "Digital Math")}</title>${stylesheetLinks()}
<style>${docCss()}</style></head>
<body><div id="flow">${head}${container.innerHTML}</div></body></html>`;
  await printHtml(html, trimmedTitle || "Digital Math", author);
}

async function waitForImages(doc: Document): Promise<void> {
  await Promise.all(
    Array.from(doc.images).map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            img.addEventListener("load", () => resolve(), { once: true });
            img.addEventListener("error", () => resolve(), { once: true });
          }),
    ),
  );
}

/** Répartit les blocs sur des pages A4 sans jamais couper un bloc (spec §18). */
function paginate(doc: Document, author = ""): void {
  const flow = doc.getElementById("flow");
  if (!flow) return;

  const blocks = Array.from(flow.children) as HTMLElement[];
  const pxPerMm = flow.getBoundingClientRect().width / CONTENT_WIDTH_MM || 3.78;
  const maxHeight = (PAGE_HEIGHT_MM - 14) * pxPerMm;

  const pages: HTMLElement[] = [];
  const newPage = (): HTMLElement => {
    const page = doc.createElement("div");
    page.className = "page";
    const body = doc.createElement("div");
    body.className = "page-body";
    page.appendChild(body);
    doc.body.appendChild(page);
    pages.push(page);
    return body;
  };

  let body = newPage();

  for (const block of blocks) {
    body.appendChild(block);
    if (body.getBoundingClientRect().height > maxHeight && body.children.length > 1) {
      // déborde : on repousse ce bloc (+ titres/questions qui le précèdent) sur une nouvelle page
      const trailing: HTMLElement[] = [block];
      let previous = block.previousElementSibling as HTMLElement | null;
      while (previous && keepWithNext(previous)) {
        trailing.unshift(previous);
        previous = previous.previousElementSibling as HTMLElement | null;
      }
      if (trailing.length === body.children.length) {
        // le bloc seul dépasse déjà la page : on le laisse (il sera juste un peu long)
        continue;
      }
      body = newPage();
      trailing.forEach((node) => body.appendChild(node));
    }
  }

  flow.remove();

  pages.forEach((page, index) => {
    const foot = doc.createElement("div");
    foot.className = "page-foot";
    foot.innerHTML = `<span>${escapeHtml(author.trim() || "Digital Math")}</span><span>Page ${index + 1} / ${pages.length}</span>`;
    page.appendChild(foot);
  });
}

function keepWithNext(el: HTMLElement): boolean {
  if (/^H[1-3]$/.test(el.tagName)) return true;
  if (
    el.classList.contains("doc-h1") ||
    el.classList.contains("doc-h2") ||
    el.classList.contains("doc-h3")
  ) {
    return true;
  }
  // une question ne doit pas être séparée de son calcul (spec §13)
  return el.querySelector(":scope > .q") !== null || el.classList.contains("q");
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
