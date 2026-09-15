import { marked } from "marked";
import katex from "katex";

export type GraphSpec = {
  titre?: string;
  xlabel?: string;
  ylabel?: string;
  xmin?: number;
  xmax?: number;
  ymin?: number;
  ymax?: number;
  courbes?: GraphCurve[];
  points?: Array<{ x: number; y: number; label?: string }>;
  /** Position de la légende en pourcentage de la zone du graphique. */
  legende?: { x: number; y: number };
};

export type GraphPoint = { x: number; y: number };
export type GraphCurve = {
  expr?: string;
  label?: string;
  couleur?: string;
  type?: "fonction" | "droite" | "segments" | "courbe" | "parabole" | "nuage";
  points?: GraphPoint[];
};

/** Transforme une légende héritée/JSON en texte lisible. */
export function graphLabel(value: unknown): string {
  if (typeof value === "string") {
    const text = value.trim();
    if ((text.startsWith("{") || text.startsWith("[")) && text.length < 1000) {
      try { return graphLabel(JSON.parse(text)); } catch { return text; }
    }
    return text;
  }
  if (value && typeof value === "object") {
    const item = value as Record<string, unknown>;
    for (const key of ["texte", "text", "label", "nom", "equation", "formule", "valeur"]) {
      const result = graphLabel(item[key]);
      if (result) return result;
    }
  }
  return "";
}

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

/** Rendu d'un fragment en ligne (pas de <p>) : gras/italique + LaTeX `$...$`. */
export function renderInline(source: string): string {
  source = wrapBareLatex(source);
  const placeholders: string[] = [];
  const withMath = source
    .replace(/\$\$([\s\S]+?)\$\$/g, (_m, tex: string) => store(placeholders, tex, false))
    .replace(/(?<!\\)\$([^$\n]+?)\$/g, (_m, tex: string) => store(placeholders, tex, false))
    .replace(/\\\(([\s\S]+?)\\\)/g, (_m, tex: string) => store(placeholders, tex, false));

  let html = marked.parseInline(withMath, { async: false, gfm: true }) as string;
  placeholders.forEach((value, index) => {
    html = html.replaceAll(token(index), value);
  });
  return html;
}

/**
 * Répare une sortie OCR qui contient une formule LaTeX seule sans délimiteurs `$`.
 * Cela évite d'afficher littéralement `\mapsto` ou `\dfrac` dans une question.
 */
function wrapBareLatex(source: string): string {
  if (
    source.includes("$") ||
    !/\\(?:d?frac|mapsto|times|sqrt|leq|geq|neq|infty|sum|int)\b/.test(source)
  ) {
    return source;
  }
  const residue = source
    .replace(/\\[A-Za-z]+/g, "")
    .replace(/[A-Za-z](?![A-Za-z])/g, "")
    .replace(/[\d\s{}()[\],.;:+\-*/=<>^_|€%]/g, "");
  return residue.trim() ? source : `$${source}$`;
}

/** Rendu d'une expression LaTeX seule (KaTeX). */
export function renderMath(tex: string, display: boolean): string {
  try {
    return katex.renderToString(tex.trim(), {
      displayMode: display,
      throwOnError: false,
      output: "html",
      strict: false,
    });
  } catch {
    return `<code>${escapeHtml(tex)}</code>`;
  }
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
