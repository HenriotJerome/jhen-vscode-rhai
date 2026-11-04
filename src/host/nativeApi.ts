import * as vscode from 'vscode';

export interface NativeFunctionParam {
	name?: string;
	type?: string;
}

export interface NativeFunction {
	name: string;
	type: 'native' | 'script';
	access: 'public' | 'private';
	namespace?: string;
	numParams: number;
	params?: NativeFunctionParam[];
	returnType?: string;
	signature: string;
	docComments?: string[];
}

export interface NativeDefinitionLocation {
	uri: vscode.Uri;
	line: number;
	textLength: number;
	selectionStart: number;
	selectionEnd: number;
}

const API_SETTING = 'navigation.nativeApi';
const DEFINITIONS_SETTING = 'navigation.nativeDefinitions';
const DEFAULT_API_GLOBS = ['**/rhai-defs/api.json'];
const DEFAULT_DEFINITION_GLOBS = ['**/rhai-defs/api.d.rhai'];
const MAX_FILES_PER_GLOB = 50;
const DEFINITION_LINE_REGEX = /^\s*fn\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/;

function readGlobs(setting: string, defaults: string[]): string[] {
	const configured = vscode.workspace
		.getConfiguration('rhai')
		.get<string[]>(setting, defaults);
	return Array.isArray(configured) && configured.length > 0 ? configured : defaults;
}

function readApiGlobs(): string[] {
	const priority = vscode.workspace
		.getConfiguration('rhai')
		.get<string[]>('navigation.nativeApiPriority', []) ?? [];
	return [...priority, ...readGlobs(API_SETTING, DEFAULT_API_GLOBS)];
}

async function collectFiles(globs: string[]): Promise<vscode.Uri[]> {
	const seen = new Set<string>();
	const files: vscode.Uri[] = [];

	for (const glob of globs) {
		let matches: vscode.Uri[];
		try {
			matches = await vscode.workspace.findFiles(glob, undefined, MAX_FILES_PER_GLOB);
		} catch (error) {
			console.warn(`[nativeApi] cannot search '${glob}': ${error}`);
			continue;
		}
		for (const uri of matches) {
			const key = uri.toString();
			if (seen.has(key)) {
				continue;
			}
			seen.add(key);
			files.push(uri);
		}
	}

	return files;
}

function formatNativeDoc(doc: string): string[] {
	const formatted: string[] = [];

	for (const raw of doc.split(/\r?\n/)) {
		const line = raw.trimEnd();
		const trimmed = line.trim();

		if (trimmed.length === 0) {
			formatted.push('');
			continue;
		}

		if (/^#+\s*Arguments$/i.test(trimmed)) {
			formatted.push('**📥 Arguments**');
			continue;
		}
		if (/^#+\s*Returns$/i.test(trimmed)) {
			formatted.push('**📤 Returns**');
			continue;
		}
		if (/^#+\s*\S/.test(trimmed)) {
			formatted.push(`**${trimmed.replace(/^#+\s*/, '')}**`);
			continue;
		}
		if (/^\*\s+\S/.test(trimmed)) {
			formatted.push(`• ${trimmed.replace(/^\*\s+/, '')}`);
			continue;
		}

		formatted.push(line);
	}

	return formatted.map((line) => (line.length > 0 ? `${line}  ` : line));
}

export class NativeApiIndex {
	private functions = new Map<string, NativeFunction[]>();
	private locations = new Map<string, NativeDefinitionLocation[]>();
	private loaded = false;
	private loading: Promise<void> | undefined;

	invalidate(): void {
		this.functions.clear();
		this.locations.clear();
		this.loaded = false;
		this.loading = undefined;
	}

	async ensureLoaded(): Promise<void> {
		if (this.loaded) {
			return;
		}
		if (!this.loading) {
			this.loading = this.load();
		}
		await this.loading;
	}

	has(name: string): boolean {
		return this.functions.has(name);
	}

	getOverloads(name: string): NativeFunction[] {
		return this.functions.get(name) ?? [];
	}

	getNames(): string[] {
		return [...this.functions.keys()];
	}

	getDefinitionLocations(name: string): NativeDefinitionLocation[] {
		return this.locations.get(name) ?? [];
	}

	buildHover(name: string): string | undefined {
		const overloads = this.functions.get(name);
		if (!overloads || overloads.length === 0) {
			return undefined;
		}

		const parts: string[] = [
			`### 🔧 ${name}()`,
			'',
			'**🔧 Fonction native (hôte)**',
			'',
			...overloads.map((overload) => `\`fn ${overload.signature}\``)
		];

		const seen = new Set<string>();
		for (const overload of overloads) {
			const doc = (overload.docComments ?? []).join('\n').trim();
			if (doc.length === 0 || seen.has(doc)) {
				continue;
			}
			seen.add(doc);
			parts.push('', '---', '', ...formatNativeDoc(doc));
		}

		return parts.join('\n');
	}

	private async load(): Promise<void> {
		try {
			for (const uri of await collectFiles(readApiGlobs())) {
				await this.loadApiFile(uri);
			}
			for (const uri of await collectFiles(readGlobs(DEFINITIONS_SETTING, DEFAULT_DEFINITION_GLOBS))) {
				await this.loadDefinitionsFile(uri);
			}
		} catch (error) {
			console.warn(`[nativeApi] loading failed: ${error}`);
		} finally {
			this.loaded = true;
		}
	}

	private async loadApiFile(uri: vscode.Uri): Promise<void> {
		let payload: { functions?: NativeFunction[] };
		try {
			const bytes = await vscode.workspace.fs.readFile(uri);
			payload = JSON.parse(Buffer.from(bytes).toString('utf8'));
		} catch (error) {
			console.warn(`[nativeApi] cannot read ${uri.toString()}: ${error}`);
			return;
		}

		for (const fn of payload?.functions ?? []) {
			if (!fn?.name || fn.type !== 'native' || fn.access === 'private') {
				continue;
			}
			const overloads = this.functions.get(fn.name) ?? [];
			// Multi-host: the first file wins for a given name and arity
			if (overloads.some((existing) => existing.numParams === fn.numParams)) {
				continue;
			}
			overloads.push(fn);
			overloads.sort((a, b) => a.numParams - b.numParams);
			this.functions.set(fn.name, overloads);
		}
	}

	private async loadDefinitionsFile(uri: vscode.Uri): Promise<void> {
		let text: string;
		try {
			const bytes = await vscode.workspace.fs.readFile(uri);
			text = Buffer.from(bytes).toString('utf8');
		} catch (error) {
			console.warn(`[nativeApi] cannot read ${uri.toString()}: ${error}`);
			return;
		}

		const lines = text.split(/\r?\n/);
		for (let line = 0; line < lines.length; line++) {
			const match = DEFINITION_LINE_REGEX.exec(lines[line]);
			if (!match) {
				continue;
			}
			const name = match[1];
			const start = match.index + match[0].lastIndexOf(name);
			const locations = this.locations.get(name) ?? [];
			locations.push({
				uri,
				line,
				textLength: lines[line].length,
				selectionStart: start,
				selectionEnd: start + name.length
			});
			this.locations.set(name, locations);
		}
	}
}

export function registerNativeApiWatcher(index: NativeApiIndex): vscode.Disposable {
	const globs = [
		...readGlobs(API_SETTING, DEFAULT_API_GLOBS),
		...readGlobs(DEFINITIONS_SETTING, DEFAULT_DEFINITION_GLOBS)
	];

	const seen = new Set<string>();
	const disposables: vscode.Disposable[] = [];

	for (const glob of globs) {
		if (seen.has(glob)) {
			continue;
		}
		seen.add(glob);

		const watcher = vscode.workspace.createFileSystemWatcher(glob);
		watcher.onDidChange(() => index.invalidate());
		watcher.onDidCreate(() => index.invalidate());
		watcher.onDidDelete(() => index.invalidate());
		disposables.push(watcher);
	}

	return vscode.Disposable.from(...disposables);
}
