import {
	Block,
	ClosureExpr,
	ConstDecl,
	Expr,
	FunctionDecl,
	ImportDecl,
	MapEntry,
	ModuleAst,
	Param,
	ParseError,
	Range,
	Stmt,
	SwitchCase,
	Visibility
} from './ast';
import { Token, isKeyword, tokenize } from './lexer';

class ParseFailure extends Error {
	constructor(message: string, readonly token: Token) {
		super(message);
	}
}

const BINARY_PRECEDENCE: Record<string, number> = {
	'||': 1,
	'??': 2,
	'&&': 3,
	'|': 4,
	'^': 5,
	'&': 6,
	'==': 7,
	'!=': 7,
	'<': 8,
	'<=': 8,
	'>': 8,
	'>=': 8,
	in: 9,
	'..': 10,
	'..=': 10,
	'+': 11,
	'-': 11,
	'*': 12,
	'/': 12,
	'%': 12,
	'**': 13
};

const RIGHT_ASSOCIATIVE = new Set(['**']);

const ASSIGNMENT_OPERATORS = new Set([
	'=', '+=', '-=', '*=', '/=', '%=', '**=', '<<=', '>>=', '&=', '|=', '^='
]);

function tokenEnd(token: Token): { line: number; character: number } {
	return { line: token.line, character: token.column + token.value.length };
}

function tokenStart(token: Token): { line: number; character: number } {
	return { line: token.line, character: token.column };
}

function docText(token: Token): string {
	return token.value.replace(/^\/\/[/!]\s?/, '').trimEnd();
}

export class Parser {
	private readonly tokens: Token[];
	private index = 0;
	private readonly errors: ParseError[] = [];

	constructor(text: string) {
		this.tokens = tokenize(text).filter((token) => token.kind !== 'comment');
	}

	parseModule(): ModuleAst {
		const imports: ImportDecl[] = [];
		const functions: FunctionDecl[] = [];
		const constants: ConstDecl[] = [];
		const statements: Stmt[] = [];
		let pendingDoc: string[] = [];

		while (!this.atEnd()) {
			if (this.peek().kind === 'doc') {
				pendingDoc.push(docText(this.peek()));
				this.advance();
				continue;
			}
			try {
				if (this.checkPunct(';')) {
					this.advance();
					continue;
				}
				if (this.checkKeyword('import')) {
					imports.push(this.parseImport());
					pendingDoc = [];
					continue;
				}
				if (this.isFunctionStart()) {
					functions.push(this.parseFunction(pendingDoc));
					pendingDoc = [];
					continue;
				}
				if (this.checkKeyword('const')) {
					constants.push(this.parseConst(pendingDoc));
					pendingDoc = [];
					continue;
				}
				statements.push(this.parseStatement());
				pendingDoc = [];
			} catch (error) {
				this.recordFailure(error);
				this.synchronize();
				pendingDoc = [];
			}
		}

		return { imports, functions, constants, statements, errors: this.errors };
	}

	private parseImport(): ImportDecl {
		const start = this.expectKeyword('import');
		const module = this.expectString();
		this.expectKeyword('as');
		const alias = this.expectIdentifier();
		this.expectPunct(';');
		return {
			module: module.value.slice(1, -1),
			alias: alias.value,
			range: { start: tokenStart(start), end: tokenEnd(alias) }
		};
	}

	private parseFunction(doc: string[]): FunctionDecl {
		let visibility: Visibility = 'public';
		if (this.checkKeyword('private')) {
			this.advance();
			visibility = 'private';
		}

		const start = this.expectKeyword('fn');
		const name = this.expectIdentifier();
		this.expectPunct('(');
		const params: Param[] = [];
		if (!this.checkPunct(')')) {
			do {
				if (this.checkPunct(')')) {
					break;
				}
				params.push(this.parseParam());
			} while (this.matchPunct(','));
		}
		this.expectPunct(')');

		const body = this.parseBlock();
		return {
			name: name.value,
			params,
			body,
			doc,
			line: start.line,
			visibility,
			range: { start: tokenStart(start), end: body.range.end }
		};
	}

	private parseParam(): Param {
		const name = this.expectIdentifier();
		let type: string | undefined;
		if (this.matchPunct(':')) {
			type = this.parseTypeName();
		}
		let defaultValue: Expr | undefined;
		if (this.matchPunct('=')) {
			defaultValue = this.parseExpression();
		}
		return {
			name: name.value,
			type,
			default: defaultValue,
			range: { start: tokenStart(name), end: tokenEnd(name) }
		};
	}

	private parseTypeName(): string {
		const token = this.peek();
		if (token.kind !== 'ident' && token.kind !== 'keyword') {
			throw new ParseFailure('Type attendu', token);
		}
		this.advance();
		let type = token.value;
		while (this.matchPunct('::')) {
			const next = this.peek();
			if (next.kind !== 'ident') {
				break;
			}
			this.advance();
			type += `::${next.value}`;
		}
		return type;
	}

	private parseConst(doc: string[]): ConstDecl {
		const start = this.expectKeyword('const');
		const name = this.expectIdentifier();
		let value: Expr | undefined;
		if (this.matchPunct('=')) {
			value = this.parseExpression();
		}
		this.expectPunct(';');
		return {
			name: name.value,
			value,
			doc,
			line: start.line,
			range: { start: tokenStart(start), end: tokenEnd(name) }
		};
	}

	private parseStatement(): Stmt {
		if (this.checkKeyword('let')) {
			const start = this.expectKeyword('let');
			const name = this.expectIdentifier();
			let value: Expr | undefined;
			if (this.matchPunct('=')) {
				value = this.parseExpression();
			}
			this.expectPunct(';');
			return { kind: 'let', name: name.value, value, range: { start: tokenStart(start), end: tokenEnd(name) } };
		}

		if (this.checkKeyword('const')) {
			const declaration = this.parseConst([]);
			return { kind: 'const', name: declaration.name, value: declaration.value, range: declaration.range };
		}

		if (this.checkKeyword('if')) {
			return this.parseIf();
		}

		if (this.checkKeyword('while') || this.checkKeyword('do')) {
			return this.parseWhile();
		}

		if (this.checkKeyword('loop')) {
			const start = this.expectKeyword('loop');
			const body = this.parseBlock();
			return { kind: 'loop', body, range: { start: tokenStart(start), end: body.range.end } };
		}

		if (this.checkKeyword('for')) {
			return this.parseFor();
		}

		if (this.checkKeyword('switch')) {
			return this.parseSwitch();
		}

		if (this.checkKeyword('try')) {
			return this.parseTry();
		}

		if (this.checkKeyword('return')) {
			const start = this.expectKeyword('return');
			const value = this.checkPunct(';') ? undefined : this.parseExpression();
			this.expectTerminator();
			return { kind: 'return', value, range: { start: tokenStart(start), end: tokenEnd(start) } };
		}

		if (this.checkKeyword('break')) {
			const start = this.expectKeyword('break');
			const value = this.checkPunct(';') ? undefined : this.parseExpression();
			this.expectTerminator();
			return { kind: 'break', value, range: { start: tokenStart(start), end: tokenEnd(start) } };
		}

		if (this.checkKeyword('continue')) {
			const start = this.expectKeyword('continue');
			this.expectPunct(';');
			return { kind: 'continue', range: { start: tokenStart(start), end: tokenEnd(start) } };
		}

		if (this.checkKeyword('throw')) {
			const start = this.expectKeyword('throw');
			const value = this.checkPunct(';') ? undefined : this.parseExpression();
			this.expectTerminator();
			return { kind: 'throw', value, range: { start: tokenStart(start), end: tokenEnd(start) } };
		}

		if (this.isFunctionStart()) {
			const declaration = this.parseFunction([]);
			return { kind: 'fn', declaration, range: declaration.range };
		}

		if (this.checkPunct('{')) {
			const body = this.parseBlock();
			return { kind: 'block', body, range: body.range };
		}

		const expression = this.parseExpression();
		const assignment = this.peek();
		if (assignment.kind === 'punct' && ASSIGNMENT_OPERATORS.has(assignment.value)) {
			this.advance();
			const value = this.parseExpression();
			const end = this.expectTerminator();
			return {
				kind: 'expr',
				expr: {
					kind: 'binary',
					operator: assignment.value,
					left: expression,
					right: value,
					range: { start: expression.range.start, end: value.range.end }
				},
				range: { start: expression.range.start, end: end ? tokenEnd(end) : value.range.end }
			};
		}
		const end = this.expectTerminator();
		return { kind: 'expr', expr: expression, range: { start: expression.range.start, end: end ? tokenEnd(end) : expression.range.end } };
	}

	private expectTerminator(): Token | undefined {
		if (this.checkPunct(';')) {
			return this.advance();
		}
		if (this.checkPunct('}') || this.atEnd()) {
			return undefined;
		}
		throw new ParseFailure("';' attendu", this.peek());
	}

	private parseIf(): Stmt {
		const start = this.expectKeyword('if');
		const condition = this.parseExpression();
		const then = this.parseBlock();
		let elseBlock: Block | undefined;

		if (this.checkKeyword('else')) {
			this.advance();
			if (this.checkKeyword('if')) {
				const nested = this.parseIf();
				elseBlock = { statements: [nested], range: nested.range };
			} else {
				elseBlock = this.parseBlock();
			}
		}

		const end = elseBlock ? elseBlock.range.end : then.range.end;
		return { kind: 'if', condition, then, else: elseBlock, range: { start: tokenStart(start), end } };
	}

	private parseIfExpression(): Expr {
		const start = this.expectKeyword('if');
		const condition = this.parseExpression();
		const then = this.parseBlock();
		let elseBlock: Block | undefined;

		if (this.checkKeyword('else')) {
			this.advance();
			if (this.checkKeyword('if')) {
				const nested = this.parseIfExpression();
				elseBlock = { statements: [{ kind: 'expr', expr: nested, range: nested.range }], range: nested.range };
			} else {
				elseBlock = this.parseBlock();
			}
		}

		const end = elseBlock ? elseBlock.range.end : then.range.end;
		return { kind: 'ifExpr', condition, then, else: elseBlock, range: { start: tokenStart(start), end } };
	}

	private parseWhile(): Stmt {
		let until = false;
		let start: Token;
		let body: Block;
		let condition: Expr;

		if (this.checkKeyword('do')) {
			start = this.expectKeyword('do');
			body = this.parseBlock();
			if (this.checkKeyword('until')) {
				until = true;
				this.advance();
			} else {
				this.expectKeyword('while');
			}
			condition = this.parseExpression();
			this.expectPunct(';');
			return { kind: 'while', condition, body, until, range: { start: tokenStart(start), end: body.range.end } };
		}

		start = this.expectKeyword('while');
		condition = this.parseExpression();
		body = this.parseBlock();
		return { kind: 'while', condition, body, until, range: { start: tokenStart(start), end: body.range.end } };
	}

	private parseFor(): Stmt {
		const start = this.expectKeyword('for');
		let variable: string;
		let indexVariable: string | undefined;

		if (this.matchPunct('(')) {
			variable = this.expectIdentifier().value;
			if (this.matchPunct(',')) {
				indexVariable = this.expectIdentifier().value;
			}
			this.expectPunct(')');
		} else {
			variable = this.expectIdentifier().value;
		}

		this.expectKeyword('in');
		const iterable = this.parseExpression();
		const body = this.parseBlock();
		return {
			kind: 'for',
			variable,
			indexVariable,
			iterable,
			body,
			range: { start: tokenStart(start), end: body.range.end }
		};
	}

	private parseSwitch(): Stmt {
		const start = this.expectKeyword('switch');
		const subject = this.parseExpression();
		this.expectPunct('{');
		const cases: SwitchCase[] = [];

		while (!this.checkPunct('}') && !this.atEnd()) {
			if (this.checkPunct(',')) {
				this.advance();
				continue;
			}
			const caseStart = this.peek();
			let test: Expr | undefined;
			if (!this.checkPunct('_') && !(this.peek().kind === 'ident' && this.peek().value === '_')) {
				test = this.parseExpression();
				if (this.checkKeyword('if')) {
					this.advance();
					this.parseExpression();
				}
			} else {
				this.advance();
			}
			this.expectPunct('=>');
			const body = this.checkPunct('{') ? this.parseBlock() : this.expressionBody();
			cases.push({ test, body, range: { start: tokenStart(caseStart), end: body.range.end } });
		}

		this.expectPunct('}');
		return { kind: 'switch', subject, cases, range: { start: tokenStart(start), end: tokenEnd(start) } };
	}

	private parseTry(): Stmt {
		const start = this.expectKeyword('try');
		const body = this.parseBlock();
		let catchVariable: string | undefined;
		let catchBody: Block | undefined;

		if (this.checkKeyword('catch')) {
			this.advance();
			if (this.matchPunct('(')) {
				catchVariable = this.expectIdentifier().value;
				this.expectPunct(')');
			}
			catchBody = this.parseBlock();
		}

		const end = catchBody ? catchBody.range.end : body.range.end;
		return { kind: 'try', body, catchVariable, catchBody, range: { start: tokenStart(start), end } };
	}

	private parseBlock(): Block {
		const start = this.expectPunct('{');
		const statements: Stmt[] = [];

		while (!this.checkPunct('}') && !this.atEnd()) {
			if (this.peek().kind === 'doc') {
				this.advance();
				continue;
			}
			try {
				statements.push(this.parseStatement());
			} catch (error) {
				this.recordFailure(error);
				this.synchronize();
			}
		}

		const end = this.expectPunct('}');
		return { statements, range: { start: tokenStart(start), end: tokenEnd(end) } };
	}

	private parseExpression(minPrecedence = 0): Expr {
		let left = this.parseUnary();

		while (true) {
			const token = this.peek();
			const operator = token.kind === 'keyword' && token.value === 'in' ? 'in' : token.value;
			const precedence = BINARY_PRECEDENCE[operator];

			if (precedence === undefined || precedence < minPrecedence) {
				break;
			}

			this.advance();

			if (operator === '..' || operator === '..=') {
				const right = this.canStartExpression() ? this.parseExpression(precedence + 1) : undefined;
				left = {
					kind: 'range',
					from: left,
					to: right,
					inclusive: operator === '..=',
					range: { start: left.range.start, end: right ? right.range.end : tokenEnd(token) }
				};
				continue;
			}

			const nextMin = RIGHT_ASSOCIATIVE.has(operator) ? precedence : precedence + 1;
			const right = this.parseExpression(nextMin);
			left = {
				kind: 'binary',
				operator,
				left,
				right,
				range: { start: left.range.start, end: right.range.end }
			};
		}

		return left;
	}

	private parseUnary(): Expr {
		const token = this.peek();
		if (token.kind === 'punct' && (token.value === '-' || token.value === '+' || token.value === '!' || token.value === '~')) {
			this.advance();
			const operand = this.parseUnary();
			return {
				kind: 'unary',
				operator: token.value,
				operand,
				range: { start: tokenStart(token), end: operand.range.end }
			};
		}
		return this.parsePostfix();
	}

	private parsePostfix(): Expr {
		let expression = this.parsePrimary();

		while (true) {
			if (this.checkPunct('(')) {
				this.advance();
				const args: Expr[] = [];
				if (!this.checkPunct(')')) {
					do {
						if (this.checkPunct(')')) {
							break;
						}
						args.push(this.parseExpression());
					} while (this.matchPunct(','));
				}
				const close = this.expectPunct(')');
				expression = {
					kind: 'call',
					callee: expression,
					args,
					range: { start: expression.range.start, end: tokenEnd(close) }
				};
				continue;
			}

			if (this.checkPunct('[')) {
				this.advance();
				const index = this.parseExpression();
				const close = this.expectPunct(']');
				expression = {
					kind: 'index',
					receiver: expression,
					index,
					range: { start: expression.range.start, end: tokenEnd(close) }
				};
				continue;
			}

			if (this.checkPunct('.') || this.checkPunct('::')) {
				const separator = this.peek().value;
				this.advance();
				const name = this.expectIdentifier();

				if (separator === '.' && this.checkPunct('(')) {
					this.advance();
					const args: Expr[] = [];
					if (!this.checkPunct(')')) {
						do {
							if (this.checkPunct(')')) {
								break;
							}
							args.push(this.parseExpression());
						} while (this.matchPunct(','));
					}
					const close = this.expectPunct(')');
					expression = {
						kind: 'method',
						receiver: expression,
						name: name.value,
						args,
						range: { start: expression.range.start, end: tokenEnd(close) }
					};
					continue;
				}

				expression = {
					kind: 'member',
					receiver: expression,
					name: name.value,
					range: { start: expression.range.start, end: tokenEnd(name) }
				};
				continue;
			}

			break;
		}

		return expression;
	}

	private parsePrimary(): Expr {
		const token = this.peek();

		if (token.kind === 'number') {
			this.advance();
			return { kind: 'literal', value: token.value, literalType: 'number', range: { start: tokenStart(token), end: tokenEnd(token) } };
		}

		if (token.kind === 'string') {
			this.advance();
			return { kind: 'literal', value: token.value, literalType: 'string', range: { start: tokenStart(token), end: tokenEnd(token) } };
		}

		if (token.kind === 'keyword' && (token.value === 'true' || token.value === 'false')) {
			this.advance();
			return { kind: 'literal', value: token.value, literalType: 'bool', range: { start: tokenStart(token), end: tokenEnd(token) } };
		}

		if (token.kind === 'ident' || (token.kind === 'keyword' && token.value === 'this')) {
			this.advance();
			return { kind: 'ident', name: token.value, range: { start: tokenStart(token), end: tokenEnd(token) } };
		}

		if (this.checkPunct('(')) {
			const start = this.advance();
			if (this.checkPunct(')')) {
				const close = this.advance();
				return { kind: 'literal', value: '', literalType: 'unit', range: { start: tokenStart(start), end: tokenEnd(close) } };
			}
			const inner = this.parseExpression();
			const close = this.expectPunct(')');
			return { kind: 'paren', expr: inner, range: { start: tokenStart(start), end: tokenEnd(close) } };
		}

		if (this.checkPunct('[')) {
			const start = this.advance();
			const elements: Expr[] = [];
			if (!this.checkPunct(']')) {
				do {
					if (this.checkPunct(']')) {
						break;
					}
					elements.push(this.parseExpression());
				} while (this.matchPunct(','));
			}
			const close = this.expectPunct(']');
			return { kind: 'array', elements, range: { start: tokenStart(start), end: tokenEnd(close) } };
		}

		if (this.checkPunct('#')) {
			return this.parseMap();
		}

		if (this.checkKeyword('if')) {
			return this.parseIfExpression();
		}

		if (this.checkPunct('{')) {
			const body = this.parseBlock();
			return { kind: 'blockExpr', body, range: body.range };
		}

		if (this.checkPunct('|') || this.checkPunct('||')) {
			return this.parseClosure();
		}

		throw new ParseFailure(`Expression attendue, trouvé '${token.value || token.kind}'`, token);
	}

	private parseMap(): Expr {
		const start = this.expectPunct('#');
		this.expectPunct('{');
		const entries: MapEntry[] = [];

		while (!this.checkPunct('}') && !this.atEnd()) {
			if (this.checkPunct(',')) {
				this.advance();
				continue;
			}
			const keyToken = this.peek();
			let key: string;
			if (keyToken.kind === 'ident' || keyToken.kind === 'keyword' || keyToken.kind === 'number') {
				key = keyToken.value;
				this.advance();
			} else if (keyToken.kind === 'string') {
				key = keyToken.value.slice(1, -1);
				this.advance();
			} else {
				throw new ParseFailure('Clé de map attendue', keyToken);
			}

			let value: Expr | undefined;
			if (this.matchPunct(':')) {
				value = this.parseExpression();
			}
			entries.push({ key, value, range: { start: tokenStart(keyToken), end: tokenEnd(keyToken) } });
			this.matchPunct(',');
		}

		const close = this.expectPunct('}');
		return { kind: 'map', entries, range: { start: tokenStart(start), end: tokenEnd(close) } };
	}

	private parseClosure(): ClosureExpr {
		const start = this.peek();
		const params: string[] = [];

		if (this.checkPunct('||')) {
			this.advance();
		} else {
			this.expectPunct('|');
			if (!this.checkPunct('|')) {
				do {
					if (this.checkPunct('|')) {
						break;
					}
					params.push(this.expectIdentifier().value);
				} while (this.matchPunct(','));
			}
			this.expectPunct('|');
		}

		const body = this.checkPunct('{')
			? this.parseBlock()
			: this.expressionBody();

		return { kind: 'closure', params, body, range: { start: tokenStart(start), end: body.range.end } };
	}

	private expressionBody(): Block {
		const start = this.peek();
		const expr = this.parseExpression();
		const range = { start: tokenStart(start), end: expr.range.end };
		return { statements: [{ kind: 'expr', expr, range }], range };
	}

	private canStartExpression(): boolean {
		const token = this.peek();
		if (token.kind === 'eof' || token.kind === 'doc') {
			return false;
		}
		if (token.kind === 'punct') {
			return token.value === '(' || token.value === '[' || token.value === '#' || token.value === '|' || token.value === '-' || token.value === '!';
		}
		return true;
	}

	private isFunctionStart(): boolean {
		return this.checkKeyword('fn') || (this.checkKeyword('private') && this.peekAt(1).value === 'fn');
	}

	private synchronize(): void {
		while (!this.atEnd()) {
			const token = this.peek();
			if (token.kind === 'punct' && (token.value === ';' || token.value === '}')) {
				this.advance();
				return;
			}
			if (token.kind === 'keyword' && (token.value === 'fn' || token.value === 'import' || token.value === 'const')) {
				return;
			}
			this.advance();
		}
	}

	private recordFailure(error: unknown): void {
		if (error instanceof ParseFailure) {
			this.errors.push({
				message: error.message,
				range: { start: tokenStart(error.token), end: tokenEnd(error.token) }
			});
			return;
		}
		this.errors.push({
			message: error instanceof Error ? error.message : String(error),
			range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }
		});
	}

	private atEnd(): boolean {
		return this.peek().kind === 'eof';
	}

	private peek(): Token {
		return this.tokens[Math.min(this.index, this.tokens.length - 1)];
	}

	private peekAt(offset: number): Token {
		return this.tokens[Math.min(this.index + offset, this.tokens.length - 1)];
	}

	private advance(): Token {
		const token = this.peek();
		if (token.kind !== 'eof') {
			this.index++;
		}
		return token;
	}

	private checkPunct(value: string): boolean {
		const token = this.peek();
		return token.kind === 'punct' && token.value === value;
	}

	private checkKeyword(value: string): boolean {
		return isKeyword(this.peek(), value);
	}

	private matchPunct(value: string): boolean {
		if (this.checkPunct(value)) {
			this.advance();
			return true;
		}
		return false;
	}

	private expectPunct(value: string): Token {
		if (!this.checkPunct(value)) {
			throw new ParseFailure(`'${value}' attendu`, this.peek());
		}
		return this.advance();
	}

	private expectKeyword(value: string): Token {
		if (!this.checkKeyword(value)) {
			throw new ParseFailure(`'${value}' attendu`, this.peek());
		}
		return this.advance();
	}

	private expectIdentifier(): Token {
		const token = this.peek();
		if (token.kind !== 'ident' && token.kind !== 'keyword') {
			throw new ParseFailure('Identifiant attendu', token);
		}
		return this.advance();
	}

	private expectString(): Token {
		const token = this.peek();
		if (token.kind !== 'string') {
			throw new ParseFailure('Chaîne attendue', token);
		}
		return this.advance();
	}
}

export function parse(text: string): ModuleAst {
	return new Parser(text).parseModule();
}

export function parseRange(_range: Range): void {
	// Reserved for future range-restricted parsing
}
