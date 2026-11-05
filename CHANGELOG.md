# Changelog

All notable changes to the **vscode-rhai-support** extension are documented here.

## [2026.4.8] - 2026-11-05

### 🔄 Changed

- All hover cards share the same layout: no more `###` headings, the badge is a bold line (`**📦 Module**`, `**🟢 name()**`, `**🔷 name()**`, `**🔧 Fonction native (hôte)**`), and every card ends with a single separator and an italic origin line

---

## [2026.4.7] - 2026-11-05

### 🔄 Changed

- Hover cards rebuilt: the signature comes first as a code block, parameters are rendered as a table (`| Paramètre | Description |`), the return is a compact line, and doc tags (`@see`) are isolated in italic
- Section titles are plain bold text, no heading, no emoji prefix

---

## [2026.4.6] - 2026-11-05

### 🔄 Changed

- Hover cards restyled: the signature is a fenced `rhai` code block, section titles are bold instead of Markdown headings, bullets are normalised (`•`, em dash) and doc tags are italic
- The `isAlreadyFormatted` shortcut was removed — it returned the raw doc as soon as a single bullet was present, which left `# Arguments` as a giant heading
- The script-function card now shows the declaration line in its footer, and host cards use the same code block

---

## [2026.4.5] - 2026-11-05

### 🔄 Changed

- Release workflow: publishing tolerates an already published version (--skip-duplicate), so a re-run never fails on a duplicate.

---

## [2026.4.4] - 2026-11-05

### 🔄 Changed

- CI: the test script uses `node --test "test/*.test.js"` so it runs on Node 22 as well as Node 26; the GitHub actions were upgraded to their current majors (checkout@v7, setup-node@v7, upload-artifact@v7, action-gh-release@v3)
- CI: `ovsx` is now a devDependency, so the release workflow no longer downloads it on the fly

---

## [2026.4.3] - 2026-11-05

### 🐛 Fixed

- The lexer swallowed the range operator: `0..n` was read as the number `0.` followed by `.n`, so every range lost its operator and the right-hand side became a member access. `for i in 0..n` now parses as a range, and a variable used only inside a range is no longer reported as unused.

---

## [2026.4.2] - 2026-11-04

### 🐛 Fixed

- Diagnostics were computed on every open document: a `.json`, `.md` or `.ts` file was parsed as Rhai and flooded with syntax errors. Only documents whose language is `rhai` (or ending in `.rhai`) are analysed now.

---

## [2026.4.1] - 2026-11-04

### ✨ Added

- **Diagnostics**: syntax errors (unterminated string, unbalanced delimiters, `import` without alias), warnings (unused import / constant / variable, unreachable code), information (empty block, `TODO`/`FIXME` markers) — can be disabled with `rhai.diagnostics.enable`
- **Quick fixes**: remove an unused import, add the missing alias, close a delimiter
- **Completion**: functions and constants of the current file, host native functions (signature as detail), keywords; after `alias::` the public symbols of the imported module; inside `#{` the known map keys. Nothing is proposed inside comments and strings
- **Signature help**: triggered on `(` and `,`, detects the current call (function, method or module), tracks the active parameter by depth and selects the host overload matching the arity
- **References, highlights and rename**: *Find All References* on functions, constants and `alias::` accesses, occurrence highlighting in the document, rename (F2) across the workspace — refused for keywords, host-provided functions and ambiguous symbols
- **Workspace symbols, folding and selection**: `Ctrl+T` lists every function and constant of the workspace; folding for blocks, `// region:` regions and import groups; level selection (expression → statement → block → function)
- **Semantic tokens**: semantic colouring for functions (declaration and call), constants, variables, parameters, properties, import aliases, keywords, operators, strings, numbers and comments — tmLanguage remains the fallback
- **Inlay hints**: parameter names shown on host function calls, disable with `rhai.inlayHints.enable`
- **Code actions**: `///` documentation skeleton on a bare function, sorting and deduplication of imports
- **Extended formatting**: block re-indentation (range formatting `Shift+Alt+F` on a selection, and on-type on `}` and `;`), idempotent and honouring `insertSpaces` / `tabSize`
- **Host contract**: JSON validation (`functions[]`, `type`, `access`, `numParams`, `signature`), `.d.rhai` ↔ JSON coherence check, stale artefact detection
- **Multi-host**: `rhai.navigation.nativeApiPriority` — on a conflict (same name, same arity) the first glob wins
- **Regeneration**: "Rhai: Regenerate host definitions" command driven by `rhai.host.regenerateCommand`, output in the "Rhai" channel, indexes refreshed afterwards
- **Status bar**: `⚙ Rhai: N native(s)` indicator, clickable to regenerate
- **Walkthrough**: "Get started with Rhai" in 4 steps
- **CI/CD**: GitHub Actions workflows — `ci.yml` (compile, test, package on Ubuntu and Windows), a "genericness" job rejecting any host-specific term and any `isTrusted` hover content, `release.yml` on `v*` tags (Open VSX publish, VSIX attached to the release, post-publish verification)
- **Documentation**: "Troubleshooting" section (editor gallery, incompatibility, missing host functions) and `galleryBanner`
- **Localisation**: `package.nls.json` (French by default) and `package.nls.en.json` — settings, commands and walkthrough translated

### 🔄 Changed

- **Genericisation**: the native hover badge becomes "🔧 Fonction native (hôte)" — no host-specific reference left
- **Hover security**: `isTrusted` and `supportHtml` removed — `command:` links inside doc comments are no longer clickable (`https` links still work)
- **Documentation**: neutral examples (`greet(name)`) and section renamed to "Host-Provided Functions"
- **Encoding**: corrupted emojis restored in README headings

---

## [2026.3.1] - 2026-11-04

### ✨ Added

- **Native Rust functions**: Hovering a function exposed by the host (`api.json`) shows its documentation — every overload, arguments, return type and doc comments, with a 🔧 badge
- **Ctrl+Click to native declarations**: Jumps to the matching line in `api.d.rhai`
- **Two new settings**: `rhai.navigation.nativeApi` and `rhai.navigation.nativeDefinitions` (globs, defaults `**/rhai-defs/api.json` and `**/rhai-defs/api.d.rhai`)
- **Live reload**: a `FileSystemWatcher` invalidates the index as soon as the artefacts are regenerated, no window reload needed

### 🔄 Changed

- **Hover resolution order**: import alias → `module::function` → function in the current file → **native Rust** → generic built-in Rhai function. Project documentation now wins over the 🔷 card for shared names (`replace`, `get`, `set`, `min`, `max`, `floor`…)
- **Navigation priority**: a script definition always wins over a native one with the same name

---

## [2026.2.2] - 2026-11-04

### 🔄 Changed

- **Wider compatibility**: `engines.vscode` goes back from `^1.144.0` to `^1.126.0` — the extension is installable again in VS Code derivatives still on 1.126 (Devin/Windsurf, VSCodium…)
- **`@types/vscode`** aligned on `~1.125.0` (1.126.0 does not exist on DefinitelyTyped)
- **Installation**: the primary method now points to Open VSX
- **Publishing**: `npm run publish` targets Open VSX; the Microsoft Marketplace remains available through `npm run publish:marketplace`

### 🐛 Fixed

- 2026.2.1 was flagged as incompatible and never offered as an update in editors older than 1.144

---

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
- **`.vscodeignore`**: `test/`, `src/`, `tsconfig.json`, `.gitignore`, `.vsix` files and source maps are no longer bundled into the published extension

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
