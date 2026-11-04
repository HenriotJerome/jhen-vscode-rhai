import * as vscode from 'vscode';
import { parse } from '../core/parser';
import { WorkspaceIndex } from '../core/workspaceIndex';
import { collectOccurrences, toVscodeRange, wordAt } from '../utils/occurrences';

export class RhaiReferenceProvider implements vscode.ReferenceProvider {
	constructor(private readonly index: WorkspaceIndex) {}

	async provideReferences(
		document: vscode.TextDocument,
		position: vscode.Position,
		context: vscode.ReferenceContext,
		_token: vscode.CancellationToken
	): Promise<vscode.Location[]> {
		const name = wordAt(document, position);
		if (!name) {
			return [];
		}

		await this.index.ensureLoaded();

		const currentUri = document.uri.toString();
		const locations: vscode.Location[] = [];
		const seen = new Set<string>();

		const push = (uri: vscode.Uri, range: vscode.Range): void => {
			const key = `${uri.toString()}:${range.start.line}:${range.start.character}`;
			if (seen.has(key)) {
				return;
			}
			seen.add(key);
			locations.push(new vscode.Location(uri, range));
		};

		for (const occurrence of this.index.getReferences(name)) {
			if (occurrence.uri.toString() === currentUri) {
				continue;
			}
			push(occurrence.uri, toVscodeRange(occurrence.range));
		}

		const ast = parse(document.getText());
		for (const range of collectOccurrences(ast, name)) {
			push(document.uri, toVscodeRange(range));
		}

		if (context.includeDeclaration) {
			for (const declaration of [...this.index.getFunctions(name), ...this.index.getConstants(name)]) {
				if (declaration.uri.toString() === currentUri) {
					continue;
				}
				push(declaration.uri, toVscodeRange(declaration.nameRange));
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
				push(document.uri, new vscode.Range(line, column, line, column + name.length));
			}
		}

		return locations;
	}
}
