import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Camera, FileDown, Images, RefreshCw, ScanLine, ScanText } from "lucide-react";
import { toast } from "sonner";
import "katex/dist/katex.min.css";

import { transcribePage } from "@/lib/transcription.functions";
import { rescanFromQuad, scanFile, type Quad } from "@/lib/scan";
import { newId, type ScanPage } from "@/lib/pages";
import { assembleDoc, type TranscribedPage } from "@/lib/structure";
import { runChecklist } from "@/lib/validation";
import { exportDocToPdf, printDocument } from "@/lib/pdf";
import { downloadScannedPdf } from "@/lib/scanned-pdf";
import { blocksToHtml } from "@/lib/render-doc";
import type { DigitalDoc, DocMode } from "@/lib/doc-model";
import { PageCard } from "@/components/PageCard";
import { CropEditor } from "@/components/CropEditor";
import { ProgressSteps } from "@/components/ProgressSteps";
import { VerificationView } from "@/components/VerificationView";
import { DocumentEditor } from "@/components/DocumentEditor";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Digital Math — une photo, un document mathématique numérique" },
      {
        name: "description",
        content:
          "Digital Math transforme une photo de notes de maths manuscrites en document numérique fidèle : OCR mathématique, vérification par élément, mise en page A4 et export PDF.",
      },
      { property: "og:title", content: "Digital Math" },
      {
        property: "og:description",
        content: "Une photo. Une retranscription propre. Un PDF prêt à imprimer.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

type Mode = "scan" | "ai";

function Index() {
  const [mode, setMode] = useState<Mode>("ai");
  const [docMode, setDocMode] = useState<DocMode>("fidele");
  const [author, setAuthor] = useState("");
  const [meta, setMeta] = useState("");
  const [pages, setPages] = useState<ScanPage[]>([]);
  const [dragging, setDragging] = useState(false);

  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [cropId, setCropId] = useState<string | null>(null);

  const [doc, setDoc] = useState<DigitalDoc | null>(null);
  const [step, setStep] = useState(0);
  const [stepDetail, setStepDetail] = useState<string>("");
  const [ack, setAck] = useState(false);
  /** Retranscription modifiée à la main, mode libre façon Word (spec digital-math). */
  const [freeHtml, setFreeHtml] = useState<string | null>(null);
  const [freeEditSource, setFreeEditSource] = useState<HTMLElement | null>(null);

  const cameraRef = useRef<HTMLInputElement | null>(null);
  const galleryRef = useRef<HTMLInputElement | null>(null);
  const runTranscription = useServerFn(transcribePage);

  const validation = useMemo(() => (doc ? runChecklist(doc) : null), [doc]);

  const invalidateDoc = useCallback(() => {
    setDoc(null);
    setStep(0);
    setAck(false);
    setFreeHtml(null);
  }, []);

  const updateScan = useCallback((id: string, patch: Partial<ScanPage>) => {
    setPages((current) => current.map((page) => (page.id === id ? { ...page, ...patch } : page)));
  }, []);

  const addFiles = useCallback(
    async (files: FileList | null) => {
      if (!files?.length) return;
      invalidateDoc();
      setScanning(true);
      const converted: ScanPage[] = [];
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
          });
        } catch {
          toast.error(`Impossible de scanner « ${file.name} ».`);
        }
      }
      setScanning(false);
      if (!converted.length) return;
      setPages((current) => [...current, ...converted]);
      toast.success(`${converted.length} page(s) importée(s).`);
      if (failedCrop) {
        toast.info(
          `${failedCrop} page(s) sans recadrage auto : utilisez « Ajuster le recadrage » si besoin.`,
        );
      }
    },
    [invalidateDoc],
  );

  const move = useCallback(
    (id: string, direction: -1 | 1) => {
      invalidateDoc();
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
    },
    [invalidateDoc],
  );

  const remove = useCallback(
    (id: string) => {
      invalidateDoc();
      setPages((current) => current.filter((page) => page.id !== id));
    },
    [invalidateDoc],
  );

  const applyCrop = useCallback(
    async (id: string, quad: Quad) => {
      const page = pages.find((item) => item.id === id);
      setCropId(null);
      if (!page) return;
      invalidateDoc();
      try {
        const scanDataUrl = await rescanFromQuad(page.sourceDataUrl, quad);
        updateScan(id, { imageDataUrl: scanDataUrl, quad });
        toast.success("Page rescannée avec le nouveau recadrage.");
      } catch {
        toast.error("Le rescan a échoué.");
      }
    },
    [pages, updateScan, invalidateDoc],
  );

  const runDigitalMath = useCallback(async () => {
    if (!pages.length) return;
    setBusy(true);
    setAck(false);
    setFreeHtml(null);
    try {
      setStep(0);
      setStepDetail("");
      await tick();
      setStep(1);
      await tick();

      setStep(2);
      const transcribed: TranscribedPage[] = [];
      for (let i = 0; i < pages.length; i += 1) {
        const page = pages[i]!;
        setStepDetail(`page ${i + 1}/${pages.length}`);
        const result = await runTranscription({
          data: {
            imageDataUrl: page.sourceDataUrl,
            style: docMode,
          },
        });
        transcribed.push({ ai: result.page, sourceImage: page.imageDataUrl });
      }
      setStepDetail("");

      setStep(3);
      await tick();

      setStep(4);
      const assembled = assembleDoc(transcribed, docMode, meta, author);
      setDoc(assembled);
      await tick();

      setStep(6);
      const flagged = assembled.pages.reduce(
        (sum, p) => sum + p.blocks.filter((b) => b.incertain || b.confiance < 0.85).length,
        0,
      );
      toast.success(
        flagged
          ? `Retranscription terminée — ${flagged} élément(s) à vérifier.`
          : "Retranscription terminée.",
      );
    } catch (error) {
      toast.error(readableTranscriptionError(error));
      setStep(0);
    } finally {
      setBusy(false);
    }
  }, [pages, docMode, meta, author, runTranscription]);

  const exportPdf = useCallback(async () => {
    if (!doc) return;
    setExporting(true);
    try {
      if (freeHtml) {
        const container = document.createElement("div");
        container.innerHTML = freeHtml;
        await printDocument(container, doc.titre ?? "", doc.meta, doc.author);
      } else {
        await exportDocToPdf(doc);
      }
    } catch {
      toast.error("L'export PDF a échoué. Réessayez depuis un navigateur récent.");
    } finally {
      setExporting(false);
    }
  }, [doc, freeHtml]);

  /** Ouvre l'éditeur de texte libre (type Word) sur la retranscription assemblée. */
  const openFreeEditor = useCallback(() => {
    if (!doc) return;
    const container = document.createElement("div");
    container.innerHTML =
      freeHtml ??
      doc.pages
        .map((page) => blocksToHtml(page.blocks, { mode: doc.mode, highlightUncertain: false }))
        .join("\n");
    setFreeEditSource(container);
  }, [doc, freeHtml]);

  const exportScannedPdf = useCallback(async () => {
    setExporting(true);
    try {
      await downloadScannedPdf(
        pages.map((page) => page.imageDataUrl),
        doc?.titre ?? "",
        meta,
      );
      toast.success("PDF scanné téléchargé.");
    } catch {
      toast.error("L'export du PDF scanné a échoué.");
    } finally {
      setExporting(false);
    }
  }, [pages, doc, meta]);

  const cropPage = pages.find((page) => page.id === cropId) ?? null;
  const showVerification = mode === "ai" && doc && validation;

  return (
    <main className="mx-auto w-full px-4 pb-24">
      <div className="dm-top">
        <div className="dm-brand text-ink">
          <span className="dm-logo">∑</span>
          <span>
            Digital <b>Math</b>
          </span>
        </div>
        <span className="dm-pill">Photo → PDF mathématique</span>
      </div>

      <div className={`mx-auto w-full ${showVerification ? "max-w-[1400px]" : "max-w-3xl"}`}>
        <header className="mb-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-brick">
            Numérisation intelligente
          </p>
          <h1 className="dm-hero-title text-ink">
            Transforme tes notes <span>manuscrites</span> en PDF numérique.
          </h1>
          <p className="mt-2 max-w-prose text-sm text-ink-soft">
            Une photo. Une retranscription propre. Un PDF prêt à imprimer. Digital Math reconstruit
            la structure mathématique de ta feuille — sans rien inventer : ce qui est douteux est
            signalé, pas deviné.
          </p>
        </header>

        {!showVerification ? (
          <section className="sheet mb-5 p-4">
            <fieldset className="mb-4">
              <legend className="font-mono text-[11px] text-ink-soft">Type de document</legend>
              <div className="mt-2 flex gap-2 rounded border border-border bg-secondary/40 p-1">
                <ModeButton
                  active={mode === "ai"}
                  onClick={() => setMode("ai")}
                  icon={<ScanText className="size-4" />}
                >
                  Document numérique
                </ModeButton>
                <ModeButton
                  active={mode === "scan"}
                  onClick={() => setMode("scan")}
                  icon={<ScanLine className="size-4" />}
                >
                  PDF scanné
                </ModeButton>
              </div>
              <p className="mt-2 text-xs text-ink-soft">
                {mode === "ai"
                  ? "La feuille est retranscrite en document mathématique structuré, vérifiable élément par élément, puis exportée en PDF A4."
                  : "Les pages nettoyées sont assemblées telles quelles dans un PDF A4, sans retranscription."}
              </p>

              <div className="mt-3 rounded border border-dashed border-border bg-card p-3 text-xs text-ink-soft">
                La photo est redressée localement, puis OpenAI retranscrit automatiquement le texte,
                les formules, les tableaux et les graphiques visibles.
              </div>

              {mode === "ai" ? (
                <div className="mt-3 rounded border border-border bg-card p-3">
                  <p className="font-mono text-[11px] text-ink-soft">
                    Mode de retranscription (spec §22)
                  </p>
                  <div className="mt-2 flex gap-2 rounded border border-border bg-secondary/40 p-1">
                    <ModeButton active={docMode === "fidele"} onClick={() => setDocMode("fidele")}>
                      Fidèle
                    </ModeButton>
                    <ModeButton active={docMode === "propre"} onClick={() => setDocMode("propre")}>
                      Propre
                    </ModeButton>
                  </div>
                  <p className="mt-2 text-xs text-ink-soft">
                    {docMode === "fidele"
                      ? "Reproduit la structure d'origine aussi fidèlement que possible."
                      : "Même contenu exact (mêmes nombres, mêmes résultats) mais mise en page de document scolaire."}
                  </p>
                </div>
              ) : null}
            </fieldset>

            <label className="mb-3 block">
              <span className="font-mono text-[11px] text-ink-soft">Votre nom</span>
              <input
                value={author}
                onChange={(event) => setAuthor(event.target.value)}
                placeholder="Ex. Deniz Azmi"
                className="mt-1 w-full rounded border border-input bg-secondary/40 px-3 py-2 text-sm text-ink outline-none focus:border-brick"
              />
              <span className="mt-1 block text-[11px] text-ink-soft">
                Affiché en bas à gauche de chaque page.
              </span>
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

            <div
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                void addFiles(event.dataTransfer.files);
              }}
              onClick={() => galleryRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") galleryRef.current?.click();
              }}
              className={`mt-4 cursor-pointer rounded border-2 border-dashed p-6 text-center transition-colors ${
                dragging
                  ? "border-brick bg-brick/10"
                  : "border-border bg-card hover:bg-secondary/50"
              }`}
            >
              <p className="text-2xl">📷</p>
              <p className="mt-1 text-sm font-medium text-ink">Dépose ta photo</p>
              <p className="mt-1 text-xs text-ink-soft">ou sélectionne un fichier</p>
              <p className="mx-auto mt-3 max-w-md text-xs leading-relaxed text-ink-soft">
                Pour une retranscription optimale, prends la photo avec un bon éclairage, bien
                droite et sans ombre sur la feuille.
              </p>
              <p className="mt-2 font-mono text-[10px] text-ink-soft">JPG · PNG · HEIC · WEBP</p>
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
        ) : null}

        {busy ? (
          <section className="sheet mb-5 p-4">
            <p className="mb-3 font-mono text-[11px] uppercase tracking-tight text-ink-soft">
              Traitement
            </p>
            <ProgressSteps current={step} detail={stepDetail} />
          </section>
        ) : null}

        {showVerification && doc && validation ? (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void runDigitalMath()}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded border border-border bg-card px-3 py-2 text-sm text-ink transition-colors hover:bg-secondary disabled:opacity-50"
              >
                <RefreshCw className="size-4" /> Relancer la retranscription
              </button>
              <button
                type="button"
                onClick={() => {
                  setDoc(null);
                  setStep(0);
                  setFreeHtml(null);
                }}
                className="inline-flex items-center gap-2 rounded border border-border bg-card px-3 py-2 text-sm text-ink transition-colors hover:bg-secondary"
              >
                ← Revenir aux pages
              </button>
              <span className="font-mono text-[11px] text-ink-soft">
                {doc.pages.length} page(s) · mode {doc.mode}
              </span>
            </div>

            <VerificationView
              doc={doc}
              onDoc={setDoc}
              validation={validation}
              acknowledged={ack}
              onAcknowledge={setAck}
              onExport={() => void exportPdf()}
              exporting={exporting}
              onTitle={(value) =>
                setDoc((current) =>
                  current ? { ...current, titre: value.trim() || null } : current,
                )
              }
              onMeta={(value) => {
                setMeta(value);
                setDoc((current) => (current ? { ...current, meta: value } : current));
              }}
              onAuthor={(value) => {
                setAuthor(value);
                setDoc((current) => (current ? { ...current, author: value } : current));
              }}
              freeHtml={freeHtml}
              onOpenFreeEditor={openFreeEditor}
              onDiscardFreeEdit={() => setFreeHtml(null)}
            />
          </>
        ) : pages.length > 0 ? (
          <>
            <div className="mb-4 flex flex-col gap-2 sm:flex-row">
              {mode === "scan" ? (
                <button
                  type="button"
                  onClick={() => void exportScannedPdf()}
                  disabled={exporting || scanning}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded border border-brick bg-brick px-4 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  <FileDown className="size-4" />
                  {exporting ? "Assemblage du PDF…" : "Télécharger le PDF scanné"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void runDigitalMath()}
                  disabled={busy || scanning}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded border border-brick bg-brick px-4 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  <ScanText className="size-4" />
                  {busy ? "Retranscription en cours…" : "Retranscrire"}
                </button>
              )}
            </div>

            <p className="mb-3 font-mono text-[11px] text-ink-soft">
              {pages.length} page(s)
              {scanning ? " · scan en cours…" : ""}
            </p>

            <div className="space-y-3">
              {pages.map((page, index) => (
                <PageCard
                  key={page.id}
                  page={page}
                  index={index}
                  total={pages.length}
                  onMove={move}
                  onRemove={remove}
                  onAdjust={setCropId}
                />
              ))}
            </div>
          </>
        ) : (
          <p className="sheet p-6 text-center text-sm text-ink-soft">
            Aucune page pour l'instant. Prends une photo de ta feuille pour commencer.
          </p>
        )}
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

      {freeEditSource && doc ? (
        <DocumentEditor
          source={freeEditSource}
          title={doc.titre ?? "Digital Math"}
          meta={doc.meta}
          author={doc.author}
          onClose={(html) => {
            setFreeHtml(html);
            setFreeEditSource(null);
          }}
        />
      ) : null}
    </main>
  );
}

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 260));
}

function readableTranscriptionError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/<!doctype|<html|This page didn't load/i.test(message)) {
    return "Le serveur local n’a pas pu traiter cette photo. Actualisez la page puis réessayez.";
  }
  const plain = message
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return plain.slice(0, 240) || "La retranscription a échoué.";
}

function ModeButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex flex-1 items-center justify-center gap-2 rounded px-3 py-2 text-sm font-medium transition-colors ${
        active
          ? "border border-brick bg-brick text-primary-foreground"
          : "border border-transparent text-ink-soft hover:bg-card"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}
