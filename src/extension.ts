import * as vscode from 'vscode';
import { NativeApiIndex, registerNativeApiWatcher } from './host/nativeApi';
import { registerWorkspaceIndexWatchers, WorkspaceIndex } from './core/workspaceIndex';
import { RhaiCodeActionProvider } from './features/codeActions';
import { RhaiCompletionProvider } from './features/completion';
import { RhaiDefinitionProvider } from './features/definition';
import { RhaiDocumentHighlightProvider } from './features/documentHighlight';
import { registerDiagnostics } from './features/diagnostics';
import { RhaiFormattingProvider } from './features/formatting';
import { RhaiFoldingRangeProvider } from './features/folding';
import { RhaiHoverProvider } from './features/hover';
import { RhaiInlayHintsProvider } from './features/inlayHints';
import { RhaiOnTypeFormattingProvider, RhaiRangeFormattingProvider } from './features/rangeFormatting';
import { RhaiReferenceProvider } from './features/references';
import { RhaiRenameProvider } from './features/rename';
import { RhaiSelectionRangeProvider } from './features/selectionRange';
import { RhaiSemanticTokensProvider, SEMANTIC_TOKENS_LEGEND } from './features/semanticTokens';
import { RhaiSignatureHelpProvider } from './features/signatureHelp';
import { RhaiDocumentSymbolProvider } from './features/symbols';
import { RhaiWorkspaceSymbolProvider } from './features/workspaceSymbols';

export { RhaiDefinitionProvider } from './features/definition';
export { RhaiFormattingProvider } from './features/formatting';
export { RhaiHoverProvider } from './features/hover';
export { RhaiDocumentSymbolProvider } from './features/symbols';

//#region: Activation

export function activate(context: vscode.ExtensionContext): void {
	const nativeApi = new NativeApiIndex();
	const workspaceIndex = new WorkspaceIndex();
	context.subscriptions.push(registerNativeApiWatcher(nativeApi));
	context.subscriptions.push(registerWorkspaceIndexWatchers(workspaceIndex));

	const symbolProvider = new RhaiDocumentSymbolProvider();
	context.subscriptions.push(
		vscode.languages.registerDocumentSymbolProvider(
			{ language: 'rhai', scheme: 'file' },
			symbolProvider
		)
	);

	const formattingProvider = new RhaiFormattingProvider();
	context.subscriptions.push(
		vscode.languages.registerDocumentFormattingEditProvider(
			{ language: 'rhai', scheme: 'file' },
			formattingProvider
		)
	);

	const definitionProvider = new RhaiDefinitionProvider(nativeApi);
	context.subscriptions.push(
		vscode.languages.registerDefinitionProvider(
			{ language: 'rhai', scheme: 'file' },
			definitionProvider
		)
	);

	const hoverProvider = new RhaiHoverProvider(nativeApi);
	context.subscriptions.push(
		vscode.languages.registerHoverProvider(
			{ language: 'rhai', scheme: 'file' },
			hoverProvider
		)
	);

	context.subscriptions.push(registerDiagnostics());
	context.subscriptions.push(
		vscode.languages.registerInlayHintsProvider(
			{ language: 'rhai', scheme: 'file' },
			new RhaiInlayHintsProvider(nativeApi)
		)
	);
	context.subscriptions.push(
		vscode.languages.registerDocumentRangeFormattingEditProvider(
			{ language: 'rhai', scheme: 'file' },
			new RhaiRangeFormattingProvider()
		)
	);
	context.subscriptions.push(
		vscode.languages.registerOnTypeFormattingEditProvider(
			{ language: 'rhai', scheme: 'file' },
			new RhaiOnTypeFormattingProvider(),
			'}',
			';'
		)
	);
	context.subscriptions.push(
		vscode.languages.registerDocumentSemanticTokensProvider(
			{ language: 'rhai', scheme: 'file' },
			new RhaiSemanticTokensProvider(),
			SEMANTIC_TOKENS_LEGEND
		)
	);
	context.subscriptions.push(
		vscode.languages.registerWorkspaceSymbolProvider(
			new RhaiWorkspaceSymbolProvider(workspaceIndex)
		)
	);
	context.subscriptions.push(
		vscode.languages.registerFoldingRangeProvider(
			{ language: 'rhai', scheme: 'file' },
			new RhaiFoldingRangeProvider()
		)
	);
	context.subscriptions.push(
		vscode.languages.registerSelectionRangeProvider(
			{ language: 'rhai', scheme: 'file' },
			new RhaiSelectionRangeProvider()
		)
	);
	context.subscriptions.push(
		vscode.languages.registerReferenceProvider(
			{ language: 'rhai', scheme: 'file' },
			new RhaiReferenceProvider(workspaceIndex)
		)
	);
	context.subscriptions.push(
		vscode.languages.registerDocumentHighlightProvider(
			{ language: 'rhai', scheme: 'file' },
			new RhaiDocumentHighlightProvider()
		)
	);
	context.subscriptions.push(
		vscode.languages.registerRenameProvider(
			{ language: 'rhai', scheme: 'file' },
			new RhaiRenameProvider(workspaceIndex, nativeApi)
		)
	);
	context.subscriptions.push(
		vscode.languages.registerSignatureHelpProvider(
			{ language: 'rhai', scheme: 'file' },
			new RhaiSignatureHelpProvider(nativeApi),
			'(',
			','
		)
	);
	context.subscriptions.push(
		vscode.languages.registerCompletionItemProvider(
			{ language: 'rhai', scheme: 'file' },
			new RhaiCompletionProvider(nativeApi),
			':'
		)
	);
	context.subscriptions.push(
		vscode.languages.registerCodeActionsProvider(
			{ language: 'rhai', scheme: 'file' },
			new RhaiCodeActionProvider(),
			{ providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }
		)
	);
}

export function deactivate(): void {
	// Nothing to clean up
}

//#endregion: Activation
