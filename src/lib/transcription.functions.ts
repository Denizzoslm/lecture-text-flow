import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const TRANSCRIPTION_PROMPT = `Tu vois la photo d'une page de cours de mathématiques (tableau ou cahier, écriture manuscrite ou imprimée). Ta seule mission est une retranscription STRICTEMENT FIDÈLE à 100 % du contenu, en Markdown, en français.

MÉTHODE OBLIGATOIRE :
- Lis d'abord toute la page de haut en bas, zone par zone, puis retranscris dans l'ordre exact d'apparition.
- Ne saute AUCUN élément : titres, numéros de page, numéros d'exercices, annotations en marge, tableaux, graphiques, flèches, légendes.
- Retranscris exactement ce qui est écrit, sans rien ajouter, rien retirer, rien reformuler, rien réorganiser.
- NE CORRIGE RIEN : même si un calcul, un résultat, une orthographe ou une formule est faux, recopie-le tel quel (par exemple 5 × 0,861 écrit « 4,05 » reste « 4,05 »).
- N'ajoute aucun calcul, aucune étape, aucune explication, aucune section, aucune conclusion, aucun commentaire.
- N'invente aucun graphique ni aucune courbe qui ne serait pas dessiné sur la photo.
- Recopie les nombres chiffre par chiffre, en gardant la virgule décimale française.
- Si un mot ou un symbole est vraiment illisible, écris [illisible].

MISE EN PAGE (à reproduire fidèlement) :
- '# ' uniquement si un titre principal est visible ; '## ' pour les sections visibles, '### ' pour les sous-parties visibles.
- Conserve les repères de structure tels qu'écrits : « A. », « a) », « b) », « 1° », listes à puces, etc.
- Encadrés : utilise > . Soulignements : reprends-les en **gras**.
- TABLEAUX : un tableau Markdown par tableau dessiné. Si deux tableaux sont côte à côte sur la page, écris-les l'un après l'autre SANS aucun texte ni ligne de séparation entre eux (ils seront réaffichés côte à côte). Garde exactement les mêmes en-têtes, le même nombre de lignes et les mêmes valeurs.
- Toutes les formules et expressions mathématiques en LaTeX : $...$ en ligne, $$...$$ pour une formule isolée ou centrée sur la page.
- Aucun commentaire de ta part, uniquement le contenu de la page.

GRAPHIQUES DÉJÀ DESSINÉS SUR LA PAGE (et seulement ceux-là) :
Si un repère, une courbe ou un graphique est effectivement tracé sur la photo, reproduis-le au plus près sous forme d'un bloc de code de langage \`graphique\` contenant UNIQUEMENT du JSON valide de cette forme :

\`\`\`graphique
{"titre":"Courbe de f","xmin":-5,"xmax":5,"ymin":-4,"ymax":8,"courbes":[{"expr":"x^2-2*x","label":"f(x)=x^2-2x"}],"points":[{"x":1,"y":-1,"label":"S"}]}
\`\`\`

Règles pour les blocs \`graphique\` : "expr" est une expression JavaScript/mathjs de la variable x (utilise *, /, ^, sqrt(x), abs(x), exp(x), log(x), sin(x)...), jamais du LaTeX. Reprends la fenêtre xmin/xmax/ymin/ymax du repère dessiné, ainsi que toutes les courbes tracées avec leurs étiquettes exactes. "points" et "titre" sont optionnels. Ne mets aucun texte autour du JSON dans le bloc. Si aucun graphique n'est dessiné, n'écris aucun bloc \`graphique\`.`;

const MODEL = "google/gemini-3.1-pro-preview";


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
          temperature: 0,

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
