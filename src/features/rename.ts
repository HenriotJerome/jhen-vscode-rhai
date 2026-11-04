import * as vscode from 'vscode';
import { parse } from '../core/parser';
import { WorkspaceIndex } from '../core/workspaceIndex';
import { NativeApiIndex } from '../host/nativeApi';
import { collectOccurrences, toVscodeRange, wordAt } from '../utils/occurrences';

const RESERVED = new Set([
	'true', 'false', 'let', 'const', 'if', 'else', 'switch', 'do', 'while', 'until',
	'loop', 'for', 'in', 'continue', 'break', 'return', 'throw', 'try', 'catch',
	'fn', 'private', 'import', 'as', 'export', 'global', 'this', 'Fn'
]);

export class RhaiRenameProvider implements vscode.RenameProvider {
	constructor(
		private readonly index: WorkspaceIndex,
		private readonly nativeApi: NativeApiIndex
	) {}

	async prepareRename(
		document: vscode.TextDocument,
		position: vscode.Position,
		_token: vscode.CancellationToken
	): Promise<vscode.Range> {
		const name = wordAt(document, position);
		if (!name) {
			throw new Error('Aucun symbole à renommer à cet emplacement.');
		}
		if (RESERVED.has(name)) {
			throw new Error(`'${name}' est un mot-clé et ne peut pas être renommé.`);
		}

		await this.nativeApi.ensureLoaded();
		if (this.nativeApi.has(name)) {
			throw new Error(`'${name}' est fourni par l'hôte et ne peut pas être renommé.`);
		}

		await this.index.ensureLoaded();
		const declarations = [...this.index.getFunctions(name), ...this.index.getConstants(name)];
		if (declarations.length > 1) {
			throw new Error(`'${name}' est ambigu : ${declarations.length} définitions dans le workspace.`);
		}

		const range = document.getWordRangeAtPosition(position);
		if (!range) {
			throw new Error('Aucun symbole à renommer à cet emplacement.');
		}
		return range;
	}

	async provideRenameEdits(
		document: vscode.TextDocument,
		position: vscode.Position,
		newName: string,
		_token: vscode.CancellationToken
	): Promise<vscode.WorkspaceEdit> {
		const name = wordAt(document, position);
		if (!name) {
			throw new Error('Aucun symbole à renommer à cet emplacement.');
		}

		await this.index.ensureLoaded();

		const edit = new vscode.WorkspaceEdit();
		const currentUri = document.uri.toString();

		for (const occurrence of this.index.getReferences(name)) {
			if (occurrence.uri.toString() === currentUri) {
				continue;
			}
			edit.replace(occurrence.uri, toVscodeRange(occurrence.range), newName);
		}

		const ast = parse(document.getText());
		for (const range of collectOccurrences(ast, name)) {
			edit.replace(document.uri, toVscodeRange(range), newName);
		}

		for (const declaration of [...ast.functions, ...ast.constants]) {
			if (declaration.name !== name) {
				continue;
			}
			const line = declaration.range.start.line;
			const column = document.lineAt(line).text.indexOf(name);
			if (column < 0) {
				continue;
			}
			edit.replace(document.uri, new vscode.Range(line, column, line, column + name.length), newName);
		}

		for (const declaration of [...this.index.getFunctions(name), ...this.index.getConstants(name)]) {
			if (declaration.uri.toString() === currentUri) {
				continue;
			}
			edit.replace(declaration.uri, toVscodeRange(declaration.nameRange), newName);
		}

		return edit;
	}
}
