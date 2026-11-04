import * as vscode from 'vscode';
import { WorkspaceIndex } from '../core/workspaceIndex';
import { toVscodeRange } from '../utils/occurrences';

export class RhaiWorkspaceSymbolProvider implements vscode.WorkspaceSymbolProvider {
	constructor(private readonly index: WorkspaceIndex) {}

	async provideWorkspaceSymbols(query: string): Promise<vscode.SymbolInformation[]> {
		await this.index.ensureLoaded();

		const needle = query.trim().toLowerCase();
		const symbols = [...this.index.getAllFunctions(), ...this.index.getAllConstants()];

		return symbols
			.filter((symbol) => needle.length === 0 || symbol.name.toLowerCase().includes(needle))
			.map(
				(symbol) =>
					new vscode.SymbolInformation(
						symbol.name,
						symbol.kind === 'function' ? vscode.SymbolKind.Function : vscode.SymbolKind.Constant,
						'',
						new vscode.Location(symbol.uri, toVscodeRange(symbol.nameRange))
					)
			);
	}
}
