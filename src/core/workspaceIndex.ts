import * as vscode from 'vscode';
import { Expr, ModuleAst, Range } from './ast';
import { parse } from './parser';
import { walkBlock, walkExpr, walkStmt } from './walk';

export type SymbolKind = 'function' | 'constant';

export interface SymbolRef {
	uri: vscode.Uri;
	name: string;
	kind: SymbolKind;
	line: number;
	range: Range;
	nameRange: Range;
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
				nameRange: declaration.nameRange,
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
				nameRange: declaration.nameRange,
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
			if (expr.kind === 'ident') {
				const occurrences = this.identifiers.get(expr.name) ?? [];
				occurrences.push({ uri, name: expr.name, range: expr.range });
				this.identifiers.set(expr.name, occurrences);
				return;
			}
			if (expr.kind === 'member' && expr.separator === '::') {
				const occurrences = this.identifiers.get(expr.name) ?? [];
				occurrences.push({ uri, name: expr.name, range: expr.nameRange });
				this.identifiers.set(expr.name, occurrences);
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
	}
}

export function registerWorkspaceIndexWatchers(index: WorkspaceIndex): vscode.Disposable {
	const watcher = vscode.workspace.createFileSystemWatcher('**/*.rhai');
	watcher.onDidChange(() => index.invalidate());
	watcher.onDidCreate(() => index.invalidate());
	watcher.onDidDelete(() => index.invalidate());
	return watcher;
}
