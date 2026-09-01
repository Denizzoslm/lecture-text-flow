/** Assemble les images scannées dans un PDF A4 (une page par image) et le télécharge. */
import { jsPDF } from "jspdf";

const A4 = { width: 210, height: 297 };
const MARGIN = 8;

export async function downloadScannedPdf(images: string[], title: string, meta: string): Promise<void> {
  if (!images.length) throw new Error("Aucune page à exporter.");
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });

  for (let index = 0; index < images.length; index += 1) {
    const dataUrl = images[index] as string;
    const size = await imageSize(dataUrl);
    if (index > 0) doc.addPage();

    const maxWidth = A4.width - MARGIN * 2;
    const maxHeight = A4.height - MARGIN * 2;
    const scale = Math.min(maxWidth / size.width, maxHeight / size.height);
    const width = size.width * scale;
    const height = size.height * scale;
    const x = (A4.width - width) / 2;
    const y = (A4.height - height) / 2;
    doc.addImage(dataUrl, "JPEG", x, y, width, height, `page-${index}`, "FAST");
  }

  const base = (title.trim() || "cahier-numerique").replace(/[^\p{L}\p{N}\- ]+/gu, "").trim() || "cahier-numerique";
  doc.setProperties({ title: title.trim() || "Cahier numérique", subject: meta.trim() });
  doc.save(`${base.replace(/\s+/g, "-").toLowerCase()}-scan.pdf`);
}

function imageSize(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("Image de page illisible."));
    img.src = dataUrl;
  });
}
