import { useMemo } from "react";
import { blocksToHtml } from "@/lib/render-doc";
import type { Block, DocMode } from "@/lib/doc-model";
import { GraphPlot } from "./GraphPlot";

type Run = { kind: "html"; html: string; ids: string[] } | { kind: "graph"; block: Block };

/** Rendu de la retranscription : identique au PDF, mais graphes en direct + blocs cliquables. */
export function DocRenderer({
  blocks,
  mode,
  selectedId,
  onSelect,
}: {
  blocks: Block[];
  mode: DocMode;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}) {
  const runs = useMemo<Run[]>(() => splitRuns(blocks, mode), [blocks, mode]);

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!onSelect) return;
    const target = (event.target as HTMLElement).closest("[data-bid]");
    const id = target?.getAttribute("data-bid");
    if (id) onSelect(id);
  };

  return (
    <div
      className={`doc-render prose-cahier text-[0.95rem] ${selectedId ? "has-selection" : ""}`}
      onClick={handleClick}
      data-selected={selectedId ?? ""}
    >
      {runs.map((run, index) =>
        run.kind === "graph" ? (
          <figure
            key={run.block.id}
            data-bid={run.block.id}
            data-graph-spec={run.block.type === "graphe" ? JSON.stringify(run.block.graphe) : undefined}
            className={`blk graph-figure ${blockFlagged(run.block) ? "uncertain" : ""} ${
              selectedId === run.block.id ? "selected" : ""
            }`}
          >
            <GraphPlot spec={run.block.type === "graphe" ? run.block.graphe : { courbes: [] }} />
          </figure>
        ) : (
          <div
            key={index}
            className="run"
            dangerouslySetInnerHTML={{ __html: markSelection(run.html, selectedId) }}
          />
        ),
      )}
      {!blocks.length ? <p className="text-sm text-ink-soft">Aucun contenu retranscrit.</p> : null}
    </div>
  );
}

function splitRuns(blocks: Block[], mode: DocMode): Run[] {
  const runs: Run[] = [];
  let buffer: Block[] = [];
  const flush = () => {
    if (!buffer.length) return;
    runs.push({
      kind: "html",
      html: blocksToHtml(buffer, { mode, highlightUncertain: true }),
      ids: buffer.map((b) => b.id),
    });
    buffer = [];
  };
  for (const block of blocks) {
    if (block.type === "graphe") {
      flush();
      runs.push({ kind: "graph", block });
    } else {
      buffer.push(block);
    }
  }
  flush();
  return runs;
}

function blockFlagged(block: Block): boolean {
  return block.incertain || block.confiance < 0.85;
}

/** Ajoute la classe `selected` sur le bloc édité (sans re-render du HTML complet). */
function markSelection(html: string, selectedId?: string | null): string {
  if (!selectedId) return html;
  return html.replace(
    new RegExp(`(<div data-bid="${escapeRegExp(selectedId)}"[^>]*class=")([^"]*)(")`),
    (_m, a: string, cls: string, c: string) => `${a}${cls} selected${c}`,
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
