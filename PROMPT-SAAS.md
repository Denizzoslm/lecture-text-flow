# PROMPT DE CONSTRUCTION — Digital Math (plateforme enseignants, multi-matières, multi-langues)

> À coller dans Lovable (ou à donner à un agent de code). Le projet actuel contient déjà le **cœur** décrit
> en §A (pipeline photo → document mathématique numérique → PDF). Ce prompt le transforme en **produit SaaS
> pour un établissement** : comptes enseignants, onboarding matière + langue, bibliothèque, et adaptation
> automatique du moteur à la matière et à la langue de chaque prof.
>
> Objectif de qualité : **le meilleur outil possible** sur ce besoin. Code de niveau production, design de
> niveau studio. Deux règles priment toujours : **FIDÉLITÉ > ESTHÉTIQUE** et **PRÉCISION > AUTOMATISATION**.
> On ne devine jamais : ce qui est douteux est signalé `[À VÉRIFIER]`, pas inventé.

---

## 0. STACK & PRINCIPES

- **Front** : React + TypeScript strict, Vite, Tailwind, shadcn/ui, TanStack Router/Query.
- **Back** : Supabase — Auth (email + lien magique + Google), Postgres, Storage (photos + PDF), Edge Functions
  pour les appels IA (aucune clé exposée au client).
- **IA** : un modèle de vision pour l'OCR + compréhension (transcription en **JSON structuré**, jamais du texte
  brut), un modèle d'image pour le rendu « scanner ». Tous les appels passent par une Edge Function.
- **i18n** : toute l'interface traduite (FR, EN, ES, DE, IT, PT, NL, AR au minimum). L'arabe déclenche la
  mise en page RTL. La langue de l'UI et la langue des **documents produits** sont deux réglages distincts.
- **Architecture** : séparer nettement `preprocessing image` / `vision+OCR` / `parsing mathématique` /
  `structuration` / `validation` / `rendu` / `génération PDF`. Aucune logique fourre-tout dans un composant.
- **Qualité** : TypeScript strict, aucun `any`, `tsc` et `eslint` sans erreur, composants testés sur mobile,
  états de chargement toujours nommés, jamais d'écran vide.

---

## A. CŒUR MÉTIER (déjà en place — à conserver et fiabiliser)

Reprendre intégralement les 32 règles de la spec « Digital Math » (fichier de référence du projet). En résumé
non négociable :

1. **Fidélité absolue.** Ne jamais inventer, compléter, résoudre, corriger une erreur, simplifier, changer une
   valeur, supprimer une ligne ou une annotation, ni réorganiser. Recopier même ce qui est faux.
2. **Incertitude explicite.** Élément illisible → `[À VÉRIFIER]` + raison, on garde la lecture brute. L'utilisateur
   corrige ensuite.
3. **Pipeline** : photo → prétraitement → détection de page → redressement/perspective → segmentation → OCR/vision
   → compréhension → structuration → validation automatique → génération du document → révision visuelle → export PDF.
4. **Prétraitement** non destructif : contours de la feuille, fond blanchi, perspective corrigée, bruit réduit,
   détails de l'écriture préservés. `4³` ne devient jamais `43`, `0,85` jamais `085`.
5. **Structure détectée** : titre, sous-titre, exercice, question, sous-question, texte, formule, calcul, résultat,
   tableau, graphique, annotation, flèche, encadré, commentaire, unité — hiérarchie conservée.
6. **OCR spécialisé** : + − × ÷ = < > ≤ ≥ ≠ % √ π ∞ ∑ ∫, fractions, puissances, indices, parenthèses, crochets,
   accolades, fonctions, vecteurs, coordonnées, unités, lettres grecques → représentation structurée en **LaTeX**.
7. **Nombres & unités** : conserver exactement. Conventions locales respectées (voir §C). Ne jamais convertir
   `0,85 → 0.85` sans demande explicite.
8. **Graphiques** = objets mathématiques : détecter axes, origine, graduations, valeurs, labels, points, courbes,
   flèches, équation → reconstruire en **vectoriel**. Jamais de courbe ou de valeur inventée ; si incertain, garder
   la photo comme référence et signaler.
9. **Tableaux** reconstruits en vraies lignes/colonnes, cellules éditables.
10. **Annotations** manuscrites conservées (→ ✓ ? ! « attention » « faux » « à revoir ») ; illisible → `[ANNOTATION À VÉRIFIER]`.
11. **Validation croisée** : après la 1ʳᵉ retranscription, 2ᵉ passage indépendant qui compare photo ⇄ retranscription
    (chiffres, puissances, indices, signes, parenthèses, fractions, virgules, unités, résultats). Les éléments
    suspects entrent dans une liste « Éléments à vérifier », cliquable et éditable.
12. **Interface de vérification en 3 zones** : `ORIGINAL │ RETRANSCRIPTION (éditable) │ PDF FINAL`. Éléments
    incertains repérables d'un coup d'œil. Boutons : Modifier, Valider, Générer le PDF. Responsive : sur téléphone,
    les 3 zones s'empilent (Photo ↓ Retranscription ↓ PDF).
13. **Mise en page** : A4 portrait, marges ~20 mm, police type Inter/Noto Sans, hiérarchie de tailles définie,
    mise en page **intelligente** (question jamais séparée de son calcul, pas de titre seul en bas de page, pas de
    paragraphe coupé, pas de page presque vide).
14. **Pagination** : ne jamais couper une formule, un graphique, un tableau, une question importante ; grands
    graphiques redimensionnés proportionnellement, jamais déformés.
15. **PDF** : A4, haute résolution, texte sélectionnable et recherchable, équations et graphiques nets au zoom,
    polices incorporées, pied de page discret `Digital Math · Page X / Y`.
16. **En-tête** : garder le titre lu sur la feuille ; s'il n'y en a pas, ne pas en inventer. Logo établissement
    optionnel, désactivé par défaut dans le document final.
17. **Deux modes** : `Fidèle` (structure d'origine au plus près) et `Propre` (même contenu exact, mise en page
    améliorée). Le mode Propre ne modifie jamais le contenu.
18. **Contrôle final automatique** avant téléchargement (checklist complète de la spec §20). Si un point dur
    échoue : pas de PDF silencieux → « ⚠️ N éléments nécessitent votre vérification ».
19. **Score de confiance** interne par élément ; à l'utilisateur on montre seulement `✓ Vérifié` ou `⚠️ À vérifier`.
20. **Aperçu = export** : l'aperçu affiché EST le PDF exporté (même moteur de rendu).
21. **Multi-pages** : importer plusieurs photos, l'IA les analyse, détermine l'ordre, l'utilisateur réordonne,
    un seul PDF en sortie.
22. **Cas difficiles** à gérer : mauvaise lumière, photo inclinée, écriture minuscule ou difficile, plusieurs
    couleurs de stylo, feuille quadrillée/blanche, calculs barrés, corrections, fractions manuscrites, racines,
    mélange texte + mathématiques.

---

## B. COMPTES & ONBOARDING (nouveau)

### Authentification
- Écran d'accueil public : proposition de valeur, capture d'écran, CTA « Créer un compte enseignant » / « Se connecter ».
- Méthodes : e-mail + mot de passe, **lien magique**, Google. Vérification e-mail. Réinitialisation de mot de passe.
- Après connexion : si l'onboarding n'est pas complété → redirection vers l'onboarding. Sinon → tableau de bord.

### Onboarding en 3 étapes (barre de progression, chaque étape enregistrée immédiatement)

**Étape 1 — Identité**
- Nom, prénom.
- Établissement (texte libre) + pays (sélecteur) + ville (optionnel).
- Rôle : enseignant / professeur documentaliste / autre.

**Étape 2 — Enseignement**
- **Matières enseignées** (multi-sélection, au moins une) : Mathématiques, Physique-Chimie, SVT, NSI,
  Sciences de l'ingénieur, Technologie, Économie-Gestion / SES, Français, Histoire-Géographie, Langues,
  Philosophie, Arts, EPS (théorie), Autre (champ libre).
- **Niveaux** (multi-sélection) : Primaire, Collège (6e→3e), Lycée (2de→Terminale), CPGE / Prépa, Supérieur,
  Formation pro. Adapter les libellés au pays choisi si connu (ex. « Secondaire 1/2 » en Suisse).
- Matière **principale** (radio) parmi les matières cochées → sert de préréglage par défaut à chaque nouveau document.

**Étape 3 — Langues & conventions**
- **Langue de l'interface** (par défaut : langue du navigateur).
- **Langue des documents produits** (par défaut : identique à l'interface) — la retranscription, les titres
  générés, les mentions « à vérifier », les légendes seront dans cette langue.
- **Conventions d'écriture** : séparateur décimal (`,` ou `.`), séparateur de milliers (espace fine / virgule /
  point / aucun), notation des intervalles (`]a ; b[` / `(a, b)`), unité monétaire. Valeurs préremplies selon
  le pays ; **ces réglages décrivent l'attendu, ils ne servent jamais à convertir automatiquement ce qui est
  écrit sur une feuille**.

### Profil modifiable
Un écran « Préférences » regroupe tout l'onboarding + : logo de l'établissement (upload, utilisé seulement si
l'enseignant l'active sur un document), pied de page personnalisé, thème clair/sombre, suppression du compte
(RGPD, purge des données et du Storage).

---

## C. ADAPTATION AUTOMATIQUE À LA MATIÈRE ET À LA LANGUE (nouveau, décisif)

Le moteur d'extraction n'est pas générique : il se **spécialise** selon la matière et la langue choisies pour
le document. Concrètement, l'Edge Function d'OCR reçoit `{ subject, level, outputLanguage, conventions }` et
compose un **prompt système spécialisé** :

- **Langue de sortie** : tout le texte reconstruit (énoncés, titres, annotations, raisons d'incertitude) est
  produit dans `outputLanguage`. La reconnaissance fonctionne quelle que soit la langue manuscrite ; seule la
  restitution est traduite si la feuille est déjà dans cette langue on n'y touche pas. **Aucune traduction du
  contenu mathématique/scientifique**, seulement de la langue naturelle, et jamais de reformulation.
- **Conventions locales** : respecter EXACTEMENT ce qui est écrit sur la feuille (virgule ou point, notation des
  intervalles, symboles). Les réglages `conventions` ne servent qu'au rendu des éléments **générés par l'outil**
  (numéros de page, libellés) et à lever une ambiguïté de lecture, jamais à corriger la feuille.
- **Profils de matière** (bloc de règles injecté dans le prompt) :
  - **Mathématiques** : LaTeX complet, `\dfrac`, exposants/indices, vecteurs `\vec{}`, ensembles, intervalles,
    repères et fonctions. Graphiques = courbes + repère.
  - **Physique-Chimie** : équations-bilan (`\rightarrow`, états `(s)(l)(g)(aq)`), grandeurs et **unités SI**,
    puissances de 10, **chiffres significatifs** conservés à l'identique, schémas de montage → objet
    `schema` légendé, tableaux de mesures.
  - **SVT** : schémas biologiques légendés (flèches + étiquettes → objet `schema`), tableaux, cycles, coupes.
  - **NSI / informatique** : blocs de **code** (langage détecté, indentation préservée, jamais « corrigé »),
    pseudo-code, tables de vérité, arbres, complexité.
  - **Sciences de l'ingénieur / Techno** : schémas blocs, chaînes d'énergie/information, cotes.
  - **SES / Éco-Gestion** : tableaux statistiques, pourcentages, taux de variation, indices, graphiques
    (barres, courbes) — valeurs conservées à la décimale près.
  - **Français / HG / Philo / Langues** : structure (titres, paragraphes, citations en `>` , annotations de
    marge), pas de sur-formalisation ; citations recopiées à l'identique, sans correction.
  - **Autre** : profil neutre = texte + tableaux + annotations + schémas génériques.
- Le **modèle de données de bloc** est étendu pour couvrir toutes les matières : ajouter les types
  `code` (langage, contenu), `schema` (image recadrée + liste de labels positionnés + flèches),
  `equation_chimie`, `citation`. Le rendu et le PDF gèrent ces types. Tout bloc garde
  `contenu / position d'origine / type / ordre / confiance / représentation numérique`.

---

## D. BIBLIOTHÈQUE & ORGANISATION (nouveau)

- **Tableau de bord** : documents récents, raccourci « Nouveau document », statistiques légères (nombre de
  documents, pages traitées).
- **Classes** : l'enseignant crée ses classes (nom, niveau, matière). Un document appartient à 0 ou 1 classe.
- **Dossiers** libres (ex. « Chapitre 3 — Exponentielle »), imbriquables une fois.
- **Document** = { titre, matière, langue, classe?, dossier?, photos sources (Storage), pages, blocs structurés,
  historique de versions, PDF généré }. États : brouillon / à vérifier / validé.
- **Liste** : vignette, titre, matière (pastille couleur), classe, date, statut. Recherche plein texte,
  filtres (matière, classe, statut, période), tri.
- **Actions document** : ouvrir dans l'espace de travail, dupliquer, déplacer, renommer, supprimer,
  **partager un lien en lecture seule** (page publique minimale affichant le PDF, révocable), exporter le PDF.
- **Corbeille** 30 jours avant purge définitive.

---

## E. ESPACE DE TRAVAIL

Reprendre l'interface 3 zones (§A.12) enrichie :
- Barre supérieure : titre du document (éditable), matière + langue (héritées du profil, modifiables par
  document), classe/dossier, mode `Fidèle`/`Propre`, bouton `Exporter en PDF` (bloqué tant que le contrôle
  final n'est pas au vert ou les incertitudes non confirmées).
- **Zone ORIGINAL** : photos, zoom, réordonnancement, ajout/suppression de page, ré-cadrage manuel, rendu
  « scanner » IA par page.
- **Zone RETRANSCRIPTION** : liste des blocs, éléments incertains surlignés + panneau « À vérifier » cliquable,
  éditeur par bloc selon son type (texte, LaTeX avec aperçu KaTeX en direct, cellules de tableau, JSON/édition
  visuelle de graphe, code, labels de schéma), boutons Monter/Descendre/Supprimer/`Marquer vérifié`.
- **Zone PDF FINAL** : rendu paginé réel (même moteur que l'export), se met à jour à chaque modification,
  panneau « Contrôle final » (checklist) + case « J'ai vérifié les éléments signalés ».
- **Progression** pendant le traitement, 6 étapes nommées : Analyse de la photo · Détection du contenu ·
  Lecture (matière) · Vérification croisée · Mise en page · Génération du PDF.

---

## F. MODÈLE DE DONNÉES (Supabase, avec RLS stricte)

Tables (au minimum) :
- `profiles` (id = auth.uid, nom, prénom, établissement, pays, ville, rôle, ui_language, doc_language,
  conventions jsonb, logo_url, footer, theme, onboarding_done bool)
- `teacher_subjects` (profile_id, subject, is_primary)
- `teacher_levels` (profile_id, level)
- `classes` (id, profile_id, nom, niveau, subject, couleur)
- `folders` (id, profile_id, nom, parent_id nullable)
- `documents` (id, profile_id, class_id nullable, folder_id nullable, titre, subject, doc_language,
  mode, status, cover_url, created_at, updated_at, deleted_at nullable)
- `document_pages` (id, document_id, ordre, source_path, scanned_path, quad jsonb)
- `document_versions` (id, document_id, created_at, blocks jsonb)  ← les blocs structurés versionnés
- `document_shares` (id, document_id, token, revoked bool, created_at)
- `exports` (id, document_id, pdf_path, created_at)

**RLS** : chaque enseignant n'accède qu'aux lignes où `profile_id = auth.uid()` (et cascade via `document_id`).
Le partage public ne lit que via `document_shares.token` non révoqué, en lecture seule, sans exposer les autres
colonnes sensibles. Storage : buckets `sources` et `exports` privés, accès signé par l'utilisateur propriétaire.

---

## G. DESIGN — DIRECTION ARTISTIQUE (niveau studio)

Objectif : un **outil de professionnel**, calme, dense en information mais aéré. **Pas** de SaaS générique
(dégradés violets, grosses cartes flottantes, ombres lourdes, emojis partout, tout en majuscules).

- **Ton** : éditorial, précis, « atelier ». Le contenu mathématique passe toujours au premier plan.
- **Typo** : une serif de titrage discrète (ex. Fraunces / Source Serif), une sans-serif d'interface très
  lisible (Inter / Geist), une monospace pour les métadonnées (numéros, statuts, LaTeX brut).
- **Couleur** : base neutre chaude (papier / encre), **une** couleur d'action (rouge brique ou bleu encre),
  vert sauge pour « validé », ambre pour « à vérifier », rouge pour « bloquant ». Pastilles de matière
  discrètes. Contraste AA garanti, mode clair **et** sombre.
- **Layout** : grille stricte, espacements sur une échelle cohérente, densité maîtrisée. Panneaux
  redimensionnables dans l'espace de travail. Sur mobile, tout s'empile, cibles tactiles ≥ 44 px.
- **Le document produit** doit donner l'impression d'avoir été créé dans un logiciel professionnel de
  traitement de texte mathématique : marges nettes, hiérarchie claire, formules centrées quand elles sont
  autonomes, tableaux alignés, graphiques vectoriels propres, pied de page discret.
- **Micro-détails** : états de focus visibles, transitions courtes (120–180 ms), squelettes de chargement,
  messages d'erreur exploitables, `aria-live` sur les zones qui se mettent à jour, RTL complet pour l'arabe.
- **Accessibilité** : navigation clavier intégrale, rôles ARIA, respect de `prefers-reduced-motion`,
  taille de police confortable par défaut.

---

## H. NON NÉGOCIABLES / À NE PAS FAIRE

- Ne jamais « améliorer » un contenu : pas de correction d'orthographe, de calcul, de résultat, de formule.
- Ne jamais produire une formule en texte brut si sa structure est identifiable → LaTeX.
- Ne jamais couper une formule / un tableau / un graphique / une question entre deux pages.
- Ne jamais afficher un aperçu différent du PDF final.
- Ne jamais exporter un PDF quand le contrôle final échoue, sans avertissement explicite.
- Ne jamais convertir une convention locale (`,`↔`.`, notation d'intervalle…) sans demande explicite.
- Ne jamais exposer une clé d'API au client ; tout appel IA via Edge Function.
- Ne jamais laisser l'utilisateur devant un écran vide : progression nommée à chaque étape.
- En cas de doute entre deux lectures : **ne pas deviner**, marquer `[À VÉRIFIER]`.

---

## I. PLAN DE CONSTRUCTION (par phases, dans cet ordre)

1. **Fondations** : Auth Supabase (email + magique + Google), schéma DB + RLS, i18n (FR/EN d'abord), thème
   clair/sombre, layout applicatif (accueil public, tableau de bord vide, préférences).
2. **Onboarding** 3 étapes + écran Préférences, persistance immédiate, garde de route.
3. **Nouveau document** : upload/caméra multi-photos → Storage, prétraitement client (redressement, filtre
   document), rendu « scanner » IA par page, réordonnancement.
4. **Moteur d'extraction** : Edge Function OCR → **JSON structuré** spécialisé `{subject, level, outputLanguage,
   conventions}`, double passage (transcription + relecture croisée), modèle de blocs étendu (maths + code +
   schéma + chimie + citation), scores de confiance et incertitudes.
5. **Espace de travail 3 zones** : rendu partagé aperçu/PDF, éditeur par type de bloc, panneau « À vérifier »,
   contrôle final bloquant, modes Fidèle/Propre.
6. **PDF** : pagination intelligente A4, en-tête (titre lu, logo optionnel), pied `Digital Math · Page X/Y`,
   texte sélectionnable, formules/graphes nets, aperçu == export.
7. **Bibliothèque** : classes, dossiers, liste + recherche + filtres, dupliquer/déplacer/supprimer, corbeille.
8. **Partage** en lecture seule (lien révocable) + page publique minimale.
9. **Polish** : i18n complet (ES/DE/IT/PT/NL/AR + RTL), accessibilité AA, perfs, vides et erreurs soignés,
   suppression de compte RGPD.

Livrer chaque phase fonctionnelle et testée avant de passer à la suivante. TypeScript strict, `tsc` + `eslint`
au vert en permanence.

---

### Paramètres à ajuster avant de lancer (valeurs par défaut proposées)
- Matières prioritaires au lancement : **Mathématiques + Physique-Chimie** (les autres profils branchés mais
  moins peaufinés).
- Langues au lancement : **FR, EN** (les autres ajoutées en phase 9).
- Fournisseurs d'auth : e-mail + lien magique + Google.
- Offre : usage individuel enseignant, pas de facturation dans cette version (prévoir la place pour des
  « espaces établissement » plus tard).
