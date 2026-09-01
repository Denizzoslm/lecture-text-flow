import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const MODEL = "google/gemini-3.1-flash-image";

const SCAN_PROMPT = `Transforme cette photo en un véritable scan de scanner à plat (300 dpi), qualité document.

À FAIRE :
- Redresse complètement la page : bords parallèles au cadre, perspective corrigée, feuille bien à plat (supprime les courbures, plis et coins relevés).
- Recadre exactement sur la feuille : plus aucun arrière-plan (table, bois, doigts, ombre portée).
- Fond du papier blanc pur et parfaitement uniforme, sans ombre, sans vignettage, sans reflet, sans jaunissement.
- Écriture et traits nets, bien contrastés, avec leurs couleurs d'origine (encre bleue, rouge, verte conservées).
- Conserve le quadrillage / les lignes du cahier s'ils sont présents, en gris clair régulier.
- Orientation portrait, page droite, comme une numérisation propre.

INTERDIT ABSOLUMENT :
- Ne modifie, ne corrige, n'ajoute, ne supprime AUCUN contenu : chaque mot, chiffre, symbole, tableau, courbe et annotation doit rester identique, au même endroit, avec la même graphie manuscrite.
- Ne réécris pas le texte avec une police d'ordinateur, ne redessine pas les graphiques, n'invente rien.
- Aucun texte de réponse : renvoie uniquement l'image.`;

export const enhanceScan = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        imageDataUrl: z.string().min(32).max(12_000_000),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) {
      throw new Error("La clé du service d'IA est absente. Contactez l'administrateur du site.");
    }

    let response: Response;
    try {
      response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: MODEL,
          modalities: ["image", "text"],
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: SCAN_PROMPT },
                { type: "image_url", image_url: { url: data.imageDataUrl } },
              ],
            },
          ],
        }),
      });
    } catch {
      throw new Error("Le service de scan IA est injoignable. Vérifiez votre connexion.");
    }

    if (response.status === 429) {
      throw new Error("Trop de scans d'un coup : patientez un instant puis réessayez.");
    }
    if (response.status === 402) {
      throw new Error("Crédits IA épuisés : rechargez l'espace de travail Lovable.");
    }
    if (!response.ok) {
      throw new Error(`Le scan IA a échoué (code ${response.status}).`);
    }

    const payload = (await response.json()) as {
      choices?: { message?: { images?: { image_url?: { url?: string } }[] } }[];
    };
    const url = payload.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!url || !url.startsWith("data:image")) {
      throw new Error("Le scan IA n'a renvoyé aucune image.");
    }
    return { imageDataUrl: url };
  });
