import * as vscode from 'vscode';
import { FunctionDecl } from '../core/ast';
import { tokenize } from '../core/lexer';
import { parse } from '../core/parser';
import { NativeApiIndex } from '../host/nativeApi';
import { renderDocumentation } from '../utils/documentation';
import { resolveModuleUri } from '../utils/modules';

export interface CallContext {
	name: string;
	qualifier?: string;
	kind: 'call' | 'method' | 'module';
	activeParameter: number;
}

function offsetAt(text: string, line: number, character: number): number {
	const lines = text.split('\n');
	let offset = 0;
	for (let index = 0; index < line && index < lines.length; index++) {
		offset += lines[index].length + 1;
	}
	return offset + character;
}

export function findCallContext(text: string, offset: number): CallContext | undefined {
	const tokens = tokenize(text).filter((token) => token.kind !== 'comment' && token.kind !== 'doc');

	let cursor = tokens.findIndex((token) => token.start >= offset);
	if (cursor === -1) {
		cursor = tokens.length;
	}

	let depth = 0;
	for (let index = cursor - 1; index >= 0; index--) {
		const token = tokens[index];
		if (token.kind !== 'punct') {
			continue;
		}

		if (token.value === ')' || token.value === ']' || token.value === '}') {
			depth++;
			continue;
		}

		if (token.value === '[' || token.value === '{') {
			if (depth > 0) {
				depth--;
			}
			continue;
		}

		if (token.value !== '(') {
			continue;
		}

		if (depth > 0) {
			depth--;
			continue;
		}

		const callee = tokens[index - 1];
		if (!callee || (callee.kind !== 'ident' && callee.value !== 'this')) {
			return undefined;
		}

		let qualifier: string | undefined;
		let kind: CallContext['kind'] = 'call';
		const separator = tokens[index - 2];
		if (separator && separator.kind === 'punct' && (separator.value === '.' || separator.value === '::')) {
			const receiver = tokens[index - 3];
			if (receiver && receiver.kind === 'ident') {
				qualifier = receiver.value;
				kind = separator.value === '::' ? 'module' : 'method';
			}
		}

		let activeParameter = 0;
		let innerDepth = 0;
		for (let scan = index + 1; scan < cursor; scan++) {
			const current = tokens[scan];
			if (current.kind !== 'punct') {
				continue;
			}
			if (current.value === '(' || current.value === '[' || current.value === '{') {
				innerDepth++;
			} else if (current.value === ')' || current.value === ']' || current.value === '}') {
				innerDepth--;
			} else if (current.value === ',' && innerDepth === 0) {
				activeParameter++;
			}
		}

		return { name: callee.value, qualifier, kind, activeParameter };
	}

	return undefined;
}

function signatureFromFunction(
	declaration: FunctionDecl,
	origin = `Fichier courant · ligne ${declaration.line + 1}`
): vscode.SignatureInformation {
	const params = declaration.params.map((param) =>
		param.type ? `${param.name}: ${param.type}` : param.name
	);
	const signature = new vscode.SignatureInformation(`${declaration.name}(${params.join(', ')})`);
	signature.parameters = declaration.params.map(
		(param) => new vscode.ParameterInformation(param.type ? `${param.name}: ${param.type}` : param.name)
	);
	if (declaration.doc.length > 0) {
		signature.documentation = new vscode.MarkdownString(
			[
				`**🟢 ${declaration.name}()**`,
				'',
				renderDocumentation(declaration.doc),
				'',
				'---',
				'',
				`*${origin}*`
			].join('\n')
		);
	}
	return signature;
}

export class RhaiSignatureHelpProvider implements vscode.SignatureHelpProvider {
	constructor(private readonly nativeApi: NativeApiIndex) {}

	async provideSignatureHelp(
		document: vscode.TextDocument,
		position: vscode.Position,
		_token: vscode.CancellationToken,
		_context: vscode.SignatureHelpContext
	): Promise<vscode.SignatureHelp | undefined> {
		const text = document.getText();
		const offset = offsetAt(text, position.line, position.character);
		const call = findCallContext(text, offset);
		if (!call) {
			return undefined;
		}

		await this.nativeApi.ensureLoaded();

		const ast = parse(text);

		if (call.kind === 'module' && call.qualifier) {
			const signatures = await this.moduleSignatures(document, ast.imports, call);
			if (signatures) {
				return signatures;
			}
		}

		const local = ast.functions.find((declaration) => declaration.name === call.name);
		if (local) {
			const help = new vscode.SignatureHelp();
			help.signatures = [signatureFromFunction(local)];
			help.activeSignature = 0;
			help.activeParameter = Math.min(call.activeParameter, Math.max(local.params.length - 1, 0));
			return help;
		}

		const overloads = this.nativeApi.getOverloads(call.name);
		if (overloads.length === 0) {
			return undefined;
		}

		const sorted = [...overloads].sort((a, b) => a.numParams - b.numParams);
		const help = new vscode.SignatureHelp();
		help.signatures = sorted.map((overload) => {
			const signature = new vscode.SignatureInformation(overload.signature);
			signature.parameters = (overload.params ?? []).map(
				(param) => new vscode.ParameterInformation(param.type ? `${param.name ?? '_'}: ${param.type}` : param.name ?? '_')
			);
			if (overload.docComments && overload.docComments.length > 0) {
				signature.documentation = new vscode.MarkdownString(
					[
						`**🔧 Fonction native (hôte)** · \`${call.name}\``,
						'',
						renderDocumentation(overload.docComments),
						'',
						'---',
						'',
						"*Fonction fournie par l'hôte*"
					].join('\n')
				);
			}
			return signature;
		});

		const matching = sorted.findIndex((overload) => overload.numParams > call.activeParameter);
		help.activeSignature = matching === -1 ? sorted.length - 1 : matching;
		help.activeParameter = Math.min(call.activeParameter, Math.max(sorted[help.activeSignature].numParams - 1, 0));
		return help;
	}

	private async moduleSignatures(
		document: vscode.TextDocument,
		imports: { module: string; alias: string }[],
		call: CallContext
	): Promise<vscode.SignatureHelp | undefined> {
		const declaration = imports.find((item) => item.alias === call.qualifier);
		if (!declaration) {
			return undefined;
		}

		const uri = await resolveModuleUri(document, declaration.module);
		if (!uri) {
			return undefined;
		}

		let moduleText: string;
		try {
			moduleText = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
		} catch {
			return undefined;
		}

		const moduleAst = parse(moduleText);
		const target = moduleAst.functions.find(
			(item) => item.name === call.name && item.visibility !== 'private'
		);
		if (!target) {
			return undefined;
		}

		const help = new vscode.SignatureHelp();
		help.signatures = [signatureFromFunction(target, `Importée depuis \`${call.qualifier}\``)];
		help.activeSignature = 0;
		help.activeParameter = Math.min(call.activeParameter, Math.max(target.params.length - 1, 0));
		return help;
	}
}
