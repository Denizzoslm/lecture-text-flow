/**
 * Étape « structuration du document » (spec §27 étape 4).
 * Transforme la sortie IA validée (`AiPage`) en `DocPage` / `DigitalDoc`
 * avec identifiants stables, ordre normalisé et confiance de page.
 */

import type { AiBlock, AiPage } from "./transcription.functions";
import {
  newId,
  pageConfidence,
  renumber,
  type Block,
  type DigitalDoc,
  type DocMode,
  type DocPage,
  type GraphSpec,
} from "./doc-model";

export function aiPageToDocPage(ai: AiPage, sourceImage: string, pageIndex: number): DocPage {
  const blocks: Block[] = ai.blocs.map((raw, index) => toBlock(raw, pageIndex, index));
  return {
    id: newId("pg"),
    sourceImage,
    blocks,
    confiance: pageConfidence(blocks),
  };
}

function toBlock(raw: AiBlock, page: number, ordre: number): Block {
  const raison = raw.raison?.trim();
  const original = raw.original?.trim();
  const common = {
    id: newId(),
    page,
    ordre,
    confiance: clamp(raw.confiance, 0.9),
    incertain: Boolean(raw.incertain),
    ...(raison ? { raison } : {}),
    ...(original ? { original } : {}),
  };

  switch (raw.type) {
    case "titre":
      return {
        ...common,
        type: "titre",
        niveau: (raw.niveau as 1 | 2 | 3) ?? 2,
        texte: raw.texte.trim(),
      };
    case "paragraphe":
      return { ...common, type: "paragraphe", texte: raw.texte.trim() };
    case "question":
      return {
        ...common,
        type: "question",
        repere: raw.repere.trim(),
        profondeur: Math.max(0, Math.min(4, raw.profondeur ?? 0)),
        texte: raw.texte.trim(),
      };
    case "formule":
      return {
        ...common,
        type: "formule",
        latex: raw.latex.trim(),
        display: raw.display !== false,
      };
    case "calcul":
      return { ...common, type: "calcul", latex: raw.latex.trim() };
    case "tableau":
      return { ...common, type: "tableau", colonnes: raw.colonnes, lignes: raw.lignes };
    case "graphe":
      return { ...common, type: "graphe", graphe: raw.graphe as GraphSpec };
    case "annotation":
      return { ...common, type: "annotation", genre: raw.genre, texte: raw.texte.trim() };
    case "encadre":
      return { ...common, type: "encadre", texte: raw.texte.trim() };
  }
}

function clamp(value: number, fallback: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
}

export type TranscribedPage = {
  ai: AiPage;
  sourceImage: string;
};

/** Assemble un document complet à partir des pages retranscrites, dans l'ordre fourni. */
export function assembleDoc(
  pages: TranscribedPage[],
  mode: DocMode,
  meta: string,
  author: string,
): DigitalDoc {
  const docPages = pages.map((p, index) => aiPageToDocPage(p.ai, p.sourceImage, index));

  // Titre du document : premier titre de page lu (spec §16 — jamais inventé).
  const firstWithTitle = pages.find((p) => p.ai.titre && p.ai.titre.texte.trim());
  const titre = firstWithTitle?.ai.titre?.texte.trim() ?? null;
  const titreIncertain = Boolean(firstWithTitle?.ai.titre?.incertain);

  return renumber({ titre, titreIncertain, meta, author, pages: docPages, mode });
}

/**
 * Normalisation légère des nombres français (spec §6) — utilisée en mode « propre »
 * pour l'affichage seulement, jamais pour modifier une valeur.
 * "8000" -> "8 000", conserve "0,85" tel quel, ne touche pas aux nombres déjà espacés.
 */
export function frenchNumber(value: string): string {
  return value.replace(/(?<![\d.,])(\d{4,})(?![\d.,])/g, (match) =>
    match.replace(/\B(?=(\d{3})+(?!\d))/g, " "),
  );
}
