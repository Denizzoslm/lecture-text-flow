import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Camera, FileDown, Images, ScanLine, ScanText } from "lucide-react";
import { toast } from "sonner";
import "katex/dist/katex.min.css";

import { transcribePage } from "@/lib/transcription.functions";
import { enhanceScan } from "@/lib/scan-ai.functions";
import { rescanFromQuad, scanFile, type Quad } from "@/lib/scan";
import { newId, type CoursePage } from "@/lib/pages";
import { printDocument } from "@/lib/pdf";
import { downloadScannedPdf } from "@/lib/scanned-pdf";
import { PageCard } from "@/components/PageCard";
import { CropEditor } from "@/components/CropEditor";
import { CourseContent } from "@/components/CourseContent";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Cahier numérique — scanner et retranscrire ses cours de maths" },
      {
        name: "description",
        content:
          "Scannez vos pages de cours de maths depuis votre téléphone : recadrage automatique, filtre document, export PDF A4 scanné ou retranscription IA en Markdown et LaTeX.",
      },
      { property: "og:title", content: "Cahier numérique — scanner et retranscrire ses cours de maths" },
      {
        property: "og:description",
        content:
          "Scanner de documents côté client (recadrage, redressement, filtre papier) et retranscription IA en LaTeX, avec export PDF A4.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

type Mode = "scan" | "ai";

function Index() {
  const [title, setTitle] = useState("");
  const [meta, setMeta] = useState("");
  const [mode, setMode] = useState<Mode>("scan");
  const [pages, setPages] = useState<CoursePage[]>([]);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [cropId, setCropId] = useState<string | null>(null);
  const [aiScan, setAiScan] = useState(true);
  const [style, setStyle] = useState<"fidele" | "propre">("fidele");
  const [dragging, setDragging] = useState(false);

  const cameraRef = useRef<HTMLInputElement | null>(null);
  const galleryRef = useRef<HTMLInputElement | null>(null);
  const printRef = useRef<HTMLDivElement | null>(null);
  const runTranscription = useServerFn(transcribePage);
  const runEnhance = useServerFn(enhanceScan);

  const update = useCallback((id: string, patch: Partial<CoursePage>) => {
    setPages((current) => current.map((page) => (page.id === id ? { ...page, ...patch } : page)));
  }, []);

  const enhanceOne = useCallback(
    async (id: string, dataUrl: string) => {
      update(id, { enhancing: true });
      try {
        const result = await runEnhance({ data: { imageDataUrl: dataUrl } });
        update(id, { imageDataUrl: result.imageDataUrl, aiEnhanced: true, enhancing: false });
        toast.success("Rendu scanner appliqué.");
        return true;
      } catch (error) {
        update(id, { enhancing: false });
        toast.error(error instanceof Error ? error.message : "Le scan IA a échoué.");
        return false;
      }
    },
    [runEnhance, update],
  );

  const enhanceById = useCallback(
    (id: string) => {
      const page = pages.find((item) => item.id === id);
      if (page && !page.enhancing) {
        void enhanceOne(id, page.aiEnhanced || !page.quad ? page.sourceDataUrl : page.imageDataUrl);
      }
    },
    [enhanceOne, pages],
  );

  const addFiles = useCallback(async (files: FileList | null) => {
    if (!files?.length) return;
    setScanning(true);
    const converted: CoursePage[] = [];
    let failedCrop = 0;
    for (const file of Array.from(files)) {
      try {
        const scan = await scanFile(file);
        if (!scan.quad) failedCrop += 1;
        converted.push({
          id: newId(),
          sourceDataUrl: scan.sourceDataUrl,
          sourceWidth: scan.sourceWidth,
          sourceHeight: scan.sourceHeight,
          imageDataUrl: scan.scanDataUrl,
          quad: scan.quad,
          markdown: "",
          status: "pending",
        });
      } catch {
        toast.error(`Impossible de scanner « ${file.name} ».`);
      }
    }
    setScanning(false);
    if (converted.length) {
      setPages((current) => [...current, ...converted]);
      toast.success(`${converted.length} page(s) scannée(s).`);
      if (aiScan) {
        toast.info("Rendu « scanner d'imprimante » par l'IA en cours…");
        void (async () => {
          for (const page of converted) {
            await enhanceOne(page.id, page.quad ? page.imageDataUrl : page.sourceDataUrl);
          }
        })();
      }
      if (failedCrop) {
        toast.info(
          `${failedCrop} page(s) sans recadrage automatique : utilisez « Ajuster le recadrage » si besoin.`,
        );
      }
    }
  }, [aiScan, enhanceOne]);

  const move = useCallback((id: string, direction: -1 | 1) => {
    setPages((current) => {
      const index = current.findIndex((page) => page.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      const a = next[index];
      const b = next[target];
      if (!a || !b) return current;
      next[index] = b;
      next[target] = a;
      return next;
    });
  }, []);

  const remove = useCallback((id: string) => {
    setPages((current) => current.filter((page) => page.id !== id));
  }, []);

  const applyCrop = useCallback(
    async (id: string, quad: Quad) => {
      const page = pages.find((item) => item.id === id);
      setCropId(null);
      if (!page) return;
      try {
        const scanDataUrl = await rescanFromQuad(page.sourceDataUrl, quad);
        update(id, { imageDataUrl: scanDataUrl, quad, aiEnhanced: false });
        toast.success("Page rescannée avec le nouveau recadrage.");
        if (aiScan || page.aiEnhanced) await enhanceOne(id, scanDataUrl);
      } catch {
        toast.error("Le rescan a échoué.");
      }
    },
    [aiScan, enhanceOne, pages, update],
  );

  const transcribeOne = useCallback(
    async (page: CoursePage) => {
      update(page.id, { status: "running", error: undefined });
      try {
        const result = await runTranscription({ data: { imageDataUrl: page.imageDataUrl, style } });
        update(page.id, { status: "done", markdown: result.markdown });
      } catch (error) {
        update(page.id, {
          status: "error",
          error: error instanceof Error ? error.message : "Erreur inconnue pendant la retranscription.",
        });
      }
    },
    [runTranscription, style, update],
  );

  const transcribeAll = useCallback(async () => {
    const targets = pages.filter((page) => page.status !== "done");
    if (!targets.length) {
      toast.info("Toutes les pages sont déjà retranscrites.");
      return;
    }
    setBusy(true);
    for (const page of targets) {
      await transcribeOne(page);
    }
    setBusy(false);
  }, [pages, transcribeOne]);

  const retry = useCallback(
    (id: string) => {
      const page = pages.find((item) => item.id === id);
      if (page) void transcribeOne(page);
    },
    [pages, transcribeOne],
  );

  const enhancingCount = pages.filter((page) => page.enhancing).length;

  const exportPdf = useCallback(async () => {
    const element = printRef.current;
    if (!element) return;
    setExporting(true);
    try {
      await printDocument(element, title, meta);
    } catch {
      toast.error("L'export PDF a échoué. Réessayez depuis un navigateur récent.");
    } finally {
      setExporting(false);
    }
  }, [title, meta]);

  const exportScannedPdf = useCallback(async () => {
    setExporting(true);
    try {
      await downloadScannedPdf(
        pages.map((page) => page.imageDataUrl),
        title,
        meta,
      );
      toast.success("PDF scanné téléchargé.");
    } catch {
      toast.error("L'export du PDF scanné a échoué.");
    } finally {
      setExporting(false);
    }
  }, [pages, title, meta]);

  const cropPage = pages.find((page) => page.id === cropId) ?? null;
  const doneCount = pages.filter((page) => page.status === "done").length;


  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6">
      <header className="mb-6">
        <p className="font-mono text-[11px] tracking-tight text-brick">mathématiques · scanner &amp; retranscription</p>
        <h1 className="mt-1 text-3xl leading-tight text-ink">Cahier numérique</h1>
        <p className="mt-2 max-w-prose text-sm text-ink-soft">
          Photographiez le tableau ou votre cahier : chaque page est redressée et nettoyée comme par un scanner, puis
          exportée en PDF A4 — ou retranscrite par l'IA en texte, formules LaTeX et graphiques.
        </p>

      </header>

      <section className="sheet mb-5 p-4">
        <fieldset className="mb-4">
          <legend className="font-mono text-[11px] text-ink-soft">Mode de travail</legend>
          <div className="mt-2 flex gap-2 rounded border border-border bg-secondary/40 p-1">
            <ModeButton active={mode === "scan"} onClick={() => setMode("scan")} icon={<ScanLine className="size-4" />}>
              PDF scanné
            </ModeButton>
            <ModeButton active={mode === "ai"} onClick={() => setMode("ai")} icon={<ScanText className="size-4" />}>
              PDF retranscrit (IA)
            </ModeButton>
          </div>
          <p className="mt-2 text-xs text-ink-soft">
            {mode === "scan"
              ? "Les pages nettoyées sont assemblées telles quelles dans un PDF A4, sans appel à l'IA."
              : "Chaque page scannée est retranscrite en Markdown + LaTeX, modifiable avant export."}
          </p>
          <label className="mt-3 flex items-start gap-2 rounded border border-dashed border-border bg-card p-3">
            <input
              type="checkbox"
              checked={aiScan}
              onChange={(event) => setAiScan(event.target.checked)}
              className="mt-0.5 size-4 accent-[hsl(var(--brick))]"
            />
            <span className="text-xs text-ink-soft">
              <span className="block text-sm font-medium text-ink">Rendu « scanner d'imprimante » par l'IA</span>
              L'IA redresse la feuille, efface l'arrière-plan et les ombres et rend un fond blanc net — sans toucher au
              contenu écrit. Appliqué automatiquement à chaque nouvelle photo.
            </span>
          </label>
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="font-mono text-[11px] text-ink-soft">Titre du cours</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Ex. Dérivées et tangentes"
              className="mt-1 w-full rounded border border-input bg-secondary/40 px-3 py-2 text-sm text-ink outline-none focus:border-brick"
            />
          </label>
          <label className="block">
            <span className="font-mono text-[11px] text-ink-soft">Classe / date (optionnel)</span>
            <input
              value={meta}
              onChange={(event) => setMeta(event.target.value)}
              placeholder="Ex. 1re B — 12 mars"
              className="mt-1 w-full rounded border border-input bg-secondary/40 px-3 py-2 text-sm text-ink outline-none focus:border-brick"
            />
          </label>
        </div>


        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded border border-brick bg-brick px-4 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Camera className="size-4" /> Prendre une photo
          </button>
          <button
            type="button"
            onClick={() => galleryRef.current?.click()}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded border border-border bg-card px-4 py-3 text-sm font-medium text-ink transition-colors hover:bg-secondary"
          >
            <Images className="size-4" /> Importer depuis la galerie
          </button>
        </div>

        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(event) => {
            void addFiles(event.target.files);
            event.target.value = "";
          }}
        />
        <input
          ref={galleryRef}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={(event) => {
            void addFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </section>

      {pages.length > 0 ? (
        <>
          <div className="mb-4 flex flex-col gap-2 sm:flex-row">
            {mode === "scan" ? (
              <button
                type="button"
                onClick={() => void exportScannedPdf()}
                disabled={exporting || scanning || enhancingCount > 0}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded border border-brick bg-brick px-4 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <FileDown className="size-4" />
                {exporting ? "Assemblage du PDF…" : "Télécharger le PDF scanné"}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => void transcribeAll()}
                  disabled={busy || scanning || enhancingCount > 0}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded border border-brick bg-brick px-4 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  <ScanText className="size-4" />
                  {busy ? "Retranscription en cours…" : "Retranscrire avec l'IA"}
                </button>
                <button
                  type="button"
                  onClick={() => void exportPdf()}
                  disabled={exporting || doneCount === 0}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded border border-border bg-card px-4 py-3 text-sm font-medium text-ink transition-colors hover:bg-secondary disabled:opacity-50"
                >
                  <FileDown className="size-4" />
                  {exporting ? "Préparation du PDF…" : "Télécharger le PDF retranscrit"}
                </button>
              </>
            )}
          </div>

          <p className="mb-3 font-mono text-[11px] text-ink-soft">
            {pages.length} page(s) scannée(s)
            {mode === "ai" ? ` · ${doneCount} retranscrite(s)` : ""}
            {scanning ? " · scan en cours…" : ""}
            {enhancingCount > 0 ? ` · ${enhancingCount} rendu(s) scanner IA en cours…` : ""}
          </p>

          <div className="space-y-4">
            {pages.map((page, index) => (
              <PageCard
                key={page.id}
                page={page}
                index={index}
                total={pages.length}
                showTranscription={mode === "ai"}
                onMove={move}
                onRemove={remove}
                onRetry={retry}
                onAdjust={setCropId}
                onEnhance={enhanceById}
                onChange={(id, markdown) => update(id, { markdown })}
              />
            ))}
          </div>
        </>

      ) : (
        <p className="sheet p-6 text-center text-sm text-ink-soft">
          Aucune page pour l'instant. Prenez une photo du tableau pour commencer.
        </p>
      )}

      {/* Document hors écran utilisé pour l'export PDF */}
      <div className="pointer-events-none fixed -left-[10000px] top-0" aria-hidden="true">
        <div ref={printRef} id="doc" style={{ width: "186mm", background: "#ffffff", color: "#2d3f63", padding: "0 2mm" }}>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: "22px", margin: "0 0 4px" }}>
            {title || "Cahier numérique"}
          </h1>
          {meta ? (
            <p style={{ fontFamily: "var(--font-mono)", fontSize: "11px", margin: "0 0 10px" }}>{meta}</p>
          ) : null}
          <hr style={{ border: "none", borderTop: "2px solid #8a3a24", margin: "0 0 12px" }} />
          {pages.map((page, index) => (
            <section key={page.id} style={{ pageBreakAfter: "always", marginBottom: "18px" }}>
              <p style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "#5a6a86", margin: "0 0 6px" }}>
                Page {index + 1}
              </p>
              <CourseContent markdown={page.markdown} />
            </section>
          ))}
        </div>
      </div>

      {cropPage ? (
        <CropEditor
          sourceDataUrl={cropPage.sourceDataUrl}
          sourceWidth={cropPage.sourceWidth}
          sourceHeight={cropPage.sourceHeight}
          quad={cropPage.quad}
          onCancel={() => setCropId(null)}
          onValidate={(quad) => void applyCrop(cropPage.id, quad)}
        />
      ) : null}
    </main>
  );
}

function ModeButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex flex-1 items-center justify-center gap-2 rounded px-3 py-2 text-sm font-medium transition-colors ${
        active ? "border border-brick bg-brick text-primary-foreground" : "border border-transparent text-ink-soft hover:bg-card"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

