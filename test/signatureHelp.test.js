'use strict';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert');

const { createVscodeMock, Position } = require('./helpers/vscode-mock');

const mock = createVscodeMock();
mock.install();

const { RhaiSignatureHelpProvider, findCallContext } = require('../out/features/signatureHelp.js');
const { NativeApiIndex } = require('../out/host/nativeApi.js');

const API_JSON = JSON.stringify({
	functions: [
		{
			access: 'public',
			docComments: ['Indique si une règle est active.'],
			name: 'regle_active',
			numParams: 1,
			params: [{ name: 'cle', type: 'string' }],
			returnType: 'bool',
			signature: 'regle_active(cle: string) -> bool',
			type: 'native'
		},
		{
			access: 'public',
			docComments: ['Indique si une règle vaut une valeur.'],
			name: 'regle_active',
			numParams: 2,
			params: [
				{ name: 'cle', type: 'string' },
				{ name: 'valeur', type: 'string' }
			],
			returnType: 'bool',
			signature: 'regle_active(cle: string, valeur: string) -> bool',
			type: 'native'
		}
	]
});

let provider;

async function helpAt(filePath, line, character) {
	const document = mock.createDocument(filePath);
	return provider.provideSignatureHelp(document, new Position(line, character), {}, {});
}

beforeEach(() => {
	mock.reset();
	mock.setFile('d:/proj/rhai-defs/api.json', API_JSON);
	provider = new RhaiSignatureHelpProvider(new NativeApiIndex());
});

test('détecte le contexte d appel et le paramètre actif', () => {
	const text = 'let x = compute(1, ';
	const context = findCallContext(text, text.length);

	assert.ok(context);
	assert.strictEqual(context.name, 'compute');
	assert.strictEqual(context.kind, 'call');
	assert.strictEqual(context.activeParameter, 1);
});

test('détecte un appel de module', () => {
	const text = 'let x = u::compute(';
	const context = findCallContext(text, text.length);

	assert.ok(context);
	assert.strictEqual(context.kind, 'module');
	assert.strictEqual(context.qualifier, 'u');
});

test('détecte un appel de méthode', () => {
	const text = 'let x = texte.len(';
	const context = findCallContext(text, text.length);

	assert.ok(context);
	assert.strictEqual(context.kind, 'method');
	assert.strictEqual(context.qualifier, 'texte');
});

test('ignore les parenthèses déjà fermées', () => {
	const text = 'let x = f(g(1), ';
	const context = findCallContext(text, text.length);

	assert.ok(context);
	assert.strictEqual(context.name, 'f');
	assert.strictEqual(context.activeParameter, 1);
});

test('fournit la signature d une fonction locale à 3 paramètres', async () => {
	mock.setFile('d:/proj/main.rhai', [
		'fn calculer(a, b, c) {',
		'}',
		'',
		'let x = calculer(1, '
	].join('\n'));

	const help = await helpAt('d:/proj/main.rhai', 3, 19);

	assert.ok(help);
	assert.strictEqual(help.signatures[0].label, 'calculer(a, b, c)');
	assert.strictEqual(help.signatures[0].parameters.length, 3);
	assert.strictEqual(help.activeParameter, 1);
});

test('choisit la surcharge native correspondant au nombre d arguments', async () => {
	mock.setFile('d:/proj/main.rhai', 'let x = regle_active("a", ');

	const help = await helpAt('d:/proj/main.rhai', 0, 25);

	assert.ok(help);
	assert.strictEqual(help.signatures.length, 2);
	assert.strictEqual(help.signatures[help.activeSignature].label, 'regle_active(cle: string, valeur: string) -> bool');
});

test('retourne undefined hors d un appel', async () => {
	mock.setFile('d:/proj/main.rhai', 'let x = 1;');

	const help = await helpAt('d:/proj/main.rhai', 0, 9);

	assert.strictEqual(help, undefined);
});

test('retourne undefined pour un symbole inconnu', async () => {
	mock.setFile('d:/proj/main.rhai', 'let x = inconnu(');

	const help = await helpAt('d:/proj/main.rhai', 0, 16);

	assert.strictEqual(help, undefined);
});

test('résout la signature d une fonction importée', async () => {
	mock.setFile('d:/proj/main.rhai', ['import "utils" as u;', 'let x = u::beta('].join('\n'));
	mock.setFile('d:/proj/utils.rhai', ['fn beta(a, b) {', '}'].join('\n'));

	const help = await helpAt('d:/proj/main.rhai', 1, 16);

	assert.ok(help);
	assert.strictEqual(help.signatures[0].label, 'beta(a, b)');
});
