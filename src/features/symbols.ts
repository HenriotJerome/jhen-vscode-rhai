import * as vscode from 'vscode';


const SYMBOL_KIND_MAP: Record<string, vscode.SymbolKind> = {
	fn: vscode.SymbolKind.Function,
	const: vscode.SymbolKind.Constant,
	let: vscode.SymbolKind.Variable,
	import: vscode.SymbolKind.Module,
	region: vscode.SymbolKind.Namespace,
};

interface RhaiSymbol {
	name: string;
	kind: vscode.SymbolKind;
	range: vscode.Range;
	containerName?: string;
	children: RhaiSymbol[];
}

export class RhaiDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
	provideDocumentSymbols(
		document: vscode.TextDocument,
		_token: vscode.CancellationToken
	): vscode.ProviderResult<vscode.DocumentSymbol[]> {
		const symbols: RhaiSymbol[] = [];
		const regionStack: RhaiSymbol[] = [];

		for (let i = 0; i < document.lineCount; i++) {
			const line = document.lineAt(i);
			const text = line.text.trim();

			// Skip empty lines and pure comments (not doc comments we care about)
			if (text.length === 0) {
				continue;
			}

			// Region markers: // region: Name
			const regionMatch = text.match(/^\/\/\s*region:\s*(.+)$/);
			if (regionMatch) {
				const regionName = regionMatch[1].trim();
				const region: RhaiSymbol = {
					name: regionName,
					kind: vscode.SymbolKind.Namespace,
					range: new vscode.Range(i, 0, i, line.text.length),
					children: [],
				};
				if (regionStack.length > 0) {
					regionStack[regionStack.length - 1].children.push(region);
				} else {
					symbols.push(region);
				}
				regionStack.push(region);
				continue;
			}

			// Endregion markers: // endregion: Name
			const endRegionMatch = text.match(/^\/\/\s*endregion:\s*(.+)$/);
			if (endRegionMatch) {
				if (regionStack.length > 0) {
					const region = regionStack.pop()!;
					// Extend range to include the endregion line
					region.range = new vscode.Range(
						region.range.start.line,
						0,
						i,
						line.text.length
					);
				}
				continue;
			}

			// Functions: fn name(...) - capture params, supports multi-line signatures
			const fnMatch = text.match(/^fn\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/);
			if (fnMatch) {
				const fnName = fnMatch[1];
				const fnParams = this.extractFnParams(document, i, text);
				const displayName = fnParams ? `${fnName}(${fnParams})` : `${fnName}()`;
				const fnSymbol: RhaiSymbol = {
					name: displayName,
					kind: vscode.SymbolKind.Function,
					range: new vscode.Range(i, 0, i, line.text.length),
					children: [],
				};
				this.addChild(regionStack, symbols, fnSymbol);
				continue;
			}

			// Constants: const NAME = ...
			const constMatch = text.match(/^const\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=/);
			if (constMatch) {
				const constName = constMatch[1];
				const constSymbol: RhaiSymbol = {
					name: constName,
					kind: vscode.SymbolKind.Constant,
					range: new vscode.Range(i, 0, i, line.text.length),
					children: [],
				};
				this.addChild(regionStack, symbols, constSymbol);
				continue;
			}

			// Imports: import "module" as alias
			const importMatch = text.match(/^import\s+"([^"]+)"\s+as\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
			if (importMatch) {
				const moduleName = importMatch[1];
				const alias = importMatch[2];
				const importSymbol: RhaiSymbol = {
					name: `${alias} ← ${moduleName}`,
					kind: vscode.SymbolKind.Module,
					range: new vscode.Range(i, 0, i, line.text.length),
					children: [],
				};
				this.addChild(regionStack, symbols, importSymbol);
				continue;
			}
		}

		return this.toDocumentSymbols(symbols);
	}

	private extractFnParams(
		document: vscode.TextDocument,
		startLine: number,
		firstLineText: string
	): string {
		// Try single-line first: fn name(params)
		const singleLineMatch = firstLineText.match(/^fn\s+[a-zA-Z_][a-zA-Z0-9_]*\s*\(([^)]*)\)/);
		if (singleLineMatch) {
			return singleLineMatch[1].trim();
		}

		// Multi-line: collect lines until closing ')'
		const paramsParts: string[] = [];
		// Extract partial params from first line after '('
		const afterParen = firstLineText.match(/^fn\s+[a-zA-Z_][a-zA-Z0-9_]*\s*\((.*)/);
		if (afterParen) {
			paramsParts.push(afterParen[1].trim());
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

		return rawParams;
	}

	private addChild(
		regionStack: RhaiSymbol[],
		topLevel: RhaiSymbol[],
		symbol: RhaiSymbol
	): void {
		if (regionStack.length > 0) {
			regionStack[regionStack.length - 1].children.push(symbol);
		} else {
			topLevel.push(symbol);
		}
	}

	private toDocumentSymbols(symbols: RhaiSymbol[]): vscode.DocumentSymbol[] {
		return symbols.map((s) => {
			const ds = new vscode.DocumentSymbol(
				s.name,
				this.getDetail(s.kind),
				s.kind,
				s.range,
				s.range
			);
			if (s.children.length > 0) {
				ds.children = this.toDocumentSymbols(s.children);
			}
			return ds;
		});
	}

	private getDetail(kind: vscode.SymbolKind): string {
		switch (kind) {
			case vscode.SymbolKind.Function:
				return 'fn';
			case vscode.SymbolKind.Constant:
				return 'const';
			case vscode.SymbolKind.Variable:
				return 'let';
			case vscode.SymbolKind.Module:
				return 'import';
			case vscode.SymbolKind.Namespace:
				return 'region';
			default:
				return '';
		}
	}
}
