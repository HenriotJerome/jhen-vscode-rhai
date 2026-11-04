import * as vscode from 'vscode';
import { tokenize } from '../core/lexer';

export interface FoldingRangeData {
	start: number;
	end: number;
	kind?: 'comment' | 'imports';
}

const REGION_START = /^\s*\/\/\s*region:/;
const REGION_END = /^\s*\/\/\s*endregion:/;
const IMPORT_LINE = /^\s*import\s+"/;

export function computeFoldingRanges(text: string): FoldingRangeData[] {
	const lines = text.split(/\r?\n/);
	const ranges: FoldingRangeData[] = [];
	const seen = new Set<string>();

	const push = (start: number, end: number, kind?: FoldingRangeData['kind']): void => {
		if (end <= start) {
			return;
		}
		const key = `${start}:${end}:${kind ?? ''}`;
		if (seen.has(key)) {
			return;
		}
		seen.add(key);
		ranges.push({ start, end, kind });
	};

	let regionStart = -1;
	for (let line = 0; line < lines.length; line++) {
		if (REGION_START.test(lines[line])) {
			if (regionStart === -1) {
				regionStart = line;
			}
			continue;
		}
		if (REGION_END.test(lines[line]) && regionStart !== -1) {
			push(regionStart, line, 'comment');
			regionStart = -1;
		}
	}

	const stack: number[] = [];
	for (const token of tokenize(text)) {
		if (token.kind !== 'punct') {
			continue;
		}
		if (token.value === '{') {
			stack.push(token.line);
			continue;
		}
		if (token.value === '}' && stack.length > 0) {
			const start = stack.pop() as number;
			push(start, token.line);
		}
	}

	let importStart = -1;
	let importEnd = -1;
	for (let line = 0; line < lines.length; line++) {
		if (IMPORT_LINE.test(lines[line])) {
			if (importStart === -1) {
				importStart = line;
			}
			importEnd = line;
			continue;
		}
		if (importStart !== -1) {
			push(importStart, importEnd, 'imports');
			importStart = -1;
		}
	}
	if (importStart !== -1) {
		push(importStart, importEnd, 'imports');
	}

	return ranges;
}

export class RhaiFoldingRangeProvider implements vscode.FoldingRangeProvider {
	provideFoldingRanges(
		document: vscode.TextDocument,
		_context: vscode.FoldingContext,
		_token: vscode.CancellationToken
	): vscode.FoldingRange[] {
		return computeFoldingRanges(document.getText()).map((range) => {
			const folding = new vscode.FoldingRange(range.start, range.end);
			if (range.kind === 'comment') {
				folding.kind = vscode.FoldingRangeKind.Comment;
			} else if (range.kind === 'imports') {
				folding.kind = vscode.FoldingRangeKind.Imports;
			}
			return folding;
		});
	}
}
