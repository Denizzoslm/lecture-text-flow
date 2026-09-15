import { ArrowDown, ArrowUp, Crop, Trash2 } from "lucide-react";
import type { ScanPage } from "@/lib/pages";

type Props = {
  page: ScanPage;
  index: number;
  total: number;
  onMove: (id: string, direction: -1 | 1) => void;
  onRemove: (id: string) => void;
  onAdjust: (id: string) => void;
};

export function PageCard({ page, index, total, onMove, onRemove, onAdjust }: Props) {
  return (
    <article className="sheet flex items-start gap-3 p-3">
      <img
        src={page.imageDataUrl}
        alt={`Page scannée ${index + 1}`}
        className="h-24 w-20 flex-none rounded border border-border bg-white object-cover"
      />
      <div className="min-w-0 flex-1">
        <p className="font-mono text-xs tracking-tight text-ink-soft">Page {index + 1}</p>
        {page.quad ? (
          <p className="font-mono text-[11px] text-sage">scan redressé</p>
        ) : (
          <p className="font-mono text-[11px] text-ink-soft">recadrage auto indisponible</p>
        )}
      </div>
      <div className="flex flex-none flex-wrap items-center justify-end gap-1">
        <IconButton label="Monter" disabled={index === 0} onClick={() => onMove(page.id, -1)}>
          <ArrowUp className="size-4" />
        </IconButton>
        <IconButton
          label="Descendre"
          disabled={index === total - 1}
          onClick={() => onMove(page.id, 1)}
        >
          <ArrowDown className="size-4" />
        </IconButton>
        <IconButton label="Ajuster le recadrage" onClick={() => onAdjust(page.id)}>
          <Crop className="size-4" />
        </IconButton>
        <IconButton label="Supprimer" onClick={() => onRemove(page.id)}>
          <Trash2 className="size-4 text-destructive" />
        </IconButton>
      </div>
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
