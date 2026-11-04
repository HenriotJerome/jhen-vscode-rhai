export type TokenKind =
	| 'ident'
	| 'keyword'
	| 'string'
	| 'number'
	| 'comment'
	| 'doc'
	| 'punct'
	| 'eof';

export interface Token {
	kind: TokenKind;
	value: string;
	line: number;
	column: number;
	start: number;
	end: number;
}

const KEYWORDS = new Set([
	'true', 'false',
	'let', 'const', 'if', 'else', 'switch', 'do', 'while', 'until', 'loop',
	'for', 'in', 'continue', 'break', 'return', 'throw', 'try', 'catch',
	'fn', 'private', 'import', 'as', 'export', 'global', 'this', 'Fn'
]);

const PUNCTUATORS = [
	'<<=', '>>=',
	'**=', '==', '!=', '<=', '>=', '&&', '||', '+=', '-=', '*=', '/=', '%=',
	'<<', '>>', '**', '..=', '..', '::', '->', '=>', '??', '?.', '?[',
	'#', '(', ')', '[', ']', '{', '}', ',', ';', ':', '.', '?', '!', '~',
	'+', '-', '*', '/', '%', '&', '|', '^', '=', '<', '>'
].sort((a, b) => b.length - a.length);

function isDigit(char: string): boolean {
	return char >= '0' && char <= '9';
}

function isIdentStart(char: string): boolean {
	return (char >= 'a' && char <= 'z')
		|| (char >= 'A' && char <= 'Z')
		|| char === '_';
}

function isIdentPart(char: string): boolean {
	return isIdentStart(char) || isDigit(char);
}

export function tokenize(text: string): Token[] {
	const tokens: Token[] = [];
	let offset = 0;
	let line = 0;
	let lineStart = 0;

	const push = (kind: TokenKind, value: string, start: number, startLine: number, startColumn: number): void => {
		tokens.push({ kind, value, line: startLine, column: startColumn, start, end: offset });
	};

	while (offset < text.length) {
		const char = text[offset];

		if (char === '\n') {
			offset++;
			line++;
			lineStart = offset;
			continue;
		}
		if (char === ' ' || char === '\t' || char === '\r' || char === '\uFEFF') {
			offset++;
			continue;
		}

		const start = offset;
		const startLine = line;
		const startColumn = offset - lineStart;

		// Line comments (and doc comments)
		if (char === '/' && text[offset + 1] === '/') {
			let end = offset + 2;
			while (end < text.length && text[end] !== '\n') {
				end++;
			}
			const value = text.slice(offset, end);
			offset = end;
			const isDoc = value.startsWith('///') || value.startsWith('//!');
			push(isDoc ? 'doc' : 'comment', value, start, startLine, startColumn);
			continue;
		}

		// Block comments
		if (char === '/' && text[offset + 1] === '*') {
			let end = offset + 2;
			let depth = 1;
			while (end < text.length && depth > 0) {
				if (text[end] === '/' && text[end + 1] === '*') {
					depth++;
					end += 2;
					continue;
				}
				if (text[end] === '*' && text[end + 1] === '/') {
					depth--;
					end += 2;
					continue;
				}
				if (text[end] === '\n') {
					line++;
					lineStart = end + 1;
				}
				end++;
			}
			const value = text.slice(offset, end);
			offset = end;
			push('comment', value, start, startLine, startColumn);
			continue;
		}

		// Strings and template literals
		if (char === '"' || char === '\'' || char === '`') {
			const quote = char;
			let end = offset + 1;
			while (end < text.length) {
				const current = text[end];
				if (current === '\\') {
					if (text[end + 1] === '\n') {
						line++;
						lineStart = end + 2;
					}
					end += 2;
					continue;
				}
				if (quote === '`' && current === '$' && text[end + 1] === '{') {
					let depth = 1;
					end += 2;
					while (end < text.length && depth > 0) {
						if (text[end] === '{') {
							depth++;
						} else if (text[end] === '}') {
							depth--;
						} else if (text[end] === '\n') {
							line++;
							lineStart = end + 1;
						}
						end++;
					}
					continue;
				}
				if (current === quote) {
					end++;
					break;
				}
				if (current === '\n') {
					if (quote !== '`') {
						break;
					}
					line++;
					lineStart = end + 1;
				}
				end++;
			}
			const value = text.slice(offset, end);
			offset = end;
			push('string', value, start, startLine, startColumn);
			continue;
		}

		// Numbers
		if (isDigit(char) || (char === '.' && isDigit(text[offset + 1] ?? ''))) {
			let end = offset;
			if (char === '0' && /[xXbBoO]/.test(text[end + 1] ?? '')) {
				end += 2;
				while (end < text.length && /[0-9a-fA-F_]/.test(text[end])) {
					end++;
				}
			} else {
				while (end < text.length && (isDigit(text[end]) || text[end] === '_')) {
					end++;
				}
				if (text[end] === '.') {
					end++;
					while (end < text.length && (isDigit(text[end]) || text[end] === '_')) {
						end++;
					}
				}
				if (text[end] === 'e' || text[end] === 'E') {
					end++;
					if (text[end] === '+' || text[end] === '-') {
						end++;
					}
					while (end < text.length && isDigit(text[end])) {
						end++;
					}
				}
			}
			const value = text.slice(offset, end);
			offset = end;
			push('number', value, start, startLine, startColumn);
			continue;
		}

		// Identifiers and keywords
		if (isIdentStart(char)) {
			let end = offset + 1;
			while (end < text.length && isIdentPart(text[end])) {
				end++;
			}
			const value = text.slice(offset, end);
			offset = end;
			push(KEYWORDS.has(value) ? 'keyword' : 'ident', value, start, startLine, startColumn);
			continue;
		}

		// Punctuators (longest match first)
		const punctuator = PUNCTUATORS.find((candidate) => text.startsWith(candidate, offset));
		if (punctuator) {
			offset += punctuator.length;
			push('punct', punctuator, start, startLine, startColumn);
			continue;
		}

		// Unknown character: emit as punct so the parser can report it
		offset++;
		push('punct', char, start, startLine, startColumn);
	}

	tokens.push({ kind: 'eof', value: '', line, column: offset - lineStart, start: offset, end: offset });
	return tokens;
}

export function isKeyword(token: Token, keyword: string): boolean {
	return token.kind === 'keyword' && token.value === keyword;
}
