import * as vscode from 'vscode';
import { NativeApiIndex } from './nativeApi';

export class HostStatusBar implements vscode.Disposable {
	private readonly item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);

	constructor(private readonly nativeApi: NativeApiIndex) {
		this.item.command = 'rhai.regenerateHostDefinitions';
		this.item.name = 'Rhai host definitions';
		void this.refresh();
	}

	async refresh(): Promise<void> {
		await this.nativeApi.ensureLoaded();

		const count = this.nativeApi.getNames().length;
		this.item.text = `⚙ Rhai : ${count} native(s)`;
		this.item.tooltip = count > 0
			? "Fonctions natives fournies par l'hôte — cliquer pour régénérer"
			: "Aucune définition d'hôte trouvée — cliquer pour configurer la régénération";
		this.item.show();
	}

	dispose(): void {
		this.item.dispose();
	}
}
