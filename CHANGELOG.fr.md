# Changelog

Tous les changements notables de l'extension **vscode-rhai-support** sont documentés ici.

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
