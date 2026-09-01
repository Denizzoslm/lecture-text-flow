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
- Recopie les nombres chiffre par chiffre, en gardant la virgule décimale française et EXACTEMENT le même nombre de décimales que sur la photo (zoome mentalement sur chaque cellule de tableau avant de l'écrire). N'ajoute jamais un chiffre manquant pour « rendre le calcul juste ».
- Si un mot ou un symbole est vraiment illisible, écris [illisible].

MISE EN PAGE (à reproduire fidèlement) :
- '# ' uniquement si un titre principal est visible ; '## ' pour les sections visibles, '### ' pour les sous-parties visibles.
- Conserve les repères de structure tels qu'écrits : « A. », « a) », « b) », « 1° », listes à puces, etc.
- NUMÉROS D'EXERCICE : tout repère d'exercice ou de question numéroté (« 4. », « Exercice 3 », « 1) », « 2° »…) est écrit EN GRAS, en début de ligne, suivi de son énoncé : par exemple « **4.** $8h \\to 8\\,000$ bactéries ».
- REPÈRES EN LETTRES : chaque sous-question en lettre (« a) », « b) », « c) »…) commence une nouvelle ligne. Si elle est visiblement décalée vers la droite sur la feuille, écris-la comme élément de liste pour obtenir un alinéa : « - a) … ». Les lignes de calcul rattachées à cette lettre et encore plus décalées sur la photo deviennent une liste imbriquée (« - » précédé de 2 espaces). Garde la lettre et sa ponctuation exactement comme sur la feuille.
- Encadrés : utilise > . Soulignements : reprends-les en **gras**.
- TABLEAUX : un tableau Markdown distinct par tableau dessiné, chacun avec sa propre ligne d'en-tête. Si deux tableaux sont côte à côte sur la page, écris-les l'un après l'autre séparés UNIQUEMENT par une ligne vide (jamais de texte, de titre ni de trait entre eux) : ils seront réaffichés côte à côte. Ne fusionne jamais deux tableaux en un seul. Garde exactement les mêmes en-têtes, le même nombre de lignes et les mêmes valeurs.
- Toutes les formules et expressions mathématiques en LaTeX : $...$ en ligne, $$...$$ pour une formule isolée ou centrée sur la page.
- Aucun commentaire de ta part, uniquement le contenu de la page.

GRAPHIQUES DÉJÀ DESSINÉS SUR LA PAGE (et seulement ceux-là) :
Si un repère, une courbe ou un graphique est effectivement tracé sur la photo, reproduis-le au plus près sous forme d'un bloc de code de langage \`graphique\` contenant UNIQUEMENT du JSON valide de cette forme :

\`\`\`graphique
{"titre":"Courbe de f","xlabel":"x (heures écoulées)","ylabel":"y (milliers de bactéries)","xmin":-1,"xmax":3,"ymin":0,"ymax":1100,"courbes":[{"expr":"8*4^x","label":"y=8000*4^x"}],"points":[{"x":1,"y":32,"label":"A"}]}
\`\`\`

Règles pour les blocs \`graphique\` : "expr" est une expression JavaScript/mathjs de la variable x (utilise *, /, ^, sqrt(x), abs(x), exp(x), log(x), sin(x)...), jamais du LaTeX. Reprends la fenêtre xmin/xmax/ymin/ymax du repère dessiné, ainsi que toutes les courbes tracées avec leurs étiquettes exactes. "xlabel" et "ylabel" sont OBLIGATOIRES : recopie les noms des axes lus sur la photo, avec leur unité (ex. "x (heures écoulées)", "y (milliers de bactéries)") ; si l'échelle du repère est en milliers, adapte "expr" à cette échelle pour que la courbe reste dans la fenêtre. "points" et "titre" sont optionnels. Ne mets aucun texte autour du JSON dans le bloc. Si aucun graphique n'est dessiné, n'écris aucun bloc \`graphique\`.`;

const REVIEW_PROMPT = `Tu es relecteur. On te donne la même photo de page de cours et une première retranscription Markdown de cette page. Compare-les ligne par ligne et rends la VERSION CORRIGÉE de la retranscription.

À vérifier impérativement :
- chaque nombre, chiffre par chiffre (virgule décimale française), y compris dans les tableaux ;
- chaque formule LaTeX (indices, exposants, fractions, racines, parenthèses) ;
- l'ordre et la présence de tous les éléments : titres, repères « A. », « a) », numéros, annotations de marge, légendes, flèches ;
- la mise en forme des repères : numéros d'exercice/question en **gras**, sous-questions en lettres en éléments de liste (alinéa) quand elles sont décalées sur la photo ;
- les tableaux : même nombre de colonnes/lignes, mêmes en-têtes, tableaux côte à côte gardés comme deux tableaux séparés par une seule ligne vide ;
- les blocs \`graphique\` : ne garder que les graphiques réellement dessinés, avec la bonne fenêtre et les bonnes courbes/étiquettes ;
- aucun ajout, aucune correction de calcul. INTERDIT de recalculer une valeur : tu ne changes un nombre que si tu vois clairement qu'il a été MAL LU sur la photo. Exemple : si la page écrit « 4,05 » alors que le calcul juste donnerait 4,305, tu gardes « 4,05 ».

Réponds UNIQUEMENT avec le Markdown final corrigé, sans commentaire, sans balise de code autour (sauf les blocs \`graphique\`).`;

/** Mode « propre » : même contenu, mise en page de document scolaire. */
const CLEAN_PROMPT = `MODE « PROPRE » (mise en forme uniquement) :
- Le CONTENU reste strictement identique : mêmes nombres, mêmes résultats (même faux), mêmes étapes, même ordre des questions.
- Tu peux uniquement : hiérarchiser les titres et sous-titres, aérer les paragraphes, aligner les repères de questions (« A. », « a) », « b) »…) en liste propre, centrer une formule isolée avec $$...$$, régulariser les espaces.
- Écris les mathématiques proprement en LaTeX : \\times pour ×, fractions avec \\dfrac, exposants et indices bien placés, virgule décimale française, espace fine pour les milliers (8\\,000), unités en texte (\\text{h}, \\text{bactéries}).
- N'ajoute aucun titre inventé, aucune explication, aucune correction de calcul, aucune conclusion.`;

const MODEL = "openai/gpt-5.5";

function readErrorMessage(status: number, body: string): string {
  let message = body.slice(0, 300);
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string }; message?: string };
    message = parsed.error?.message ?? parsed.message ?? message;
  } catch {
    /* texte brut */
  }
  if (status === 429) return "Trop de pages envoyées en même temps. Réessayez dans quelques instants.";
  if (status === 402) return message || "Crédits d'IA épuisés pour cet espace de travail.";
  if (status === 403) return message || "L'accès au service d'IA est bloqué pour cet espace de travail.";
  return message || `Échec de la retranscription (erreur ${status}).`;
}

type ResponsePart = { type: "input_text"; text: string } | { type: "input_image"; image_url: string };

/** Appel OpenAI via l'API Responses de la passerelle (streaming obligatoire). */
async function askGateway(apiKey: string, content: ResponsePart[]): Promise<string | null> {
  let response: Response;
  try {
    response = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model: MODEL,
        input: [{ role: "user", content }],
        stream: true,
        store: false,
        reasoning: { effort: "medium", summary: "auto" },
      }),
    });
  } catch {
    throw new Error("Impossible de joindre le service de retranscription. Vérifiez la connexion.");
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(readErrorMessage(response.status, body));
  }
  if (!response.body) throw new Error("Réponse vide du service de retranscription.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let completed = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      let event: {
        type?: string;
        delta?: string;
        response?: { output_text?: string };
      };
      try {
        event = JSON.parse(payload);
      } catch {
        continue;
      }
      if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
        text += event.delta;
      } else if (event.type === "response.completed" && event.response?.output_text) {
        completed = event.response.output_text;
      }
    }
  }

  const final = (text || completed).trim();
  return final.length > 0 ? final : null;
}

function stripCodeFence(markdown: string): string {
  const fenced = markdown.match(/^```(?:markdown|md)?\n([\s\S]*)\n```$/);
  return fenced?.[1]?.trim() ?? markdown;
}

export const transcribePage = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        imageDataUrl: z.string().min(32).max(12_000_000),
        style: z.enum(["fidele", "propre"]).default("fidele"),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) {
      throw new Error("La clé du service d'IA est absente. Contactez l'administrateur du site.");
    }

    const image: ResponsePart = { type: "input_image", image_url: data.imageDataUrl };
    const basePrompt =
      data.style === "propre" ? `${TRANSCRIPTION_PROMPT}\n\n${CLEAN_PROMPT}` : TRANSCRIPTION_PROMPT;

    const draft = await askGateway(apiKey, [{ type: "input_text", text: basePrompt }, image]);
    if (!draft) {
      throw new Error("La retranscription est revenue vide. Reprenez la photo si elle est floue.");
    }

    // Deuxième passage : l'IA relit sa propre transcription face à la photo.
    let reviewed: string | null = null;
    try {
      reviewed = await askGateway(apiKey, [
        { type: "input_text", text: `${REVIEW_PROMPT}\n\n--- PREMIÈRE RETRANSCRIPTION ---\n${draft}` },
        image,
      ]);
    } catch {
      reviewed = null;
    }

    const markdown = stripCodeFence((reviewed ?? draft).trim());
    return { markdown };
  });
