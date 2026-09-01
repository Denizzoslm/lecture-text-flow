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
  @page { size: A4; margin: 16mm 14mm; }
  html, body { background: #fff; margin: 0; }
  body { color: #2d3f63; font-family: Inter, system-ui, sans-serif; font-size: 11pt; }
  #doc { width: auto !important; padding: 0 !important; }
  img, canvas, .katex-display { break-inside: avoid; page-break-inside: avoid; }
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
