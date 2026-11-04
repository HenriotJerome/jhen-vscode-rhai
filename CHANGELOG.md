# Changelog

All notable changes to the **vscode-rhai-support** extension are documented here.

## [2026.2.1] - 2026-11-04

### ✨ Added

- **Sub-directory search**: Module resolution (`import "character" as p;`) now looks for the file next to the current file, then recursively through the workspace sub-directories
- **Extended cross-file navigation**: Ctrl+Click on a function or constant not found in the current file searches for its definition in every `.rhai` file of the workspace
- **Navigation to imported constants**: `p::MY_CONSTANT` now opens its definition in the imported module, not only functions
- **New `rhai.navigation.searchSubdirectories` setting** (enabled by default) to disable these recursive searches
- **Unit tests**: `npm test` runs 8 navigation tests through Node's built-in `node:test` runner (no added dependency)

### 🔄 Changed

- **Dependency updates**: TypeScript 7.0.2, `@vscode/vsce` 4.1.0, `@types/vscode` 1.144.0, `@types/node` 26.6.6
- **Requirement**: VS Code **1.144** minimum (`engines.vscode`)
- **Shared code**: module path resolution is now shared between the DefinitionProvider and the HoverProvider (no more duplication)
- **`.vscodeignore`**: `test/`, `.gitignore` and `.vsix` files are no longer bundled into the published extension

### 🐛 Fixed

- `@types/vscode` was no longer aligned with `engines.vscode`, which made `vsce package` fail
- Special characters in a function name no longer break regular expression construction
- `tsconfig.json` now declares `"types": ["node"]` explicitly, required by TypeScript 7 which no longer includes `@types` packages automatically

---

## [2026.1.2] - 2026-04-16

### ✨ Added

- **Hover on imports**: Hovering an import alias (e.g. `p` in `import "character" as p;`) displays the module's `//!` documentation
- **Ctrl+Click on imports**: Clicking an import alias opens the corresponding module file
- **Ctrl+Click on used aliases**: Clicking an alias in `p::function()` opens the module file
- **Emoji detection in headers**: Headers already containing an emoji (🎯, ⚠️, etc.) no longer get 📌 added automatically
- **Code block preservation**: Content inside code blocks (` ``` `) is no longer formatted — displayed as-is
- **Bold preservation**: Markdown `**bold**` is no longer treated as "already formatted" and displays correctly

### 🔄 Changed

- **Documentation formatter rewrite**: New approach that preserves the original file structure (blank lines, line breaks) instead of restructuring
- **Markdown line breaks**: Automatic trailing double spaces to force line breaks in VS Code rendering
- **Formatting simplification**: Minimal per-line transformation (`#` → header, `*`/`-` → bullets) without adding artificial spacing

### 🐛 Fixed

- Bold `**IHM web**` was not displaying in function documentation
- List items after a header appeared on a single line
- Code block content was interpreted by the formatter (e.g. `#` in `#{}`)

---

## [2026.1.1] - 2026-04-15

### ✨ Added

- **Hover documentation** for native Rhai functions (🔷)
- **Hover documentation** for user-defined functions (🟢)
- **Hover documentation** for imported functions via `module::function`
- **Go to Definition** (Ctrl+Click / F12) for functions and constants
- **Cross-file navigation**: Ctrl+Click on `p::function` opens the imported file
- **Code formatter**: Function signatures with one parameter per line
- **Smart documentation formatting**: headers, bullets, inline code

---

## [2026.1.0] - 2026-04-14

### ✨ Added

- Rhai syntax highlighting (TextMate grammar)
- File structure / Outline (functions, constants, imports, regions)
- Snippets for common Rhai constructs
- Language configuration (comments, brackets, folding, indentation)
- Custom file icons (light/dark)
