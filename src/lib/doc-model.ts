/**
 * Modèle de données du document mathématique numérique (spec §27).
 *
 * La photo n'est qu'une source. Après OCR + compréhension mathématique, chaque
 * page devient une liste de `Block` typés. Chaque bloc conserve :
 *  - son contenu numérique (texte, LaTeX, cellules, spec de graphe…) ;
 *  - son type et son ordre d'apparition d'origine ;
 *  - un niveau de confiance et un marqueur d'incertitude éditable par l'utilisateur ;
 *  - la lecture brute (`original`) telle que vue sur la feuille, pour la zone
 *    « éléments à vérifier ».
 */

import type { GraphSpec } from "./markdown";

export type { GraphSpec };

export type BlockType =
  | "titre"
  | "paragraphe"
  | "question"
  | "formule"
  | "calcul"
  | "tableau"
  | "graphe"
  | "annotation"
  | "encadre";

export type AnnotationKind = "fleche" | "coche" | "croix" | "note" | "correction";

type Common = {
  id: string;
  /** Ordre de lecture sur la feuille d'origine (croissant). */
  ordre: number;
  /** 0 → 1. Confiance interne de la retranscription de ce bloc. */
  confiance: number;
  /** true tant que l'utilisateur n'a pas validé un élément douteux. */
  incertain: boolean;
  /** Pourquoi le bloc est marqué incertain (chiffre ambigu, symbole flou…). */
  raison?: string;
  /** Lecture brute, verbatim, avant toute mise en forme. */
  original?: string;
  /** Page source (index 0-based). */
  page: number;
};

export type TitreBlock = Common & { type: "titre"; niveau: 1 | 2 | 3; texte: string };
export type ParagrapheBlock = Common & { type: "paragraphe"; texte: string };
export type QuestionBlock = Common & {
  type: "question";
  /** Repère verbatim : « 4. », « Exercice 3 », « a) », « 1° »… */
  repere: string;
  /** Profondeur d'imbrication (0 = exercice, 1 = a), 2 = ligne de calcul rattachée…). */
  profondeur: number;
  texte: string;
};
export type FormuleBlock = Common & {
  type: "formule";
  latex: string;
  /** true → formule isolée, centrée. false → dans le fil du texte. */
  display: boolean;
};
export type CalculBlock = Common & { type: "calcul"; latex: string };
export type TableauBlock = Common & {
  type: "tableau";
  colonnes: string[];
  lignes: string[][];
};
export type GrapheBlock = Common & {
  type: "graphe";
  graphe: GraphSpec;
  /** Recadrage du graphe manuscrit d'origine (référence en cas de doute). */
  apercuSource?: string;
};
export type AnnotationBlock = Common & {
  type: "annotation";
  genre: AnnotationKind;
  texte: string;
};
export type EncadreBlock = Common & { type: "encadre"; texte: string };

export type Block =
  | TitreBlock
  | ParagrapheBlock
  | QuestionBlock
  | FormuleBlock
  | CalculBlock
  | TableauBlock
  | GrapheBlock
  | AnnotationBlock
  | EncadreBlock;

export type DocPage = {
  id: string;
  /** Photo redressée / nettoyée de la page. */
  sourceImage: string;
  blocks: Block[];
  /** Confiance moyenne pondérée de la page. */
  confiance: number;
};

export type DigitalDoc = {
  /** Titre lu sur la feuille — jamais inventé (spec §16). null si absent. */
  titre: string | null;
  titreIncertain: boolean;
  /** Métadonnées ajoutées par l'utilisateur (classe, date…). Optionnel. */
  meta: string;
  /** Nom affiché en bas à gauche de chaque page. */
  author: string;
  pages: DocPage[];
  mode: DocMode;
};

export type DocMode = "fidele" | "propre";

/** Vue dérivée : un élément signalé à l'utilisateur pour vérification (spec §10/§21). */
export type UncertainRef = {
  blockId: string;
  page: number;
  ordre: number;
  type: BlockType;
  apercu: string;
  raison: string;
};

export function newId(prefix = "b"): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** Court extrait lisible d'un bloc, pour les listes de vérification. */
export function blockPreview(block: Block): string {
  switch (block.type) {
    case "titre":
    case "paragraphe":
    case "encadre":
    case "annotation":
      return truncate(block.texte);
    case "question":
      return truncate(`${block.repere} ${block.texte}`.trim());
    case "formule":
    case "calcul":
      return truncate(block.latex);
    case "tableau":
      return `Tableau ${block.colonnes.length}×${block.lignes.length} — ${truncate(block.colonnes.join(" · "), 60)}`;
    case "graphe":
      return `Graphique — ${truncate(block.graphe.titre ?? block.graphe.xlabel ?? "repère", 60)}`;
    default:
      return "";
  }
}

function truncate(value: string, max = 90): string {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

const LOW_CONFIDENCE = 0.85;

/** Construit la liste « éléments à vérifier » (spec §10, §11, §21). */
export function collectUncertain(doc: DigitalDoc): UncertainRef[] {
  const refs: UncertainRef[] = [];
  for (const page of doc.pages) {
    for (const block of page.blocks) {
      const flag = block.incertain || block.confiance < LOW_CONFIDENCE;
      if (!flag) continue;
      refs.push({
        blockId: block.id,
        page: block.page,
        ordre: block.ordre,
        type: block.type,
        apercu: blockPreview(block),
        raison:
          block.raison || (block.confiance < LOW_CONFIDENCE ? "confiance faible" : "à confirmer"),
      });
    }
  }
  return refs.sort((a, b) => a.page - b.page || a.ordre - b.ordre);
}

/** Confiance moyenne pondérée (les graphes / tableaux pèsent plus lourd). */
export function pageConfidence(blocks: Block[]): number {
  if (!blocks.length) return 0;
  const weight = (b: Block) => (b.type === "graphe" || b.type === "tableau" ? 2 : 1);
  const total = blocks.reduce((sum, b) => sum + weight(b), 0);
  const acc = blocks.reduce((sum, b) => sum + weight(b) * clamp01(b.confiance), 0);
  return acc / total;
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** Renumérote `ordre` page par page après réordonnancement. */
export function renumber(doc: DigitalDoc): DigitalDoc {
  return {
    ...doc,
    pages: doc.pages.map((page, pageIndex) => ({
      ...page,
      blocks: page.blocks.map((block, blockIndex) => ({
        ...block,
        page: pageIndex,
        ordre: blockIndex,
      })),
      confiance: pageConfidence(page.blocks),
    })),
  };
}

export function updateBlock(doc: DigitalDoc, blockId: string, patch: Partial<Block>): DigitalDoc {
  return {
    ...doc,
    pages: doc.pages.map((page) => {
      if (!page.blocks.some((b) => b.id === blockId)) return page;
      const blocks = page.blocks.map((b) => (b.id === blockId ? ({ ...b, ...patch } as Block) : b));
      return { ...page, blocks, confiance: pageConfidence(blocks) };
    }),
  };
}

export function removeBlock(doc: DigitalDoc, blockId: string): DigitalDoc {
  return renumber({
    ...doc,
    pages: doc.pages.map((page) => ({
      ...page,
      blocks: page.blocks.filter((b) => b.id !== blockId),
    })),
  });
}

export function moveBlock(doc: DigitalDoc, blockId: string, direction: -1 | 1): DigitalDoc {
  return renumber({
    ...doc,
    pages: doc.pages.map((page) => {
      const index = page.blocks.findIndex((b) => b.id === blockId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= page.blocks.length) return page;
      const blocks = [...page.blocks];
      const a = blocks[index]!;
      const b = blocks[target]!;
      blocks[index] = b;
      blocks[target] = a;
      return { ...page, blocks };
    }),
  });
}

/** Marque un bloc comme vérifié par l'utilisateur (spec §11 « Valider »). */
export function markVerified(doc: DigitalDoc, blockId: string): DigitalDoc {
  return {
    ...doc,
    pages: doc.pages.map((page) => {
      if (!page.blocks.some((b) => b.id === blockId)) return page;
      const blocks = page.blocks.map((b) => {
        if (b.id !== blockId) return b;
        const { raison: _raison, ...rest } = b;
        return { ...rest, incertain: false, confiance: 1 } as Block;
      });
      return { ...page, blocks, confiance: pageConfidence(blocks) };
    }),
  };
}
