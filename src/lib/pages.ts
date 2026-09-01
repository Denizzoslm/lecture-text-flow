import type { Quad } from "./scan";

export type PageStatus = "pending" | "running" | "done" | "error";

export type CoursePage = {
  id: string;
  /** Photo d'origine (base d'un recadrage manuel). */
  sourceDataUrl: string;
  sourceWidth: number;
  sourceHeight: number;
  /** Image traitée « scanner » affichée et exportée. */
  imageDataUrl: string;
  /** Coins du document ; null si la détection auto a échoué. */
  quad: Quad | null;
  markdown: string;
  status: PageStatus;
  error?: string | undefined;
  /** L'image a été nettoyée par l'IA (rendu « scanner d'imprimante »). */
  aiEnhanced?: boolean;
  /** Nettoyage IA en cours pour cette page. */
  enhancing?: boolean;
};

export function statusLabel(status: PageStatus): string {
  switch (status) {
    case "pending":
      return "en attente";
    case "running":
      return "en cours…";
    case "done":
      return "terminé";
    case "error":
      return "erreur";
  }
}

export function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `p-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
