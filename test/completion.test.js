'use strict';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert');

const { createVscodeMock, Position } = require('./helpers/vscode-mock');

const mock = createVscodeMock();
mock.install();

const { RhaiCompletionProvider } = require('../out/features/completion.js');
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
		}
	]
});

let provider;

async function completionsAt(filePath, line, character) {
	const document = mock.createDocument(filePath);
	return provider.provideCompletionItems(document, new Position(line, character), {}, {});
}

function labels(items) {
	return items.map((item) => item.label);
}

beforeEach(() => {
	mock.reset();
	mock.setFile('d:/proj/rhai-defs/api.json', API_JSON);
	provider = new RhaiCompletionProvider(new NativeApiIndex());
});

test('propose les fonctions et constantes du fichier courant', async () => {
	mock.setFile('d:/proj/main.rhai', [
		'/// Calcule.',
		'fn alpha(x) {',
		'}',
		'',
		'const LIMITE = 10;',
		'',
		'let y = '
	].join('\n'));

	const items = await completionsAt('d:/proj/main.rhai', 6, 8);

	assert.ok(labels(items).includes('alpha'));
	assert.ok(labels(items).includes('LIMITE'));
	const alpha = items.find((item) => item.label === 'alpha');
	assert.strictEqual(alpha.kind, 2);
	assert.strictEqual(alpha.detail, 'alpha(x)');
});

test('propose les fonctions natives de l hôte avec leur signature', async () => {
	mock.setFile('d:/proj/main.rhai', 'let y = ');

	const items = await completionsAt('d:/proj/main.rhai', 0, 8);
	const native = items.find((item) => item.label === 'regle_active');

	assert.ok(native);
	assert.strictEqual(native.detail, 'regle_active(cle: string) -> bool');
});

test('propose les mots-clés', async () => {
	mock.setFile('d:/proj/main.rhai', 'let y = ');

	const items = await completionsAt('d:/proj/main.rhai', 0, 8);

	assert.ok(labels(items).includes('fn'));
	assert.ok(labels(items).includes('return'));
});

test('après alias:: propose les symboles du module importé', async () => {
	mock.setFile('d:/proj/main.rhai', ['import "utils" as u;', 'let x = u::'].join('\n'));
	mock.setFile('d:/proj/utils.rhai', [
		'/// Calcule.',
		'fn beta(y) {',
		'}',
		'',
		'private fn interne() {',
		'}',
		'',
		'const MAX = 1;'
	].join('\n'));

	const items = await completionsAt('d:/proj/main.rhai', 1, 11);

	assert.deepStrictEqual(labels(items).sort(), ['MAX', 'beta']);
});

test('ne propose rien dans un commentaire', async () => {
	mock.setFile('d:/proj/main.rhai', '// un commentaire ');

	const items = await completionsAt('d:/proj/main.rhai', 0, 17);

	assert.deepStrictEqual(items, []);
});

test('ne propose rien dans une chaîne', async () => {
	mock.setFile('d:/proj/main.rhai', 'let s = "texte ');

	const items = await completionsAt('d:/proj/main.rhai', 0, 15);

	assert.deepStrictEqual(items, []);
});

test('propose les clés de map dans un contexte #{}', async () => {
	mock.setFile('d:/proj/main.rhai', [
		'let m = #{ nom: "a", actif: true };',
		'let n = #{ '
	].join('\n'));

	const items = await completionsAt('d:/proj/main.rhai', 1, 10);

	assert.ok(labels(items).includes('nom'));
	assert.ok(labels(items).includes('actif'));
});
