# Math Notes Digitizer

Crée une application web appelée "Cahier numérique" : un outil qui permet à une prof de maths de photographier ses pages de cours et de les faire retranscrire automatiquement en PDF structuré (texte + formules mathématiques).

FONCTIONNALITÉS

1. Écran principal avec :

   - Un champ "Titre du cours" et un champ "Classe / date" (optionnel)

   - Un bouton "Prendre une photo" (ouvre l'appareil photo sur mobile)

   - Un bouton "Importer depuis la galerie" (sélection multiple de photos existantes)

   - Une liste des photos ajoutées, dans l'ordre, avec pour chacune : miniature, "Page N", boutons monter/descendre/supprimer

2. Toutes les photos importées doivent être reconverties en JPEG côté client (via canvas) avant tout traitement, pour uniformiser le format et réduire la taille (max 1600px sur le plus grand côté).

3. Bouton "Retranscrire les photos" : envoie chaque photo à l'API Claude (endpoint /v1/messages, modèle claude-sonnet-4-6, image en base64) avec ce prompt système :

"Tu vois la photo d'une page de cours de mathématiques (tableau ou cahier, écriture manuscrite ou imprimée). Retranscris fidèlement son contenu en Markdown structuré, en français :

- Utilise '# ' uniquement si un titre principal de cours est visible.

- Utilise '## ' pour les titres de section, '### ' pour les sous-parties.

- Utilise des listes pour les énoncés d'exercices ou énumérations.

- Écris TOUTES les formules en LaTeX : $...$ en ligne, $$...$$ pour une formule isolée.

- Aucun commentaire ni explication, uniquement le contenu retranscrit.

- Si un mot est illisible, écris [illisible]."

4. Chaque page traitée s'affiche dans une carte avec : statut (en attente / en cours / terminé / erreur), un champ texte modifiable contenant le Markdown, et un aperçu rendu en direct (Markdown + LaTeX via KaTeX).

5. Bouton "Télécharger le PDF" : assemble toutes les pages (titre du document en en-tête, puis chaque page dans l'ordre) en un document structuré, rendu avec KaTeX pour les formules, puis exporté en PDF (via html2pdf.js ou équivalent), au format A4.

DESIGN

Ambiance "cahier d'école français" : fond façon papier quadrillé (grille discrète), carte blanche avec une fine bordure gauche colorée façon marge de cahier. Palette : fond vert pâle/gris clair, encre bleu-marine foncé pour le texte, rouge brique pour les actions principales et accents, vert sauge pour les statuts "terminé". Typographie : une serif academique pour les titres (ex. Fraunces), une sans-serif pour l'interface (ex. Inter), une monospace discrète pour les métadonnées (numéros de page, statuts). Éviter tout style SaaS générique (cartes toutes identiques, dégradés, labels en majuscules partout).

CONTRAINTES TECHNIQUES

- Toutes les données (photos, transcriptions) restent en mémoire côté client, pas de stockage persistant nécessaire pour la V1.

- L'appel à l'API Claude doit gérer les erreurs proprement et afficher un message clair sur la carte de la page concernée en cas d'échec.

- Interface mobile-first, utilisable au téléphone en conditions réelles (prise de photo pendant le cours).

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://lecture-text-flow.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/9ce1a919-28fc-4916-aeb5-5d646f76d198).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
