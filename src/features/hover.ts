import * as vscode from 'vscode';
import { NativeApiIndex } from '../host/nativeApi';
import { resolveModuleUri } from '../utils/modules';
import { escapeRegExp } from '../utils/text';


export class RhaiHoverProvider implements vscode.HoverProvider {
	constructor(private readonly nativeApi: NativeApiIndex = new NativeApiIndex()) {}

	// Liste des fonctions natives Rhai courantes
	private nativeFunctions: Set<string> = new Set([
		'type_of', 'print', 'debug', 'is_def_fn', 'is_def_var', 'eval',
		'to_int', 'to_float', 'to_string', 'to_lower', 'to_upper', 'trim',
		'len', 'is_empty', 'contains', 'starts_with', 'ends_with',
		'index_of', 'sub_string', 'split', 'replace', 'chars', 'bytes',
		'abs', 'sqrt', 'floor', 'ceiling', 'round', 'power',
		'sin', 'cos', 'tan', 'log', 'exp', 'rand', 'range',
		'min', 'max', 'filter', 'map', 'reduce', 'sort', 'reverse',
		'any', 'all', 'find', 'push', 'pop', 'shift', 'unshift',
		'insert', 'append', 'clear', 'remove', 'copy', 'clone',
		'keys', 'values', 'get', 'set', 'parse_int', 'parse_float',
		'pi', 'e'
	]);

	async provideHover(
		document: vscode.TextDocument,
		position: vscode.Position,
		_token: vscode.CancellationToken
	): Promise<vscode.Hover | null> {
		const wordRange = document.getWordRangeAtPosition(position);
		if (!wordRange) {
			return null;
		}

		const word = document.getText(wordRange);
		const lineText = document.lineAt(position).text;

		await this.nativeApi.ensureLoaded();

		// Check for import alias hover (e.g., hover on "u" in import "utils" as u;)
		const importAliasDoc = await this.findModuleDocumentationForAlias(document, word, lineText);
		if (importAliasDoc) {
			const { doc, moduleName } = importAliasDoc;
			const hoverContent = new vscode.MarkdownString();
			hoverContent.appendMarkdown(`### 📦 ${moduleName}\n\n`);
			hoverContent.appendMarkdown(`${doc}\n\n`);
			hoverContent.appendMarkdown(`---  \n`);
			hoverContent.appendMarkdown(`🔗 *Module* \`${moduleName}\``);
			return new vscode.Hover(hoverContent, wordRange);
		}

		// Check for module::function pattern (e.g., u::get_value)
		const moduleFnMatch = lineText.match(
			new RegExp(`([a-zA-Z_][a-zA-Z0-9_]*)\\s*::\\s*${escapeRegExp(word)}`)
		);
		if (moduleFnMatch) {
			const moduleAlias = moduleFnMatch[1];
			const importedDoc = await this.findDocumentationInImportedModule(
				document,
				moduleAlias,
				word
			);
			if (importedDoc) {
				const { doc, moduleName } = importedDoc;
				const hoverContent = new vscode.MarkdownString();
				hoverContent.appendMarkdown(`### 🟢 ${word}()\n\n`);
				hoverContent.appendMarkdown(`${doc}\n\n`);
				hoverContent.appendMarkdown(`---  \n`);
				hoverContent.appendMarkdown(`🔗 *Importée depuis* \`${moduleName}\``);
				return new vscode.Hover(hoverContent, wordRange);
			}
			return null;
		}

		// Check for user-defined function with documentation in current file
		const userFunctionDoc = this.findFunctionDocumentation(document, word);
		if (userFunctionDoc) {
			const hoverContent = new vscode.MarkdownString();
			hoverContent.appendMarkdown(`### 🟢 ${word}()\n\n`);
			hoverContent.appendMarkdown(`${userFunctionDoc}\n\n`);
			hoverContent.appendMarkdown(`---  \n`);
			hoverContent.appendMarkdown(`*Fonction définie dans ce fichier*`);
			return new vscode.Hover(hoverContent, wordRange);
		}

		// Check for a native Rust function exposed by the project API
		const nativeHover = this.nativeApi.buildHover(word);
		if (nativeHover) {
			const hoverContent = new vscode.MarkdownString();
			hoverContent.appendMarkdown(nativeHover);
			return new vscode.Hover(hoverContent, wordRange);
		}

		// Fallback: built-in Rhai function
		if (this.nativeFunctions.has(word)) {
			const hoverContent = new vscode.MarkdownString();
			hoverContent.appendMarkdown(`### 🔷 ${word}()\n\n`);
			hoverContent.appendMarkdown(`**✨ Fonction native Rhai**  \n`);
			hoverContent.appendMarkdown(`Fonction intégrée au langage Rhai.  \n\n`);
			hoverContent.appendMarkdown(`---  \n`);
			hoverContent.appendMarkdown(`[📖 Voir la documentation →](https://rhai.rs/book "Ouvrir rhai.rs/book")`);
			return new vscode.Hover(hoverContent, wordRange);
		}

		return null;
	}

	/**
	 * Find function documentation in an imported module
	 */
	private async findDocumentationInImportedModule(
		document: vscode.TextDocument,
		moduleAlias: string,
		functionName: string
	): Promise<{ doc: string; moduleName: string } | null> {
		// Find the import statement for this alias
		const importMatch = this.findImportStatement(document, moduleAlias);
		if (!importMatch) {
			return null;
		}

		const { modulePath } = importMatch;

		// Resolve the module file path
		const moduleUri = await resolveModuleUri(document, modulePath);
		if (!moduleUri) {
			return null;
		}

		// Try to open the document
		try {
			const moduleDocument = await vscode.workspace.openTextDocument(
				moduleUri
			);

			// Search for function documentation
			const doc = this.findFunctionDocumentation(moduleDocument, functionName);
			if (doc) {
				return { doc, moduleName: modulePath };
			}
		} catch {
			// File not found or not accessible
			return null;
		}

		return null;
	}

	/**
	 * Find import statement matching the given alias
	 */
	private findImportStatement(
		document: vscode.TextDocument,
		alias: string
	): { modulePath: string } | null {
		const importRegex = /^import\s+"([^"]+)"\s+as\s+([a-zA-Z_][a-zA-Z0-9_]*)/;

		for (let i = 0; i < document.lineCount; i++) {
			const lineText = document.lineAt(i).text.trim();
			const match = lineText.match(importRegex);
			if (match && match[2] === alias) {
				return { modulePath: match[1] };
			}
		}

		return null;
	}

	/**
	 * Find module documentation (//!) when hovering on an import alias
	 */
	private async findModuleDocumentationForAlias(
		document: vscode.TextDocument,
		word: string,
		lineText: string
	): Promise<{ doc: string; moduleName: string } | null> {
		// Check if the word is an import alias on this line
		const importRegex = /^import\s+"([^"]+)"\s+as\s+([a-zA-Z_][a-zA-Z0-9_]*)/;
		const lineMatch = lineText.trim().match(importRegex);

		// Also check if the word matches any import alias in the file
		let modulePath: string | null = null;
		if (lineMatch && lineMatch[2] === word) {
			modulePath = lineMatch[1];
		} else {
			// Search all imports in the file
			const importStmt = this.findImportStatement(document, word);
			if (importStmt) {
				modulePath = importStmt.modulePath;
			}
		}

		if (!modulePath) {
			return null;
		}

		// Resolve the module file path
		const moduleUri = await resolveModuleUri(document, modulePath);
		if (!moduleUri) {
			return null;
		}

		try {
			const moduleDocument = await vscode.workspace.openTextDocument(moduleUri);
			const doc = this.findModuleDocumentation(moduleDocument);
			if (doc) {
				return { doc, moduleName: modulePath };
			}
		} catch {
			// File not found or not accessible
		}

		return null;
	}

	/**
	 * Find module-level documentation (//!) at the top of a file
	 */
	private findModuleDocumentation(
		document: vscode.TextDocument
	): string | null {
		const docs: string[] = [];

		for (let i = 0; i < document.lineCount; i++) {
			const lineText = document.lineAt(i).text.trim();

			// Module doc comment //!
			if (lineText.startsWith('//!')) {
				const docLine = lineText.substring(3).trim();
				docs.push(docLine);
			} else if (lineText === '' && docs.length > 0) {
				// Empty line inside module doc - preserve it
				docs.push('');
			} else if (docs.length > 0) {
				// Non-//! line after doc comments - stop
				break;
			} else if (!lineText.startsWith('//') && lineText !== '') {
				// Non-comment code before any //! - stop
				break;
			}
		}

		if (docs.length > 0) {
			return this.formatDocumentation(docs);
		}

		return null;
	}

	/**
	 * Find documentation for a user-defined function
	 */
	private findFunctionDocumentation(
		document: vscode.TextDocument,
		functionName: string
	): string | null {
		// Search for function definition
		const fnRegex = new RegExp(`^\\s*fn\\s+${escapeRegExp(functionName)}\\s*\\(`);

		for (let i = 0; i < document.lineCount; i++) {
			const line = document.lineAt(i);
			if (fnRegex.test(line.text)) {
				// Found the function, look for documentation comments above
				const docs: string[] = [];

				// Look backwards for /// comments
				for (let j = i - 1; j >= 0; j--) {
					const prevLine = document.lineAt(j);
					const prevText = prevLine.text.trim();

					// Check for /// documentation comment
					if (prevText.startsWith('///')) {
						// Remove the /// prefix and add to docs
						const docLine = prevText.substring(3).trim();
						docs.unshift(docLine);
					} else if (prevText.startsWith('//') || prevText === '') {
						// Regular comment or empty line - stop looking
						break;
					} else {
						// Other code - stop looking
						break;
					}
				}

				if (docs.length > 0) {
					return this.formatDocumentation(docs);
				}

				return null;
			}
		}

		return null;
	}

	/**
	 * Format documentation with markdown styling
	 */
	private formatDocumentation(docs: string[]): string {
		// Check if already formatted (contains emojis added by this formatter)
		const isAlreadyFormatted = docs.some(doc =>
			doc.includes('📌') || doc.includes('•')
		);
		if (isAlreadyFormatted) {
			return docs.join('\n');
		}

		const formatted: string[] = [];
		let inCodeBlock = false;

		for (let i = 0; i < docs.length; i++) {
			const line = docs[i];

			// Toggle code block state
			if (line.startsWith('```')) {
				inCodeBlock = !inCodeBlock;
				formatted.push(line);
				continue;
			}

			// Inside code block: preserve line as-is
			if (inCodeBlock) {
				formatted.push(line);
				continue;
			}

			// Empty line: preserve it
			if (!line.trim()) {
				formatted.push(line);
				continue;
			}

			let formattedLine = line;

			// Format # Headers → **📌 Header** (skip 📌 if header already has an emoji)
			if (formattedLine.startsWith('#')) {
				const headerText = formattedLine.replace(/^#+\s*/, '');
				const hasEmoji = /\p{Emoji}/u.test(headerText);
				if (hasEmoji) {
					formattedLine = formattedLine.replace(/^#+\s*/, '**').replace(/$/, '**');
				} else {
					formattedLine = formattedLine.replace(/^#+\s*/, '**📌 ').replace(/$/, '**');
				}
			}
			// Format * bullet points → • `name` - description
			else if (formattedLine.startsWith('* ')) {
				const paramMatch = formattedLine.match(/^\*\s*`?([^`]+)`?\s*-\s*(.+)$/);
				if (paramMatch) {
					const [, paramName, description] = paramMatch;
					formattedLine = `• \`${paramName}\` - ${description}`;
				} else {
					formattedLine = '• ' + formattedLine.substring(2);
				}
			}
			// Format - bullet points → • item
			else if (formattedLine.startsWith('- ')) {
				formattedLine = '• ' + formattedLine.substring(2);
			}

			// Add trailing spaces to force markdown line break
			formatted.push(formattedLine + '  ');
		}

		return formatted.join('\n');
	}
}
