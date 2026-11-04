'use strict';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert');

const { createVscodeMock } = require('./helpers/vscode-mock');

const mock = createVscodeMock();
mock.install();

const { NativeApiIndex } = require('../out/host/nativeApi.js');

const API_JSON = JSON.stringify({
	functions: [
		{
			access: 'public',
			docComments: [
				'Indique si une règle optionnelle vaut une valeur donnée.',
				'',
				'# Arguments',
				'* `cle` : Clé ou nom affiché de la règle.',
				'* `valeur` : Valeur attendue (choix, texte ou élément de multi-choix).',
				'',
				'# Returns',
				'`true` si la règle `choix`/`texte` vaut `valeur`.'
			],
			isAnonymous: false,
			name: 'regle_active',
			namespace: 'global',
			numParams: 2,
			params: [
				{ name: 'cle', type: 'string' },
				{ name: 'valeur', type: 'string' }
			],
			returnType: 'bool',
			signature: 'regle_active(cle: string, valeur: string) -> bool',
			type: 'native'
		},
		{
			access: 'public',
			docComments: ['Indique si une règle optionnelle est active.'],
			isAnonymous: false,
			name: 'regle_active',
			namespace: 'global',
			numParams: 1,
			params: [{ name: 'cle', type: 'string' }],
			returnType: 'bool',
			signature: 'regle_active(cle: string) -> bool',
			type: 'native'
		},
		{
			access: 'private',
			name: 'helper_interne',
			numParams: 0,
			signature: 'helper_interne()',
			type: 'native'
		},
		{
			access: 'public',
			name: 'fonction_script',
			numParams: 0,
			signature: 'fonction_script()',
			type: 'script'
		}
	]
});

const API_D_RHAI = [
	'module static;',
	'',
	'/// Indique si une règle optionnelle est active.',
	'fn regle_active(cle: string) -> bool;',
	'',
	'/// Indique si une règle optionnelle vaut une valeur donnée.',
	'fn regle_active(cle: string, valeur: string) -> bool;',
	'',
	'fn lire_lancer(lancer_id: string) -> map;'
].join('\n');

function setupFiles() {
	mock.setFile('d:/proj/rhai-defs/api.json', API_JSON);
	mock.setFile('d:/proj/rhai-defs/api.d.rhai', API_D_RHAI);
}

beforeEach(() => mock.reset());

test('regroupe les surcharges et les trie par arité', async () => {
	setupFiles();
	const index = new NativeApiIndex();
	await index.ensureLoaded();

	const overloads = index.getOverloads('regle_active');

	assert.strictEqual(overloads.length, 2);
	assert.deepStrictEqual(overloads.map((overload) => overload.numParams), [1, 2]);
	assert.strictEqual(index.has('regle_active'), true);
	assert.strictEqual(index.has('inconnu'), false);
});

test('buildHover expose signatures, arguments et retour', async () => {
	setupFiles();
	const index = new NativeApiIndex();
	await index.ensureLoaded();

	const hover = index.buildHover('regle_active');

	assert.ok(hover.includes('🔧'));
	assert.ok(hover.includes('regle_active(cle: string) -> bool'));
	assert.ok(hover.includes('regle_active(cle: string, valeur: string) -> bool'));
	assert.ok(hover.includes('📥 Arguments'));
	assert.ok(hover.includes('📤 Returns'));
	assert.ok(hover.includes('`cle` : Clé ou nom affiché de la règle.'));
	assert.strictEqual(index.buildHover('inconnu'), undefined);
});

test('localise les déclarations dans le fichier .d.rhai', async () => {
	setupFiles();
	const index = new NativeApiIndex();
	await index.ensureLoaded();

	const locations = index.getDefinitionLocations('lire_lancer');

	assert.strictEqual(locations.length, 1);
	assert.strictEqual(locations[0].line, 8);
	assert.strictEqual(locations[0].selectionStart, 3);
	assert.strictEqual(locations[0].selectionEnd, 3 + 'lire_lancer'.length);
});

test('ignore les fonctions privées et les fonctions de script', async () => {
	setupFiles();
	const index = new NativeApiIndex();
	await index.ensureLoaded();

	assert.strictEqual(index.has('helper_interne'), false);
	assert.strictEqual(index.has('fonction_script'), false);
});

test('tolère un JSON invalide ou un fichier absent', async () => {
	mock.setFile('d:/proj/rhai-defs/api.json', '{ ceci n est pas du json');

	const index = new NativeApiIndex();
	await index.ensureLoaded();

	assert.strictEqual(index.has('regle_active'), false);
	assert.deepStrictEqual(index.getDefinitionLocations('regle_active'), []);
});

test('fusionne plusieurs globs et déduplique les URIs', async () => {
	mock.settings['navigation.nativeApi'] = ['**/rhai-defs/api.json', '**/*.json'];
	mock.setFile('d:/proj/rhai-defs/api.json', API_JSON);

	const index = new NativeApiIndex();
	await index.ensureLoaded();

	assert.strictEqual(index.getOverloads('regle_active').length, 2);
});
