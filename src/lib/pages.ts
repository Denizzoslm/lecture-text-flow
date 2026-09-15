import type { Quad } from "./scan";

/** Page au stade « scan » : photo redressée/nettoyée, avant retranscription. */
export type ScanPage = {
  id: string;
  /** Photo d'origine (base d'un recadrage manuel). */
  sourceDataUrl: string;
  sourceWidth: number;
  sourceHeight: number;
  /** Image traitée « scanner » affichée et retranscrite. */
  imageDataUrl: string;
  /** Coins du document ; null si la détection auto a échoué. */
  quad: Quad | null;
};

export function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `p-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
