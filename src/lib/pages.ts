export type PageStatus = "pending" | "running" | "done" | "error";

export type CoursePage = {
  id: string;
  imageDataUrl: string;
  markdown: string;
  status: PageStatus;
  error?: string | undefined;
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
