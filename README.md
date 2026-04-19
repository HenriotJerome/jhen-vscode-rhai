# Rhai Language Support for VS Code

<div align="center">

![Version](https://img.shields.io/badge/version-2026.1.2-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![VS Code](https://img.shields.io/badge/VS%20Code-1.85+-orange.svg)
![Rhai](https://img.shields.io/badge/Rhai-Scripting-brown.svg)

</div>

VS Code extension dedicated to the **Rhai** scripting language, providing comprehensive syntax highlighting, file outline/structure, code formatting and snippets for optimal productivity.

## 🐛 Known Limitations

* Syntax highlighting is basic and could be improved
* Autocompletion is limited to snippets
* Code formatter is rudimentary
* Some third-party extensions may cause hover documentation to display twice — disable conflicting extensions to resolve the issue

## ⚙️ Recommended Configuration (VS Code native)

For **Ctrl+Click** to work as navigation (Go to Definition) instead of multi-cursor:

```json
"editor.multiCursorModifier": "alt"
```

This allows:
- **Ctrl+Click** = Go to Definition
- **Alt+Click** = Multi-cursor

## Author

**jhenriot alias lemeran81**

## Features

### 🎨 Syntax Highlighting

Full Rhai syntax support:

- **Keywords**: `fn`, `const`, `let`, `if`, `else`, `for`, `in`, `while`, `switch`, `import`, `as`, `export`, `private`, `break`, `continue`, `return`, `throw`, `try`, `catch`
- **Types**: integers, floats, hexadecimal, binary, octal numbers
- **Operators**: `and`, `or`, `not`, `is`, `is_empty`, `is_undefined`
- **Functions**: definitions `fn name()` and calls `name()`
- **Objects**: maps `#{}`, closures `|...| {}`
- **Strings**: interpolation `${...}` in double-quoted `""` and template literals `` `...` ``
- **Comments**: `//`, `/* */`, documentation `///` and `//!`
- **Constants**: `true`, `false`, `()`

### 📋 Structure / Outline

The outline displays in the sidebar:

- **Functions** (`fn`) — with name and parameters (e.g. `create_weapon(name, description)`)
- **Constants** (`const`) — in uppercase
- **Imports** (`import "module" as alias`) — with alias and source module
- **Regions** (`// region: Name`) — collapsible, with hierarchy

### 🔗 Go to Definition (Ctrl+Click)

Navigate quickly through your Rhai code, even across files:

- **Ctrl+Click** (or **F12**) on a function name → jumps to its definition `fn name()`
- **Ctrl+Click** on a constant → jumps to its definition `const NAME`
- **Ctrl+Click** on `module::function` (e.g. `p::get_equipment`) → opens the imported file and jumps to the definition
- **Ctrl+Click** on an import alias (e.g. `p` in `import "character" as p;`) → opens the module file
- **Ctrl+Click** on a used alias (e.g. `p::` in code) → opens the module file
- Supports imports via `import "file" as alias`

**Example:**
```rust
import "character" as p;

// Ctrl+Click on p → opens character.rhai
// Ctrl+Click on get_equipment → opens character.rhai at the definition
let equipment = p::get_equipment(character);
```

### 📖 Hover Documentation

Hover over a function to see its documentation instantly with rich display:

**Native Rhai functions:** 🔷
- **Hover** on `type_of()`, `print()`, `debug()`, `len()`, etc.
- Colorful display with emoji and link to official documentation

**User-defined functions (local and imported):** 🟢
- **Hover** on a function displays its formatted `///` documentation
- **Local functions**: documentation extracted from the current file
- **Imported functions**: `module::function()` opens the imported file and displays its doc

**Imported modules:** 📦
- **Hover** on an import alias (e.g. `p`) displays the module's `//!` documentation
- Module documentation extracted from `//!` comments at the top of the file

**Smart formatting:**
- **📌 Headers** (`# Arguments`, `# Returns`) in bold — 📌 skipped if header already contains an emoji
- **• Bullets** for parameter lists (`*` and `-`)
- `` `Inline code` `` preserved
- **Code blocks** (`\`\`\``) preserved as-is (no formatting inside)
- **Bold** (`**text**`) preserved in documentation
- Original file structure preserved (blank lines, line breaks)

**Example:**
```rust
// In character.rhai:
/// Calculates character hit points
///
/// # Arguments
/// * `constitution` - Constitution value (8-18)
/// * `level` - Character level (1-20)
///
/// # Returns
/// Calculated hit points
fn calculate_hp(constitution, level) {
    return constitution * 2 + level * 5
}

// In another file:
import "character" as p;

// Hovering p::calculate_hp() shows:
// 🟢 calculate_hp()
// Calculates character hit points
// ...
// 🔗 Imported from character
let hp = p::calculate_hp(12, 3);
```

### 🧩 Snippets

| Snippet | Description |
|---------|-------------|
| `fn` | Function with full RhaiDoc documentation |
| `const` | Constant declaration |
| `region` | Region markers with name |
| `import` | Module import with alias |
| `map` | Object map `#{}` |
| `closure` | Closure `\|...\| {}` |
| `for` | For loop |
| `if` | If/else condition |

### 🔧 Code Formatter

Formats function signatures with **one parameter per line**:

**Before:**
```rust
fn create_weapon(name, description, impact_points) {
```

**After** (Shift+Alt+F):
```rust
fn create_weapon(
	name,
	description,
	impact_points,
) {
```

Formatter rules:
- Each parameter on its own line with trailing comma
- Indentation respected (tabs or spaces per VS Code settings)
- Already well-formatted functions are not modified
- Functions without parameters remain `fn name() {`
- Supports existing multi-line signatures

Configuration:
- `rhai.format.enable`: Enable/disable the formatter (enabled by default)

### 🗂️ Language Configuration

- **Comments**: `//` line, `/* */` block
- **Brackets**: `{}`, `[]`, `()`, `#{}`
- **Auto-closing**: automatic character pairs
- **Folding**: regions `// region:` / `// endregion:`
- **Indentation**: automatic on `{` and `}`

## Installation

### Method 1: VSIX File

```bash
code --install-extension vscode-rhai-support-2026.1.2.vsix
```

Or via the UI:
1. Open **Extensions** (Ctrl+Shift+X)
2. Click `...` (more actions)
3. **Install from VSIX...**
4. Select `vscode-rhai-support-2026.1.2.vsix`

### Method 2: Local Development

```bash
cd vscode-rhai
npm install
npm run compile
# Press F5 to launch in VS Code
```

## Usage

### Automatic Highlighting

`.rhai` files are automatically recognized with dedicated syntax highlighting.

### Outline

1. Open a `.rhai` file
2. The structure appears in the **Explorer** sidebar → **Outline** section
3. Click an element to navigate

### Snippets

Start typing the snippet name, then Tab to insert:

```rust
fn [Tab]  → Generates a function with documentation
```

## Colored Code Example

```rust
//! Character management module

// region: Types

const WARRIOR_CLASS = #{
    "name": "Warrior",
    "base_hp": 10
};

// endregion: Types

/// Creates a new character
///
/// # Arguments
///
/// * `name` - Character name
/// * `class` - Class key
fn create_character(
	name,
	class,
) {
    let char = #{
        "name": name,
        "class": WARRIOR_CLASS,
        "inventory": []
    };
    
    for item in char.inventory {
        if item.key == "sword" {
            print("Sword found!");
        }
    }
    
    char
}

import "utilities" as u;
```

## License

MIT — jhenriot alias lemeran81

## Links

- [Rhai](https://rhai.rs/) — Embedded scripting language for Rust
- [VS Code Extension API](https://code.visualstudio.com/api)
- Changelog — voir CHANGELOG.md
