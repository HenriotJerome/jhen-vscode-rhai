import * as vscode from 'vscode';
import { Block, Expr, ModuleAst, Range, Stmt } from '../core/ast';
import { parse } from '../core/parser';

export interface PositionData {
	line: number;
	character: number;
}

function compare(a: PositionData, b: PositionData): number {
	return a.line === b.line ? a.character - b.character : a.line - b.line;
}

function contains(range: Range, position: PositionData): boolean {
	return compare(range.start, position) <= 0 && compare(position, range.end) <= 0;
}

function size(range: Range): number {
	return (range.end.line - range.start.line) * 10000 + (range.end.character - range.start.character);
}

function collectBlock(block: Block, out: Range[]): void {
	out.push(block.range);
	for (const statement of block.statements) {
		collectStatement(statement, out);
	}
}

function collectStatement(statement: Stmt, out: Range[]): void {
	out.push(statement.range);

	switch (statement.kind) {
		case 'let':
		case 'const':
			if (statement.value) {
				collectExpression(statement.value, out);
			}
			break;
		case 'expr':
			collectExpression(statement.expr, out);
			break;
		case 'if':
			collectExpression(statement.condition, out);
			collectBlock(statement.then, out);
			if (statement.else) {
				collectBlock(statement.else, out);
			}
			break;
		case 'while':
			collectExpression(statement.condition, out);
			collectBlock(statement.body, out);
			break;
		case 'for':
			collectExpression(statement.iterable, out);
			collectBlock(statement.body, out);
			break;
		case 'loop':
			collectBlock(statement.body, out);
			break;
		case 'return':
		case 'break':
		case 'throw':
			if (statement.value) {
				collectExpression(statement.value, out);
			}
			break;
		case 'try':
			collectBlock(statement.body, out);
			if (statement.catchBody) {
				collectBlock(statement.catchBody, out);
			}
			break;
		case 'switch':
			collectExpression(statement.subject, out);
			for (const switchCase of statement.cases) {
				if (switchCase.test) {
					collectExpression(switchCase.test, out);
				}
				collectBlock(switchCase.body, out);
			}
			break;
		case 'fn':
			collectBlock(statement.declaration.body, out);
			break;
		case 'block':
			collectBlock(statement.body, out);
			break;
		case 'continue':
			break;
	}
}

function collectExpression(expr: Expr, out: Range[]): void {
	out.push(expr.range);

	switch (expr.kind) {
		case 'ident':
		case 'literal':
			break;
		case 'array':
			for (const element of expr.elements) {
				collectExpression(element, out);
			}
			break;
		case 'map':
			for (const entry of expr.entries) {
				if (entry.value) {
					collectExpression(entry.value, out);
				}
			}
			break;
		case 'call':
			collectExpression(expr.callee, out);
			for (const argument of expr.args) {
				collectExpression(argument, out);
			}
			break;
		case 'method':
			collectExpression(expr.receiver, out);
			for (const argument of expr.args) {
				collectExpression(argument, out);
			}
			break;
		case 'member':
			collectExpression(expr.receiver, out);
			break;
		case 'index':
			collectExpression(expr.receiver, out);
			collectExpression(expr.index, out);
			break;
		case 'unary':
			collectExpression(expr.operand, out);
			break;
		case 'binary':
			collectExpression(expr.left, out);
			collectExpression(expr.right, out);
			break;
		case 'paren':
			collectExpression(expr.expr, out);
			break;
		case 'closure':
			collectBlock(expr.body, out);
			break;
		case 'ifExpr':
			collectExpression(expr.condition, out);
			collectBlock(expr.then, out);
			if (expr.else) {
				collectBlock(expr.else, out);
			}
			break;
		case 'blockExpr':
			collectBlock(expr.body, out);
			break;
		case 'range':
			if (expr.from) {
				collectExpression(expr.from, out);
			}
			if (expr.to) {
				collectExpression(expr.to, out);
			}
			break;
	}
}

export function collectRanges(ast: ModuleAst): Range[] {
	const ranges: Range[] = [];

	for (const declaration of ast.functions) {
		ranges.push(declaration.range);
		collectBlock(declaration.body, ranges);
	}
	for (const declaration of ast.constants) {
		if (declaration.value) {
			collectExpression(declaration.value, ranges);
		}
	}
	for (const statement of ast.statements) {
		collectStatement(statement, ranges);
	}

	return ranges;
}

export function buildSelectionChain(ranges: Range[], position: PositionData): Range[] {
	const candidates = ranges
		.filter((range) => contains(range, position))
		.sort((a, b) => size(a) - size(b));

	const chain: Range[] = [];
	for (const range of candidates) {
		const previous = chain[chain.length - 1];
		if (previous && previous.start.line === range.start.line
			&& previous.start.character === range.start.character
			&& previous.end.line === range.end.line
			&& previous.end.character === range.end.character) {
			continue;
		}
		chain.push(range);
	}

	return chain;
}

export class RhaiSelectionRangeProvider implements vscode.SelectionRangeProvider {
	provideSelectionRanges(
		document: vscode.TextDocument,
		positions: vscode.Position[],
		_token: vscode.CancellationToken
	): vscode.SelectionRange[] {
		const ast = parse(document.getText());
		const ranges = collectRanges(ast);

		return positions.map((position) => {
			const chain = buildSelectionChain(ranges, position);
			let node: vscode.SelectionRange | undefined;

			for (const range of chain) {
				node = new vscode.SelectionRange(
					new vscode.Range(
						range.start.line,
						range.start.character,
						range.end.line,
						range.end.character
					),
					node
				);
			}

			return node ?? new vscode.SelectionRange(new vscode.Range(position.line, position.character, position.line, position.character));
		});
	}
}
