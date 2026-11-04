import * as vscode from 'vscode';


export class RhaiFormattingProvider implements vscode.DocumentFormattingEditProvider {
	provideDocumentFormattingEdits(
		document: vscode.TextDocument,
		options: vscode.FormattingOptions,
		_token: vscode.CancellationToken
	): vscode.ProviderResult<vscode.TextEdit[]> {
		const edits: vscode.TextEdit[] = [];
		const indent = options.insertSpaces
			? ' '.repeat(options.tabSize)
			: '\t';

		for (let i = 0; i < document.lineCount; i++) {
			const line = document.lineAt(i);
			const text = line.text;

			// Format function signatures: fn name(param1, param2) { → multi-line
			const fnEdit = this.formatFnSignature(document, i, text, indent);
			if (fnEdit) {
				edits.push(fnEdit.edit);
				// Skip lines that were part of the old signature
				i = fnEdit.endLine;
				continue;
			}
		}

		return edits;
	}

	private formatFnSignature(
		document: vscode.TextDocument,
		startLine: number,
		text: string,
		indent: string
	): { edit: vscode.TextEdit; endLine: number } | null {
		// Match fn name( on this line
		const fnStartMatch = text.match(/^(\s*)fn\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/);
		if (!fnStartMatch) {
			return null;
		}

		const baseIndent = fnStartMatch[1];
		const fnName = fnStartMatch[2];

		// Find the full signature range (from fn to the closing ')')
		const params = this.extractFnParams(document, startLine, text.trim());
		if (params === null) {
			return null;
		}

		// Find end line of the signature (line containing ')')
		let sigEndLine = startLine;
		let foundCloseParen = text.includes(')');
		if (!foundCloseParen) {
			for (let j = startLine + 1; j < document.lineCount && j <= startLine + 10; j++) {
				sigEndLine = j;
				if (document.lineAt(j).text.includes(')')) {
					foundCloseParen = true;
					break;
				}
			}
		}

		if (!foundCloseParen) {
			return null;
		}

		// Check if already formatted correctly (multi-line with one param per line)
		if (this.isAlreadyFormatted(document, startLine, sigEndLine, params)) {
			return null;
		}

		// No params: fn name()
		if (params.length === 0) {
			const newText = `${baseIndent}fn ${fnName}() {\n`;
			const range = new vscode.Range(startLine, 0, sigEndLine, document.lineAt(sigEndLine).text.length);
			return {
				edit: vscode.TextEdit.replace(range, newText.trimEnd()),
				endLine: sigEndLine,
			};
		}

		// Build multi-line signature
		const paramLines = params.map((p) => `${indent}${p},`);
		const signature = [
			`${baseIndent}fn ${fnName}(`,
			...paramLines,
			`${baseIndent}) {`,
		].join('\n');

		const range = new vscode.Range(startLine, 0, sigEndLine, document.lineAt(sigEndLine).text.length);
		return {
			edit: vscode.TextEdit.replace(range, signature),
			endLine: sigEndLine,
		};
	}

	private extractFnParams(
		document: vscode.TextDocument,
		startLine: number,
		firstLineText: string
	): string[] | null {
		// Try single-line: fn name(params)
		const singleLineMatch = firstLineText.match(/^fn\s+[a-zA-Z_][a-zA-Z0-9_]*\s*\(([^)]*)\)/);
		if (singleLineMatch) {
			const raw = singleLineMatch[1].trim();
			return raw ? this.splitParams(raw) : [];
		}

		// Multi-line: collect until ')'
		const paramsParts: string[] = [];
		const afterParen = firstLineText.match(/^fn\s+[a-zA-Z_][a-zA-Z0-9_]*\s*\((.*)/);
		if (afterParen) {
			const part = afterParen[1].trim();
			if (part) {
				paramsParts.push(part);
			}
		}

		for (let j = startLine + 1; j < document.lineCount && j <= startLine + 10; j++) {
			const nextLine = document.lineAt(j).text.trim();
			if (nextLine.includes(')')) {
				const beforeParen = nextLine.replace(/\).*/, '').trim();
				if (beforeParen) {
					paramsParts.push(beforeParen);
				}
				break;
			}
			if (nextLine) {
				paramsParts.push(nextLine);
			}
		}

		const rawParams = paramsParts
			.join(', ')
			.replace(/,\s*,/g, ',')
			.replace(/^\s*,\s*/, '')
			.replace(/,\s*$/, '')
			.trim();

		return rawParams ? this.splitParams(rawParams) : [];
	}

	private splitParams(raw: string): string[] {
		return raw
			.split(',')
			.map((p) => p.trim())
			.filter((p) => p.length > 0);
	}

	private isAlreadyFormatted(
		document: vscode.TextDocument,
		startLine: number,
		endLine: number,
		params: string[]
	): boolean {
		// Already multi-line if the signature spans more than 1 line
		// and each param is on its own line
		if (params.length === 0 && endLine === startLine) {
			return true;
		}

		// Must span at least params.length + 2 lines (fn line, param lines, ) line)
		const expectedLines = params.length + 2;
		if (endLine - startLine + 1 !== expectedLines) {
			return false;
		}

		// Check each param line
		for (let k = 0; k < params.length; k++) {
			const paramLine = document.lineAt(startLine + 1 + k).text.trim();
			if (paramLine !== `${params[k]},`) {
				return false;
			}
		}

		return true;
	}
}
