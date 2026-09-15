/**
 * Contrôle final automatique (spec §20). Rien n'est exporté silencieusement :
 * si un point dur échoue, l'export est bloqué ; si des éléments sont incertains,
 * l'utilisateur doit confirmer les avoir vérifiés.
 */

import katex from "katex";
import { compile } from "mathjs";
import { collectUncertain, type Block, type DigitalDoc } from "./doc-model";

export type CheckState = "ok" | "warn" | "fail";

export type CheckItem = {
  id: string;
  label: string;
  state: CheckState;
  detail?: string | undefined;
};

export type ValidationResult = {
  items: CheckItem[];
  /** true si un point dur échoue → export impossible. */
  blocked: boolean;
  /** Nombre d'éléments à faire vérifier par l'utilisateur. */
  toVerify: number;
};

export function runChecklist(doc: DigitalDoc): ValidationResult {
  const items: CheckItem[] = [];
  const allBlocks = doc.pages.flatMap((p) => p.blocks);

  // 1. Chaque page a produit du contenu.
  const emptyPages = doc.pages.filter((p) => p.blocks.length === 0).length;
  items.push({
    id: "pages",
    label: "Toutes les pages ont été traitées",
    state: emptyPages ? "fail" : "ok",
    detail: emptyPages ? `${emptyPages} page(s) sans aucun bloc` : `${doc.pages.length} page(s)`,
  });

  // 2. Aucun bloc vide.
  const empties = allBlocks.filter(isEmptyBlock).length;
  items.push({
    id: "non-vide",
    label: "Aucun bloc vide",
    state: empties ? "fail" : "ok",
    detail: empties ? `${empties} bloc(s) sans contenu` : undefined,
  });

  // 3. Formules LaTeX valides.
  const badFormulas = allBlocks.filter(
    (b) => (b.type === "formule" || b.type === "calcul") && !latexOk(b.latex),
  );
  items.push({
    id: "formules",
    label: "Les formules sont correctement rendues",
    state: badFormulas.length ? "warn" : "ok",
    detail: badFormulas.length
      ? `${badFormulas.length} formule(s) non rendues par KaTeX`
      : undefined,
  });

  // 4. Tableaux rectangulaires.
  const raggedTables = allBlocks.filter(
    (b) => b.type === "tableau" && b.lignes.some((r) => r.length !== b.colonnes.length),
  );
  items.push({
    id: "tableaux",
    label: "Les tableaux sont bien formés",
    state: raggedTables.length ? "fail" : "ok",
    detail: raggedTables.length
      ? `${raggedTables.length} tableau(x) aux lignes inégales`
      : undefined,
  });

  // 5. Graphes traçables.
  const badGraphs = allBlocks.filter(
    (b) => b.type === "graphe" && (b.graphe.courbes ?? []).some((c) => (c.type ?? "fonction") === "fonction" && (!c.expr || !exprOk(c.expr))),
  );
  items.push({
    id: "graphes",
    label: "Les graphiques sont traçables",
    state: badGraphs.length ? "warn" : "ok",
    detail: badGraphs.length
      ? `${badGraphs.length} graphe(s) avec une courbe non compilable`
      : undefined,
  });

  // 6. Ordre des questions numérotées non décroissant.
  items.push(questionOrderCheck(allBlocks));

  // 7. Éléments incertains.
  const uncertain = collectUncertain(doc);
  items.push({
    id: "incertains",
    label: "Éléments signalés à vérifier",
    state: uncertain.length ? "warn" : "ok",
    detail: uncertain.length ? `${uncertain.length} élément(s) incertain(s)` : "aucun",
  });

  // 8. Fidélité des nombres — non vérifiable automatiquement, reste à l'utilisateur.
  items.push({
    id: "nombres",
    label: "Nombres, exposants, indices et unités conformes à la photo",
    state: "warn",
    detail: "à confirmer visuellement (zone ORIGINAL)",
  });

  const blocked = items.some((it) => it.state === "fail");
  return { items, blocked, toVerify: uncertain.length };
}

function isEmptyBlock(block: Block): boolean {
  switch (block.type) {
    case "titre":
    case "paragraphe":
    case "annotation":
    case "encadre":
      return !block.texte.trim();
    case "question":
      return !block.texte.trim() && !block.repere.trim();
    case "formule":
    case "calcul":
      return !block.latex.trim();
    case "tableau":
      return block.colonnes.length === 0 && block.lignes.length === 0;
    case "graphe":
      return !(block.graphe.courbes ?? []).length && !(block.graphe.points ?? []).length;
    default:
      return false;
  }
}

function latexOk(tex: string): boolean {
  try {
    katex.renderToString(tex, { throwOnError: true, strict: false });
    return true;
  } catch {
    return false;
  }
}

function exprOk(expr: string): boolean {
  try {
    compile(expr).evaluate({ x: 1 });
    return true;
  } catch {
    return false;
  }
}

function questionOrderCheck(blocks: Block[]): CheckItem {
  const numbers: number[] = [];
  for (const b of blocks) {
    if (b.type !== "question" || b.profondeur !== 0) continue;
    const m = b.repere.match(/\d+/);
    if (m) numbers.push(Number(m[0]));
  }
  let decreasing = 0;
  for (let i = 1; i < numbers.length; i += 1) {
    if (numbers[i]! < numbers[i - 1]!) decreasing += 1;
  }
  return {
    id: "ordre",
    label: "Les questions sont dans l'ordre",
    state: decreasing ? "warn" : "ok",
    detail: decreasing ? `${decreasing} rupture(s) de numérotation` : undefined,
  };
}
