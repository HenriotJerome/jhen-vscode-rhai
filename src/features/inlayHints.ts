import * as vscode from 'vscode';
import { Expr } from '../core/ast';
import { parse } from '../core/parser';
import { walkBlock, walkExpr, walkStmt } from '../core/walk';
import { NativeApiIndex } from '../host/nativeApi';

export interface ParameterHint {
	line: number;
	character: number;
	label: string;
}

export function computeParameterHints(text: string, nativeApi: NativeApiIndex): ParameterHint[] {
	const ast = parse(text);
	const hints: ParameterHint[] = [];

	const visit = (expr: Expr): void => {
		if (expr.kind !== 'call' || expr.callee.kind !== 'ident') {
			return;
		}

		const overloads = nativeApi.getOverloads(expr.callee.name);
		if (overloads.length === 0) {
			return;
		}

		const overload = overloads.find((item) => item.numParams === expr.args.length) ?? overloads[0];
		const params = overload.params ?? [];

		expr.args.forEach((argument, index) => {
			const param = params[index];
			if (!param || !param.name || param.name === '_') {
				return;
			}
			hints.push({
				line: argument.range.start.line,
				character: argument.range.start.character,
				label: `${param.name}:`
			});
		});
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

	return hints;
}

function hintsEnabled(): boolean {
	return vscode.workspace.getConfiguration('rhai').get<boolean>('inlayHints.enable', true);
}

export class RhaiInlayHintsProvider implements vscode.InlayHintsProvider {
	constructor(private readonly nativeApi: NativeApiIndex) {}

	async provideInlayHints(
		document: vscode.TextDocument,
		range: vscode.Range,
		_token: vscode.CancellationToken
	): Promise<vscode.InlayHint[]> {
		if (!hintsEnabled()) {
			return [];
		}

		await this.nativeApi.ensureLoaded();

		return computeParameterHints(document.getText(), this.nativeApi)
			.filter((hint) => hint.line >= range.start.line && hint.line <= range.end.line)
			.map((hint) => {
				const inlay = new vscode.InlayHint(
					new vscode.Position(hint.line, hint.character),
					hint.label,
					vscode.InlayHintKind.Parameter
				);
				inlay.paddingRight = true;
				return inlay;
			});
	}
}
