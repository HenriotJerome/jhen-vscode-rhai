import * as vscode from 'vscode';
import { Block, Expr, ModuleAst, Range, Stmt } from './ast';
import { parse } from './parser';

export type SymbolKind = 'function' | 'constant';

export interface SymbolRef {
	uri: vscode.Uri;
	name: string;
	kind: SymbolKind;
	line: number;
	range: Range;
	doc: string[];
}

export interface ModuleRef {
	module: string;
	alias: string;
	uri: vscode.Uri;
	line: number;
	range: Range;
}

export interface IdentifierOccurrence {
	uri: vscode.Uri;
	name: string;
	range: Range;
}

const MAX_FILES = 1000;

function walkBlock(block: Block, visit: (expr: Expr) => void): void {
	for (const statement of block.statements) {
		walkStmt(statement, visit);
	}
}

function walkStmt(stmt: Stmt, visit: (expr: Expr) => void): void {
	switch (stmt.kind) {
		case 'let':
		case 'const':
			if (stmt.value) {
				walkExpr(stmt.value, visit);
			}
			break;
		case 'expr':
			walkExpr(stmt.expr, visit);
			break;
		case 'if':
			walkExpr(stmt.condition, visit);
			walkBlock(stmt.then, visit);
			if (stmt.else) {
				walkBlock(stmt.else, visit);
			}
			break;
		case 'while':
			walkExpr(stmt.condition, visit);
			walkBlock(stmt.body, visit);
			break;
		case 'for':
			walkExpr(stmt.iterable, visit);
			walkBlock(stmt.body, visit);
			break;
		case 'loop':
			walkBlock(stmt.body, visit);
			break;
		case 'return':
		case 'break':
		case 'throw':
			if (stmt.value) {
				walkExpr(stmt.value, visit);
			}
			break;
		case 'try':
			walkBlock(stmt.body, visit);
			if (stmt.catchBody) {
				walkBlock(stmt.catchBody, visit);
			}
			break;
		case 'switch':
			walkExpr(stmt.subject, visit);
			for (const switchCase of stmt.cases) {
				if (switchCase.test) {
					walkExpr(switchCase.test, visit);
				}
				walkBlock(switchCase.body, visit);
			}
			break;
		case 'fn':
			walkBlock(stmt.declaration.body, visit);
			break;
		case 'block':
			walkBlock(stmt.body, visit);
			break;
		case 'continue':
			break;
	}
}

function walkExpr(expr: Expr, visit: (expr: Expr) => void): void {
	visit(expr);

	switch (expr.kind) {
		case 'ident':
		case 'literal':
			break;
		case 'array':
			for (const element of expr.elements) {
				walkExpr(element, visit);
			}
			break;
		case 'map':
			for (const entry of expr.entries) {
				if (entry.value) {
					walkExpr(entry.value, visit);
				}
			}
			break;
		case 'call':
			walkExpr(expr.callee, visit);
			for (const argument of expr.args) {
				walkExpr(argument, visit);
			}
			break;
		case 'method':
			walkExpr(expr.receiver, visit);
			for (const argument of expr.args) {
				walkExpr(argument, visit);
			}
			break;
		case 'member':
			walkExpr(expr.receiver, visit);
			break;
		case 'index':
			walkExpr(expr.receiver, visit);
			walkExpr(expr.index, visit);
			break;
		case 'unary':
			walkExpr(expr.operand, visit);
			break;
		case 'binary':
			walkExpr(expr.left, visit);
			walkExpr(expr.right, visit);
			break;
		case 'paren':
			walkExpr(expr.expr, visit);
			break;
		case 'closure':
			walkBlock(expr.body, visit);
			break;
		case 'ifExpr':
			walkExpr(expr.condition, visit);
			walkBlock(expr.then, visit);
			if (expr.else) {
				walkBlock(expr.else, visit);
			}
			break;
		case 'blockExpr':
			walkBlock(expr.body, visit);
			break;
		case 'range':
			if (expr.from) {
				walkExpr(expr.from, visit);
			}
			if (expr.to) {
				walkExpr(expr.to, visit);
			}
			break;
	}
}

export class WorkspaceIndex {
	private readonly asts = new Map<string, ModuleAst>();
	private readonly files = new Map<string, vscode.Uri>();
	private readonly functions = new Map<string, SymbolRef[]>();
	private readonly constants = new Map<string, SymbolRef[]>();
	private readonly identifiers = new Map<string, IdentifierOccurrence[]>();
	private modules: ModuleRef[] = [];
	private loaded = false;
	private loading: Promise<void> | undefined;

	invalidate(): void {
		this.asts.clear();
		this.files.clear();
		this.functions.clear();
		this.constants.clear();
		this.identifiers.clear();
		this.modules = [];
		this.loaded = false;
		this.loading = undefined;
	}

	async ensureLoaded(): Promise<void> {
		if (this.loaded) {
			return;
		}
		if (!this.loading) {
			this.loading = this.load();
		}
		await this.loading;
	}

	getAst(uri: vscode.Uri): ModuleAst | undefined {
		return this.asts.get(uri.toString());
	}

	getFunctions(name: string): SymbolRef[] {
		return this.functions.get(name) ?? [];
	}

	getConstants(name: string): SymbolRef[] {
		return this.constants.get(name) ?? [];
	}

	getModules(): ModuleRef[] {
		return this.modules;
	}

	getReferences(name: string): IdentifierOccurrence[] {
		return this.identifiers.get(name) ?? [];
	}

	getAllFunctions(): SymbolRef[] {
		return [...this.functions.values()].flat();
	}

	getAllConstants(): SymbolRef[] {
		return [...this.constants.values()].flat();
	}

	getFiles(): vscode.Uri[] {
		return [...this.files.values()];
	}

	private async load(): Promise<void> {
		try {
			const files = await vscode.workspace.findFiles('**/*.rhai', undefined, MAX_FILES);
			for (const uri of files) {
				if (uri.path.endsWith('.d.rhai')) {
					continue;
				}
				await this.loadFile(uri);
			}
		} catch (error) {
			console.warn(`[workspaceIndex] loading failed: ${error}`);
		} finally {
			this.loaded = true;
		}
	}

	private async loadFile(uri: vscode.Uri): Promise<void> {
		let text: string;
		try {
			text = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
		} catch (error) {
			console.warn(`[workspaceIndex] cannot read ${uri.toString()}: ${error}`);
			return;
		}

		const ast = parse(text);
		this.asts.set(uri.toString(), ast);
		this.files.set(uri.toString(), uri);

		for (const declaration of ast.functions) {
			this.pushSymbol(this.functions, declaration.name, {
				uri,
				name: declaration.name,
				kind: 'function',
				line: declaration.line,
				range: declaration.range,
				doc: declaration.doc
			});
		}

		for (const declaration of ast.constants) {
			this.pushSymbol(this.constants, declaration.name, {
				uri,
				name: declaration.name,
				kind: 'constant',
				line: declaration.line,
				range: declaration.range,
				doc: declaration.doc
			});
		}

		for (const declaration of ast.imports) {
			this.modules.push({
				module: declaration.module,
				alias: declaration.alias,
				uri,
				line: declaration.range.start.line,
				range: declaration.range
			});
		}

		this.collectIdentifiers(uri, ast);
	}

	private pushSymbol(target: Map<string, SymbolRef[]>, name: string, ref: SymbolRef): void {
		const refs = target.get(name) ?? [];
		refs.push(ref);
		target.set(name, refs);
	}

	private collectIdentifiers(uri: vscode.Uri, ast: ModuleAst): void {
		const visit = (expr: Expr): void => {
			if (expr.kind !== 'ident') {
				return;
			}
			const occurrences = this.identifiers.get(expr.name) ?? [];
			occurrences.push({ uri, name: expr.name, range: expr.range });
			this.identifiers.set(expr.name, occurrences);
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
	}
}

export function registerWorkspaceIndexWatchers(index: WorkspaceIndex): vscode.Disposable {
	const watcher = vscode.workspace.createFileSystemWatcher('**/*.rhai');
	watcher.onDidChange(() => index.invalidate());
	watcher.onDidCreate(() => index.invalidate());
	watcher.onDidDelete(() => index.invalidate());
	return watcher;
}
