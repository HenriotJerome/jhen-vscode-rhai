# Changelog

All notable changes to the **vscode-rhai-support** extension are documented here.

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
