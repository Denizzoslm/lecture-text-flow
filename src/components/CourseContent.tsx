import { useMemo } from "react";
import { parseCourseMarkdown } from "@/lib/markdown";
import { GraphPlot } from "./GraphPlot";

/** Aperçu rendu d'une page : markdown + LaTeX (KaTeX) + graphiques regénérés. */
export function CourseContent({ markdown }: { markdown: string }) {
  const segments = useMemo(() => parseCourseMarkdown(markdown), [markdown]);

  if (!markdown.trim()) {
    return <p className="text-sm text-muted-foreground">Aucun contenu pour l'instant.</p>;
  }

  return (
    <div className="prose-cahier text-[0.95rem]">
      {segments.map((segment, index) => {
        if (segment.kind === "html") {
          return <div key={index} dangerouslySetInnerHTML={{ __html: segment.html }} />;
        }
        if (segment.kind === "graph") {
          return <GraphPlot key={index} spec={segment.spec} />;
        }
        return (
          <pre
            key={index}
            className="my-3 overflow-x-auto rounded border border-destructive/40 bg-secondary p-2 font-mono text-[11px]"
          >
            Graphique illisible : {segment.raw}
          </pre>
        );
      })}
    </div>
  );
}
