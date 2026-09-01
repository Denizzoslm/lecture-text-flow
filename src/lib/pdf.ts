/**
 * Export PDF A4 : le document rendu (markdown + KaTeX + graphiques) est copié
 * dans un iframe imprimable, les graphiques canvas devenant des images PNG.
 * L'utilisateur choisit "Enregistrer au format PDF" dans la boîte d'impression.
 */
export async function printDocument(source: HTMLElement, title: string, meta: string): Promise<void> {
  const clone = source.cloneNode(true) as HTMLElement;

  // Les canvas ne survivent pas au clone : on les remplace par des images.
  const originals = source.querySelectorAll("canvas");
  clone.querySelectorAll("canvas").forEach((canvas, index) => {
    const origin = originals[index];
    if (!origin) return;
    const img = document.createElement("img");
    img.src = origin.toDataURL("image/png");
    img.style.width = "100%";
    img.style.height = "auto";
    canvas.replaceWith(img);
  });

  const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
    .map((link) => `<link rel="stylesheet" href="${(link as HTMLLinkElement).href}">`)
    .join("");

  const documentTitle = title.trim() || "Cahier numérique";
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<title>${escapeHtml(documentTitle)}</title>${styles}
<style>
  @page { size: A4; margin: 18mm 16mm; }
  html, body { background: #fff; margin: 0; }
  body { color: #1a1a1a; font-family: Inter, "Helvetica Neue", Arial, sans-serif; font-size: 10.5pt; line-height: 1.5; }
  #doc { width: auto !important; padding: 0 !important; }
  img, canvas, .katex-display, table { break-inside: avoid; page-break-inside: avoid; }
  .prose-cahier { color: #1a1a1a; }
  .prose-cahier h1 { font-family: inherit; font-weight: 700; font-size: 15pt; text-align: center; margin: 0 0 1.2em; }
  .prose-cahier h2 { font-family: inherit; font-weight: 700; font-size: 12pt; color: #1a1a1a; margin: 1.1em 0 0.4em; }
  .prose-cahier h3 { font-family: inherit; font-weight: 700; font-size: 11pt; color: #1a1a1a; margin: 0.9em 0 0.3em; }
  .prose-cahier strong { color: #1a1a1a; }
  .prose-cahier blockquote { border-left: 2px solid #bbb; color: #1a1a1a; }
  .prose-cahier table { display: inline-table; vertical-align: top; margin: 0.6em 1em 0.6em 0; }
  .prose-cahier th, .prose-cahier td { border: 1px solid #444; }
  figure { margin: 1em 0; }
  figcaption { color: #444; }


  section { break-after: page; page-break-after: always; }
  section:last-of-type { break-after: auto; page-break-after: auto; }
</style></head><body>${clone.innerHTML}</body></html>`;

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

  await new Promise((resolve) => setTimeout(resolve, 600));
  try {
    if (frameDocument.fonts?.ready) await frameDocument.fonts.ready;
  } catch {
    /* polices non critiques */
  }

  iframe.contentWindow?.focus();
  iframe.contentWindow?.print();
  setTimeout(() => iframe.remove(), 60_000);
  void meta;
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
