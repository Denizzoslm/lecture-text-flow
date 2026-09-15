import { useState } from "react";
import { ArrowDown, ArrowUp, Check, Trash2 } from "lucide-react";
import type { Block, GraphSpec } from "@/lib/doc-model";
import { GraphEditorPanel } from "./GraphEditorPanel";

type Props = {
  block: Block;
  onChange: (patch: Partial<Block>) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
  onVerified: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
};

const TYPE_LABEL: Record<Block["type"], string> = {
  titre: "Titre / section",
  paragraphe: "Texte",
  question: "Question",
  formule: "Formule",
  calcul: "Calcul",
  tableau: "Tableau",
  graphe: "Graphique",
  annotation: "Annotation",
  encadre: "Encadré",
};

export function BlockEditor({
  block,
  onChange,
  onRemove,
  onMove,
  onVerified,
  canMoveUp,
  canMoveDown,
}: Props) {
  const flagged = block.incertain || block.confiance < 0.85;

  return (
    <div
      className={`rounded border bg-card p-3 ${
        flagged ? "border-brick/60 ring-1 ring-brick/30" : "border-border"
      }`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] uppercase tracking-tight text-ink-soft">
          {TYPE_LABEL[block.type]}
          {flagged ? <span className="ml-2 text-brick">⚠ à vérifier</span> : null}
        </span>
        <div className="flex items-center gap-1">
          {flagged ? (
            <button
              type="button"
              onClick={onVerified}
              title="Marquer comme vérifié"
              className="inline-flex items-center gap-1 rounded border border-sage/50 px-2 py-1 text-[11px] text-sage hover:bg-sage/10"
            >
              <Check className="size-3" /> Vérifié
            </button>
          ) : null}
          <IconBtn label="Monter" disabled={!canMoveUp} onClick={() => onMove(-1)}>
            <ArrowUp className="size-3.5" />
          </IconBtn>
          <IconBtn label="Descendre" disabled={!canMoveDown} onClick={() => onMove(1)}>
            <ArrowDown className="size-3.5" />
          </IconBtn>
          <IconBtn label="Supprimer" onClick={onRemove}>
            <Trash2 className="size-3.5 text-destructive" />
          </IconBtn>
        </div>
      </div>

      {flagged && block.raison ? (
        <p className="mb-2 rounded bg-brick/10 px-2 py-1 text-[11px] text-ink">{block.raison}</p>
      ) : null}
      {block.original && block.original !== currentText(block) ? (
        <p className="mb-2 font-mono text-[11px] text-ink-soft">lecture brute : {block.original}</p>
      ) : null}

      <Fields block={block} onChange={onChange} />
    </div>
  );
}

function Fields({ block, onChange }: { block: Block; onChange: (patch: Partial<Block>) => void }) {
  switch (block.type) {
    case "titre":
      return (
        <div className="space-y-2">
          <select
            value={block.niveau}
            onChange={(e) => onChange({ niveau: Number(e.target.value) as 1 | 2 | 3 })}
            className="rounded border border-input bg-secondary/40 px-2 py-1 text-xs"
          >
            <option value={1}>Niveau 1 — titre principal</option>
            <option value={2}>Niveau 2 — section</option>
            <option value={3}>Niveau 3 — sous-partie</option>
          </select>
          <TextInput value={block.texte} onChange={(texte) => onChange({ texte })} />
        </div>
      );
    case "paragraphe":
      return (
        <TextArea
          value={block.texte}
          onChange={(texte) => onChange({ texte })}
          hint="Maths en ligne entre $…$"
        />
      );
    case "encadre":
      return <TextArea value={block.texte} onChange={(texte) => onChange({ texte })} />;
    case "annotation":
      return (
        <div className="space-y-2">
          <select
            value={block.genre}
            onChange={(e) => onChange({ genre: e.target.value as typeof block.genre })}
            className="rounded border border-input bg-secondary/40 px-2 py-1 text-xs"
          >
            {["fleche", "coche", "croix", "note", "correction"].map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          <TextInput value={block.texte} onChange={(texte) => onChange({ texte })} />
        </div>
      );
    case "question":
      return (
        <div className="space-y-2">
          <div className="flex gap-2">
            <label className="flex-1">
              <span className="font-mono text-[10px] text-ink-soft">Repère</span>
              <input
                value={block.repere}
                onChange={(e) => onChange({ repere: e.target.value })}
                placeholder="a)  ·  4.  ·  Exercice 3"
                className="mt-0.5 w-full rounded border border-input bg-secondary/40 px-2 py-1 text-xs"
              />
            </label>
            <label className="w-24">
              <span className="font-mono text-[10px] text-ink-soft">Retrait</span>
              <input
                type="number"
                min={0}
                max={4}
                value={block.profondeur}
                onChange={(e) =>
                  onChange({ profondeur: Math.max(0, Math.min(4, Number(e.target.value))) })
                }
                className="mt-0.5 w-full rounded border border-input bg-secondary/40 px-2 py-1 text-xs"
              />
            </label>
          </div>
          <TextArea
            value={block.texte}
            onChange={(texte) => onChange({ texte })}
            hint="Énoncé — maths en ligne entre $…$"
          />
        </div>
      );
    case "formule":
      return (
        <div className="space-y-2">
          <TextArea
            value={block.latex}
            onChange={(latex) => onChange({ latex })}
            mono
            hint="LaTeX"
          />
          <label className="flex items-center gap-2 text-xs text-ink">
            <input
              type="checkbox"
              checked={block.display}
              onChange={(e) => onChange({ display: e.target.checked })}
              className="size-3.5 accent-[hsl(var(--brick))]"
            />
            Formule isolée (centrée)
          </label>
        </div>
      );
    case "calcul":
      return (
        <TextArea
          value={block.latex}
          onChange={(latex) => onChange({ latex })}
          mono
          hint="LaTeX — une étape de calcul"
        />
      );
    case "tableau":
      return <TableFields block={block} onChange={onChange} />;
    case "graphe":
      return <GraphFields spec={block.graphe} onChange={(graphe) => onChange({ graphe })} />;
  }
}

function TableFields({
  block,
  onChange,
}: {
  block: Extract<Block, { type: "tableau" }>;
  onChange: (patch: Partial<Block>) => void;
}) {
  const setCol = (index: number, value: string) => {
    const colonnes = block.colonnes.map((c, i) => (i === index ? value : c));
    onChange({ colonnes });
  };
  const setCell = (r: number, c: number, value: string) => {
    const lignes = block.lignes.map((row, i) =>
      i === r ? row.map((cell, j) => (j === c ? value : cell)) : row,
    );
    onChange({ lignes });
  };
  const width = block.colonnes.length || (block.lignes[0]?.length ?? 1);
  const addRow = () =>
    onChange({ lignes: [...block.lignes, Array.from({ length: width }, () => "")] });
  const addCol = () =>
    onChange({
      colonnes: [...block.colonnes, ""],
      lignes: block.lignes.map((row) => [...row, ""]),
    });
  const delRow = (r: number) => onChange({ lignes: block.lignes.filter((_, i) => i !== r) });
  const delCol = (c: number) =>
    onChange({
      colonnes: block.colonnes.filter((_, i) => i !== c),
      lignes: block.lignes.map((row) => row.filter((_, i) => i !== c)),
    });

  return (
    <div className="space-y-2 overflow-x-auto">
      <table className="text-xs">
        <thead>
          <tr>
            {block.colonnes.map((col, i) => (
              <th key={i} className="p-0.5">
                <div className="flex items-center gap-1">
                  <input
                    value={col}
                    onChange={(e) => setCol(i, e.target.value)}
                    className="w-24 rounded border border-input bg-secondary/40 px-1 py-0.5 text-center font-semibold"
                  />
                  <button
                    type="button"
                    onClick={() => delCol(i)}
                    title={`Supprimer la colonne ${i + 1}`}
                    aria-label={`Supprimer la colonne ${i + 1}`}
                    className="rounded px-1 text-destructive hover:bg-destructive/10"
                  >
                    ×
                  </button>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.lignes.map((row, r) => (
            <tr key={r}>
              {row.map((cell, c) => (
                <td key={c} className="p-0.5">
                  <input
                    value={cell}
                    onChange={(e) => setCell(r, c, e.target.value)}
                    className="w-24 rounded border border-input bg-secondary/40 px-1 py-0.5 text-center"
                  />
                </td>
              ))}
              <td>
                <button type="button" onClick={() => delRow(r)} className="px-1 text-destructive">
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex gap-2 text-[11px]">
        <button
          type="button"
          onClick={addRow}
          className="rounded border border-border px-2 py-1 hover:bg-secondary"
        >
          + ligne
        </button>
        <button
          type="button"
          onClick={addCol}
          className="rounded border border-border px-2 py-1 hover:bg-secondary"
        >
          + colonne
        </button>
      </div>
    </div>
  );
}

function GraphFields({ spec, onChange }: { spec: GraphSpec; onChange: (spec: GraphSpec) => void }) {
  return <GraphEditorPanel spec={spec} onChange={onChange} />;
}

function currentText(block: Block): string {
  switch (block.type) {
    case "titre":
    case "paragraphe":
    case "encadre":
    case "annotation":
      return block.texte;
    case "question":
      return `${block.repere} ${block.texte}`.trim();
    case "formule":
    case "calcul":
      return block.latex;
    default:
      return "";
  }
}

function TextInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded border border-input bg-secondary/40 px-2 py-1 text-sm text-ink outline-none focus:border-brick"
    />
  );
}

function TextArea({
  value,
  onChange,
  hint,
  mono,
}: {
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  mono?: boolean;
}) {
  return (
    <label className="block">
      {hint ? <span className="font-mono text-[10px] text-ink-soft">{hint}</span> : null}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        spellCheck={false}
        className={`mt-0.5 w-full resize-y rounded border border-input bg-secondary/40 p-2 text-sm text-ink outline-none focus:border-brick ${
          mono ? "font-mono text-xs" : ""
        }`}
      />
    </label>
  );
}

function IconBtn({
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
      className="rounded border border-border p-1 text-ink transition-colors hover:bg-secondary disabled:opacity-35"
    >
      {children}
    </button>
  );
}
