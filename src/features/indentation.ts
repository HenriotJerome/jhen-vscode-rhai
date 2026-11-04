import { tokenize } from '../core/lexer';

export interface IndentOptions {
	insertSpaces: boolean;
	tabSize: number;
}

export interface IndentAnalysis {
	depthAtLine: number[];
	startsWithClosing: boolean[];
}

export function analyzeIndentation(text: string): IndentAnalysis {
	const lines = text.split(/\r?\n/);
	const depthAtLine = new Array<number>(lines.length).fill(0);
	const startsWithClosing = new Array<boolean>(lines.length).fill(false);

	let depth = 0;
	let line = 0;
	let seenOnLine = false;

	for (const token of tokenize(text)) {
		if (token.kind === 'eof') {
			break;
		}

		while (line < token.line && line < lines.length - 1) {
			line++;
			seenOnLine = false;
			depthAtLine[line] = depth;
		}

		if (!seenOnLine) {
			depthAtLine[line] = depth;
			seenOnLine = true;
			if (token.kind === 'punct' && token.value === '}') {
				startsWithClosing[line] = true;
			}
		}

		if (token.kind === 'punct') {
			if (token.value === '{') {
				depth++;
			} else if (token.value === '}') {
				depth = Math.max(0, depth - 1);
			}
		}
	}

	for (let index = 0; index < lines.length; index++) {
		if (depthAtLine[index] === 0 && index > 0 && index >= line) {
			depthAtLine[index] = depth;
		}
	}

	return { depthAtLine, startsWithClosing };
}

export function indentUnit(options: IndentOptions): string {
	return options.insertSpaces ? ' '.repeat(Math.max(1, options.tabSize)) : '\t';
}

export function formatIndentation(text: string, options: IndentOptions): string {
	const lines = text.split(/\r?\n/);
	const { depthAtLine, startsWithClosing } = analyzeIndentation(text);
	const unit = indentUnit(options);

	return lines
		.map((lineText, index) => {
			if (lineText.trim().length === 0) {
				return '';
			}
			const level = Math.max(0, depthAtLine[index] - (startsWithClosing[index] ? 1 : 0));
			return `${unit.repeat(level)}${lineText.trimStart()}`;
		})
		.join('\n');
}

export function formatIndentationRange(
	text: string,
	fromLine: number,
	toLine: number,
	options: IndentOptions
): string[] {
	const formatted = formatIndentation(text, options).split(/\r?\n/);
	return formatted.slice(fromLine, toLine + 1);
}
