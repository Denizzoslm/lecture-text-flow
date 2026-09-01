import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const TRANSCRIPTION_PROMPT = `Tu vois la photo d'une page de cours de mathématiques (tableau ou cahier, écriture manuscrite ou imprimée). Ta seule mission est une retranscription STRICTEMENT FIDÈLE du contenu, en Markdown, en français.

RÈGLE ABSOLUE DE FIDÉLITÉ :
- Retranscris exactement ce qui est écrit, dans le même ordre et la même structure, sans rien ajouter, rien retirer, rien reformuler.
- NE CORRIGE RIEN : même si un calcul, un résultat ou une formule est faux, recopie-le tel quel.
- N'ajoute aucun calcul, aucune étape, aucune explication, aucune section supplémentaire, aucune conclusion.
- N'invente aucun graphique ni aucune courbe qui ne serait pas dessiné sur la photo.
- Si un mot ou un symbole est illisible, écris [illisible].
- Conserve la mise en page : titres, numéros d'exercices, listes, encadrés (utilise > pour un encadré), soulignements repris en **gras**, tableaux en Markdown.

MISE EN FORME :
- '# ' uniquement si un titre principal est visible sur la page ; '## ' pour les sections visibles, '### ' pour les sous-parties visibles.
- Toutes les formules et expressions mathématiques en LaTeX : $...$ en ligne, $$...$$ pour une formule isolée ou centrée sur la page.
- Aucun commentaire de ta part, uniquement le contenu de la page.

GRAPHIQUES DÉJÀ DESSINÉS SUR LA PAGE (et seulement ceux-là) :
Si un repère, une courbe ou un graphique est effectivement tracé sur la photo, reproduis-le au plus près sous forme d'un bloc de code de langage \`graphique\` contenant UNIQUEMENT du JSON valide de cette forme :

\`\`\`graphique
{"titre":"Courbe de f","xmin":-5,"xmax":5,"ymin":-4,"ymax":8,"courbes":[{"expr":"x^2-2*x","label":"f(x)=x^2-2x"}],"points":[{"x":1,"y":-1,"label":"S"}]}
\`\`\`

Règles pour les blocs \`graphique\` : "expr" est une expression JavaScript/mathjs de la variable x (utilise *, /, ^, sqrt(x), abs(x), exp(x), log(x), sin(x)...), jamais du LaTeX. Reprends la fenêtre xmin/xmax/ymin/ymax du repère dessiné. "points" et "titre" sont optionnels. Ne mets aucun texte autour du JSON dans le bloc. Si aucun graphique n'est dessiné, n'écris aucun bloc \`graphique\`.`;

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
