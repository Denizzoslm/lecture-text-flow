import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const TRANSCRIPTION_PROMPT = `Tu vois la photo d'une page de cours de mathématiques (tableau ou cahier, écriture manuscrite ou imprimée). Retranscris fidèlement son contenu en Markdown structuré, en français :

- Utilise '# ' uniquement si un titre principal de cours est visible.
- Utilise '## ' pour les titres de section, '### ' pour les sous-parties.
- Utilise des listes pour les énoncés d'exercices ou énumérations.
- Écris TOUTES les formules en LaTeX : $...$ en ligne, $$...$$ pour une formule isolée.
- Aucun commentaire ni explication, uniquement le contenu retranscrit.
- Si un mot est illisible, écris [illisible].

REFAIRE LES CALCULS ET LES GRAPHIQUES :
- Refais entièrement chaque calcul, résolution, dérivée, primitive, limite, factorisation ou application numérique présent sur la page, et donne le résultat exact (simplifié).
- Si un résultat écrit sur la page est faux ou incomplet, retranscris la ligne originale puis ajoute juste en dessous une ligne commençant par "**Correction :**" avec le calcul refait, détaillé étape par étape en LaTeX.
- À la fin de la page, si des calculs étaient présents, ajoute une section "### Calculs refaits" avec les étapes complètes de chaque calcul vérifié.
- Chaque fois qu'un graphique, une courbe, un repère ou une fonction à représenter apparaît (ou est demandé), regénère-le sous forme d'un bloc de code de langage \`graphique\` contenant UNIQUEMENT du JSON valide de cette forme :

\`\`\`graphique
{"titre":"Courbe de f","xmin":-5,"xmax":5,"ymin":-4,"ymax":8,"courbes":[{"expr":"x^2-2*x","label":"f(x)=x^2-2x"}],"points":[{"x":1,"y":-1,"label":"S"}]}
\`\`\`

Règles pour les blocs \`graphique\` : "expr" est une expression JavaScript/mathjs de la variable x (utilise *, /, ^, sqrt(x), abs(x), exp(x), log(x), sin(x)...), jamais du LaTeX. Choisis une fenêtre xmin/xmax/ymin/ymax pertinente. "points" et "titre" sont optionnels. Ne mets aucun texte autour du JSON dans le bloc.`;

const MODEL = "google/gemini-3.7-flash";

export const transcribePage = createServerFn({ method: "POST" })
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
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: TRANSCRIPTION_PROMPT },
                { type: "image_url", image_url: { url: data.imageDataUrl } },
              ],
            },
          ],
        }),
      });
    } catch {
      throw new Error("Impossible de joindre le service de retranscription. Vérifiez la connexion.");
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      let message = body.slice(0, 300);
      try {
        const parsed = JSON.parse(body) as { error?: { message?: string }; message?: string };
        message = parsed.error?.message ?? parsed.message ?? message;
      } catch {
        /* texte brut */
      }
      if (response.status === 429) {
        throw new Error("Trop de pages envoyées en même temps. Réessayez dans quelques instants.");
      }
      if (response.status === 402) {
        throw new Error(message || "Crédits d'IA épuisés pour cet espace de travail.");
      }
      if (response.status === 403) {
        throw new Error(message || "L'accès au service d'IA est bloqué pour cet espace de travail.");
      }
      throw new Error(message || `Échec de la retranscription (erreur ${response.status}).`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const markdown = payload.choices?.[0]?.message?.content?.trim();
    if (!markdown) {
      throw new Error("La retranscription est revenue vide. Reprenez la photo si elle est floue.");
    }
    return { markdown };
  });
