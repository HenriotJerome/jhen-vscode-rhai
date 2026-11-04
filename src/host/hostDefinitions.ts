import * as vscode from 'vscode';
import { NativeFunction } from './nativeApi';

export interface HostArtifact {
	uri: vscode.Uri;
	modified: Date;
	functions: number;
}

export interface HostContractReport {
	artifacts: HostArtifact[];
	issues: string[];
}

const MAX_FILES = 50;

function asArray(value: unknown): NativeFunction[] {
	if (!value || typeof value !== 'object') {
		return [];
	}
	const functions = (value as { functions?: unknown }).functions;
	return Array.isArray(functions) ? (functions as NativeFunction[]) : [];
}

export function validateNativeApiPayload(payload: unknown): string[] {
	const issues: string[] = [];
	const functions = asArray(payload);

	if (functions.length === 0) {
		issues.push("Aucune fonction : la clé 'functions' est absente ou vide.");
		return issues;
	}

	functions.forEach((fn, index) => {
		const label = `functions[${index}]`;
		if (!fn || typeof fn !== 'object') {
			issues.push(`${label} n'est pas un objet.`);
			return;
		}
		if (typeof fn.name !== 'string' || fn.name.length === 0) {
			issues.push(`${label} : 'name' manquant.`);
		}
		if (fn.type !== 'native' && fn.type !== 'script') {
			issues.push(`${label} (${fn.name}) : 'type' doit valoir 'native' ou 'script'.`);
		}
		if (fn.access !== 'public' && fn.access !== 'private') {
			issues.push(`${label} (${fn.name}) : 'access' doit valoir 'public' ou 'private'.`);
		}
		if (typeof fn.numParams !== 'number' || fn.numParams < 0) {
			issues.push(`${label} (${fn.name}) : 'numParams' invalide.`);
		}
		if (typeof fn.signature !== 'string' || fn.signature.length === 0) {
			issues.push(`${label} (${fn.name}) : 'signature' manquante.`);
		}
	});

	return issues;
}

export function checkCoherence(functions: NativeFunction[], definitionNames: string[]): string[] {
	const issues: string[] = [];
	const declared = new Set(definitionNames);

	for (const fn of functions) {
		if (fn.type !== 'native' || fn.access === 'private') {
			continue;
		}
		if (!declared.has(fn.name)) {
			issues.push(`'${fn.name}' est dans le JSON mais absent de api.d.rhai.`);
		}
	}

	const jsonNames = new Set(functions.filter((fn) => fn.type === 'native').map((fn) => fn.name));
	for (const name of declared) {
		if (!jsonNames.has(name)) {
			issues.push(`'${name}' est dans api.d.rhai mais absent du JSON.`);
		}
	}

	return issues;
}

function readGlobs(): string[] {
	const configuration = vscode.workspace.getConfiguration('rhai');
	const priority = configuration.get<string[]>('navigation.nativeApiPriority', []) ?? [];
	const api = configuration.get<string[]>('navigation.nativeApi', ['**/rhai-defs/api.json']) ?? [];
	return [...priority, ...api];
}

export async function collectHostArtifacts(): Promise<HostArtifact[]> {
	const seen = new Set<string>();
	const artifacts: HostArtifact[] = [];

	for (const glob of readGlobs()) {
		let matches: vscode.Uri[];
		try {
			matches = await vscode.workspace.findFiles(glob, undefined, MAX_FILES);
		} catch {
			continue;
		}

		for (const uri of matches) {
			const key = uri.toString();
			if (seen.has(key)) {
				continue;
			}
			seen.add(key);

			let functions = 0;
			let modified = new Date(0);
			try {
				const stat = await vscode.workspace.fs.stat(uri);
				modified = new Date(stat.mtime);
				if (uri.path.endsWith('.json')) {
					const payload = JSON.parse(Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8'));
					functions = asArray(payload).length;
				}
			} catch {
				// Unreadable artifact: still reported so the user sees it
			}

			artifacts.push({ uri, modified, functions });
		}
	}

	return artifacts;
}

export async function validateHostContract(): Promise<HostContractReport> {
	const artifacts = await collectHostArtifacts();
	const issues: string[] = [];

	for (const artifact of artifacts) {
		if (!artifact.uri.path.endsWith('.json')) {
			continue;
		}
		try {
			const payload = JSON.parse(Buffer.from(await vscode.workspace.fs.readFile(artifact.uri)).toString('utf8'));
			issues.push(...validateNativeApiPayload(payload).map((issue) => `${artifact.uri.path}: ${issue}`));
		} catch (error) {
			issues.push(`${artifact.uri.path}: JSON invalide (${error instanceof Error ? error.message : String(error)}).`);
		}
	}

	return { artifacts, issues };
}
