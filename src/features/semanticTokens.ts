import * as vscode from 'vscode';
import { Block, Expr, ModuleAst, Range, Stmt } from '../core/ast';
import { Token, tokenize } from '../core/lexer';
import { parse } from '../core/parser';

export const TOKEN_TYPES = [
	'function',
	'variable',
	'parameter',
	'property',
	'keyword',
	'comment',
	'string',
	'number',
	'operator',
	'namespace'
];

export const TOKEN_MODIFIERS = ['declaration', 'readonly', 'defaultLibrary'];

const OPERATORS = new Set([
	'+', '-', '*', '/', '%', '**', '==', '!=', '<', '<=', '>', '>=', '&&', '||',
	'!', '~', '&', '|', '^', '=', '+=', '-=', '*=', '/=', '%=', '<<', '>>',
	'<<=', '>>=', '**=', '??', '..', '..=', '->', '=>', '::', '.', '?'
]);

interface Role {
	type: string;
	modifiers: string[];
}

interface Segment {
	line: number;
	start: number;
	length: number;
	type: string;
	modifiers: string[];
}

function keyOf(range: Range): string {
	return `${range.start.line}:${range.start.character}`;
}

function modifierMask(modifiers: string[]): number {
	let mask = 0;
	for (const modifier of modifiers) {
		const index = TOKEN_MODIFIERS.indexOf(modifier);
		if (index >= 0) {
			mask |= 1 << index;
		}
	}
	return mask;
}

function buildRoleMap(ast: ModuleAst): Map<string, Role> {
	const roles = new Map<string, Role>();

	const declare = (range: Range, role: Role): void => {
		roles.set(keyOf(range), role);
	};

	for (const declaration of ast.functions) {
		declare(declaration.nameRange, { type: 'function', modifiers: ['declaration'] });
		for (const param of declaration.params) {
			declare(param.range, { type: 'parameter', modifiers: ['declaration'] });
		}
	}

	for (const declaration of ast.constants) {
		declare(declaration.nameRange, { type: 'variable', modifiers: ['declaration', 'readonly'] });
	}

	for (const declaration of ast.imports) {
		declare(declaration.aliasRange, { type: 'namespace', modifiers: ['declaration'] });
	}

	const visitExpression = (expr: Expr): void => {
		switch (expr.kind) {
			case 'call':
				if (expr.callee.kind === 'ident') {
					declare(expr.callee.range, { type: 'function', modifiers: [] });
				}
				break;
			case 'member':
				if (expr.separator === '::') {
					declare(expr.nameRange, { type: 'function', modifiers: [] });
				} else {
					declare(expr.nameRange, { type: 'property', modifiers: [] });
				}
				break;
			default:
				break;
		}
	};

	const visitBlock = (block: Block): void => {
		for (const statement of block.statements) {
			visitStatement(statement);
		}
	};

	const visitStatement = (statement: Stmt): void => {
		switch (statement.kind) {
			case 'let':
				declare(statement.nameRange, { type: 'variable', modifiers: ['declaration'] });
				if (statement.value) {
					walk(statement.value);
				}
				break;
			case 'const':
				declare(statement.nameRange, { type: 'variable', modifiers: ['declaration', 'readonly'] });
				if (statement.value) {
					walk(statement.value);
				}
				break;
			case 'expr':
				walk(statement.expr);
				break;
			case 'for':
				declare(statement.range, { type: 'variable', modifiers: ['declaration'] });
				walk(statement.iterable);
				visitBlock(statement.body);
				break;
			case 'if':
				walk(statement.condition);
				visitBlock(statement.then);
				if (statement.else) {
					visitBlock(statement.else);
				}
				break;
			case 'while':
				walk(statement.condition);
				visitBlock(statement.body);
				break;
			case 'loop':
				visitBlock(statement.body);
				break;
			case 'return':
			case 'break':
			case 'throw':
				if (statement.value) {
					walk(statement.value);
				}
				break;
			case 'try':
				visitBlock(statement.body);
				if (statement.catchBody) {
					visitBlock(statement.catchBody);
				}
				break;
			case 'switch':
				walk(statement.subject);
				for (const switchCase of statement.cases) {
					if (switchCase.test) {
						walk(switchCase.test);
					}
					visitBlock(switchCase.body);
				}
				break;
			case 'fn':
				visitBlock(statement.declaration.body);
				break;
			case 'block':
				visitBlock(statement.body);
				break;
			default:
				break;
		}
	};

	const walk = (expr: Expr): void => {
		visitExpression(expr);
		switch (expr.kind) {
			case 'array':
				expr.elements.forEach(walk);
				break;
			case 'map':
				expr.entries.forEach((entry) => {
					if (entry.value) {
						walk(entry.value);
					}
				});
				break;
			case 'call':
				walk(expr.callee);
				expr.args.forEach(walk);
				break;
			case 'method':
				walk(expr.receiver);
				expr.args.forEach(walk);
				break;
			case 'member':
				walk(expr.receiver);
				break;
			case 'index':
				walk(expr.receiver);
				walk(expr.index);
				break;
			case 'unary':
				walk(expr.operand);
				break;
			case 'binary':
				walk(expr.left);
				walk(expr.right);
				break;
			case 'paren':
				walk(expr.expr);
				break;
			case 'closure':
				visitBlock(expr.body);
				break;
			case 'ifExpr':
				walk(expr.condition);
				visitBlock(expr.then);
				if (expr.else) {
					visitBlock(expr.else);
				}
				break;
			case 'blockExpr':
				visitBlock(expr.body);
				break;
			case 'range':
				if (expr.from) {
					walk(expr.from);
				}
				if (expr.to) {
					walk(expr.to);
				}
				break;
			default:
				break;
		}
	};

	for (const statement of ast.statements) {
		visitStatement(statement);
	}
	for (const declaration of ast.functions) {
		visitBlock(declaration.body);
	}
	for (const declaration of ast.constants) {
		if (declaration.value) {
			walk(declaration.value);
		}
	}

	return roles;
}

function expandToken(token: Token): Segment[] {
	if (token.kind === 'eof') {
		return [];
	}

	if (!token.value.includes('\n')) {
		return [{
			line: token.line,
			start: token.column,
			length: token.value.length,
			type: '',
			modifiers: []
		}];
	}

	return token.value.split('\n').map((part, index) => ({
		line: token.line + index,
		start: index === 0 ? token.column : 0,
		length: part.replace(/\r$/, '').length,
		type: '',
		modifiers: []
	}));
}

export function computeSemanticTokens(text: string): number[] {
	const roles = buildRoleMap(parse(text));
	const segments: Segment[] = [];

	for (const token of tokenize(text)) {
		let type: string | undefined;
		let modifiers: string[] = [];

		switch (token.kind) {
			case 'keyword':
				if (token.value === 'this') {
					type = 'variable';
					modifiers = ['defaultLibrary'];
				} else {
					type = 'keyword';
				}
				break;
			case 'string':
				type = 'string';
				break;
			case 'number':
				type = 'number';
				break;
			case 'comment':
			case 'doc':
				type = 'comment';
				break;
			case 'punct':
				if (OPERATORS.has(token.value)) {
					type = 'operator';
				}
				break;
			case 'ident': {
				const role = roles.get(`${token.line}:${token.column}`);
				type = role?.type ?? 'variable';
				modifiers = role?.modifiers ?? [];
				break;
			}
			default:
				break;
		}

		if (!type) {
			continue;
		}

		for (const segment of expandToken(token)) {
			if (segment.length === 0) {
				continue;
			}
			segments.push({ ...segment, type, modifiers });
		}
	}

	segments.sort((a, b) => (a.line === b.line ? a.start - b.start : a.line - b.line));

	const data: number[] = [];
	let previousLine = 0;
	let previousStart = 0;

	for (const segment of segments) {
		const typeIndex = TOKEN_TYPES.indexOf(segment.type);
		if (typeIndex < 0) {
			continue;
		}
		const deltaLine = segment.line - previousLine;
		const deltaStart = deltaLine === 0 ? segment.start - previousStart : segment.start;
		data.push(deltaLine, deltaStart, segment.length, typeIndex, modifierMask(segment.modifiers));
		previousLine = segment.line;
		previousStart = segment.start;
	}

	return data;
}

export const SEMANTIC_TOKENS_LEGEND = new vscode.SemanticTokensLegend(TOKEN_TYPES, TOKEN_MODIFIERS);

export class RhaiSemanticTokensProvider implements vscode.DocumentSemanticTokensProvider {
	provideDocumentSemanticTokens(document: vscode.TextDocument): vscode.SemanticTokens {
		return new vscode.SemanticTokens(new Uint32Array(computeSemanticTokens(document.getText())));
	}
}
