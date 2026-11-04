import * as vscode from 'vscode';
import { NativeApiIndex } from '../host/nativeApi';
import { findDefinitionInText, findDefinitionInWorkspace, resolveModuleUri, searchSubdirectoriesEnabled } from '../utils/modules';
import { escapeRegExp } from '../utils/text';


export class RhaiDefinitionProvider implements vscode.DefinitionProvider {
	constructor(private readonly nativeApi: NativeApiIndex = new NativeApiIndex()) {}

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

		await this.nativeApi.ensureLoaded();

		// Get the full line to check for module::function pattern
		const line = document.lineAt(position);
		const lineText = line.text;

		// Check for import alias on this line (e.g., hover on "u" in import "utils" as u;)
		const importLineMatch = lineText.match(/^import\s+"([^"]+)"\s+as\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
		if (importLineMatch && importLineMatch[2] === word) {
			const modulePath = importLineMatch[1];
			const moduleUri = await resolveModuleUri(document, modulePath);
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
			const moduleUri = await resolveModuleUri(document, importStmt.modulePath);
			if (moduleUri) {
				return [{
					originSelectionRange: wordRange,
					targetUri: moduleUri,
					targetRange: new vscode.Range(0, 0, 0, 0),
					targetSelectionRange: new vscode.Range(0, 0, 0, 0)
				}];
			}
		}

		// Check for module::function pattern (e.g., u::get_value)
		const moduleFnMatch = lineText.match(
			new RegExp(`([a-zA-Z_][a-zA-Z0-9_]*)\\s*::\\s*${escapeRegExp(word)}`)
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
			const fnRegex = new RegExp(`^\\s*fn\\s+${escapeRegExp(word)}\\s*\\(`);
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
		const constRegex = new RegExp(`^\\s*const\\s+${escapeRegExp(word)}\\s*=`);
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

		// Fallback: search the whole workspace, sub-directories included
		if (searchSubdirectoriesEnabled()) {
			const workspaceResult = await findDefinitionInWorkspace(
				document,
				word,
				wordRange
			);
			if (workspaceResult) {
				return workspaceResult;
			}
		}

		// Fallback: native Rust function declared in the project definitions
		const nativeLocations = this.nativeApi.getDefinitionLocations(word);
		if (nativeLocations.length > 0) {
			return nativeLocations.map((location) => ({
				originSelectionRange: wordRange,
				targetUri: location.uri,
				targetRange: new vscode.Range(location.line, 0, location.line, location.textLength),
				targetSelectionRange: new vscode.Range(location.line, location.selectionStart, location.line, location.selectionEnd)
			}));
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
		const moduleUri = await resolveModuleUri(document, modulePath);
		if (!moduleUri) {
			return null;
		}

		// Try to open the document
		try {
			const moduleDocument = await vscode.workspace.openTextDocument(
				moduleUri
			);

			const location = findDefinitionInText(
				moduleDocument.getText(),
				moduleUri,
				functionName,
				originSelectionRange
			);
			return location ? [location] : null;
		} catch {
			// File not found or not accessible
			return null;
		}
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
}
