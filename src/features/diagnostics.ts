import * as vscode from 'vscode';
import { Block, Expr, ModuleAst, Range, Stmt } from '../core/ast';
import { Token, tokenize } from '../core/lexer';
import { parse } from '../core/parser';
import { walkBlock, walkExpr, walkStmt } from '../core/walk';

export type IssueSeverity = 'error' | 'warning' | 'info';

export interface RhaiIssue {
	range: Range;
	message: string;
	severity: IssueSeverity;
	code: string;
}

const DEBOUNCE_MS = 300;
const TERMINATORS = new Set(['return', 'throw', 'break', 'continue']);
const TODO_PATTERN = /\b(TODO|FIXME)\b/;

function rangeFromToken(token: Token): Range {
	return {
		start: { line: token.line, character: token.column },
		end: { line: token.line, character: token.column + token.value.length }
	};
}

function checkDelimiters(tokens: Token[]): RhaiIssue[] {
	const issues: RhaiIssue[] = [];
	const opening = new Map([
		[')', '('],
		[']', '['],
		['}', '{']
	]);
	const stack: Token[] = [];

	for (const token of tokens) {
		if (token.kind !== 'punct') {
			continue;
		}
		if (token.value === '(' || token.value === '[' || token.value === '{') {
			stack.push(token);
			continue;
		}
		const expected = opening.get(token.value);
		if (!expected) {
			continue;
		}
		const last = stack.pop();
		if (!last || last.value !== expected) {
			issues.push({
				range: rangeFromToken(token),
				message: `Délimiteur fermant '${token.value}' inattendu`,
				severity: 'error',
				code: 'unbalanced-delimiter'
			});
		}
	}

	for (const token of stack) {
		issues.push({
			range: rangeFromToken(token),
			message: `Délimiteur '${token.value}' non fermé`,
			severity: 'error',
			code: 'unclosed-delimiter'
		});
	}

	return issues;
}

function checkImports(tokens: Token[]): RhaiIssue[] {
	const issues: RhaiIssue[] = [];

	for (let index = 0; index < tokens.length; index++) {
		const token = tokens[index];
		if (token.kind !== 'keyword' || token.value !== 'import') {
			continue;
		}
		const module = tokens[index + 1];
		const next = tokens[index + 2];
		if (!module || module.kind !== 'string') {
			continue;
		}
		if (!next || next.kind !== 'keyword' || next.value !== 'as') {
			issues.push({
				range: rangeFromToken(module),
				message: "Import sans alias : ajouter 'as <nom>'",
				severity: 'error',
				code: 'import-missing-alias'
			});
		}
	}

	return issues;
}

function collectIdentifiers(ast: ModuleAst): Map<string, number> {
	const counts = new Map<string, number>();
	const visit = (expr: Expr): void => {
		if (expr.kind === 'ident') {
			counts.set(expr.name, (counts.get(expr.name) ?? 0) + 1);
		}
	};

	for (const statement of ast.statements) {
		walkStmt(statement, visit);
	}
	for (const declaration of ast.functions) {
		walkBlock(declaration.body, visit);
	}
	for (const declaration of ast.constants) {
		if (declaration.value) {
			walkExpr(declaration.value, visit);
		}
	}

	return counts;
}

function checkBlock(block: Block, issues: RhaiIssue[], owner: string): void {
	let terminated = false;

	for (const statement of block.statements) {
		if (terminated) {
			issues.push({
				range: statement.range,
				message: 'Code inatteignable',
				severity: 'warning',
				code: 'unreachable-code'
			});
		}
		if (statement.kind === 'return' || statement.kind === 'throw' || statement.kind === 'break' || statement.kind === 'continue') {
			terminated = true;
		}

		switch (statement.kind) {
			case 'if':
				checkBlock(statement.then, issues, 'if');
				if (statement.else) {
					checkBlock(statement.else, issues, 'if');
				}
				break;
			case 'while':
			case 'for':
			case 'loop':
				if (statement.body.statements.length === 0) {
					issues.push({
						range: statement.range,
						message: 'Bloc vide',
						severity: 'info',
						code: 'empty-block'
					});
				}
				checkBlock(statement.body, issues, 'loop');
				break;
			case 'try':
				checkBlock(statement.body, issues, 'try');
				if (statement.catchBody) {
					checkBlock(statement.catchBody, issues, 'catch');
				}
				break;
			case 'block':
				checkBlock(statement.body, issues, owner);
				break;
			default:
				break;
		}
	}
}

function collectLetStatements(block: Block, out: { name: string; range: Range }[]): void {
	for (const statement of block.statements) {
		collectFromStatement(statement, out);
	}
}

function collectFromStatement(statement: Stmt, out: { name: string; range: Range }[]): void {
	switch (statement.kind) {
		case 'let':
			out.push({ name: statement.name, range: statement.range });
			break;
		case 'if':
			collectLetStatements(statement.then, out);
			if (statement.else) {
				collectLetStatements(statement.else, out);
			}
			break;
		case 'while':
		case 'for':
		case 'loop':
			collectLetStatements(statement.body, out);
			break;
		case 'try':
			collectLetStatements(statement.body, out);
			if (statement.catchBody) {
				collectLetStatements(statement.catchBody, out);
			}
			break;
		case 'switch':
			for (const switchCase of statement.cases) {
				collectLetStatements(switchCase.body, out);
			}
			break;
		case 'fn':
			collectLetStatements(statement.declaration.body, out);
			break;
		case 'block':
			collectLetStatements(statement.body, out);
			break;
		default:
			break;
	}
}

export function computeDiagnostics(text: string): RhaiIssue[] {
	const issues: RhaiIssue[] = [];
	const ast = parse(text);
	const tokens = tokenize(text);
	const identifierCounts = collectIdentifiers(ast);

	const importIssues = checkImports(tokens);
	const flaggedLines = new Set(importIssues.map((issue) => issue.range.start.line));

	for (const error of ast.errors) {
		if (flaggedLines.has(error.range.start.line) && error.message.includes("'as'")) {
			continue;
		}
		issues.push({ range: error.range, message: error.message, severity: 'error', code: 'parse' });
	}

	for (const token of tokens) {
		if (token.kind !== 'string') {
			continue;
		}
		const quote = token.value[0];
		if (token.value.length < 2 || !token.value.endsWith(quote)) {
			issues.push({
				range: rangeFromToken(token),
				message: 'Chaîne non terminée',
				severity: 'error',
				code: 'unterminated-string'
			});
		}
	}

	issues.push(...checkDelimiters(tokens), ...importIssues);

	for (const declaration of ast.imports) {
		if ((identifierCounts.get(declaration.alias) ?? 0) === 0) {
			issues.push({
				range: declaration.range,
				message: `Import '${declaration.alias}' inutilisé`,
				severity: 'warning',
				code: 'unused-import'
			});
		}
	}

	for (const declaration of ast.constants) {
		if ((identifierCounts.get(declaration.name) ?? 0) === 0) {
			issues.push({
				range: declaration.range,
				message: `Constante '${declaration.name}' inutilisée`,
				severity: 'warning',
				code: 'unused-constant'
			});
		}
	}

	for (const declaration of ast.functions) {
		const lets: { name: string; range: Range }[] = [];
		collectLetStatements(declaration.body, lets);
		for (const variable of lets) {
			if ((identifierCounts.get(variable.name) ?? 0) === 0) {
				issues.push({
					range: variable.range,
					message: `Variable '${variable.name}' inutilisée`,
					severity: 'warning',
					code: 'unused-variable'
				});
			}
		}
		checkBlock(declaration.body, issues, declaration.name);
	}

	for (const token of tokens) {
		if (token.kind !== 'comment' && token.kind !== 'doc') {
			continue;
		}
		if (TODO_PATTERN.test(token.value)) {
			issues.push({
				range: rangeFromToken(token),
				message: 'Marqueur TODO/FIXME',
				severity: 'info',
				code: 'todo-marker'
			});
		}
	}

	return issues;
}

function severityOf(severity: IssueSeverity): vscode.DiagnosticSeverity {
	switch (severity) {
		case 'error':
			return vscode.DiagnosticSeverity.Error;
		case 'warning':
			return vscode.DiagnosticSeverity.Warning;
		default:
			return vscode.DiagnosticSeverity.Information;
	}
}

export function toDiagnostic(issue: RhaiIssue): vscode.Diagnostic {
	const range = new vscode.Range(
		issue.range.start.line,
		issue.range.start.character,
		issue.range.end.line,
		issue.range.end.character
	);
	const diagnostic = new vscode.Diagnostic(range, issue.message, severityOf(issue.severity));
	diagnostic.code = issue.code;
	diagnostic.source = 'rhai';
	return diagnostic;
}

function diagnosticsEnabled(): boolean {
	return vscode.workspace.getConfiguration('rhai').get<boolean>('diagnostics.enable', true);
}

export class RhaiDiagnosticsProvider implements vscode.Disposable {
	private readonly collection = vscode.languages.createDiagnosticCollection('rhai');
	private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

	refresh(document: vscode.TextDocument): void {
		const key = document.uri.toString();
		const pending = this.timers.get(key);
		if (pending) {
			clearTimeout(pending);
		}
		this.timers.set(
			key,
			setTimeout(() => {
				this.timers.delete(key);
				this.update(document);
			}, DEBOUNCE_MS)
		);
	}

	update(document: vscode.TextDocument): void {
		if (!diagnosticsEnabled()) {
			this.collection.delete(document.uri);
			return;
		}
		const issues = computeDiagnostics(document.getText());
		this.collection.set(document.uri, issues.map(toDiagnostic));
	}

	clear(document: vscode.TextDocument): void {
		this.collection.delete(document.uri);
	}

	dispose(): void {
		for (const timer of this.timers.values()) {
			clearTimeout(timer);
		}
		this.timers.clear();
		this.collection.dispose();
	}
}

export function registerDiagnostics(): vscode.Disposable {
	const provider = new RhaiDiagnosticsProvider();

	return vscode.Disposable.from(
		provider,
		vscode.workspace.onDidOpenTextDocument((document) => provider.refresh(document)),
		vscode.workspace.onDidChangeTextDocument((event) => provider.refresh(event.document)),
		vscode.workspace.onDidSaveTextDocument((document) => provider.refresh(document)),
		vscode.workspace.onDidCloseTextDocument((document) => provider.clear(document))
	);
}
