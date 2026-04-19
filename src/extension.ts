import * as vscode from 'vscode';

//#region: DocumentSymbolProvider — Outline / Structure

const SYMBOL_KIND_MAP: Record<string, vscode.SymbolKind> = {
	fn: vscode.SymbolKind.Function,
	const: vscode.SymbolKind.Constant,
	let: vscode.SymbolKind.Variable,
	import: vscode.SymbolKind.Module,
	region: vscode.SymbolKind.Namespace,
};

interface RhaiSymbol {
	name: string;
	kind: vscode.SymbolKind;
	range: vscode.Range;
	containerName?: string;
	children: RhaiSymbol[];
}

export class RhaiDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
	provideDocumentSymbols(
		document: vscode.TextDocument,
		_token: vscode.CancellationToken
	): vscode.ProviderResult<vscode.DocumentSymbol[]> {
		const symbols: RhaiSymbol[] = [];
		const regionStack: RhaiSymbol[] = [];

		for (let i = 0; i < document.lineCount; i++) {
			const line = document.lineAt(i);
			const text = line.text.trim();

			// Skip empty lines and pure comments (not doc comments we care about)
			if (text.length === 0) {
				continue;
			}

			// Region markers: // region: Name
			const regionMatch = text.match(/^\/\/\s*region:\s*(.+)$/);
			if (regionMatch) {
				const regionName = regionMatch[1].trim();
				const region: RhaiSymbol = {
					name: regionName,
					kind: vscode.SymbolKind.Namespace,
					range: new vscode.Range(i, 0, i, line.text.length),
					children: [],
				};
				if (regionStack.length > 0) {
					regionStack[regionStack.length - 1].children.push(region);
				} else {
					symbols.push(region);
				}
				regionStack.push(region);
				continue;
			}

			// Endregion markers: // endregion: Name
			const endRegionMatch = text.match(/^\/\/\s*endregion:\s*(.+)$/);
			if (endRegionMatch) {
				if (regionStack.length > 0) {
					const region = regionStack.pop()!;
					// Extend range to include the endregion line
					region.range = new vscode.Range(
						region.range.start.line,
						0,
						i,
						line.text.length
					);
				}
				continue;
			}

			// Functions: fn name(...) - capture params, supports multi-line signatures
			const fnMatch = text.match(/^fn\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/);
			if (fnMatch) {
				const fnName = fnMatch[1];
				const fnParams = this.extractFnParams(document, i, text);
				const displayName = fnParams ? `${fnName}(${fnParams})` : `${fnName}()`;
				const fnSymbol: RhaiSymbol = {
					name: displayName,
					kind: vscode.SymbolKind.Function,
					range: new vscode.Range(i, 0, i, line.text.length),
					children: [],
				};
				this.addChild(regionStack, symbols, fnSymbol);
				continue;
			}

			// Constants: const NAME = ...
			const constMatch = text.match(/^const\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=/);
			if (constMatch) {
				const constName = constMatch[1];
				const constSymbol: RhaiSymbol = {
					name: constName,
					kind: vscode.SymbolKind.Constant,
					range: new vscode.Range(i, 0, i, line.text.length),
					children: [],
				};
				this.addChild(regionStack, symbols, constSymbol);
				continue;
			}

			// Imports: import "module" as alias
			const importMatch = text.match(/^import\s+"([^"]+)"\s+as\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
			if (importMatch) {
				const moduleName = importMatch[1];
				const alias = importMatch[2];
				const importSymbol: RhaiSymbol = {
					name: `${alias} ← ${moduleName}`,
					kind: vscode.SymbolKind.Module,
					range: new vscode.Range(i, 0, i, line.text.length),
					children: [],
				};
				this.addChild(regionStack, symbols, importSymbol);
				continue;
			}
		}

		return this.toDocumentSymbols(symbols);
	}

	private extractFnParams(
		document: vscode.TextDocument,
		startLine: number,
		firstLineText: string
	): string {
		// Try single-line first: fn name(params)
		const singleLineMatch = firstLineText.match(/^fn\s+[a-zA-Z_][a-zA-Z0-9_]*\s*\(([^)]*)\)/);
		if (singleLineMatch) {
			return singleLineMatch[1].trim();
		}

		// Multi-line: collect lines until closing ')'
		const paramsParts: string[] = [];
		// Extract partial params from first line after '('
		const afterParen = firstLineText.match(/^fn\s+[a-zA-Z_][a-zA-Z0-9_]*\s*\((.*)/);
		if (afterParen) {
			paramsParts.push(afterParen[1].trim());
		}

		for (let j = startLine + 1; j < document.lineCount && j <= startLine + 10; j++) {
			const nextLine = document.lineAt(j).text.trim();
			if (nextLine.includes(')')) {
				const beforeParen = nextLine.replace(/\).*/, '').trim();
				if (beforeParen) {
					paramsParts.push(beforeParen);
				}
				break;
			}
			if (nextLine) {
				paramsParts.push(nextLine);
			}
		}

		const rawParams = paramsParts
			.join(', ')
			.replace(/,\s*,/g, ',')
			.replace(/^\s*,\s*/, '')
			.replace(/,\s*$/, '')
			.trim();

		return rawParams;
	}

	private addChild(
		regionStack: RhaiSymbol[],
		topLevel: RhaiSymbol[],
		symbol: RhaiSymbol
	): void {
		if (regionStack.length > 0) {
			regionStack[regionStack.length - 1].children.push(symbol);
		} else {
			topLevel.push(symbol);
		}
	}

	private toDocumentSymbols(symbols: RhaiSymbol[]): vscode.DocumentSymbol[] {
		return symbols.map((s) => {
			const ds = new vscode.DocumentSymbol(
				s.name,
				this.getDetail(s.kind),
				s.kind,
				s.range,
				s.range
			);
			if (s.children.length > 0) {
				ds.children = this.toDocumentSymbols(s.children);
			}
			return ds;
		});
	}

	private getDetail(kind: vscode.SymbolKind): string {
		switch (kind) {
			case vscode.SymbolKind.Function:
				return 'fn';
			case vscode.SymbolKind.Constant:
				return 'const';
			case vscode.SymbolKind.Variable:
				return 'let';
			case vscode.SymbolKind.Module:
				return 'import';
			case vscode.SymbolKind.Namespace:
				return 'region';
			default:
				return '';
		}
	}
}

//#endregion: DocumentSymbolProvider

//#region: DocumentFormattingEditProvider — Formatter

export class RhaiFormattingProvider implements vscode.DocumentFormattingEditProvider {
	provideDocumentFormattingEdits(
		document: vscode.TextDocument,
		options: vscode.FormattingOptions,
		_token: vscode.CancellationToken
	): vscode.ProviderResult<vscode.TextEdit[]> {
		const edits: vscode.TextEdit[] = [];
		const indent = options.insertSpaces
			? ' '.repeat(options.tabSize)
			: '\t';

		for (let i = 0; i < document.lineCount; i++) {
			const line = document.lineAt(i);
			const text = line.text;

			// Format function signatures: fn name(param1, param2) { → multi-line
			const fnEdit = this.formatFnSignature(document, i, text, indent);
			if (fnEdit) {
				edits.push(fnEdit.edit);
				// Skip lines that were part of the old signature
				i = fnEdit.endLine;
				continue;
			}
		}

		return edits;
	}

	private formatFnSignature(
		document: vscode.TextDocument,
		startLine: number,
		text: string,
		indent: string
	): { edit: vscode.TextEdit; endLine: number } | null {
		// Match fn name( on this line
		const fnStartMatch = text.match(/^(\s*)fn\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/);
		if (!fnStartMatch) {
			return null;
		}

		const baseIndent = fnStartMatch[1];
		const fnName = fnStartMatch[2];

		// Find the full signature range (from fn to the closing ')')
		const params = this.extractFnParams(document, startLine, text.trim());
		if (params === null) {
			return null;
		}

		// Find end line of the signature (line containing ')')
		let sigEndLine = startLine;
		let foundCloseParen = text.includes(')');
		if (!foundCloseParen) {
			for (let j = startLine + 1; j < document.lineCount && j <= startLine + 10; j++) {
				sigEndLine = j;
				if (document.lineAt(j).text.includes(')')) {
					foundCloseParen = true;
					break;
				}
			}
		}

		if (!foundCloseParen) {
			return null;
		}

		// Check if already formatted correctly (multi-line with one param per line)
		if (this.isAlreadyFormatted(document, startLine, sigEndLine, params)) {
			return null;
		}

		// No params: fn name()
		if (params.length === 0) {
			const newText = `${baseIndent}fn ${fnName}() {\n`;
			const range = new vscode.Range(startLine, 0, sigEndLine, document.lineAt(sigEndLine).text.length);
			return {
				edit: vscode.TextEdit.replace(range, newText.trimEnd()),
				endLine: sigEndLine,
			};
		}

		// Build multi-line signature
		const paramLines = params.map((p) => `${indent}${p},`);
		const signature = [
			`${baseIndent}fn ${fnName}(`,
			...paramLines,
			`${baseIndent}) {`,
		].join('\n');

		const range = new vscode.Range(startLine, 0, sigEndLine, document.lineAt(sigEndLine).text.length);
		return {
			edit: vscode.TextEdit.replace(range, signature),
			endLine: sigEndLine,
		};
	}

	private extractFnParams(
		document: vscode.TextDocument,
		startLine: number,
		firstLineText: string
	): string[] | null {
		// Try single-line: fn name(params)
		const singleLineMatch = firstLineText.match(/^fn\s+[a-zA-Z_][a-zA-Z0-9_]*\s*\(([^)]*)\)/);
		if (singleLineMatch) {
			const raw = singleLineMatch[1].trim();
			return raw ? this.splitParams(raw) : [];
		}

		// Multi-line: collect until ')'
		const paramsParts: string[] = [];
		const afterParen = firstLineText.match(/^fn\s+[a-zA-Z_][a-zA-Z0-9_]*\s*\((.*)/);
		if (afterParen) {
			const part = afterParen[1].trim();
			if (part) {
				paramsParts.push(part);
			}
		}

		for (let j = startLine + 1; j < document.lineCount && j <= startLine + 10; j++) {
			const nextLine = document.lineAt(j).text.trim();
			if (nextLine.includes(')')) {
				const beforeParen = nextLine.replace(/\).*/, '').trim();
				if (beforeParen) {
					paramsParts.push(beforeParen);
				}
				break;
			}
			if (nextLine) {
				paramsParts.push(nextLine);
			}
		}

		const rawParams = paramsParts
			.join(', ')
			.replace(/,\s*,/g, ',')
			.replace(/^\s*,\s*/, '')
			.replace(/,\s*$/, '')
			.trim();

		return rawParams ? this.splitParams(rawParams) : [];
	}

	private splitParams(raw: string): string[] {
		return raw
			.split(',')
			.map((p) => p.trim())
			.filter((p) => p.length > 0);
	}

	private isAlreadyFormatted(
		document: vscode.TextDocument,
		startLine: number,
		endLine: number,
		params: string[]
	): boolean {
		// Already multi-line if the signature spans more than 1 line
		// and each param is on its own line
		if (params.length === 0 && endLine === startLine) {
			return true;
		}

		// Must span at least params.length + 2 lines (fn line, param lines, ) line)
		const expectedLines = params.length + 2;
		if (endLine - startLine + 1 !== expectedLines) {
			return false;
		}

		// Check each param line
		for (let k = 0; k < params.length; k++) {
			const paramLine = document.lineAt(startLine + 1 + k).text.trim();
			if (paramLine !== `${params[k]},`) {
				return false;
			}
		}

		return true;
	}
}

//#endregion: DocumentFormattingEditProvider

//#region: DefinitionProvider — Ctrl+Click sur les fonctions

export class RhaiDefinitionProvider implements vscode.DefinitionProvider {
	async provideDefinition(
		document: vscode.TextDocument,
		position: vscode.Position,
		_token: vscode.CancellationToken
	): Promise<vscode.LocationLink[] | null> {
		const wordRange = document.getWordRangeAtPosition(position);
		if (!wordRange) {
			return null;
		}

		const word = document.getText(wordRange);

		// Get the full line to check for module::function pattern
		const line = document.lineAt(position);
		const lineText = line.text;

		// Check for import alias on this line (e.g., hover on "p" in import "personnage" as p;)
		const importLineMatch = lineText.match(/^import\s+"([^"]+)"\s+as\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
		if (importLineMatch && importLineMatch[2] === word) {
			const modulePath = importLineMatch[1];
			const moduleUri = await this.resolveModulePath(document, modulePath);
			if (moduleUri) {
				return [{
					originSelectionRange: wordRange,
					targetUri: moduleUri,
					targetRange: new vscode.Range(0, 0, 0, 0),
					targetSelectionRange: new vscode.Range(0, 0, 0, 0)
				}];
			}
		}

		// Check if word is a known import alias → navigate to the module file
		const importStmt = this.findImportStatement(document, word);
		if (importStmt) {
			const moduleUri = await this.resolveModulePath(document, importStmt.modulePath);
			if (moduleUri) {
				return [{
					originSelectionRange: wordRange,
					targetUri: moduleUri,
					targetRange: new vscode.Range(0, 0, 0, 0),
					targetSelectionRange: new vscode.Range(0, 0, 0, 0)
				}];
			}
		}

		// Check for module::function pattern (e.g., p::get_equipement)
		const moduleFnMatch = lineText.match(
			new RegExp(`([a-zA-Z_][a-zA-Z0-9_]*)\\s*::\\s*${word}`)
		);
		if (moduleFnMatch) {
			const moduleAlias = moduleFnMatch[1];
				const result = await this.findDefinitionInImportedModule(
				document,
				moduleAlias,
				word,
				wordRange
			);
			if (result) {
				return result;
			}
		}

		// Search for function definition in current file: fn word(...)
		for (let i = 0; i < document.lineCount; i++) {
			const lineText = document.lineAt(i).text;
			const fnRegex = new RegExp(`^\\s*fn\\s+${word}\\s*\\(`);
			if (fnRegex.test(lineText)) {
				return [{
					originSelectionRange: wordRange,
					targetUri: document.uri,
					targetRange: new vscode.Range(i, 0, i, lineText.length),
					targetSelectionRange: new vscode.Range(i, lineText.indexOf(word), i, lineText.indexOf(word) + word.length)
				}];
			}
		}

		// Search for constant definition in current file: const WORD = ...
		const constRegex = new RegExp(`^\\s*const\\s+${word}\\s*=`);
		for (let i = 0; i < document.lineCount; i++) {
			const lineText = document.lineAt(i).text;
			if (constRegex.test(lineText)) {
				return [{
					originSelectionRange: wordRange,
					targetUri: document.uri,
					targetRange: new vscode.Range(i, 0, i, lineText.length),
					targetSelectionRange: new vscode.Range(i, lineText.indexOf(word), i, lineText.indexOf(word) + word.length)
				}];
			}
		}

		return null;
	}

	/**
	 * Find function definition in an imported module
	 */
	private async findDefinitionInImportedModule(
		document: vscode.TextDocument,
		moduleAlias: string,
		functionName: string,
		originSelectionRange: vscode.Range
	): Promise<vscode.LocationLink[] | null> {
		// Find the import statement for this alias
		const importMatch = this.findImportStatement(document, moduleAlias);
		if (!importMatch) {
			return null;
		}

		const { modulePath } = importMatch;

		// Resolve the module file path
		const moduleUri = await this.resolveModulePath(document, modulePath);
		if (!moduleUri) {
			return null;
		}

		// Try to open the document
		try {
			const moduleDocument = await vscode.workspace.openTextDocument(
				moduleUri
			);

			// Search for the function definition
			const fnRegex = new RegExp(`^\\s*fn\\s+${functionName}\\s*\\(`);
			for (let i = 0; i < moduleDocument.lineCount; i++) {
				const lineText = moduleDocument.lineAt(i).text;
				if (fnRegex.test(lineText)) {
					return [{
						originSelectionRange: originSelectionRange,
						targetUri: moduleUri,
						targetRange: new vscode.Range(i, 0, i, lineText.length),
						targetSelectionRange: new vscode.Range(i, lineText.indexOf(functionName), i, lineText.indexOf(functionName) + functionName.length)
					}];
				}
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
	 * Resolve module path to a file URI
	 */
	private async resolveModulePath(
		document: vscode.TextDocument,
		modulePath: string
	): Promise<vscode.Uri | null> {
		const baseDir = vscode.Uri.joinPath(document.uri, '..');

		// Try different extensions
		const extensions = ['.rhai', ''];

		for (const ext of extensions) {
			const fileUri = vscode.Uri.joinPath(baseDir, `${modulePath}${ext}`);
			try {
				await vscode.workspace.fs.stat(fileUri);
				return fileUri;
			} catch {
				// File doesn't exist, try next
			}
		}

		return null;
	}
}

//#endregion: DefinitionProvider

//#region: HoverProvider — Documentation des fonctions natives Rhai

export class RhaiHoverProvider implements vscode.HoverProvider {
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

		// Check for native Rhai function
		if (this.nativeFunctions.has(word)) {
			const hoverContent = new vscode.MarkdownString();
			hoverContent.supportHtml = true;
			hoverContent.appendMarkdown(`### 🔷 ${word}()\n\n`);
			hoverContent.appendMarkdown(`**✨ Fonction native Rhai**  \n`);
			hoverContent.appendMarkdown(`Fonction intégrée au langage Rhai.  \n\n`);
			hoverContent.appendMarkdown(`---  \n`);
			hoverContent.appendMarkdown(`[📖 Voir la documentation →](https://rhai.rs/book "Ouvrir rhai.rs/book")`);
			hoverContent.isTrusted = true;
			return new vscode.Hover(hoverContent, wordRange);
		}

		// Check for import alias hover (e.g., hover on "p" in import "personnage" as p;)
		const importAliasDoc = await this.findModuleDocumentationForAlias(document, word, lineText);
		if (importAliasDoc) {
			const { doc, moduleName } = importAliasDoc;
			const hoverContent = new vscode.MarkdownString();
			hoverContent.supportHtml = true;
			hoverContent.appendMarkdown(`### 📦 ${moduleName}\n\n`);
			hoverContent.appendMarkdown(`${doc}\n\n`);
			hoverContent.appendMarkdown(`---  \n`);
			hoverContent.appendMarkdown(`🔗 *Module* \`${moduleName}\``);
			hoverContent.isTrusted = true;
			return new vscode.Hover(hoverContent, wordRange);
		}

		// Check for module::function pattern (e.g., p::get_equipement)
		const moduleFnMatch = lineText.match(
			new RegExp(`([a-zA-Z_][a-zA-Z0-9_]*)\\s*::\\s*${word}`)
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
				hoverContent.supportHtml = true;
				hoverContent.appendMarkdown(`### 🟢 ${word}()\n\n`);
				hoverContent.appendMarkdown(`${doc}\n\n`);
				hoverContent.appendMarkdown(`---  \n`);
				hoverContent.appendMarkdown(`🔗 *Importée depuis* \`${moduleName}\``);
				hoverContent.isTrusted = true;
				return new vscode.Hover(hoverContent, wordRange);
			}
			return null;
		}

		// Check for user-defined function with documentation in current file
		const userFunctionDoc = this.findFunctionDocumentation(document, word);
		if (userFunctionDoc) {
			const hoverContent = new vscode.MarkdownString();
			hoverContent.supportHtml = true;
			hoverContent.appendMarkdown(`### 🟢 ${word}()\n\n`);
			hoverContent.appendMarkdown(`${userFunctionDoc}\n\n`);
			hoverContent.appendMarkdown(`---  \n`);
			hoverContent.appendMarkdown(`*Fonction définie dans ce fichier*`);
			hoverContent.isTrusted = true;
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
		const moduleUri = await this.resolveModulePath(document, modulePath);
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
	 * Resolve module path to a file URI
	 */
	private async resolveModulePath(
		document: vscode.TextDocument,
		modulePath: string
	): Promise<vscode.Uri | null> {
		const baseDir = vscode.Uri.joinPath(document.uri, '..');

		// Try different extensions
		const extensions = ['.rhai', ''];

		for (const ext of extensions) {
			const fileUri = vscode.Uri.joinPath(baseDir, `${modulePath}${ext}`);
			try {
				await vscode.workspace.fs.stat(fileUri);
				return fileUri;
			} catch {
				// File doesn't exist, try next
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
		const moduleUri = await this.resolveModulePath(document, modulePath);
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
		const fnRegex = new RegExp(`^\\s*fn\\s+${functionName}\\s*\\(`);

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

//#endregion: HoverProvider

//#region: Activation

export function activate(context: vscode.ExtensionContext): void {
	const symbolProvider = new RhaiDocumentSymbolProvider();
	context.subscriptions.push(
		vscode.languages.registerDocumentSymbolProvider(
			{ language: 'rhai', scheme: 'file' },
			symbolProvider
		)
	);

	const formattingProvider = new RhaiFormattingProvider();
	context.subscriptions.push(
		vscode.languages.registerDocumentFormattingEditProvider(
			{ language: 'rhai', scheme: 'file' },
			formattingProvider
		)
	);

	const definitionProvider = new RhaiDefinitionProvider();
	context.subscriptions.push(
		vscode.languages.registerDefinitionProvider(
			{ language: 'rhai', scheme: 'file' },
			definitionProvider
		)
	);

	const hoverProvider = new RhaiHoverProvider();
	context.subscriptions.push(
		vscode.languages.registerHoverProvider(
			{ language: 'rhai', scheme: 'file' },
			hoverProvider
		)
	);
}

export function deactivate(): void {
	// Nothing to clean up
}

//#endregion: Activation
