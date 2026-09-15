import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileDown, Redo2, Undo2 } from "lucide-react";
import { mountPaginatedDoc } from "@/lib/pdf";
import {
  collectUncertain,
  markVerified,
  moveBlock,
  removeBlock,
  updateBlock,
  type Block,
  type DigitalDoc,
} from "@/lib/doc-model";
import type { ValidationResult } from "@/lib/validation";
import { DocRenderer } from "./DocRenderer";
import { BlockEditor } from "./BlockEditor";
import { ChecklistPanel } from "./ChecklistPanel";

type Zone = "photo" | "texte" | "pdf";

type Props = {
  doc: DigitalDoc;
  onDoc: (next: DigitalDoc) => void;
  validation: ValidationResult;
  acknowledged: boolean;
  onAcknowledge: (value: boolean) => void;
  onExport: () => void;
  exporting: boolean;
  onTitle: (value: string) => void;
  onMeta: (value: string) => void;
  onAuthor: (value: string) => void;
  /** Retranscription modifiée à la main dans l'éditeur libre type Word (ou null). */
  freeHtml: string | null;
  onOpenFreeEditor: () => void;
  onDiscardFreeEdit: () => void;
};

const A4_PX = 794; // 210 mm @ 96 dpi

export function VerificationView({
  doc,
  onDoc,
  validation,
  acknowledged,
  onAcknowledge,
  onExport,
  exporting,
  onTitle,
  onMeta,
  onAuthor,
  freeHtml,
  onOpenFreeEditor,
  onDiscardFreeEdit,
}: Props) {
  const [zone, setZone] = useState<Zone>("texte");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [past, setPast] = useState<DigitalDoc[]>([]);
  const [future, setFuture] = useState<DigitalDoc[]>([]);

  const allBlocks = useMemo(() => doc.pages.flatMap((p) => p.blocks), [doc.pages]);
  const selected = allBlocks.find((b) => b.id === selectedId) ?? null;
  const uncertain = useMemo(() => collectUncertain(doc), [doc]);

  const commit = useCallback(
    (next: DigitalDoc) => {
      setPast((items) => [...items.slice(-49), doc]);
      setFuture([]);
      onDoc(next);
    },
    [doc, onDoc],
  );

  const undo = useCallback(() => {
    const previous = past.at(-1);
    if (!previous) return;
    setPast((items) => items.slice(0, -1));
    setFuture((items) => [doc, ...items].slice(0, 50));
    onDoc(previous);
  }, [doc, onDoc, past]);

  const redo = useCallback(() => {
    const next = future[0];
    if (!next) return;
    setFuture((items) => items.slice(1));
    setPast((items) => [...items.slice(-49), doc]);
    onDoc(next);
  }, [doc, future, onDoc]);

  const patch = useCallback(
    (id: string, next: Partial<Block>) => commit(updateBlock(doc, id, next)),
    [commit, doc],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
      } else if (key === "y" || (key === "z" && event.shiftKey)) {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [redo, undo]);

  const selectBlock = useCallback((id: string) => {
    setSelectedId(id);
    requestAnimationFrame(() => {
      document
        .getElementById(`edit-${id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }, []);

  const exportDisabled =
    exporting || validation.blocked || (validation.toVerify > 0 && !acknowledged);

  return (
    <div>
      <div className="mb-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={undo}
          disabled={!past.length}
          title="Annuler la dernière modification (Ctrl+Z)"
          className="inline-flex items-center gap-1 rounded border border-border bg-card px-3 py-1.5 text-xs text-ink hover:bg-secondary disabled:opacity-35"
        >
          <Undo2 className="size-3.5" /> Annuler
        </button>
        <button
          type="button"
          onClick={redo}
          disabled={!future.length}
          title="Rétablir la modification (Ctrl+Y)"
          className="inline-flex items-center gap-1 rounded border border-border bg-card px-3 py-1.5 text-xs text-ink hover:bg-secondary disabled:opacity-35"
        >
          <Redo2 className="size-3.5" /> Rétablir
        </button>
      </div>
      {/* sélecteur de zone — mobile (spec §24) */}
      <div className="mb-3 flex gap-1 rounded border border-border bg-secondary/40 p-1 lg:hidden">
        {(["photo", "texte", "pdf"] as Zone[]).map((z) => (
          <button
            key={z}
            type="button"
            onClick={() => setZone(z)}
            className={`flex-1 rounded px-2 py-1.5 text-xs font-medium capitalize ${
              zone === z ? "bg-brick text-primary-foreground" : "text-ink-soft"
            }`}
          >
            {z === "photo" ? "Original" : z === "texte" ? "Retranscription" : "PDF"}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Column title="Original" hidden={zone !== "photo"}>
          <div className="space-y-3">
            {doc.pages.map((page, index) => (
              <figure key={page.id} className="m-0">
                <figcaption className="mb-1 font-mono text-[11px] text-ink-soft">
                  Page {index + 1}
                </figcaption>
                <img
                  src={page.sourceImage}
                  alt={`Photo d'origine, page ${index + 1}`}
                  className="w-full rounded border border-border bg-white"
                />
              </figure>
            ))}
          </div>
        </Column>

        <Column title="Retranscription" hidden={zone !== "texte"}>
          <div className="space-y-3">
            <div className="grid gap-2">
              <label className="block">
                <span className="font-mono text-[10px] text-ink-soft">Votre nom — pied de page</span>
                <input
                  value={doc.author}
                  onChange={(e) => onAuthor(e.target.value)}
                  placeholder="Ex. Deniz Azmi"
                  className="mt-0.5 w-full rounded border border-input bg-secondary/40 px-2 py-1 text-sm outline-none focus:border-brick"
                />
              </label>
              <label className="block">
                <span className="font-mono text-[10px] text-ink-soft">
                  Titre du document (laisser vide si absent)
                </span>
                <input
                  value={doc.titre ?? ""}
                  onChange={(e) => onTitle(e.target.value)}
                  placeholder="Titre lu sur la feuille"
                  className="mt-0.5 w-full rounded border border-input bg-secondary/40 px-2 py-1 text-sm outline-none focus:border-brick"
                />
              </label>
              <label className="block">
                <span className="font-mono text-[10px] text-ink-soft">
                  Classe / date (optionnel)
                </span>
                <input
                  value={doc.meta}
                  onChange={(e) => onMeta(e.target.value)}
                  placeholder="Ex. 1re B — 12 mars"
                  className="mt-0.5 w-full rounded border border-input bg-secondary/40 px-2 py-1 text-sm outline-none focus:border-brick"
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-dashed border-brick/40 bg-card p-3">
              <div>
                <p className="text-sm font-medium text-ink">✏️ Mode libre (façon Word)</p>
                <p className="text-xs text-ink-soft">
                  {freeHtml
                    ? "Modifications manuelles actives — le PDF utilisera cette version."
                    : "Mise en forme libre, glisser-déposer, formules : comme dans Word."}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                {freeHtml ? (
                  <button
                    type="button"
                    onClick={onDiscardFreeEdit}
                    className="rounded border border-border px-3 py-2 text-xs text-ink transition-colors hover:bg-secondary"
                  >
                    Revenir à la retranscription
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={onOpenFreeEditor}
                  className="rounded border border-brick bg-brick px-3 py-2 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
                >
                  {freeHtml ? "Modifier" : "Ouvrir l'éditeur"}
                </button>
              </div>
            </div>

            {uncertain.length ? (
              <div className="rounded border border-brick/40 bg-brick/10 p-2">
                <p className="mb-1 font-mono text-[11px] text-ink">
                  ⚠️ {uncertain.length} élément(s) à vérifier
                </p>
                <ul className="space-y-1">
                  {uncertain.map((ref) => (
                    <li key={ref.blockId}>
                      <button
                        type="button"
                        onClick={() => selectBlock(ref.blockId)}
                        className="text-left text-[11px] text-ink underline decoration-brick/40 underline-offset-2 hover:decoration-brick"
                      >
                        p.{ref.page + 1} · {ref.type} — {ref.apercu}{" "}
                        <span className="text-ink-soft">({ref.raison})</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {doc.pages.map((page, index) => (
              <div key={page.id}>
                <p className="mb-1 font-mono text-[11px] text-ink-soft">
                  Page {index + 1} · confiance {(page.confiance * 100).toFixed(0)} %
                </p>
                <div className="rounded border border-dashed border-border bg-card p-3">
                  <DocRenderer
                    blocks={page.blocks}
                    mode={doc.mode}
                    selectedId={selectedId}
                    onSelect={selectBlock}
                  />
                </div>
              </div>
            ))}

            <div
              id={selected ? `edit-${selected.id}` : undefined}
              className="sticky bottom-0 bg-background pt-2"
            >
              {selected ? (
                <BlockEditor
                  block={selected}
                  onChange={(next) => patch(selected.id, next)}
                  onRemove={() => {
                    commit(removeBlock(doc, selected.id));
                    setSelectedId(null);
                  }}
                  onMove={(dir) => commit(moveBlock(doc, selected.id, dir))}
                  onVerified={() => commit(markVerified(doc, selected.id))}
                  canMoveUp={pageLocalIndex(doc, selected) > 0}
                  canMoveDown={pageLocalIndex(doc, selected) < pageBlockCount(doc, selected) - 1}
                />
              ) : (
                <p className="rounded border border-border bg-card p-2 text-center text-[11px] text-ink-soft">
                  Cliquez un élément ci-dessus pour le modifier.
                </p>
              )}
            </div>
          </div>
        </Column>

        <Column title="PDF final" hidden={zone !== "pdf"}>
          <div className="space-y-3">
            {freeHtml ? (
              <div className="overflow-hidden rounded border border-border bg-[#f2f3f5] p-3">
                <p className="mb-2 font-mono text-[11px] text-ink-soft">
                  Aperçu — mode libre (pagination appliquée à l'export)
                </p>
                <div
                  className="digital-document prose-cahier"
                  dangerouslySetInnerHTML={{ __html: freeHtml }}
                />
              </div>
            ) : (
              <PdfPreview doc={doc} />
            )}
            <ChecklistPanel
              result={validation}
              acknowledged={acknowledged}
              onAcknowledge={onAcknowledge}
            />
            <button
              type="button"
              onClick={onExport}
              disabled={exportDisabled}
              className="inline-flex w-full items-center justify-center gap-2 rounded border border-brick bg-brick px-4 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <FileDown className="size-4" />
              {exporting ? "Préparation du PDF…" : "Exporter en PDF"}
            </button>
            {validation.blocked ? (
              <p className="text-center text-[11px] text-destructive">
                Corrigez les points bloquants du contrôle final.
              </p>
            ) : null}
          </div>
        </Column>
      </div>
    </div>
  );
}

function Column({
  title,
  hidden,
  children,
}: {
  title: string;
  hidden: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={`${hidden ? "hidden" : ""} lg:block`}>
      <h2 className="mb-2 font-mono text-[11px] uppercase tracking-tight text-brick">{title}</h2>
      <div className="rounded border border-border bg-card/60 p-3">
        {children}
      </div>
    </section>
  );
}

/** Aperçu PDF = rendu paginé réel dans un iframe (spec §23). */
function PdfPreview({ doc }: { doc: DigitalDoc }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [scale, setScale] = useState(0.6);
  const [pages, setPages] = useState(1);
  const [pending, setPending] = useState(true);

  useEffect(() => {
    const measure = () => {
      const width = containerRef.current?.clientWidth ?? A4_PX;
      setScale(Math.min(1, width / A4_PX));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setPending(true);
    const timer = setTimeout(async () => {
      const frame = frameRef.current;
      if (!frame) return;
      try {
        await mountPaginatedDoc(frame, doc);
        if (cancelled) return;
        setPages(frame.contentDocument?.querySelectorAll(".page").length || 1);
      } catch {
        /* ignore — l'export refera le rendu */
      } finally {
        if (!cancelled) setPending(false);
      }
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [doc]);

  return (
    <div ref={containerRef} className="overflow-hidden rounded border border-border bg-[#f2f3f5]">
      <div style={{ height: `calc(${pages} * 297mm * ${scale} + 8px)` }} className="relative">
        <iframe
          ref={frameRef}
          title="Aperçu du PDF"
          className="absolute left-0 top-0 border-0 bg-white"
          style={{
            width: "210mm",
            height: `calc(${pages} * 297mm)`,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        />
        {pending ? (
          <div className="absolute inset-0 flex items-center justify-center bg-white/60 text-[11px] text-ink-soft">
            mise en page…
          </div>
        ) : null}
      </div>
    </div>
  );
}

function pageLocalIndex(doc: DigitalDoc, block: Block): number {
  return doc.pages[block.page]?.blocks.findIndex((b) => b.id === block.id) ?? -1;
}

function pageBlockCount(doc: DigitalDoc, block: Block): number {
  return doc.pages[block.page]?.blocks.length ?? 0;
}
