import * as vscode from 'vscode';
import { NativeApiIndex, registerNativeApiWatcher } from './host/nativeApi';
import { registerWorkspaceIndexWatchers, WorkspaceIndex } from './core/workspaceIndex';
import { RhaiCodeActionProvider } from './features/codeActions';
import { RhaiCompletionProvider } from './features/completion';
import { RhaiDefinitionProvider } from './features/definition';
import { RhaiDocumentHighlightProvider } from './features/documentHighlight';
import { registerDiagnostics } from './features/diagnostics';
import { RhaiFormattingProvider } from './features/formatting';
import { RhaiHoverProvider } from './features/hover';
import { RhaiReferenceProvider } from './features/references';
import { RhaiRenameProvider } from './features/rename';
import { RhaiSignatureHelpProvider } from './features/signatureHelp';
import { RhaiDocumentSymbolProvider } from './features/symbols';

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
