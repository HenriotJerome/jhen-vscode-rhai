import * as vscode from 'vscode';
import { Expr, ModuleAst, Range } from '../core/ast';
import { walkBlock, walkExpr, walkStmt } from '../core/walk';

export function wordAt(document: vscode.TextDocument, position: vscode.Position): string | undefined {
	const range = document.getWordRangeAtPosition(position);
	return range ? document.getText(range) : undefined;
}

export function toVscodeRange(range: Range): vscode.Range {
	return new vscode.Range(
		range.start.line,
		range.start.character,
		range.end.line,
		range.end.character
	);
}

export function collectOccurrences(ast: ModuleAst, name: string): Range[] {
	const ranges: Range[] = [];

	const visit = (expr: Expr): void => {
		if (expr.kind === 'ident' && expr.name === name) {
			ranges.push(expr.range);
			return;
		}
		if (expr.kind === 'member' && expr.separator === '::' && expr.name === name) {
			ranges.push(expr.nameRange);
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

	return ranges;
}
