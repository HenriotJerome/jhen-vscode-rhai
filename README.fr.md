# Rhai Language Support pour VS Code

<div align="center">

![Version](https://img.shields.io/badge/version-2026.3.1-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![VS Code](https://img.shields.io/badge/VS%20Code-1.126+-orange.svg)
[![Open VSX](https://img.shields.io/open-vsx/v/jhenriotaliaslemeran81/vscode-rhai-support)](https://open-vsx.org/extension/jhenriotaliaslemeran81/vscode-rhai-support)
![Rhai](https://img.shields.io/badge/Rhai-Scripting-brown.svg)

</div>

Extension VS Code dédiée au langage de scripting **Rhai**, offrant une coloration syntaxique complète, une structure/outline des fichiers, un formateur de code et des snippets pour une productivité optimale.

## 🐛 Limitations connues

* La coloration syntaxique est basique et pourrait être améliorée
* L'autocomplétion est limitée aux snippets
* Le formateur de code est rudimentaire
* Certaines extensions tierces peuvent provoquer un double affichage du hover — désactiver les extensions en conflit pour résoudre le problème

## ⚙️ Configuration recommandée (VS Code natif)

Pour que **Ctrl+Click** fonctionne comme navigation (Go to Definition) au lieu de multi-curseur :

```json
"editor.multiCursorModifier": "alt"
```

Cela permet :
- **Ctrl+Click** = Go to Definition
- **Alt+Click** = Multi-curseur

## Auteur

**jhenriot alias lemeran81**

## Fonctionnalités

### 🎨 Coloration Syntaxique

Support complet de la syntaxe Rhai :

- **Mots-clés** : `fn`, `const`, `let`, `if`, `else`, `for`, `in`, `while`, `switch`, `import`, `as`, `export`, `private`, `break`, `continue`, `return`, `throw`, `try`, `catch`
- **Types** : nombres entiers, flottants, hexadécimaux, binaires, octaux
- **Opérateurs** : `and`, `or`, `not`, `is`, `is_empty`, `is_undefined`
- **Fonctions** : définitions `fn nom()` et appels `nom()`
- **Objets** : maps `#{}`, closures `|...| {}`
- **Chaînes** : interpolation `${...}` dans les strings double-quote `""` et templates `` `...` ``
- **Commentaires** : `//`, `/* */`, documentation `///` et `//!`
- **Constantes** : `true`, `false`, `()`

### 📋 Structure / Outline

L'outline affiche dans la barre latérale :

- **Fonctions** (`fn`) — avec nom et paramètres (ex: `creer_arme(nom, description)`)
- **Constantes** (`const`) — en majuscules
- **Imports** (`import "module" as alias`) — avec alias et module source
- **Régions** (`// region: Nom`) — pliables, avec hiérarchie

### 🔗 Navigation par définition (Ctrl+Click)

Naviguez rapidement dans votre code Rhai, même entre fichiers :

- **Ctrl+Click** (ou **F12**) sur un nom de fonction → saute à sa définition `fn nom()`
- **Ctrl+Click** sur une constante → saute à sa définition `const NOM`
- **Ctrl+Click** sur `module::fonction` (ex: `p::get_equipement`) → ouvre le fichier importé et saute à la définition
- **Ctrl+Click** sur un alias d'import (ex: `p` dans `import "personnage" as p;`) → ouvre le fichier module
- **Ctrl+Click** sur un alias utilisé (ex: `p::` dans le code) → ouvre le fichier module
- **Ctrl+Click** sur un nom introuvable dans le fichier courant → cherche dans tous les fichiers `.rhai` du workspace
- Supporte les imports via `import "fichier" as alias`
- La résolution des modules et des définitions cherche aussi dans les **sous-répertoires** du workspace (désactivable via `rhai.navigation.searchSubdirectories`)

**Exemple :**
```rust
import "personnage" as p;

// Ctrl+Click sur p → ouvre personnage.rhai
// Ctrl+Click sur get_equipement → ouvre personnage.rhai à la définition
let equipement = p::get_equipement(personnage);
```

### 🔧 Fonctions fournies par l'hôte

Les fonctions enregistrées par une application hôte (`engine.register_fn`, `#[export_module]`, packages) n'existent dans aucun fichier `.rhai`. L'extension lit deux artefacts générés par l'hôte pour les documenter et y naviguer :

| Artefact | Glob par défaut | Usage |
|---|---|---|
| `api.json` | `**/rhai-defs/api.json` | Hover (signatures, arguments, type de retour, doc) |
| `api.d.rhai` | `**/rhai-defs/api.d.rhai` | Ctrl+Click / F12 (saute à la ligne de déclaration) |

**Survol** d'une fonction d'hôte : carte 🔧 avec toutes les surcharges :

```
🔧 greet()

fn greet(name: string) -> string

📥 Arguments
• `name` : Nom de la personne à saluer.

📤 Returns
Un message de salutation.
```

**Ordre de résolution** — la doc de l'hôte prime sur la carte générique :

1. Alias d'import (📦)
2. `module::fonction` (🟢)
3. Fonction définie dans le fichier courant (🟢)
4. **Fonction fournie par l'hôte (🔧)**
5. Fonction native Rhai générique (🔷)

Une définition de script prime toujours sur une native homonyme. Les modifications des artefacts sont prises en compte immédiatement (file watcher), sans rechargement de fenêtre.

**Génération des artefacts** (côté Rust, features `metadata` + `internals`) :

```rust
engine
    .definitions()
    .include_standard_packages(false)
    .write_to_file("rhai-defs/api.d.rhai")?;

std::fs::write("rhai-defs/api.json", engine.gen_fn_metadata_to_json(false)?)?;
```

### 🎨 Coloration sémantique

En complément de la grammaire TextMate (conservée en fallback), l'extension classe les tokens sémantiquement :

| Tokens | Exemples |
|---|---|
| `function` | `fn alpha` (déclaration), `alpha()`, `u::beta()` |
| `variable` / `parameter` | `let y`, `const LIMITE` (readonly), `fn f(x)` |
| `property` / `namespace` | `objet.cle`, `import "utils" as u` |
| `keyword` / `operator` | `fn`, `let`, `if`, `+`, `??`, `::` |
| `string` / `number` / `comment` | littéraux, docs `///` et `//!` |

Les commentaires multi-lignes et les templates sont découpés ligne par ligne, comme l'exige le protocole.

### 🗺️ Symboles, pliage et sélection

- **Aller au symbole du workspace** (`Ctrl+T`) : toutes les fonctions et constantes du projet, filtrables par nom
- **Pliage** : blocs, sections `// region:` / `// endregion:` et groupes d'imports consécutifs
- **Sélection par niveaux** (`Maj+Alt+→`) : expression → instruction → bloc → fonction

### 🔎 Références, highlights et rename

- **Rechercher toutes les références** (`Maj+F12`) sur une fonction, une constante ou un accès `alias::nom`, dans tout le workspace
- **Mise en évidence** : toutes les occurrences du symbole sous le curseur sont surlignées dans le fichier courant
- **Renommage** (`F2`) réécrit toutes les occurrences, dans tous les fichiers, y compris les accès `alias::nom`. Refusé pour les mots-clés, les fonctions fournies par l'hôte et les noms déclarés plusieurs fois

### ✍️ Signature help

Pendant la saisie d'un appel, `(` et `,` ouvrent la liste des paramètres : le paramètre courant est mis en évidence, les appels imbriqués sont gérés et les surcharges de l'hôte sont choisies par arité. Fonctionne pour les fonctions locales, les méthodes (`valeur.len(`), les modules importés (`u::compute(`) et les fonctions de l'hôte.

### 💡 Complétion

| Contexte | Suggestions |
|---|---|
| Identifiant | Fonctions et constantes du fichier, fonctions natives de l'hôte (avec signature), mots-clés |
| `alias::` | Fonctions et constantes publiques du module importé |
| `#{` | Clés de map déjà utilisées dans le fichier |

Aucune proposition dans les commentaires ni les chaînes. `:` est un caractère déclencheur : `u:` ouvre directement la liste du module.

### 🩺 Diagnostics

L'extension analyse vos scripts et signale les problèmes à la frappe (debounce 300 ms) :

| Sévérité | Contrôles |
|---|---|
| **Erreur** | Chaîne non terminée, délimiteurs non appariés, `import` sans alias, erreurs de syntaxe |
| **Avertissement** | Import, constante ou variable inutilisé, code inatteignable |
| **Information** | Bloc de boucle vide, marqueurs `TODO` / `FIXME` |

Des quick fixes sont proposés pour les imports inutilisés, l'alias manquant et les délimiteurs non fermés. Désactivable via `rhai.diagnostics.enable`.

### 📖 Documentation au survol (Hover)

Survolez une fonction pour voir sa documentation instantanée avec un affichage enrichi :

**Fonctions natives Rhai :** 🔷
- **Hover** sur `type_of()`, `print()`, `debug()`, `len()`, etc.
- Affichage coloré avec emoji et lien vers la documentation officielle

**Fonctions utilisateur (locales et importées) :** 🟢
- **Hover** sur une fonction affiche sa documentation `///` formatée
- **Fonctions locales** : documentation extraite du fichier courant
- **Fonctions importées** : `module::fonction()` ouvre le fichier importé et affiche sa doc

**Modules importés :** 📦
- **Hover** sur un alias d'import (ex: `p`) affiche la documentation `//!` du module
- Documentation de module extraite des commentaires `//!` en tête de fichier

**Mise en forme intelligente :**
- **📌 Titres** (`# Arguments`, `# Returns`) en gras — 📌 ignoré si le titre contient déjà un emoji
- **• Puces** pour les listes de paramètres (`*` et `-`)
- `` `Code inline` `` préservé
- **Blocs de code** (`\`\`\``) préservés tel quel (pas de formatage à l'intérieur)
- **Gras** (`**texte**`) préservé dans la documentation
- Structure originale du fichier préservée (lignes vides, retours chariot)

**Exemple :**
```rust
// Dans personnage.rhai :
/// Calcule les points de vie d'un personnage
///
/// # Arguments
/// * `constitution` - Valeur de constitution (8-18)
/// * `niveau` - Niveau du personnage (1-20)
///
/// # Returns
/// Nombre de points de vie calculés
fn calculer_pv(constitution, niveau) {
    return constitution * 2 + niveau * 5
}

// Dans un autre fichier :
import "personnage" as p;

// Survoler p::calculer_pv() affiche :
// 🟢 calculer_pv()
// Calcule les points de vie d'un personnage
// ...
// 🔗 Importée depuis personnage
let pv = p::calculer_pv(12, 3);
```

### 🧩 Snippets

| Snippet | Description |
|---------|-------------|
| `fn` | Fonction avec documentation RhaiDoc complète |
| `const` | Déclaration de constante |
| `region` | Marqueurs de région avec nom |
| `import` | Import de module avec alias |
| `map` | Object map `#{}` |
| `closure` | Closure `\|...\| {}` |
| `for` | Boucle for |
| `if` | Condition if/else |

### 🔧 Formateur de Code

Formate les signatures de fonctions avec **un paramètre par ligne** :   

**Avant** :
```rust
fn creer_arme(nom, description, points_impact) {
```

**Après** (Shift+Alt+F) :
```rust
fn creer_arme(
	nom,
	description,
	points_impact,
) {
```

Règles du formateur :
- Chaque paramètre sur sa propre ligne avec virgule finale
- Indentation respectée (tab ou espaces selon les settings VS Code)
- Les fonctions déjà bien formatées ne sont pas modifiées
- Les fonctions sans paramètres restent `fn nom() {`
- Supporte les signatures multi-lignes existantes

Configuration :
- `rhai.format.enable` : Active/désactive le formateur (activé par défaut)
- `rhai.navigation.searchSubdirectories` : Cherche les modules importés et les définitions dans les sous-répertoires du workspace (activé par défaut)

### 🗂️ Configuration Langage

- **Commentaires** : `//` ligne, `/* */` bloc
- **Brackets** : `{}`, `[]`, `()`, `#{}`
- **Auto-fermeture** : paires de caractères automatiques
- **Folding** : régions `// region:` / `// endregion:`
- **Indentation** : automatique sur `{` et `}`

## Installation

### Méthode 1 : Open VSX

L'extension est publiée sur [Open VSX](https://open-vsx.org/extension/jhenriotaliaslemeran81/vscode-rhai-support) :

```bash
code --install-extension jhenriotaliaslemeran81.vscode-rhai-support
```

Ou cherche **Rhai** dans la vue Extensions (Ctrl+Shift+X) — compatible VSCodium, Gitpod, Theia et tout éditeur utilisant le registre Open VSX.

### Méthode 2 : Fichier VSIX

```bash
code --install-extension vscode-rhai-support-2026.3.1.vsix
```

Ou via l'interface :
1. Ouvrir **Extensions** (Ctrl+Shift+X)
2. Cliquer sur `...` (plus d'actions)
3. **Install from VSIX...**
4. Sélectionner `vscode-rhai-support-2026.3.1.vsix`

### Méthode 3 : Développement local

```bash
cd vscode-rhai
npm install
npm run compile
npm test        # tests unitaires (node:test, sans dépendance)
# F5 pour lancer dans VS Code
```

## Utilisation

### Coloration automatique

Les fichiers `.rhai` sont automatiquement reconnus avec la coloration syntaxique dédiée.

### Outline

1. Ouvrir un fichier `.rhai`
2. La structure apparaît dans la barre latérale **Explorer** → section **Outline**
3. Cliquer sur un élément pour naviguer

### Snippets

Commencer à taper le nom du snippet, puis Tab pour l'insérer :

```rust
fn [Tab]  → Génère une fonction avec documentation
```

## Exemple de code coloré

```rust
//! Module de gestion des personnages

// region: Types

const CLASSE_GUERRIER = #{
    "nom": "Guerrier",
    "pv_base": 10
};

// endregion: Types

/// Crée un nouveau personnage
///
/// # Arguments
///
/// * `nom` - Nom du personnage
/// * `classe` - Clé de la classe
fn creer_personnage(
	nom,
	classe,
) {
    let perso = #{
        "nom": nom,
        "classe": CLASSE_GUERRIER,
        "inventaire": []
    };
    
    for item in perso.inventaire {
        if item.cle == "epee" {
            print("Épée trouvée !");
        }
    }
    
    perso
}

import "utilitaires" as u;
```

## Licence

MIT — jhenriot alias lemeran81

## Liens

- [Rhai](https://rhai.rs/) — Langage de scripting embarqué pour Rust
- [VS Code Extension API](https://code.visualstudio.com/api)
- Changelog — voir CHANGELOG.md
