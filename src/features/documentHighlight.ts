import * as vscode from 'vscode';
import { parse } from '../core/parser';
import { collectOccurrences, toVscodeRange, wordAt } from '../utils/occurrences';

export class RhaiDocumentHighlightProvider implements vscode.DocumentHighlightProvider {
	provideDocumentHighlights(
		document: vscode.TextDocument,
		position: vscode.Position,
		_token: vscode.CancellationToken
	): vscode.DocumentHighlight[] {
		const name = wordAt(document, position);
		if (!name) {
			return [];
		}

		const ast = parse(document.getText());
		return collectOccurrences(ast, name).map(
			(range) => new vscode.DocumentHighlight(toVscodeRange(range), vscode.DocumentHighlightKind.Read)
		);
	}
}
