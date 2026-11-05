# Changelog

Tous les changements notables de l'extension **vscode-rhai-support** sont documentés ici.

## [2026.4.4] - 2026-11-05

### 🔄 Changements

- CI : le script de test utilise `node --test "test/*.test.js"` et fonctionne donc sur Node 22 comme sur Node 26 ; les actions GitHub sont passées à leurs versions majeures courantes (checkout@v7, setup-node@v7, upload-artifact@v7, action-gh-release@v3)
- CI : `ovsx` est désormais une devDependency, le workflow de release ne le télécharge plus à la volée

---

## [2026.4.3] - 2026-11-05

### 🐛 Corrections

- Le lexer avalait l'opérateur de plage : `0..n` était lu comme le nombre `0.` suivi de `.n`, donc chaque plage perdait son opérateur et le membre de droite devenait un accès de propriété. `for i in 0..n` est désormais parsé comme une plage, et une variable utilisée uniquement dans une plage n'est plus signalée comme inutilisée.

---

## [2026.4.2] - 2026-11-04

### 🐛 Corrections

- Les diagnostics étaient calculés sur **tous** les documents : un fichier `.json`, `.md` ou `.ts` était analysé comme du Rhai et rempli d'erreurs de syntaxe. Seuls les documents de langage `rhai` (ou d'extension `.rhai`) sont désormais analysés.

---

## [2026.4.1] - 2026-11-04

### ✨ Ajouts

- **Diagnostics** : erreurs de syntaxe (chaîne non terminée, délimiteurs non appariés, `import` sans alias), avertissements (import / constante / variable inutilisés, code inatteignable), informations (bloc vide, marqueurs `TODO`/`FIXME`) — désactivable via `rhai.diagnostics.enable`
- **Quick fixes** : supprimer un import inutilisé, ajouter l'alias manquant, fermer un délimiteur
- **Complétion** : fonctions et constantes du fichier, fonctions natives de l'hôte (signature en détail), mots-clés ; après `alias::` les symboles publics du module importé ; dans `#{` les clés de map connues. Aucune proposition dans les commentaires et les chaînes
- **Signature help** : déclenché sur `(` et `,`, détecte l'appel courant (fonction, méthode ou module), suit le paramètre actif par profondeur et sélectionne la surcharge native correspondant à l'arité
- **Références, highlights et rename** : *Find All References* sur les fonctions, constantes et accès `alias::`, mise en évidence des occurrences dans le document, renommage (F2) sur tout le workspace — refusé pour les mots-clés, les fonctions fournies par l'hôte et les symboles ambigus
- **Symboles, pliage et sélection** : `Ctrl+T` liste toutes les fonctions et constantes du workspace ; pliage des blocs, des régions `// region:` et des groupes d'imports ; sélection par niveaux (expression → instruction → bloc → fonction)
- **Semantic tokens** : coloration sémantique des fonctions (déclaration et appel), constantes, variables, paramètres, propriétés, alias d'import, mots-clés, opérateurs, chaînes, nombres et commentaires — le tmLanguage reste le fallback
- **Inlay hints** : noms de paramètres affichés sur les appels aux fonctions natives de l'hôte, désactivable via `rhai.inlayHints.enable`
- **Code actions** : squelette de documentation `///` sur une fonction nue, tri et déduplication des imports
- **Formatage étendu** : réindentation par blocs (formatage de plage `Maj+Alt+F` sur une sélection, et à la frappe sur `}` et `;`), idempotente et respectant `insertSpaces` / `tabSize`
- **Contrat d'hôte** : validation du JSON (`functions[]`, `type`, `access`, `numParams`, `signature`), contrôle de cohérence `.d.rhai` ↔ JSON, détection des artefacts obsolètes
- **Multi-hôtes** : réglage `rhai.navigation.nativeApiPriority` — en cas de conflit (même nom, même arité), le premier glob gagne
- **Régénération** : commande « Rhai: Régénérer les définitions d'hôte » pilotée par `rhai.host.regenerateCommand`, sortie dans le canal « Rhai », index rafraîchis à la fin
- **Status bar** : indicateur `⚙ Rhai : N native(s)`, cliquable pour régénérer
- **Walkthrough** : parcours « Démarrer avec Rhai » en 4 étapes
- **CI/CD** : workflows GitHub Actions — `ci.yml` (compile, test, package sur Ubuntu et Windows), job « généricité » qui refuse tout terme propre à un hôte et tout contenu de hover `isTrusted`, `release.yml` sur tag `v*` (publication Open VSX, VSIX joint à la release, vérification post-publication)
- **Documentation** : section « Dépannage » (galerie d'éditeur, incompatibilité, fonctions d'hôte absentes) et `galleryBanner`
- **Localisation** : `package.nls.json` (français par défaut) et `package.nls.en.json` — réglages, commandes et walkthrough traduits

### 🔄 Changements

- **Généricisation** : le badge du hover natif devient « 🔧 Fonction native (hôte) » — plus aucune référence à un hôte particulier
- **Sécurité du hover** : `isTrusted` et `supportHtml` retirés — les liens `command:` présents dans les doc-comments ne sont plus cliquables (les liens `https` restent actifs)
- **Documentation** : exemples neutres (`greet(name)`) et section renommée « Fonctions fournies par l'hôte »
- **Encodage** : emojis corrompus restaurés dans les titres des README

---

## [2026.3.1] - 2026-11-04

### ✨ Ajouts

- **Fonctions natives Rust** : Le survol affiche la documentation des fonctions exposées par l'hôte (`api.json`) — toutes les surcharges, les arguments, le type de retour et les doc comments, avec le badge 🔧
- **Ctrl+Click vers les déclarations natives** : Navigue vers la ligne correspondante dans `api.d.rhai`
- **Deux nouveaux réglages** : `rhai.navigation.nativeApi` et `rhai.navigation.nativeDefinitions` (globs, défauts `**/rhai-defs/api.json` et `**/rhai-defs/api.d.rhai`)
- **Rechargement à chaud** : un `FileSystemWatcher` invalide l'index dès que les artefacts sont régénérés, sans recharger la fenêtre

### 🔄 Changements

- **Ordre de résolution du hover** : alias d'import → `module::fonction` → fonction du fichier courant → **native Rust** → fonction native Rhai générique. La documentation du projet prime désormais sur la carte 🔷 pour les noms communs (`replace`, `get`, `set`, `min`, `max`, `floor`…)
- **Priorité de navigation** : une définition de script prime toujours sur une native homonyme

---

## [2026.2.2] - 2026-11-04

### 🔄 Changements

- **Compatibilité élargie** : `engines.vscode` redescend de `^1.144.0` à `^1.126.0` — l'extension redevient installable dans les éditeurs dérivés de VS Code restés en 1.126 (Devin/Windsurf, VSCodium…)
- **`@types/vscode`** aligné sur `~1.125.0` (la 1.126.0 n'existe pas sur DefinitelyTyped)
- **Installation** : la méthode principale pointe désormais vers Open VSX
- **Publication** : `npm run publish` cible Open VSX ; le Marketplace Microsoft reste disponible via `npm run publish:marketplace`

### 🐛 Corrections

- La 2026.2.1 était marquée incompatible et n'apparaissait pas comme mise à jour dans les éditeurs antérieurs à la version 1.144

---

## [2026.2.1] - 2026-11-04

### ✨ Ajouts

- **Recherche dans les sous-répertoires** : La résolution des modules (`import "personnage" as p;`) cherche désormais le fichier dans le dossier courant, puis récursivement dans les sous-répertoires du workspace
- **Navigation inter-fichiers étendue** : Ctrl+Click sur une fonction ou une constante introuvable dans le fichier courant cherche sa définition dans tous les fichiers `.rhai` du workspace
- **Navigation vers les constantes importées** : `p::MA_CONSTANTE` ouvre désormais sa définition dans le module importé, et plus seulement les fonctions
- **Nouveau réglage `rhai.navigation.searchSubdirectories`** (activé par défaut) pour désactiver ces recherches récursives
- **Tests unitaires** : `npm test` exécute 8 tests de navigation via le runner natif `node:test` (aucune dépendance ajoutée)

### 🔄 Changements

- **Mise à jour des dépendances** : TypeScript 7.0.2, `@vscode/vsce` 4.1.0, `@types/vscode` 1.144.0, `@types/node` 26.6.6
- **Prérequis** : VS Code **1.144** minimum (`engines.vscode`)
- **Code factorisé** : la résolution des chemins de modules est partagée entre le DefinitionProvider et le HoverProvider (plus de duplication)
- **`.vscodeignore`** : `test/`, `src/`, `tsconfig.json`, `.gitignore`, les fichiers `.vsix` et les sourcemaps ne sont plus embarqués dans l'extension publiée

### 🐛 Corrections

- `@types/vscode` n'était plus aligné avec `engines.vscode`, ce qui faisait échouer `vsce package`
- Les caractères spéciaux dans un nom de fonction ne cassent plus la construction des expressions régulières
- `tsconfig.json` déclare désormais explicitement `"types": ["node"]`, requis par TypeScript 7 qui n'inclut plus automatiquement les paquets `@types`

---

## [2026.1.2] - 2026-04-16

### ✨ Ajouts

- **Hover sur les imports** : Survoler un alias d'import (ex: `p` dans `import "personnage" as p;`) affiche la documentation `//!` du module
- **Ctrl+Click sur les imports** : Cliquer sur un alias d'import ouvre le fichier module correspondant
- **Ctrl+Click sur les alias utilisés** : Cliquer sur un alias dans `p::fonction()` ouvre le fichier module
- **Détection d'emoji dans les titres** : Les titres contenant déjà un emoji (🎯, ⚠️, etc.) n'ont plus le 📌 ajouté automatiquement
- **Préservation des blocs de code** : Le contenu des blocs de code (` ``` `) n'est plus formaté — affiché tel quel
- **Préservation du gras** : Le markdown `**gras**` n'est plus traité comme "déjà formaté" et s'affiche correctement

### 🔄 Changements

- **Refonte du formateur de documentation** : Nouvelle approche qui préserve la structure originale du fichier (lignes vides, retours chariot) au lieu de restructurer
- **Sauts de ligne markdown** : Ajout automatique de deux espaces en fin de ligne pour forcer les sauts de ligne dans le rendu VS Code
- **Simplification du formatage** : Transformation minimale par ligne (`#` → titre, `*`/`-` → puces) sans ajout d'espaces ou lignes vides artificielles

### 🐛 Corrections

- Le gras `**IHM web**` ne s'affichait pas dans la documentation des fonctions
- Les items de liste après un titre apparaissaient sur une seule ligne
- Le contenu des blocs de code était interprété par le formateur (ex: `#` dans `#{}`)

---

## [2026.1.1] - 2026-04-15

### ✨ Ajouts

- **Documentation au survol (Hover)** pour les fonctions natives Rhai (🔷)
- **Documentation au survol** pour les fonctions utilisateur (🟢)
- **Documentation au survol** pour les fonctions importées via `module::fonction`
- **Navigation par définition** (Ctrl+Click / F12) pour les fonctions et constantes
- **Navigation inter-fichiers** : Ctrl+Click sur `p::fonction` ouvre le fichier importé
- **Formateur de code** : Signatures de fonctions avec un paramètre par ligne
- **Mise en forme intelligente** de la documentation : titres, puces, code inline

---

## [2026.1.0] - 2026-04-14

### ✨ Ajouts

- Coloration syntaxique Rhai (TextMate grammar)
- Structure / Outline des fichiers (fonctions, constantes, imports, régions)
- Snippets pour les constructions Rhai courantes
- Configuration langage (commentaires, brackets, folding, indentation)
- Icônes de fichier personnalisées (light/dark)
