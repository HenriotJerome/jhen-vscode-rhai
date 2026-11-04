'use strict';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert');

const { createVscodeMock, Position, Range } = require('./helpers/vscode-mock');

const mock = createVscodeMock();
mock.install();

const { computeParameterHints, RhaiInlayHintsProvider } = require('../out/features/inlayHints.js');
const { RhaiCodeActionProvider } = require('../out/features/codeActions.js');
const { formatIndentation } = require('../out/features/indentation.js');
const { RhaiRangeFormattingProvider, RhaiOnTypeFormattingProvider } = require('../out/features/rangeFormatting.js');
const { NativeApiIndex } = require('../out/host/nativeApi.js');

const API_JSON = JSON.stringify({
	functions: [
		{
			access: 'public',
			name: 'regle_active',
			numParams: 2,
			params: [
				{ name: 'cle', type: 'string' },
				{ name: 'valeur', type: 'string' }
			],
			signature: 'regle_active(cle: string, valeur: string) -> bool',
			type: 'native'
		}
	]
});

let nativeApi;

beforeEach(() => {
	mock.reset();
	mock.setFile('d:/proj/rhai-defs/api.json', API_JSON);
	nativeApi = new NativeApiIndex();
});

test('propose les noms de paramètres des appels natifs', async () => {
	await nativeApi.ensureLoaded();
	const hints = computeParameterHints('let x = regle_active("a", "b");', nativeApi);

	assert.strictEqual(hints.length, 2);
	assert.strictEqual(hints[0].label, 'cle:');
	assert.strictEqual(hints[1].label, 'valeur:');
});

test('ignore les appels aux fonctions inconnues', async () => {
	await nativeApi.ensureLoaded();
	assert.deepStrictEqual(computeParameterHints('let x = inconnue(1, 2);', nativeApi), []);
});

test('le provider filtre par plage visible', async () => {
	mock.setFile('d:/proj/main.rhai', ['let a = regle_active("a", "b");', 'let b = regle_active("c", "d");'].join('\n'));
	const provider = new RhaiInlayHintsProvider(nativeApi);

	const hints = await provider.provideInlayHints(
		mock.createDocument('d:/proj/main.rhai'),
		new Range(1, 0, 1, 30),
		{}
	);

	assert.strictEqual(hints.length, 2);
	assert.strictEqual(hints[0].position.line, 1);
	assert.strictEqual(hints[0].kind, 2);
});

test('ajoute un squelette de documentation sur une fonction nue', () => {
	mock.setFile('d:/proj/main.rhai', ['fn alpha(x, y) {', '}'].join('\n'));
	const provider = new RhaiCodeActionProvider();

	const actions = provider.provideCodeActions(
		mock.createDocument('d:/proj/main.rhai'),
		new Range(0, 0, 0, 0),
		{ diagnostics: [] }
	);

	const skeleton = actions.find((action) => action.title.includes('squelette'));
	assert.ok(skeleton);
	assert.strictEqual(skeleton.edit.operations[0].type, 'insert');
	assert.ok(skeleton.edit.operations[0].text.includes('# Arguments'));
	assert.ok(skeleton.edit.operations[0].text.includes('`x`'));
});

test('ne propose pas de squelette quand la doc existe déjà', () => {
	mock.setFile('d:/proj/main.rhai', ['/// Déjà documenté.', 'fn alpha() {', '}'].join('\n'));
	const provider = new RhaiCodeActionProvider();

	const actions = provider.provideCodeActions(
		mock.createDocument('d:/proj/main.rhai'),
		new Range(1, 0, 1, 0),
		{ diagnostics: [] }
	);

	assert.strictEqual(actions.some((action) => action.title.includes('squelette')), false);
});

test('trie et déduplique les imports', () => {
	mock.setFile('d:/proj/main.rhai', [
		'import "z" as z;',
		'import "a" as a;',
		'import "a" as a;'
	].join('\n'));
	const provider = new RhaiCodeActionProvider();

	const actions = provider.provideCodeActions(
		mock.createDocument('d:/proj/main.rhai'),
		new Range(0, 0, 0, 0),
		{ diagnostics: [] }
	);

	const organize = actions.find((action) => action.title === 'Trier les imports');
	assert.ok(organize);
	assert.strictEqual(organize.edit.operations[0].text, 'import "a" as a;\nimport "z" as z;');
});

test('réindente un bloc mal aligné', () => {
	const text = ['fn alpha() {', 'let x = 1;', 'if x {', 'return x;', '}', '}'].join('\n');
	const formatted = formatIndentation(text, { insertSpaces: true, tabSize: 4 });

	assert.strictEqual(formatted, [
		'fn alpha() {',
		'    let x = 1;',
		'    if x {',
		'        return x;',
		'    }',
		'}'
	].join('\n'));
});

test('le formatage est idempotent', () => {
	const text = ['fn alpha() {', 'let x = 1;', '}'].join('\n');
	const once = formatIndentation(text, { insertSpaces: true, tabSize: 4 });
	const twice = formatIndentation(once, { insertSpaces: true, tabSize: 4 });

	assert.strictEqual(once, twice);
});

test('respecte les tabulations quand demandé', () => {
	const formatted = formatIndentation(['fn a() {', 'let x = 1;', '}'].join('\n'), {
		insertSpaces: false,
		tabSize: 4
	});

	assert.strictEqual(formatted.split('\n')[1], '\tlet x = 1;');
});

test('le formatage de plage ne renvoie que les lignes modifiées', () => {
	mock.setFile('d:/proj/main.rhai', ['fn alpha() {', 'let x = 1;', '}'].join('\n'));
	const provider = new RhaiRangeFormattingProvider();

	const edits = provider.provideDocumentRangeFormattingEdits(
		mock.createDocument('d:/proj/main.rhai'),
		new Range(0, 0, 2, 0),
		{ insertSpaces: true, tabSize: 4 },
		{}
	);

	assert.strictEqual(edits.length, 1);
	assert.strictEqual(edits[0].newText, '    let x = 1;');
});

test('le formatage à la frappe réindente la ligne courante', () => {
	mock.setFile('d:/proj/main.rhai', ['fn alpha() {', 'let x = 1;', '}'].join('\n'));
	const provider = new RhaiOnTypeFormattingProvider();

	const edits = provider.provideOnTypeFormattingEdits(
		mock.createDocument('d:/proj/main.rhai'),
		new Position(1, 10),
		';',
		{ insertSpaces: true, tabSize: 4 },
		{}
	);

	assert.strictEqual(edits.length, 1);
	assert.strictEqual(edits[0].newText, '    let x = 1;');
});
