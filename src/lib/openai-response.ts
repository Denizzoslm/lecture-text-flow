import { z } from "zod";

const payloadSchema = z.object({
  status: z.string().optional(),
  error: z
    .object({ code: z.string().nullable().optional(), type: z.string().optional() })
    .nullable()
    .optional(),
  output: z
    .array(
      z.object({
        type: z.string(),
        content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional(),
      }),
    )
    .optional(),
});

export function readOpenAIResponse(status: number, body: unknown): string {
  const parsed = payloadSchema.safeParse(body);
  const payload = parsed.success ? parsed.data : undefined;
  if (status < 200 || status >= 300) {
    const code = payload?.error?.code;
    if (status === 401)
      throw new Error(
        "La clé OpenAI est invalide ou révoquée. Vérifiez la clé configurée sur le serveur.",
      );
    if (status === 429) {
      if (code === "credit_balance_exhausted")
        throw new Error(
          "Crédits API OpenAI épuisés. Ajoutez des crédits dans la facturation OpenAI avant de relancer.",
        );
      if (code === "project_spend_limit_exceeded")
        throw new Error(
          "Plafond de dépenses du projet OpenAI atteint. Vérifiez les limites de ce projet.",
        );
      if (code === "organization_spend_limit_exceeded")
        throw new Error(
          "Plafond de dépenses de l’organisation OpenAI atteint. Vérifiez les limites de votre organisation.",
        );
      if (code === "organization_usage_limit_exceeded")
        throw new Error(
          "Limite d’utilisation de l’organisation OpenAI atteinte. Vérifiez les limites de votre compte.",
        );
      if (code === "insufficient_quota" || payload?.error?.type === "insufficient_quota")
        throw new Error(
          "Quota API OpenAI indisponible (insufficient_quota). Vérifiez le solde et les limites dans la facturation OpenAI ; relancer immédiatement ne résoudra pas ce problème.",
        );
      if (
        code === "rate_limit_exceeded" ||
        code === "slow_down" ||
        payload?.error?.type === "rate_limit_error"
      )
        throw new Error(
          "Trop de requêtes ou de texte traité par minute sur OpenAI. Patientez avant de relancer.",
        );
      throw new Error(
        "OpenAI refuse temporairement la requête (429). Vérifiez la facturation et les limites de votre compte avant de relancer.",
      );
    }
    throw new Error(
      `La retranscription OpenAI a échoué (HTTP ${status}). Réessayez plus tard ou vérifiez les autorisations du projet.`,
    );
  }
  if (!payload) throw new Error("Réponse OpenAI inattendue.");
  if (payload.status !== "completed")
    throw new Error("La réponse OpenAI est incomplète. Essayez une zone plus petite de la page.");
  const content = (payload.output ?? [])
    .filter((item) => item.type === "message")
    .flatMap((item) => item.content ?? []);
  if (content.some((item) => item.type === "refusal"))
    throw new Error("OpenAI n’a pas accepté de retranscrire cette image.");
  const text = content
    .filter((item) => item.type === "output_text")
    .map((item) => item.text ?? "")
    .join("\n")
    .trim();
  if (!text) throw new Error("OpenAI n’a renvoyé aucun texte pour cette image.");
  return text;
}
