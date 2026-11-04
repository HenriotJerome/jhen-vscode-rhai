import * as vscode from 'vscode';
import { formatIndentation } from './indentation';

function optionsFrom(formattingOptions: vscode.FormattingOptions): { insertSpaces: boolean; tabSize: number } {
	return {
		insertSpaces: formattingOptions.insertSpaces !== false,
		tabSize: formattingOptions.tabSize ?? 4
	};
}

export class RhaiRangeFormattingProvider implements vscode.DocumentRangeFormattingEditProvider {
	provideDocumentRangeFormattingEdits(
		document: vscode.TextDocument,
		range: vscode.Range,
		options: vscode.FormattingOptions,
		_token: vscode.CancellationToken
	): vscode.TextEdit[] {
		if (!formatterEnabled()) {
			return [];
		}

		const text = document.getText();
		const formatted = formatIndentation(text, optionsFrom(options)).split('\n');
		const original = text.split('\n');

		const edits: vscode.TextEdit[] = [];
		for (let line = range.start.line; line <= Math.min(range.end.line, original.length - 1); line++) {
			if (formatted[line] === undefined || formatted[line] === original[line]) {
				continue;
			}
			edits.push(new vscode.TextEdit(new vscode.Range(line, 0, line, original[line].length), formatted[line]));
		}

		return edits;
	}
}

export class RhaiOnTypeFormattingProvider implements vscode.OnTypeFormattingEditProvider {
	provideOnTypeFormattingEdits(
		document: vscode.TextDocument,
		position: vscode.Position,
		_character: string,
		options: vscode.FormattingOptions,
		_token: vscode.CancellationToken
	): vscode.TextEdit[] {
		if (!formatterEnabled()) {
			return [];
		}

		const text = document.getText();
		const formatted = formatIndentation(text, optionsFrom(options)).split('\n');
		const line = position.line;
		const original = text.split('\n')[line];

		if (formatted[line] === undefined || formatted[line] === original) {
			return [];
		}

		return [new vscode.TextEdit(new vscode.Range(line, 0, line, original.length), formatted[line])];
	}
}

function formatterEnabled(): boolean {
	return vscode.workspace.getConfiguration('rhai').get<boolean>('format.enable', true);
}
