import * as vscode from 'vscode';
import { exec } from 'child_process';
import { WorkspaceIndex } from '../core/workspaceIndex';
import { NativeApiIndex } from './nativeApi';
import { validateHostContract } from './hostDefinitions';

export function registerValidateCommand(output: vscode.OutputChannel): vscode.Disposable {
	return vscode.commands.registerCommand('rhai.validateHostContract', async () => {
		const report = await validateHostContract();

		output.show(true);
		output.appendLine(`Contrat d'hôte : ${report.artifacts.length} artefact(s).`);
		for (const artifact of report.artifacts) {
			output.appendLine(`  ${artifact.uri.path} — ${artifact.functions} fonction(s), modifié le ${artifact.modified.toISOString()}`);
		}
		if (report.issues.length === 0) {
			output.appendLine('Aucun problème détecté.');
			return;
		}
		for (const issue of report.issues) {
			output.appendLine(`  ! ${issue}`);
		}
		vscode.window.showWarningMessage(
			`Contrat d'hôte : ${report.issues.length} problème(s) — voir le canal « Rhai ».`
		);
	});
}

export function registerRegenerateCommand(
	nativeApi: NativeApiIndex,
	workspaceIndex: WorkspaceIndex,
	output: vscode.OutputChannel
): vscode.Disposable {
	return vscode.commands.registerCommand('rhai.regenerateHostDefinitions', async () => {
		const command = vscode.workspace
			.getConfiguration('rhai')
			.get<string>('host.regenerateCommand', '')
			.trim();

		if (command.length === 0) {
			const action = await vscode.window.showWarningMessage(
				"Aucune commande de régénération n'est configurée (rhai.host.regenerateCommand).",
				'Ouvrir les réglages'
			);
			if (action) {
				await vscode.commands.executeCommand(
					'workbench.action.openSettings',
					'rhai.host.regenerateCommand'
				);
			}
			return;
		}

		const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
		output.show(true);
		output.appendLine(`$ ${command}`);

		await new Promise<void>((resolve) => {
			exec(command, { cwd, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
				if (stdout) {
					output.appendLine(stdout.trimEnd());
				}
				if (stderr) {
					output.appendLine(stderr.trimEnd());
				}
				if (error) {
					output.appendLine(`Échec : ${error.message}`);
				}
				resolve();
			});
		});

		nativeApi.invalidate();
		workspaceIndex.invalidate();
		await nativeApi.ensureLoaded();

		const report = await validateHostContract();
		for (const issue of report.issues) {
			output.appendLine(`! ${issue}`);
		}

		const count = nativeApi.getNames().length;
		const suffix = report.issues.length > 0 ? ` — ${report.issues.length} problème(s) de contrat` : '';
		vscode.window.showInformationMessage(
			`Définitions d'hôte régénérées : ${count} fonction(s) native(s)${suffix}.`
		);
	});
}
