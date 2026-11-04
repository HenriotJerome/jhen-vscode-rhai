'use strict';

const Module = require('module');

class Position {
	constructor(line, character) {
		this.line = line;
		this.character = character;
	}
}

class Range {
	constructor(startLine, startCharacter, endLine, endCharacter) {
		this.start = new Position(startLine, startCharacter);
		this.end = new Position(endLine, endCharacter);
	}
}

class Uri {
	constructor(fsPath) {
		this.path = fsPath;
		this.scheme = 'file';
	}

	static joinPath(base, ...parts) {
		const segments = [];
		for (const segment of `${base.path}/${parts.join('/')}`.split('/')) {
			if (segment === '..') {
				segments.pop();
			} else if (segment !== '.' && segment !== '') {
				segments.push(segment);
			}
		}
		return new Uri(segments.join('/'));
	}

	toString() {
		return `file:///${this.path}`;
	}
}

class RelativePattern {
	constructor(base, pattern) {
		this.baseUri = base.uri || base;
		this.pattern = pattern;
	}
}

function globToRegExp(glob) {
	const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&');
	const source = escaped
		.replace(/\*\*\//g, '\u0000')
		.replace(/\*/g, '[^/]*')
		.replace(/\u0000/g, '(?:.*/)?');
	return new RegExp(`^${source}$`);
}

function createVscodeMock() {
	const files = new Map();
	const settings = {
		'navigation.searchSubdirectories': true,
		'navigation.nativeApi': ['**/rhai-defs/api.json'],
		'navigation.nativeDefinitions': ['**/rhai-defs/api.d.rhai']
	};

	function setFile(filePath, content) {
		files.set(filePath, content);
	}

	function reset() {
		files.clear();
		settings['navigation.searchSubdirectories'] = true;
		settings['navigation.nativeApi'] = ['**/rhai-defs/api.json'];
		settings['navigation.nativeDefinitions'] = ['**/rhai-defs/api.d.rhai'];
	}

	function createDocument(filePath) {
		const content = files.get(filePath);
		if (content === undefined) {
			throw new Error(`File not found: ${filePath}`);
		}

		const lines = content.split(/\r?\n/);

		return {
			uri: new Uri(filePath),
			lineCount: lines.length,
			lineAt(lineOrPosition) {
				const index = typeof lineOrPosition === 'number' ? lineOrPosition : lineOrPosition.line;
				return { text: lines[index], lineNumber: index };
			},
			getText(range) {
				if (!range) {
					return content;
				}
				return lines[range.start.line].substring(range.start.character, range.end.character);
			},
			getWordRangeAtPosition(position) {
				const lineText = lines[position.line];
				const wordRegex = /[A-Za-z_][A-Za-z0-9_]*/g;
				let match;
				while ((match = wordRegex.exec(lineText)) !== null) {
					if (position.character >= match.index && position.character < match.index + match[0].length) {
						return new Range(position.line, match.index, position.line, match.index + match[0].length);
					}
				}
				return undefined;
			}
		};
	}

	function isUnder(uri, basePath) {
		return uri.path.startsWith(`${basePath}/`);
	}

	const vscode = {
		Position,
		Range,
		Uri,
		RelativePattern,
		SymbolKind: { Function: 11, Constant: 13, Variable: 12, Module: 1, Namespace: 2 },
		FileType: { File: 1, Directory: 2 },
		workspace: {
			getConfiguration() {
				return {
					get(key, defaultValue) {
						return key in settings ? settings[key] : defaultValue;
					}
				};
			},
			getWorkspaceFolder(uri) {
				if (!isUnder(uri, 'd:/proj')) {
					return undefined;
				}
				return { uri: new Uri('d:/proj'), name: 'proj', index: 0 };
			},
			async findFiles(include, _exclude, maxResults) {
				const glob = typeof include === 'string'
					? include
					: (include && include.pattern ? include.pattern : '**/*');
				const basePath = include && include.baseUri ? include.baseUri.path : '';
				const matcher = globToRegExp(glob);

				const matches = [];
				for (const filePath of files.keys()) {
					if (basePath && !isUnder(new Uri(filePath), basePath)) {
						continue;
					}
					if (!matcher.test(filePath)) {
						continue;
					}
					matches.push(new Uri(filePath));
					if (maxResults && matches.length >= maxResults) {
						break;
					}
				}
				return matches;
			},
			createFileSystemWatcher() {
				const noop = () => ({ dispose() {} });
				return { onDidChange: noop, onDidCreate: noop, onDidDelete: noop, dispose() {} };
			},
			onDidOpenTextDocument() {
				return { dispose() {} };
			},
			onDidChangeTextDocument() {
				return { dispose() {} };
			},
			onDidSaveTextDocument() {
				return { dispose() {} };
			},
			onDidCloseTextDocument() {
				return { dispose() {} };
			},
			async openTextDocument(uri) {
				return createDocument(uri.path);
			},
			fs: {
				async stat(uri) {
					if (!files.has(uri.path)) {
						throw new Error(`File not found: ${uri.path}`);
					}
					return { type: 1, size: files.get(uri.path).length, mtime: Date.now() };
				},
				async readFile(uri) {
					if (!files.has(uri.path)) {
						throw new Error(`File not found: ${uri.path}`);
					}
					return Buffer.from(files.get(uri.path), 'utf8');
				},
				async readDirectory(uri) {
					const prefix = `${uri.path}/`;
					const entries = new Map();

					for (const filePath of files.keys()) {
						if (!filePath.startsWith(prefix)) {
							continue;
						}
						const rest = filePath.substring(prefix.length);
						const separator = rest.indexOf('/');
						entries.set(
							separator === -1 ? rest : rest.substring(0, separator),
							separator === -1 ? 1 : 2
						);
					}

					if (entries.size === 0) {
						throw new Error(`Directory not found: ${uri.path}`);
					}
					return [...entries.entries()];
				}
			}
		},
		languages: {
			registerDocumentSymbolProvider() {},
			registerDocumentFormattingEditProvider() {},
			registerDefinitionProvider() {},
			registerHoverProvider() {},
			registerCodeActionsProvider() {},
			registerCompletionItemProvider() {},
			registerSignatureHelpProvider() {},
			registerReferenceProvider() {},
			registerDocumentHighlightProvider() {},
			registerRenameProvider() {},
			registerWorkspaceSymbolProvider() {},
			registerFoldingRangeProvider() {},
			registerSelectionRangeProvider() {},
			registerDocumentSemanticTokensProvider() {},
			registerInlayHintsProvider() {},
			registerDocumentRangeFormattingEditProvider() {},
			registerOnTypeFormattingEditProvider() {},
			createDiagnosticCollection(name) {
				const store = new Map();
				return {
					name,
					set(uri, diagnostics) {
						store.set(uri.toString(), diagnostics);
					},
					get(uri) {
						return store.get(uri.toString());
					},
					delete(uri) {
						store.delete(uri.toString());
					},
					clear() {
						store.clear();
					},
					dispose() {
						store.clear();
					}
				};
			}
		},
		DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
		InlayHintKind: { Type: 1, Parameter: 2 },
		InlayHint: class InlayHint {
			constructor(position, label, kind) {
				this.position = position;
				this.label = label;
				this.kind = kind;
				this.paddingRight = false;
			}
		},
		SemanticTokensLegend: class SemanticTokensLegend {
			constructor(tokenTypes, tokenModifiers) {
				this.tokenTypes = tokenTypes;
				this.tokenModifiers = tokenModifiers;
			}
		},
		SemanticTokens: class SemanticTokens {
			constructor(data) {
				this.data = data;
			}
		},
		SymbolInformation: class SymbolInformation {
			constructor(name, kind, containerName, location) {
				this.name = name;
				this.kind = kind;
				this.containerName = containerName;
				this.location = location;
			}
		},
		FoldingRangeKind: { Comment: { value: 'comment' }, Imports: { value: 'imports' }, Region: { value: 'region' } },
		FoldingRange: class FoldingRange {
			constructor(start, end, kind) {
				this.start = start;
				this.end = end;
				this.kind = kind;
			}
		},
		SelectionRange: class SelectionRange {
			constructor(range, parent) {
				this.range = range;
				this.parent = parent;
			}
		},
		Location: class Location {
			constructor(uri, range) {
				this.uri = uri;
				this.range = range;
			}
		},
		DocumentHighlightKind: { Text: 0, Read: 1, Write: 2 },
		DocumentHighlight: class DocumentHighlight {
			constructor(range, kind) {
				this.range = range;
				this.kind = kind;
			}
		},
		SignatureHelp: class SignatureHelp {
			constructor() {
				this.signatures = [];
				this.activeSignature = 0;
				this.activeParameter = 0;
			}
		},
		SignatureInformation: class SignatureInformation {
			constructor(label, documentation) {
				this.label = label;
				this.documentation = documentation;
				this.parameters = [];
			}
		},
		ParameterInformation: class ParameterInformation {
			constructor(label, documentation) {
				this.label = label;
				this.documentation = documentation;
			}
		},
		CompletionItemKind: { Text: 0, Method: 1, Function: 2, Field: 4, Variable: 5, Class: 6, Module: 8, Keyword: 13, Constant: 20 },
		CompletionItem: class CompletionItem {
			constructor(label, kind) {
				this.label = label;
				this.kind = kind;
				this.detail = undefined;
				this.documentation = undefined;
				this.insertText = undefined;
			}
		},
		Diagnostic: class Diagnostic {
			constructor(range, message, severity) {
				this.range = range;
				this.message = message;
				this.severity = severity;
				this.code = undefined;
				this.source = undefined;
			}
		},
		CodeActionKind: {
			QuickFix: { value: 'quickfix' },
			Refactor: { value: 'refactor' },
			RefactorRewrite: { value: 'refactor.rewrite' },
			Source: { value: 'source' },
			SourceOrganizeImports: { value: 'source.organizeImports' }
		},
		CodeAction: class CodeAction {
			constructor(title, kind) {
				this.title = title;
				this.kind = kind;
				this.diagnostics = [];
				this.edit = undefined;
			}
		},
		WorkspaceEdit: class WorkspaceEdit {
			constructor() {
				this.operations = [];
			}
			delete(uri, range) {
				this.operations.push({ type: 'delete', uri, range });
			}
			insert(uri, position, text) {
				this.operations.push({ type: 'insert', uri, position, text });
			}
			replace(uri, range, text) {
				this.operations.push({ type: 'replace', uri, range, text });
			}
		},
		Hover: class Hover {
			constructor(contents, range) {
				this.contents = Array.isArray(contents) ? contents : [contents];
				this.range = range;
			}
		},
		MarkdownString: class MarkdownString {
			constructor(value = '') {
				this.value = value;
				this.supportHtml = false;
				this.isTrusted = false;
			}
			appendMarkdown(value) {
				this.value += value;
				return this;
			}
		},
		Disposable: {
			from: (...items) => ({
				dispose: () => items.forEach((item) => item && item.dispose && item.dispose())
			})
		},
		DocumentSymbol: class {},
		TextEdit: class TextEdit {
			constructor(range, newText) {
				this.range = range;
				this.newText = newText;
			}
			static replace(range, newText) {
				return new TextEdit(range, newText);
			}
		}
	};

	function install() {
		const originalLoad = Module._load;
		Module._load = function (request, parent, isMain) {
			if (request === 'vscode') {
				return vscode;
			}
			return originalLoad.call(this, request, parent, isMain);
		};
	}

	return { vscode, files, settings, setFile, reset, createDocument, install };
}

module.exports = { createVscodeMock, Position, Range, Uri };
