import * as vscode from 'vscode';
import { NativeApiIndex, registerNativeApiWatcher } from './host/nativeApi';
import { RhaiDefinitionProvider } from './features/definition';
import { RhaiFormattingProvider } from './features/formatting';
import { RhaiHoverProvider } from './features/hover';
import { RhaiDocumentSymbolProvider } from './features/symbols';

export { RhaiDefinitionProvider } from './features/definition';
export { RhaiFormattingProvider } from './features/formatting';
export { RhaiHoverProvider } from './features/hover';
export { RhaiDocumentSymbolProvider } from './features/symbols';

//#region: Activation

export function activate(context: vscode.ExtensionContext): void {
	const nativeApi = new NativeApiIndex();
	context.subscriptions.push(registerNativeApiWatcher(nativeApi));

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
}

export function deactivate(): void {
	// Nothing to clean up
}

//#endregion: Activation
