# Feuille de route — Digital Math

## Fait

- [x] Scan IA : rendu « scanner d'imprimante » (fond blanc, feuille redressée) + export bloqué pendant le traitement.
- [x] Pipeline structuré photo → document numérique (spec §27) :
      `scan → OCR/vision → JSON structuré (2 passages) → structure.ts → doc-model → render partagé → PDF`.
- [x] Modèle de données typé : `Document / Section(titre) / Question / Formula / Table / Graph / Annotation / UncertainElement`
      avec contenu, ordre d'origine, confiance et marqueur d'incertitude éditable (`src/lib/doc-model.ts`).
- [x] OCR mathématique en JSON (`transcription.functions.ts`) : blocs typés, LaTeX, nombres FR, `incertain`+`raison`,
      relecture croisée indépendante face à la photo (spec §5, §6, §10, §28).
- [x] Rendu unique partagé aperçu ⇄ PDF (`render-doc.ts`) → l'aperçu est exactement le PDF (spec §23).
- [x] Interface de vérification 3 zones ORIGINAL │ RETRANSCRIPTION │ PDF FINAL, responsive (onglets sur mobile),
      éléments incertains cliquables + éditeur par bloc (`VerificationView.tsx`, `BlockEditor.tsx`, spec §11, §24).
- [x] Contrôle final automatique bloquant + « ⚠️ N éléments à vérifier » avant export (`validation.ts`, `ChecklistPanel.tsx`, spec §20, §21).
- [x] Progression nommée en 6 étapes (`ProgressSteps.tsx`, spec §25).
- [x] Mise en page A4 : pagination bloc par bloc (rien de coupé), titres/questions non orphelins,
      pied de page discret « Digital Math · Page X / Y » (`pdf.ts`, spec §12–§19).
- [x] Graphes vectoriels reconstruits, moteur de tracé partagé aperçu/PDF (`graph-draw.ts`, spec §7).
- [x] Deux modes Fidèle / Propre — le mode Propre ne change jamais le contenu (spec §22).
- [x] Multi-pages : import multiple, réordonnancement, un seul PDF (spec §30).

## À suivre

- [ ] Détection guidée des graphes manuscrits (axes / graduations / points) plutôt que reconstruction à l'estime.
- [ ] Édition visuelle des graphes (glisser un point, changer la fenêtre) au lieu du JSON brut.
- [ ] Recadrage du graphe d'origine (`apercuSource`) affiché en regard de la reconstruction.
- [ ] Persistance locale du document en cours (reprise après rechargement).
- [ ] Réordonnancement des blocs par glisser-déposer.
