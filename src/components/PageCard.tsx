import { ArrowDown, ArrowUp, Crop, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { CourseContent } from "./CourseContent";
import type { CoursePage } from "@/lib/pages";
import { statusLabel } from "@/lib/pages";

type Props = {
  page: CoursePage;
  index: number;
  total: number;
  showTranscription: boolean;
  onMove: (id: string, direction: -1 | 1) => void;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
  onAdjust: (id: string) => void;
  onEnhance: (id: string) => void;
  onChange: (id: string, markdown: string) => void;
};

const statusStyles: Record<CoursePage["status"], string> = {
  pending: "text-ink-soft",
  running: "text-brick",
  done: "text-sage",
  error: "text-destructive",
};

export function PageCard({
  page,
  index,
  total,
  showTranscription,
  onMove,
  onRemove,
  onRetry,
  onAdjust,
  onEnhance,
  onChange,
}: Props) {
  return (
    <article className="sheet p-3">
      <header className="flex items-start gap-3">
        <img
          src={page.imageDataUrl}
          alt={`Page scannée ${index + 1}`}
          className="h-20 w-16 flex-none rounded border border-border bg-white object-cover"
        />
        <div className="min-w-0 flex-1">
          <p className="font-mono text-xs tracking-tight text-ink-soft">Page {index + 1}</p>
          {page.enhancing ? (
            <p className="font-mono text-[11px] text-brick">scan IA en cours…</p>
          ) : page.aiEnhanced ? (
            <p className="font-mono text-[11px] text-sage">scan IA (rendu imprimante)</p>
          ) : page.quad ? (
            <p className="font-mono text-[11px] text-sage">scan redressé</p>
          ) : (
            <p className="font-mono text-[11px] text-ink-soft">recadrage auto indisponible</p>
          )}
          {showTranscription ? (
            <p className={`font-mono text-xs ${statusStyles[page.status]}`}>{statusLabel(page.status)}</p>
          ) : null}
          {page.error ? <p className="mt-1 text-xs text-destructive">{page.error}</p> : null}
        </div>
        <div className="flex flex-none flex-wrap items-center justify-end gap-1">
          <IconButton label="Monter" disabled={index === 0} onClick={() => onMove(page.id, -1)}>
            <ArrowUp className="size-4" />
          </IconButton>
          <IconButton label="Descendre" disabled={index === total - 1} onClick={() => onMove(page.id, 1)}>
            <ArrowDown className="size-4" />
          </IconButton>
          <IconButton label="Ajuster le recadrage" onClick={() => onAdjust(page.id)}>
            <Crop className="size-4" />
          </IconButton>
          <IconButton
            label="Rendu scanner par l'IA"
            disabled={page.enhancing}
            onClick={() => onEnhance(page.id)}
          >
            <Sparkles className={`size-4 ${page.aiEnhanced ? "text-sage" : ""}`} />
          </IconButton>
          {showTranscription ? (
            <IconButton
              label="Relancer la retranscription"
              disabled={page.status === "running"}
              onClick={() => onRetry(page.id)}
            >
              <RefreshCw className="size-4" />
            </IconButton>
          ) : null}
          <IconButton label="Supprimer" onClick={() => onRemove(page.id)}>
            <Trash2 className="size-4 text-destructive" />
          </IconButton>
        </div>
      </header>

      {showTranscription && (page.status !== "pending" || page.markdown) ? (
        <div className="mt-3 space-y-3">
          <label className="block">
            <span className="font-mono text-[11px] text-ink-soft">Markdown modifiable</span>
            <textarea
              value={page.markdown}
              onChange={(event) => onChange(page.id, event.target.value)}
              rows={6}
              spellCheck={false}
              placeholder="La retranscription apparaîtra ici…"
              className="mt-1 w-full resize-y rounded border border-input bg-secondary/40 p-2 font-mono text-xs leading-relaxed text-ink outline-none focus:border-brick"
            />
          </label>
          <div className="rounded border border-dashed border-border bg-card p-3">
            <p className="mb-2 font-mono text-[11px] text-ink-soft">Aperçu</p>
            <CourseContent markdown={page.markdown} />
          </div>
        </div>
      ) : null}
    </article>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="rounded border border-border p-1.5 text-ink transition-colors hover:bg-secondary disabled:opacity-35"
    >
      {children}
    </button>
  );
}
