import * as vscode from 'vscode';
import { escapeRegExp } from './text';


const MODULE_EXTENSIONS = ['.rhai', ''];
const EXCLUDED_SEARCH_DIRS = new Set(['node_modules', 'target', 'dist', 'out', 'build', 'coverage']);
const MAX_SEARCH_DEPTH = 8;
const MAX_WORKSPACE_FILES = 200;

export function searchSubdirectoriesEnabled(): boolean {
	return vscode.workspace
		.getConfiguration('rhai')
		.get<boolean>('navigation.searchSubdirectories', true);
}

async function fileExists(uri: vscode.Uri): Promise<boolean> {
	try {
		await vscode.workspace.fs.stat(uri);
		return true;
	} catch {
		return false;
	}
}

function byPathDepth(a: vscode.Uri, b: vscode.Uri): number {
	return a.path.split('/').length - b.path.split('/').length;
}

/**
 * Resolve a module path to a file URI: first relative to the current file,
 * then recursively through the sub-directories of the workspace.
 */
export async function resolveModuleUri(
	document: vscode.TextDocument,
	modulePath: string
): Promise<vscode.Uri | null> {
	const baseDir = vscode.Uri.joinPath(document.uri, '..');

	for (const ext of MODULE_EXTENSIONS) {
		const fileUri = vscode.Uri.joinPath(baseDir, `${modulePath}${ext}`);
		if (await fileExists(fileUri)) {
			return fileUri;
		}
	}

	// Explicit relative paths (./, ../) never fall back to a recursive search
	if (modulePath.startsWith('.') || !searchSubdirectoriesEnabled()) {
		return null;
	}

	const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);

	if (workspaceFolder) {
		const relative = modulePath.replace(/\\/g, '/');
		for (const ext of MODULE_EXTENSIONS) {
			const matches = await vscode.workspace.findFiles(
				new vscode.RelativePattern(workspaceFolder, `**/${relative}${ext}`),
				undefined,
				MAX_WORKSPACE_FILES
			);
			if (matches.length > 0) {
				return matches.sort(byPathDepth)[0];
			}
		}
		return null;
	}

	return findModuleInSubDirectories(baseDir, modulePath, 0);
}

async function findModuleInSubDirectories(
	dir: vscode.Uri,
	modulePath: string,
	depth: number
): Promise<vscode.Uri | null> {
	if (depth > MAX_SEARCH_DEPTH) {
		return null;
	}

	for (const ext of MODULE_EXTENSIONS) {
		const candidate = vscode.Uri.joinPath(dir, `${modulePath}${ext}`);
		if (await fileExists(candidate)) {
			return candidate;
		}
	}

	let entries: [string, vscode.FileType][];
	try {
		entries = await vscode.workspace.fs.readDirectory(dir);
	} catch {
		return null;
	}

	const subDirectories = entries
		.filter(
			([name, type]) =>
				type === vscode.FileType.Directory &&
				!name.startsWith('.') &&
				!EXCLUDED_SEARCH_DIRS.has(name)
		)
		.sort(([a], [b]) => a.localeCompare(b));

	for (const [name] of subDirectories) {
		const found = await findModuleInSubDirectories(
			vscode.Uri.joinPath(dir, name),
			modulePath,
			depth + 1
		);
		if (found) {
			return found;
		}
	}

	return null;
}

/**
 * Locate a function or constant definition inside a raw file content.
 */
export function findDefinitionInText(
	text: string,
	uri: vscode.Uri,
	name: string,
	originSelectionRange: vscode.Range
): vscode.LocationLink | null {
	const definitionRegex = new RegExp(
		`^[ \\t]*(?:fn|const)\\s+${escapeRegExp(name)}\\s*(?:\\(|=)`
	);

	const lines = text.split(/\r?\n/);
	for (let i = 0; i < lines.length; i++) {
		const lineText = lines[i];
		if (!definitionRegex.test(lineText)) {
			continue;
		}
		const index = lineText.indexOf(name);
		return {
			originSelectionRange,
			targetUri: uri,
			targetRange: new vscode.Range(i, 0, i, lineText.length),
			targetSelectionRange: new vscode.Range(i, index, i, index + name.length)
		};
	}

	return null;
}

/**
 * Search every .rhai file of the workspace for a function or constant definition.
 */
export async function findDefinitionInWorkspace(
	document: vscode.TextDocument,
	name: string,
	originSelectionRange: vscode.Range
): Promise<vscode.LocationLink[] | null> {
	const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
	if (!workspaceFolder) {
		return null;
	}

	let files: vscode.Uri[];
	try {
		files = await vscode.workspace.findFiles(
			new vscode.RelativePattern(workspaceFolder, '**/*.rhai'),
			undefined,
			MAX_WORKSPACE_FILES
		);
	} catch {
		return null;
	}

	for (const uri of files.sort(byPathDepth)) {
		if (uri.toString() === document.uri.toString()) {
			continue;
		}
		let text: string;
		try {
			const bytes = await vscode.workspace.fs.readFile(uri);
			text = Buffer.from(bytes).toString('utf8');
		} catch {
			continue;
		}
		const location = findDefinitionInText(text, uri, name, originSelectionRange);
		if (location) {
			return [location];
		}
	}

	return null;
}
