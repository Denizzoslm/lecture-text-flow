import { marked } from "marked";
import katex from "katex";

export type GraphSpec = {
  titre?: string;
  xmin?: number;
  xmax?: number;
  ymin?: number;
  ymax?: number;
  courbes?: Array<{ expr: string; label?: string }>;
  points?: Array<{ x: number; y: number; label?: string }>;
};

export type Segment =
  | { kind: "html"; html: string }
  | { kind: "graph"; spec: GraphSpec }
  | { kind: "graph-error"; raw: string };

const GRAPH_BLOCK = /```graphique\s*([\s\S]*?)```/g;

/** Découpe le markdown en segments texte (rendus) et blocs graphiques. */
export function parseCourseMarkdown(source: string): Segment[] {
  const segments: Segment[] = [];
  let lastIndex = 0;
  GRAPH_BLOCK.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = GRAPH_BLOCK.exec(source)) !== null) {
    const before = source.slice(lastIndex, match.index);
    if (before.trim()) segments.push({ kind: "html", html: renderMarkdown(before) });
    try {
      segments.push({ kind: "graph", spec: JSON.parse((match[1] ?? "").trim()) as GraphSpec });
    } catch {
      segments.push({ kind: "graph-error", raw: (match[1] ?? "").trim() });
    }
    lastIndex = match.index + match[0].length;
  }

  const rest = source.slice(lastIndex);
  if (rest.trim()) segments.push({ kind: "html", html: renderMarkdown(rest) });
  return segments;
}

/** Markdown + LaTeX (KaTeX) -> HTML. */
export function renderMarkdown(source: string): string {
  const placeholders: string[] = [];
  const withMath = source
    .replace(/\$\$([\s\S]+?)\$\$/g, (_m, tex: string) => store(placeholders, tex, true))
    .replace(/(?<!\\)\$([^$\n]+?)\$/g, (_m, tex: string) => store(placeholders, tex, false))
    .replace(/\\\[([\s\S]+?)\\\]/g, (_m, tex: string) => store(placeholders, tex, true))
    .replace(/\\\(([\s\S]+?)\\\)/g, (_m, tex: string) => store(placeholders, tex, false));

  let html = marked.parse(withMath, { async: false, gfm: true, breaks: true }) as string;
  placeholders.forEach((value, index) => {
    html = html.replaceAll(token(index), value);
  });
  return html;
}

function token(index: number) {
  return `@@KTX${index}@@`;
}

function store(list: string[], tex: string, display: boolean) {
  let rendered: string;
  try {
    rendered = katex.renderToString(tex.trim(), {
      displayMode: display,
      throwOnError: false,
      output: "html",
      strict: false,
    });
  } catch {
    rendered = `<code>${escapeHtml(tex)}</code>`;
  }
  list.push(rendered);
  return token(list.length - 1);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
