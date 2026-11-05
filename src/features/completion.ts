import * as vscode from 'vscode';
import { Expr, FunctionDecl, MapEntry, ModuleAst } from '../core/ast';
import { tokenize } from '../core/lexer';
import { parse } from '../core/parser';
import { walkBlock, walkExpr, walkStmt } from '../core/walk';
import { NativeApiIndex } from '../host/nativeApi';
import { renderDocumentation } from '../utils/documentation';
import { resolveModuleUri } from '../utils/modules';

const KEYWORDS = [
	'let', 'const', 'if', 'else', 'switch', 'do', 'while', 'until', 'loop',
	'for', 'in', 'continue', 'break', 'return', 'throw', 'try', 'catch',
	'fn', 'private', 'import', 'as', 'export', 'global', 'this', 'true', 'false'
];

const MODULE_REFERENCE = /([A-Za-z_][A-Za-z0-9_]*)\s*::\s*[A-Za-z0-9_]*$/;
const MAP_CONTEXT = /#\{[^}]*$/;

function offsetAt(text: string, line: number, character: number): number {
	const lines = text.split('\n');
	let offset = 0;
	for (let index = 0; index < line && index < lines.length; index++) {
		offset += lines[index].length + 1;
	}
	return offset + character;
}

function isInsideCommentOrString(text: string, line: number, character: number): boolean {
	const offset = offsetAt(text, line, character);
	for (const token of tokenize(text)) {
		if (token.kind !== 'comment' && token.kind !== 'doc' && token.kind !== 'string') {
			continue;
		}
		if (offset >= token.start && offset <= token.end) {
			return true;
		}
	}
	return false;
}

function functionDetail(declaration: FunctionDecl): string {
	const params = declaration.params.map((param) =>
		param.type ? `${param.name}: ${param.type}` : param.name
	);
	return `${declaration.name}(${params.join(', ')})`;
}

function documentationOf(doc: string[]): vscode.MarkdownString | undefined {
	if (doc.length === 0) {
		return undefined;
	}
	return new vscode.MarkdownString(renderDocumentation(doc));
}

function collectMapKeys(ast: ModuleAst): MapEntry[] {
	const entries: MapEntry[] = [];
	const visit = (expr: Expr): void => {
		if (expr.kind === 'map') {
			entries.push(...expr.entries);
		}
	};

	for (const statement of ast.statements) {
		walkStmt(statement, visit);
	}
	for (const declaration of ast.functions) {
		walkBlock(declaration.body, visit);
	}

	return entries;
}

export class RhaiCompletionProvider implements vscode.CompletionItemProvider {
	constructor(private readonly nativeApi: NativeApiIndex) {}

	async provideCompletionItems(
		document: vscode.TextDocument,
		position: vscode.Position,
		_token: vscode.CancellationToken,
		_context: vscode.CompletionContext
	): Promise<vscode.CompletionItem[]> {
		const text = document.getText();
		if (isInsideCommentOrString(text, position.line, position.character)) {
			return [];
		}

		await this.nativeApi.ensureLoaded();

		const linePrefix = document.lineAt(position.line).text.substring(0, position.character);

		const moduleMatch = MODULE_REFERENCE.exec(linePrefix);
		if (moduleMatch) {
			return this.moduleCompletions(document, moduleMatch[1]);
		}

		if (MAP_CONTEXT.test(linePrefix)) {
			return this.mapKeyCompletions(text);
		}

		return this.generalCompletions(text);
	}

	private async moduleCompletions(
		document: vscode.TextDocument,
		alias: string
	): Promise<vscode.CompletionItem[]> {
		const ast = parse(document.getText());
		const declaration = ast.imports.find((item) => item.alias === alias);
		if (!declaration) {
			return [];
		}

		const uri = await resolveModuleUri(document, declaration.module);
		if (!uri) {
			return [];
		}

		let moduleText: string;
		try {
			moduleText = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
		} catch {
			return [];
		}

		const moduleAst = parse(moduleText);
		const items: vscode.CompletionItem[] = [];

		for (const fn of moduleAst.functions) {
			if (fn.visibility === 'private') {
				continue;
			}
			const item = new vscode.CompletionItem(fn.name, vscode.CompletionItemKind.Function);
			item.detail = functionDetail(fn);
			item.documentation = documentationOf(fn.doc);
			items.push(item);
		}

		for (const constant of moduleAst.constants) {
			const item = new vscode.CompletionItem(constant.name, vscode.CompletionItemKind.Constant);
			item.documentation = documentationOf(constant.doc);
			items.push(item);
		}

		return items;
	}

	private mapKeyCompletions(text: string): vscode.CompletionItem[] {
		const ast = parse(text);
		const seen = new Set<string>();
		const items: vscode.CompletionItem[] = [];

		for (const entry of collectMapKeys(ast)) {
			if (seen.has(entry.key)) {
				continue;
			}
			seen.add(entry.key);
			items.push(new vscode.CompletionItem(entry.key, vscode.CompletionItemKind.Field));
		}

		return items;
	}

	private generalCompletions(text: string): vscode.CompletionItem[] {
		const ast = parse(text);
		const items: vscode.CompletionItem[] = [];

		for (const fn of ast.functions) {
			const item = new vscode.CompletionItem(fn.name, vscode.CompletionItemKind.Function);
			item.detail = functionDetail(fn);
			item.documentation = documentationOf(fn.doc);
			items.push(item);
		}

		for (const constant of ast.constants) {
			const item = new vscode.CompletionItem(constant.name, vscode.CompletionItemKind.Constant);
			item.documentation = documentationOf(constant.doc);
			items.push(item);
		}

		for (const name of this.nativeApi.getNames()) {
			const overloads = this.nativeApi.getOverloads(name);
			const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Function);
			item.detail = overloads.map((overload) => overload.signature).join(' | ');
			const doc = overloads[0]?.docComments;
			if (doc && doc.length > 0) {
				item.documentation = documentationOf(doc);
			}
			items.push(item);
		}

		for (const keyword of KEYWORDS) {
			items.push(new vscode.CompletionItem(keyword, vscode.CompletionItemKind.Keyword));
		}

		return items;
	}
}
