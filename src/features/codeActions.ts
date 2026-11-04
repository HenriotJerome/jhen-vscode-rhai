import * as vscode from 'vscode';
import { parse } from '../core/parser';

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

function documentationSkeleton(document: vscode.TextDocument, line: number): { position: vscode.Position; text: string } | undefined {
	const ast = parse(document.getText());
	const declaration = ast.functions.find((item) => item.line === line);
	if (!declaration || declaration.doc.length > 0) {
		return undefined;
	}

	const indent = (document.lineAt(line).text.match(/^\s*/) ?? [''])[0];
	const lines = [`/// Décrit ${declaration.name}.`, '///'];

	if (declaration.params.length > 0) {
		lines.push('/// # Arguments');
		for (const param of declaration.params) {
			lines.push(`/// * \`${param.name}\` : `);
		}
		lines.push('///');
	}

	lines.push('/// # Returns', '/// ');

	return {
		position: new vscode.Position(line, 0),
		text: lines.map((item) => `${indent}${item}`).join('\n') + '\n'
	};
}

function sortedImports(document: vscode.TextDocument): { range: vscode.Range; text: string } | undefined {
	const ast = parse(document.getText());
	if (ast.imports.length < 2) {
		return undefined;
	}

	const lines = ast.imports.map((item) => item.range.start.line).sort((a, b) => a - b);
	const first = lines[0];
	const last = lines[lines.length - 1];

	if (last - first + 1 !== ast.imports.length) {
		return undefined;
	}

	const seen = new Set<string>();
	const sorted: string[] = [];
	for (const item of [...ast.imports].sort(
		(a, b) => a.module.localeCompare(b.module) || a.alias.localeCompare(b.alias)
	)) {
		const key = `${item.module}\u0000${item.alias}`;
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		sorted.push(`import "${item.module}" as ${item.alias};`);
	}

	const current = lines.map((line) => document.lineAt(line).text).join('\n');
	const next = sorted.join('\n');
	if (current === next) {
		return undefined;
	}

	return {
		range: new vscode.Range(first, 0, last, document.lineAt(last).text.length),
		text: next
	};
}

export class RhaiCodeActionProvider implements vscode.CodeActionProvider {
	provideCodeActions(
		document: vscode.TextDocument,
		range: vscode.Range,
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

		const skeleton = documentationSkeleton(document, range.start.line);
		if (skeleton) {
			const action = new vscode.CodeAction(
				'Ajouter un squelette de documentation',
				vscode.CodeActionKind.RefactorRewrite
			);
			const edit = new vscode.WorkspaceEdit();
			edit.insert(document.uri, skeleton.position, skeleton.text);
			action.edit = edit;
			actions.push(action);
		}

		const imports = sortedImports(document);
		if (imports) {
			const action = new vscode.CodeAction('Trier les imports', vscode.CodeActionKind.SourceOrganizeImports);
			const edit = new vscode.WorkspaceEdit();
			edit.replace(document.uri, imports.range, imports.text);
			action.edit = edit;
			actions.push(action);
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
