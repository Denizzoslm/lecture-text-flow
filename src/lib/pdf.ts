/**
 * Export PDF A4 « mode propre » : le document rendu (markdown + KaTeX + graphiques)
 * est recopié dans un iframe, paginé bloc par bloc (aucune formule / question /
 * tableau / graphique coupé), puis imprimé. L'utilisateur choisit
 * « Enregistrer au format PDF » dans la boîte d'impression.
 */

const PAGE_HEIGHT_MM = 297 - 40; // A4 moins marges haut/bas de 20 mm
const CONTENT_WIDTH_MM = 210 - 40;

export async function printDocument(source: HTMLElement, title: string, meta: string): Promise<void> {
  const clone = source.cloneNode(true) as HTMLElement;

  // Les canvas ne survivent pas au clone : on les remplace par des images nettes.
  const originals = source.querySelectorAll("canvas");
  clone.querySelectorAll("canvas").forEach((canvas, index) => {
    const origin = originals[index];
    if (!origin) return;
    const img = document.createElement("img");
    img.src = origin.toDataURL("image/png");
    img.style.maxWidth = "100%";
    img.style.height = "auto";
    canvas.replaceWith(img);
  });

  const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
    .map((link) => `<link rel="stylesheet" href="${(link as HTMLLinkElement).href}">`)
    .join("");

  const documentTitle = title.trim() || "Digital Math";
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<title>${escapeHtml(documentTitle)}</title>${styles}
<style>
  @page { size: A4; margin: 20mm; }
  html, body { background: #fff; margin: 0; padding: 0; }
  body {
    color: #16181d;
    font-family: Inter, "Noto Sans", "Helvetica Neue", Arial, sans-serif;
    font-size: 11px;
    line-height: 1.55;
    -webkit-font-smoothing: antialiased;
  }
  #flow, .page { width: ${CONTENT_WIDTH_MM}mm; }
  .page {
    position: relative;
    min-height: ${PAGE_HEIGHT_MM}mm;
    box-sizing: border-box;
    padding-bottom: 10mm;
    break-after: page;
    page-break-after: always;
  }
  .page:last-of-type { break-after: auto; page-break-after: auto; }
  .page-foot {
    position: absolute;
    left: 0; right: 0; bottom: 0;
    display: flex;
    justify-content: space-between;
    font-size: 8.5px;
    color: #7b8190;
    border-top: 1px solid #e3e5ea;
    padding-top: 2mm;
  }
  .doc-title {
    font-size: 20px; font-weight: 700; letter-spacing: -0.01em;
    margin: 0 0 4px; color: #16181d;
  }
  .doc-meta { font-size: 10.5px; color: #6b7180; margin: 0 0 14px; }
  .prose-cahier { color: #16181d; font-family: inherit; }
  .prose-cahier h1 { font-family: inherit; font-weight: 700; font-size: 17px; margin: 0 0 10px; letter-spacing: 0.01em; }
  .prose-cahier h2 { font-family: inherit; font-weight: 700; font-size: 14.5px; color: #16181d; margin: 20px 0 8px; }
  .prose-cahier h3 { font-family: inherit; font-weight: 600; font-size: 12px; color: #16181d; margin: 14px 0 6px; }
  .prose-cahier p { margin: 0 0 9px; }
  .prose-cahier ul, .prose-cahier ol { margin: 0 0 10px; padding-left: 20px; }
  .prose-cahier li { margin: 0 0 6px; }
  .prose-cahier li > p { margin: 0 0 4px; }
  .prose-cahier strong { font-weight: 600; color: #16181d; }
  .prose-cahier blockquote { border-left: 2px solid #d3d6dd; color: #16181d; margin: 10px 0; padding-left: 10px; }
  .prose-cahier hr { border: none; border-top: 1px solid #e3e5ea; margin: 18px 0; }
  .katex { font-size: 1.06em; }
  .katex-display { margin: 10px 0; text-align: center; }
  .prose-cahier table {
    display: inline-table; vertical-align: top; border-collapse: collapse;
    margin: 8px 14px 10px 0; font-size: 10.5px;
  }
  .prose-cahier th, .prose-cahier td {
    border: 1px solid #b9bec9; padding: 4px 8px; line-height: 1.4; text-align: center;
  }
  .prose-cahier th { background: #f4f5f7; font-weight: 600; }
  figure { margin: 10px 0; page-break-inside: avoid; break-inside: avoid; }
  figcaption { color: #6b7180; font-size: 10px; }
  img, .katex-display, table, figure, li, h1, h2, h3, p, blockquote {
    break-inside: avoid; page-break-inside: avoid;
  }
  h1, h2, h3 { break-after: avoid; page-break-after: avoid; }
</style></head><body><div id="flow">${clone.innerHTML}</div></body></html>`;

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.title = documentTitle;
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:210mm;height:297mm;border:0;opacity:0;";
  document.body.appendChild(iframe);

  const frameDocument = iframe.contentDocument;
  if (!frameDocument) {
    iframe.remove();
    throw new Error("Impression indisponible.");
  }
  frameDocument.open();
  frameDocument.write(html);
  frameDocument.close();

  await new Promise((resolve) => setTimeout(resolve, 500));
  try {
    if (frameDocument.fonts?.ready) await frameDocument.fonts.ready;
  } catch {
    /* polices non critiques */
  }
  await waitForImages(frameDocument);

  paginate(frameDocument, documentTitle, meta);

  iframe.contentWindow?.focus();
  iframe.contentWindow?.print();
  setTimeout(() => iframe.remove(), 60_000);
}

async function waitForImages(doc: Document) {
  const images = Array.from(doc.images);
  await Promise.all(
    images.map(
      (img) =>
        img.complete
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              img.addEventListener("load", () => resolve(), { once: true });
              img.addEventListener("error", () => resolve(), { once: true });
            }),
    ),
  );
}

/**
 * Répartit les blocs (titres, paragraphes, formules, tableaux, graphiques) sur
 * des pages A4 en évitant de couper un bloc et de laisser un titre seul en bas.
 */
function paginate(doc: Document, title: string, meta: string) {
  const flow = doc.getElementById("flow");
  if (!flow) return;

  const blocks: HTMLElement[] = [];
  flow.querySelectorAll(":scope > *").forEach((child) => {
    const element = child as HTMLElement;
    // On descend d'un niveau dans les wrappers (sections, div de rendu markdown).
    if (element.tagName === "SECTION" || (element.tagName === "DIV" && element.children.length > 1)) {
      element.querySelectorAll(":scope > *").forEach((inner) => {
        const node = inner as HTMLElement;
        if (node.tagName === "DIV" && node.children.length > 1) {
          node.querySelectorAll(":scope > *").forEach((leaf) => blocks.push(leaf as HTMLElement));
        } else {
          blocks.push(node);
        }
      });
    } else {
      blocks.push(element);
    }
  });

  const header = doc.createElement("div");
  header.innerHTML = `<h1 class="doc-title">${escapeHtml(title)}</h1>${
    meta.trim() ? `<p class="doc-meta">${escapeHtml(meta)}</p>` : ""
  }`;

  const pxPerMm = flow.getBoundingClientRect().width / CONTENT_WIDTH_MM || 3.78;
  const maxHeight = PAGE_HEIGHT_MM * pxPerMm - 12 * pxPerMm; // marge pour le pied de page

  const pages: HTMLElement[] = [];
  const newPage = () => {
    const page = doc.createElement("div");
    page.className = "page";
    const body = doc.createElement("div");
    body.className = "prose-cahier page-body";
    page.appendChild(body);
    doc.body.appendChild(page);
    pages.push(page);
    return body;
  };

  let body = newPage();
  body.appendChild(header);

  for (const block of blocks) {
    body.appendChild(block);
    if (body.getBoundingClientRect().height > maxHeight && body.children.length > 1) {
      // Le bloc déborde : on le déplace (avec son titre s'il le précède) sur une nouvelle page.
      const trailing: HTMLElement[] = [block];
      let previous = block.previousElementSibling as HTMLElement | null;
      while (previous && /^H[1-3]$/.test(previous.tagName)) {
        trailing.unshift(previous);
        previous = previous.previousElementSibling as HTMLElement | null;
      }
      body = newPage();
      trailing.forEach((node) => body.appendChild(node));
    }
  }

  flow.remove();

  pages.forEach((page, index) => {
    const foot = doc.createElement("div");
    foot.className = "page-foot";
    foot.innerHTML = `<span>Digital Math</span><span>Page ${index + 1} / ${pages.length}</span>`;
    page.appendChild(foot);
  });
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
