import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { readOpenAIResponse } from "./openai-response";

/**
 * OCR + compréhension mathématique (spec §5, §6, §10, §28).
 *
 * Deux passages indépendants :
 *  1. transcription : la photo → un document JSON structuré (blocs typés) ;
 *  2. relecture : la même photo + le JSON → JSON corrigé, éléments douteux marqués.
 *
 * Règle absolue (spec §1, §32) : fidélité. Aucun contenu inventé, aucune erreur
 * corrigée, aucun calcul résolu. Ce qui n'est pas lisible est marqué incertain.
 */

const SCHEMA_DOC = `SCHÉMA DE SORTIE (JSON strict, rien d'autre) :

{
  "titre": { "texte": string, "confiance": 0..1, "incertain": boolean } | null,
  "blocs": [ Bloc, ... ]
}

Bloc = un objet avec un champ "type" et TOUJOURS ces champs communs :
  "type": "titre" | "paragraphe" | "question" | "formule" | "calcul" | "tableau" | "graphe" | "annotation" | "encadre",
  "confiance": 0..1,          // ta confiance dans CE bloc
  "incertain": boolean,       // true si un caractère, chiffre ou symbole n'est pas lisible avec certitude
  "raison": string,           // OBLIGATOIRE si incertain=true : ce qui est douteux ("exposant illisible", "3 ou 8 ?"…)
  "original": string          // la lecture BRUTE, verbatim, telle qu'écrite sur la feuille (avant mise en forme)

Champs selon le type :
  titre       -> "niveau": 1|2|3, "texte": string
  paragraphe  -> "texte": string            // peut contenir des maths en ligne $...$
  question    -> "repere": string,          // le repère verbatim : "4.", "Exercice 3", "a)", "1°"
                 "profondeur": number,       // 0 = exercice/question principale, 1 = a) b) c), 2 = ligne de calcul rattachée
                 "texte": string             // l'énoncé, maths en ligne en $...$
  formule     -> "latex": string, "display": boolean   // display=true si la formule est isolée/centrée sur la feuille
  calcul      -> "latex": string             // une étape de calcul (ex: "8000 \\\\times 4^{3} = 512000")
  tableau     -> "colonnes": string[], "lignes": string[][]   // lignes[i].length == colonnes.length
  graphe      -> "graphe": { "titre"?: string, "xlabel": string, "ylabel": string,
                             "xmin": number, "xmax": number, "ymin": number, "ymax": number,
                             "courbes": [{ "expr": string, "label"?: string }],
                             "points"?: [{ "x": number, "y": number, "label"?: string }] }
  annotation  -> "genre": "fleche"|"coche"|"croix"|"note"|"correction", "texte": string
  encadre     -> "texte": string`;

const TRANSCRIPTION_PROMPT = `Tu reçois la photo d'UNE page de mathématiques (cahier ou tableau, manuscrite ou imprimée, en français).
Ta mission : reconstruire cette page en document JSON structuré, STRICTEMENT FIDÈLE à ce qui est écrit.

Deux vues de la même page peuvent être fournies : la PHOTO ORIGINALE conserve les détails faibles, les couleurs
et les annotations ; le SCAN REDRESSÉ facilite la lecture et la géométrie. Compare toujours les deux. Elles ne
représentent qu'une seule page : ne duplique jamais leur contenu.

RÈGLE ABSOLUE — FIDÉLITÉ :
- N'invente RIEN. Ne complète aucune phrase que tu ne vois pas. Ne résous aucun exercice.
- Ne corrige AUCUNE erreur (calcul, résultat, orthographe, formule) : recopie-la telle quelle.
  Exemple : si la feuille écrit "5 × 0,861 = 4,05", garde "4,05" même si le vrai résultat est 4,305.
- Ne simplifie, ne réorganise, ne supprime rien : ni ligne, ni annotation, ni calcul barré, ni flèche.
- Si un élément est difficile à lire : NE DEVINE PAS. Mets "incertain": true, explique dans "raison",
  et mets dans "original" ta meilleure lecture brute.

LECTURE :
- Fais d'abord un inventaire visuel silencieux de toutes les zones : en-tête, marges, colonnes, corps de page,
  bas de page, encadrés, tableaux et figures. Lis ensuite chaque zone ligne par ligne.
- Remplis "blocs" dans l'ordre EXACT d'apparition. Une disposition en deux colonnes doit rester dans son ordre
  de lecture visuel ; ne mélange pas les lignes de colonnes différentes.
- Compare le nombre de blocs produits avec l'inventaire silencieux avant de répondre. Aucun élément visible ne
  doit disparaître, même s'il est barré, isolé dans une marge ou très court.
- Petits caractères critiques : exposants, indices, virgules, signes. "4³" ne devient jamais "43".
  "0,85" ne devient jamais "085" ni "0.85". Garde la virgule décimale française et le nombre exact de décimales.
- Une virgule décimale visible reste toujours une virgule : écris par exemple 0{,}861 en LaTeX, jamais 0.861.
- Garde les espaces de milliers français ("8 000", "29 350") dans "original" ; en LaTeX écris "8\\\\,000".
- Conserve les unités (h, min, km, kg, €, cm, m, %, …).
- DEVISES : conserve le symbole exact visible. Une somme en euros s'écrit avec « € » et une somme en dollars
  avec « $ ». Écris « 1 $ = 0{,}861 € » si ces symboles sont visibles ; n'écris jamais « euro » ou « dollar »
  à la place d'un symbole monétaire placé après un nombre.
- Numéros d'exercice / de question ("4.", "Exercice 3", "1)", "2°") -> type "question", "repere" verbatim, "profondeur" 0.
- Sous-questions en lettres ("a)", "b)"…) -> type "question", "profondeur" 1 (2+ si encore décalées vers la droite).
- Une ligne comme « a) f : x ↦ x/0,861 = 1,161x » forme UN SEUL bloc "question" : mets « a) » dans
  "repere" et toute la formule entre $...$ dans "texte". Ne répète jamais cette formule dans un second bloc.
- Un titre principal visible -> "titre" (niveau 1) au niveau du document, PAS dans "blocs". Sinon "titre": null (n'invente pas de titre).
- Sous-titres/sections visibles -> bloc "titre" niveau 2 ou 3.
- Ne perds jamais la hiérarchie typographique : une ligne visiblement grande, grasse, centrée ou soulignée reste
  un titre. Les libellés comme « UAA4 : … », « Chapitre … » sont des titres principaux ; « Exploration 1 : … »,
  « Exercice … » ou une section mise en évidence deviennent des titres/sections, jamais de simples paragraphes.
- Encadrés/soulignements -> "encadre". Annotations de marge, flèches, "✓", "?", "faux", "à revoir" -> "annotation".

MATHÉMATIQUES (spec) :
- Toute expression dont la structure est identifiable -> "formule" ou "calcul" en LaTeX (jamais du texte brut).
  "f : x -> 8000 × 4^x"  ->  latex "f : x \\\\mapsto 8\\\\,000 \\\\times 4^{x}"
  "29 350 × (0,85)^x"     ->  latex "29\\\\,350 \\\\times (0{,}85)^{x}"
- Les fractions sont de vraies fractions (\\\\dfrac{...}{...}).
- FRACTIONS MANUSCRITES : la géométrie prime sur toute interprétation algébrique. Un élément écrit au-dessus
  d'un trait horizontal est le numérateur et l'élément placé dessous est le dénominateur. Par exemple, un x
  au-dessus d'une barre et 0,861 dessous doit donner \\\\dfrac{x}{0{,}861}, jamais 0{,}861x.
- Ne transforme jamais une division en multiplication parce qu'une valeur approchée apparaît après le signe =.
  Compare séparément le numérateur, le trait de fraction et le dénominateur dans la PHOTO ORIGINALE.
- Quand un tableau de valeurs voisin porte la même fonction, utilise son en-tête uniquement pour vérifier la
  lecture visuelle de la formule. Conserve malgré tout exactement l'écriture présente sur la feuille.
- Préserve exactement les accolades, parenthèses, crochets, valeurs absolues, flèches, ensembles, intervalles,
  indices, exposants, limites et bornes. Une suite de calculs reste une suite de blocs distincts.
- Une formule isolée/centrée sur la feuille -> "display": true. Un calcul dans une phrase -> "paragraphe" avec $...$.

TABLEAUX : un bloc "tableau" par tableau dessiné. Mêmes en-têtes, même nombre de lignes/colonnes, mêmes valeurs
(zoome mentalement sur chaque cellule). Vérifie chaque ligne horizontalement puis chaque colonne verticalement.
Les cases vides restent vides. Ne fusionne jamais deux tableaux et n'invente jamais un en-tête absent.

GRAPHIQUES (uniquement ceux réellement tracés sur la photo) : bloc "graphe".
  "expr" est une expression JS/mathjs de x (*, /, ^, sqrt, exp, log, sin…), jamais du LaTeX.
  "label" est la légende affichée et doit être en LaTeX lisible : utilise par exemple
  "y = \\dfrac{x}{0{,}861}". N'utilise jamais la syntaxe brute « \\frac » dans un paragraphe hors de $...$.
  Reprends la fenêtre xmin/xmax/ymin/ymax du repère dessiné, toutes les courbes tracées avec leurs étiquettes,
  et les axes lus sur la photo dans "xlabel"/"ylabel" AVEC leur unité. Si l'échelle est en milliers, adapte "expr".
  N'invente jamais xlabel ou ylabel à partir du thème de l'exercice : laisse-les vides si aucun nom d'axe n'est
  écrit dans le repère. Une devise mentionnée dans l'énoncé ne devient pas automatiquement un titre d'axe.
  Repère d'abord les axes, l'origine, les graduations, l'échelle et les unités, puis chaque courbe et chaque point.
  N'ajoute jamais une courbe ou un point absent du dessin. Si l'équation n'est pas écrite ou reliée clairement
  à la courbe, ne l'invente pas : garde les points lisibles et marque le bloc incertain en expliquant la limite.
  Tout graphique, schéma ou repère visible doit produire un bloc "graphe", même si une partie est illisible.
  Si le texte annonce une « représentation graphique », un « graphique », une « courbe », une « droite » ou un
  « repère », vérifie obligatoirement la zone située dessous et crée le bloc "graphe" correspondant. Si les
  équations des courbes sont écrites juste avant le dessin, utilise-les dans "courbes". Les valeurs d'un tableau
  voisin servent à contrôler le tracé et sa fenêtre ; elles ne remplacent jamais le bloc "graphe".

${SCHEMA_DOC}

Réponds UNIQUEMENT avec le JSON. Pas de texte avant/après, pas de balise de code.`;

const REVIEW_PROMPT = `Tu es relecteur (spec §10 — validation croisée). On te donne la même photo et une première
retranscription JSON. Compare la photo et le JSON élément par élément, puis renvoie le JSON CORRIGÉ (même schéma).

Vérifie particulièrement : chiffres (un par un), virgules décimales, exposants, indices, fractions, racines,
parenthèses, signes (+ − × ÷ = < > ≤ ≥ ≠), nombres négatifs, lettres x/y, unités, résultats, ordre et présence
de TOUS les éléments (titres, repères, annotations de marge, flèches), tableaux (mêmes dimensions et valeurs),
blocs "graphe" (garder seulement ceux réellement dessinés, bonne fenêtre, bonnes courbes/étiquettes).

Procédure silencieuse obligatoire : balaie la page de gauche à droite et de haut en bas, compte les objets
visuels, puis associe chacun à un bloc JSON. Contrôle ensuite chaque caractère du JSON contre l'image. Vérifie
spécifiquement les petits exposants, les signes moins, les virgules, les cases vides, les graduations et les
annotations de marge. Si les deux vues diffèrent, utilise la photo originale pour le contenu et le scan redressé
pour la position et les traits.

Pour chaque fraction manuscrite, effectue un contrôle géométrique distinct : identifie ce qui est au-dessus de
la barre puis ce qui est dessous. Refuse toute transcription qui fait disparaître la barre. Une écriture visuelle
x sur 0,861 doit rester \\\\dfrac{x}{0{,}861}, même si une autre expression proche contient 0,861x.

INTERDIT de recalculer une valeur. Tu ne changes un nombre QUE si tu vois clairement qu'il a été MAL LU.
Si la feuille écrit "4,05" et que le calcul juste donnerait 4,305, tu GARDES "4,05".

Pour chaque élément qui n'est pas lisible avec une certitude totale : mets "incertain": true et remplis "raison".
Mieux vaut un élément signalé incertain qu'une valeur fausse présentée comme sûre (spec §32).

Supprime tout doublon créé par la première transcription : une ligne physique visible ne doit apparaître qu'une
seule fois dans le JSON. Pour une sous-question composée uniquement d'une formule, conserve un seul bloc
"question" avec le repère dans "repere" et la formule LaTeX entourée de $ dans "texte".

Réponds UNIQUEMENT avec le JSON corrigé.`;

const CLEAN_SUFFIX = `

MODE « PROPRE » (mise en forme uniquement — spec §22) :
Le CONTENU reste strictement identique (mêmes nombres, mêmes résultats même faux, mêmes étapes, même ordre).
Tu peux seulement : hiérarchiser proprement titre/sections, séparer clairement les questions, mettre en "display"
les formules qui constituent une étape autonome, écrire les maths proprement (\\\\times, \\\\dfrac, exposants/indices
bien placés, virgule française, "8\\\\,000" pour les milliers, unités en \\\\text{}). N'ajoute aucun titre inventé,
aucune explication, aucune correction.`;

const MODEL = "gpt-4.1-mini";
const REVIEW_MODEL = "gpt-4.1";

// ---------------------------------------------------------------------------
// Schéma de validation de la sortie IA
// ---------------------------------------------------------------------------

const graphSpecSchema = z.object({
  titre: z.string().optional(),
  xlabel: z.string().optional(),
  ylabel: z.string().optional(),
  xmin: z.number().optional(),
  xmax: z.number().optional(),
  ymin: z.number().optional(),
  ymax: z.number().optional(),
  courbes: z
    .array(z.object({
      expr: z.string().optional(),
      label: z.string().optional(),
      couleur: z.string().optional(),
      type: z.enum(["fonction", "droite", "segments", "courbe", "parabole", "nuage"]).optional(),
      points: z.array(z.object({ x: z.number(), y: z.number() })).optional(),
    }))
    .optional()
    .default([]),
  points: z
    .array(z.object({ x: z.number(), y: z.number(), label: z.string().optional() }))
    .optional(),
  legende: z.object({ x: z.number(), y: z.number() }).optional(),
});

const baseFields = {
  confiance: z.coerce.number().min(0).max(1).catch(0.9),
  incertain: z.coerce.boolean().catch(false),
  raison: z.string().optional(),
  original: z.string().optional(),
};

const blockSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("titre"),
    niveau: z.coerce.number().int().min(1).max(3).catch(2),
    texte: z.string(),
    ...baseFields,
  }),
  z.object({ type: z.literal("paragraphe"), texte: z.string(), ...baseFields }),
  z.object({
    type: z.literal("question"),
    repere: z.string().default(""),
    profondeur: z.coerce.number().int().min(0).max(4).catch(0),
    texte: z.string().default(""),
    ...baseFields,
  }),
  z.object({
    type: z.literal("formule"),
    latex: z.string(),
    display: z.coerce.boolean().catch(true),
    ...baseFields,
  }),
  z.object({ type: z.literal("calcul"), latex: z.string(), ...baseFields }),
  z.object({
    type: z.literal("tableau"),
    colonnes: z.array(z.string()).default([]),
    lignes: z.array(z.array(z.string())).default([]),
    ...baseFields,
  }),
  z.object({ type: z.literal("graphe"), graphe: graphSpecSchema, ...baseFields }),
  z.object({
    type: z.literal("annotation"),
    genre: z.enum(["fleche", "coche", "croix", "note", "correction"]).catch("note"),
    texte: z.string().default(""),
    ...baseFields,
  }),
  z.object({ type: z.literal("encadre"), texte: z.string(), ...baseFields }),
]);

const aiPageSchema = z.object({
  titre: z
    .object({
      texte: z.string(),
      confiance: z.coerce.number().min(0).max(1).catch(0.9),
      incertain: z.coerce.boolean().catch(false),
    })
    .nullable()
    .catch(null),
  blocs: z.array(z.unknown()),
});

export type AiBlock = z.infer<typeof blockSchema>;
export type AiPage = {
  titre: { texte: string; confiance: number; incertain: boolean } | null;
  blocs: AiBlock[];
};

// ---------------------------------------------------------------------------
// Appel passerelle
// ---------------------------------------------------------------------------

type ResponsePart =
  { type: "input_text"; text: string } | { type: "input_image"; image_url: string; detail: "high" };

async function askOpenAI(
  apiKey: string,
  content: ResponsePart[],
  model = MODEL,
): Promise<string | null> {
  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: [{ role: "user", content }],
        stream: false,
        store: false,
        temperature: 0,
      }),
    });
  } catch {
    throw new Error("Impossible de joindre l'API OpenAI. Vérifiez la connexion.");
  }

  const payload: unknown = await response.json().catch(() => null);
  const final = readOpenAIResponse(response.status, payload).trim();
  return final.length > 0 ? final : null;
}

/** Extrait le premier objet JSON d'une réponse (tolère les balises de code). */
function extractJson(raw: string): unknown {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence?.[1]) text = fence[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) throw new Error("no-json");
  return JSON.parse(text.slice(start, end + 1));
}

/** Valide + nettoie la sortie IA. Les blocs invalides deviennent un paragraphe incertain. */
function normalizePage(value: unknown): AiPage {
  const page = aiPageSchema.parse(value);
  const blocs: AiBlock[] = [];
  for (const rawBlock of page.blocs) {
    const compatibleBlock = normalizeGraphShape(rawBlock);
    if (
      compatibleBlock &&
      typeof compatibleBlock === "object" &&
      (compatibleBlock as Record<string, unknown>).type === "graphe" &&
      typeof (compatibleBlock as Record<string, unknown>).repere === "string"
    ) {
      const repere = String((compatibleBlock as Record<string, unknown>).repere).trim();
      if (repere && !blocs.some((block) => block.type === "question" && block.repere === repere)) {
        blocs.push({
          type: "question",
          repere,
          profondeur: 1,
          texte: "",
          confiance: graphCommon(compatibleBlock).confiance,
          incertain: false,
        });
      }
    }
    const parsed = blockSchema.safeParse(compatibleBlock);
    if (parsed.success) {
      const block = parsed.data;
      if (block.type === "tableau") {
        const width = block.colonnes.length || (block.lignes[0]?.length ?? 0);
        block.lignes = block.lignes.map((row) => {
          const next = row.slice(0, width);
          while (next.length < width) next.push("");
          return next;
        });
      }
      if (block.incertain && !block.raison) block.raison = "à confirmer";
      blocs.push(normalizeCurrencies(block));
    } else {
      const asText =
        rawBlock && typeof rawBlock === "object"
          ? JSON.stringify(compatibleBlock)
          : String(compatibleBlock ?? "");
      blocs.push({
        type: "paragraphe",
        texte: asText.slice(0, 500),
        confiance: 0.4,
        incertain: true,
        raison: "bloc non reconnu — à reformuler",
        original: asText.slice(0, 500),
      });
    }
  }
  let titre = page.titre;
  if (!titre) {
    const titleIndex = blocs.findIndex((block) => {
      const text = "texte" in block ? block.texte.trim() : "";
      return (
        (block.type === "titre" && block.niveau === 1) ||
        /^(UAA\s*\d+|chapitre\s+\d+)\s*[:—-]/i.test(text)
      );
    });
    if (titleIndex >= 0) {
      const candidate = blocs[titleIndex]!;
      const text = "texte" in candidate ? candidate.texte.trim() : "";
      if (text) {
        titre = {
          texte: text,
          confiance: candidate.confiance,
          incertain: candidate.incertain,
        };
        blocs.splice(titleIndex, 1);
      }
    }
  }

  for (let index = 0; index < blocs.length; index += 1) {
    const block = blocs[index]!;
    if (
      block.type !== "paragraphe" ||
      !/^(Exploration|Activité|Exercice)\s+\d+\s*:/i.test(block.texte)
    ) {
      continue;
    }
    blocs[index] = {
      ...block,
      type: "titre",
      niveau: 2,
      texte: block.texte,
    };
  }

  return { titre, blocs };
}

/** Accepte aussi les variantes naturelles parfois produites par le modèle. */
function normalizeGraphShape(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const raw = value as Record<string, unknown>;
  if (raw.type !== "graphe" || (raw.graphe && typeof raw.graphe === "object")) return value;
  const axes = objectValue(raw.axes);
  const xAxis = objectValue(axes.x ?? raw.axeX);
  const yAxis = objectValue(axes.y ?? raw.axeY);
  const xTicks = numberArray(xAxis.graduations ?? xAxis.valeurs);
  const yTicks = numberArray(yAxis.graduations ?? yAxis.valeurs);
  const sourceCurves = Array.isArray(raw.courbes) ? raw.courbes : Array.isArray(raw.traces) ? raw.traces : [];
  const courbes = sourceCurves.map((item, index) => {
    const curve = objectValue(item);
    const points = normalizeGraphPoints(curve.points ?? curve.coordonnees);
    const rawType = String(curve.type ?? curve.forme ?? "").toLowerCase();
    const type = rawType.includes("parab") ? "parabole"
      : rawType.includes("nuage") || rawType.includes("point") ? "nuage"
      : rawType.includes("segment") || rawType.includes("polyl") ? "segments"
      : rawType.includes("courbe") || rawType.includes("liss") ? "courbe"
      : rawType.includes("droit") ? "droite"
      : points.length >= 2 && !curve.expr && !curve.equation ? "segments"
      : "fonction";
    const expr = graphExpression(curve.expr ?? curve.equation ?? curve.formule);
    return {
      ...(expr ? { expr } : {}),
      label: String(curve.label ?? curve.legende ?? curve.nom ?? `Courbe ${index + 1}`),
      couleur: graphColor(curve.couleur ?? curve.color, index),
      type,
      ...(points.length ? { points } : {}),
    };
  });
  const graph = {
    titre: stringValue(raw.titre),
    xlabel: stringValue(raw.xlabel ?? xAxis.nom ?? xAxis.label),
    ylabel: stringValue(raw.ylabel ?? yAxis.nom ?? yAxis.label),
    xmin: finiteValue(raw.xmin, xTicks.length ? Math.min(...xTicks) : 0),
    xmax: finiteValue(raw.xmax, xTicks.length ? Math.max(...xTicks) : 10),
    ymin: finiteValue(raw.ymin, yTicks.length ? Math.min(...yTicks) : 0),
    ymax: finiteValue(raw.ymax, yTicks.length ? Math.max(...yTicks) : 10),
    courbes,
    points: normalizeGraphPoints(raw.points),
  };
  return { ...raw, ...graphCommon(raw), type: "graphe", graphe: graph };
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function numberArray(value: unknown): number[] {
  return Array.isArray(value) ? value.map(Number).filter(Number.isFinite) : [];
}
function normalizeGraphPoints(value: unknown): Array<{ x: number; y: number; label?: string }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (Array.isArray(item) && item.length >= 2 && Number.isFinite(Number(item[0])) && Number.isFinite(Number(item[1]))) return [{ x: Number(item[0]), y: Number(item[1]) }];
    const point = objectValue(item);
    if (!Number.isFinite(Number(point.x)) || !Number.isFinite(Number(point.y))) return [];
    return [{ x: Number(point.x), y: Number(point.y), ...(point.label ? { label: String(point.label) } : {}) }];
  });
}
function graphExpression(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  return value.trim().replace(/^\s*[a-z]\s*=/i, "").replace(/(\d),(\d)/g, "$1.$2").replace(/\\cdot|×/g, "*");
}
function graphColor(value: unknown, index: number): string {
  const colors: Record<string, string> = { bleu: "#1f77b4", rouge: "#d62728", vert: "#2ca02c", orange: "#ff7f0e", noir: "#111111" };
  const raw = typeof value === "string" ? value.toLowerCase() : "";
  return /^#[0-9a-f]{6}$/i.test(raw) ? raw : colors[raw] ?? ["#1f77b4", "#d62728", "#2ca02c", "#ff7f0e"][index % 4]!;
}
function finiteValue(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
function graphCommon(value: unknown): { confiance: number; incertain: boolean; raison?: string; original?: string } {
  const raw = objectValue(value);
  return {
    confiance: Number.isFinite(Number(raw.confiance)) ? Math.max(0, Math.min(1, Number(raw.confiance))) : 0.8,
    incertain: Boolean(raw.incertain),
    ...(raw.raison ? { raison: String(raw.raison) } : {}),
    ...(raw.original ? { original: String(raw.original) } : {}),
  };
}

function currencyText(value: string): string {
  return value
    .replace(/(\d(?:[\d\s.,]*\d)?)\s*euros?\b/gi, "$1 €")
    .replace(/(\d(?:[\d\s.,]*\d)?)\s*dollars?\b/gi, "$1 $");
}

function normalizeCurrencies(block: AiBlock): AiBlock {
  const common = {
    ...block,
    original: block.original ? currencyText(block.original) : block.original,
  };
  switch (block.type) {
    case "titre":
    case "paragraphe":
    case "encadre":
    case "annotation":
      return { ...common, texte: currencyText(block.texte) } as AiBlock;
    case "question":
      return { ...common, texte: currencyText(block.texte) } as AiBlock;
    case "tableau":
      return {
        ...common,
        colonnes: block.colonnes.map(currencyText),
        lignes: block.lignes.map((row) => row.map(currencyText)),
      } as AiBlock;
    default:
      return common as AiBlock;
  }
}

function needsGraphRecovery(page: AiPage): boolean {
  if (page.blocs.some((block) => block.type === "graphe")) return false;
  const text = page.blocs
    .map((block) =>
      "texte" in block ? block.texte : "original" in block ? (block.original ?? "") : "",
    )
    .join(" ");
  return /\b(graphique|courbe|droite|repère|representation graphique|représentation graphique)\b/i.test(
    text,
  );
}

export const transcribePage = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        imageDataUrl: z.string().min(32).max(12_000_000),
        sourceImageDataUrl: z.string().min(32).max(12_000_000).optional(),
        style: z.enum(["fidele", "propre"]).default("fidele"),
      })
      .parse(data),
  )
  .handler(async ({ data }): Promise<{ page: AiPage; reviewed: boolean }> => {
    const apiKey = process.env["OPENAI_API_KEY"];
    if (!apiKey) {
      throw new Error(
        "OPENAI_API_KEY est absente du fichier .env. Ajoutez-la puis redémarrez le site.",
      );
    }

    const scanImage: ResponsePart = {
      type: "input_image",
      image_url: data.imageDataUrl,
      detail: "high",
    };
    const originalImage: ResponsePart | null = data.sourceImageDataUrl
      ? { type: "input_image", image_url: data.sourceImageDataUrl, detail: "high" }
      : null;
    const imageContent: ResponsePart[] = originalImage
      ? [
          { type: "input_text", text: "PHOTO ORIGINALE :" },
          originalImage,
          { type: "input_text", text: "SCAN REDRESSÉ DE LA MÊME PAGE :" },
          scanImage,
        ]
      : [scanImage];
    const prompt =
      data.style === "propre" ? `${TRANSCRIPTION_PROMPT}${CLEAN_SUFFIX}` : TRANSCRIPTION_PROMPT;

    const draftRaw = await askOpenAI(apiKey, [
      { type: "input_text", text: prompt },
      ...imageContent,
    ]);
    if (!draftRaw) {
      throw new Error("La retranscription est revenue vide. Reprenez la photo si elle est floue.");
    }

    let draft: AiPage;
    try {
      draft = normalizePage(extractJson(draftRaw));
    } catch {
      // Dernier recours : on garde le texte brut comme un unique paragraphe incertain.
      return {
        page: {
          titre: null,
          blocs: [
            {
              type: "paragraphe",
              texte: draftRaw.slice(0, 4000),
              confiance: 0.3,
              incertain: true,
              raison: "structuration impossible — vérifier toute la page",
              original: draftRaw.slice(0, 4000),
            },
          ],
        },
        reviewed: false,
      };
    }

    // Deuxième passage : relecture de son propre JSON face à la photo.
    let reviewed = false;
    try {
      const reviewRaw = await askOpenAI(
        apiKey,
        [
          {
            type: "input_text",
            text: `${REVIEW_PROMPT}\n\n--- PREMIÈRE RETRANSCRIPTION (JSON) ---\n${JSON.stringify(draft)}`,
          },
          ...imageContent,
        ],
        REVIEW_MODEL,
      );
      if (reviewRaw) {
        draft = normalizePage(extractJson(reviewRaw));
        reviewed = true;
      }
    } catch {
      reviewed = false;
    }

    // Rattrapage ciblé : un énoncé annonce un graphique, mais aucun bloc n'a été produit.
    if (needsGraphRecovery(draft)) {
      try {
        const recoveredRaw = await askOpenAI(
          apiKey,
          [
            {
              type: "input_text",
              text:
                `${REVIEW_PROMPT}\n\nLe JSON ci-dessous mentionne une représentation graphique mais ne contient ` +
                `aucun bloc graphe. Examine particulièrement la zone sous l'énoncé et les tableaux. Renvoie le ` +
                `DOCUMENT COMPLET sans doublon, avec le bloc graphe à sa position exacte. Utilise les équations ` +
                `visibles pour ses courbes et les graduations visibles pour sa fenêtre. Les équations servant de ` +
                `légende restent uniquement dans graphe.courbes[].label : n'ajoute aucune ligne de formule autour ` +
                `du graphique et ne dégrade aucun titre déjà présent.\n\n${JSON.stringify(draft)}`,
            },
            ...imageContent,
          ],
          REVIEW_MODEL,
        );
        if (recoveredRaw) draft = normalizePage(extractJson(recoveredRaw));
      } catch {
        // La transcription reste disponible et le texte concerné demeure vérifiable par l'utilisateur.
      }
    }

    return { page: draft, reviewed };
  });
