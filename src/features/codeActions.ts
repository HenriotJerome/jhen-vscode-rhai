import * as vscode from 'vscode';

const CLOSING: Record<string, string> = {
	'(': ')',
	'[': ']',
	'{': '}'
};

function aliasFromModule(moduleName: string): string {
	const base = moduleName.split('/').pop() ?? moduleName;
	const cleaned = base.replace(/[^A-Za-z0-9_]/g, '_');
	return /^[A-Za-z_]/.test(cleaned) ? cleaned : `m_${cleaned}`;
}

export class RhaiCodeActionProvider implements vscode.CodeActionProvider {
	provideCodeActions(
		document: vscode.TextDocument,
		_range: vscode.Range,
		context: vscode.CodeActionContext
	): vscode.CodeAction[] {
		const actions: vscode.CodeAction[] = [];

		for (const diagnostic of context.diagnostics) {
			if (diagnostic.source !== 'rhai') {
				continue;
			}
			const action = this.buildAction(document, diagnostic);
			if (action) {
				actions.push(action);
			}
		}

		return actions;
	}

	private buildAction(document: vscode.TextDocument, diagnostic: vscode.Diagnostic): vscode.CodeAction | undefined {
		switch (diagnostic.code) {
			case 'unused-import':
				return this.removeLine(document, diagnostic, "Supprimer l'import inutilisé");
			case 'import-missing-alias':
				return this.addAlias(document, diagnostic);
			case 'unclosed-delimiter':
				return this.closeDelimiter(document, diagnostic);
			default:
				return undefined;
		}
	}

	private removeLine(
		document: vscode.TextDocument,
		diagnostic: vscode.Diagnostic,
		title: string
	): vscode.CodeAction {
		const line = diagnostic.range.start.line;
		const lineRange = new vscode.Range(line, 0, line + 1, 0);
		const action = new vscode.CodeAction(title, vscode.CodeActionKind.QuickFix);
		action.diagnostics = [diagnostic];
		const edit = new vscode.WorkspaceEdit();
		edit.delete(document.uri, lineRange);
		action.edit = edit;
		return action;
	}

	private addAlias(document: vscode.TextDocument, diagnostic: vscode.Diagnostic): vscode.CodeAction | undefined {
		const lineText = document.lineAt(diagnostic.range.start.line).text;
		const match = lineText.match(/import\s+"([^"]+)"/);
		if (!match) {
			return undefined;
		}

		const alias = aliasFromModule(match[1]);
		const insertAt = new vscode.Position(diagnostic.range.start.line, lineText.replace(/\s+$/, '').length);
		const action = new vscode.CodeAction(`Ajouter 'as ${alias}'`, vscode.CodeActionKind.QuickFix);
		action.diagnostics = [diagnostic];
		const edit = new vscode.WorkspaceEdit();
		edit.insert(document.uri, insertAt, ` as ${alias}`);
		action.edit = edit;
		return action;
	}

	private closeDelimiter(document: vscode.TextDocument, diagnostic: vscode.Diagnostic): vscode.CodeAction | undefined {
		const lineText = document.lineAt(diagnostic.range.start.line).text;
		const opener = lineText[diagnostic.range.start.character];
		const closer = CLOSING[opener];
		if (!closer) {
			return undefined;
		}

		const insertAt = new vscode.Position(diagnostic.range.start.line, lineText.length);
		const action = new vscode.CodeAction(`Fermer avec '${closer}'`, vscode.CodeActionKind.QuickFix);
		action.diagnostics = [diagnostic];
		const edit = new vscode.WorkspaceEdit();
		edit.insert(document.uri, insertAt, closer);
		action.edit = edit;
		return action;
	}
}
