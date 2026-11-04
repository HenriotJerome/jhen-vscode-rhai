'use strict';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert');

const { createVscodeMock, Position } = require('./helpers/vscode-mock');

const mock = createVscodeMock();
mock.install();

const { RhaiHoverProvider } = require('../out/extension.js');
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
				'',
				'# Returns',
				'`true` si la règle vaut la valeur.'
			],
			name: 'regle_active',
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
			name: 'regle_active',
			numParams: 1,
			params: [{ name: 'cle', type: 'string' }],
			returnType: 'bool',
			signature: 'regle_active(cle: string) -> bool',
			type: 'native'
		},
		{
			access: 'public',
			docComments: ["Remplace une portion de texte (documentation fournie par l'hôte)."],
			name: 'replace',
			numParams: 3,
			params: [
				{ name: 'texte', type: 'string' },
				{ name: 'motif', type: 'string' },
				{ name: 'remplacement', type: 'string' }
			],
			returnType: 'string',
			signature: 'replace(texte: string, motif: string, remplacement: string) -> string',
			type: 'native'
		}
	]
});

let provider;

function markdownOf(hover) {
	if (!hover) {
		return null;
	}
	return hover.contents.map((content) => content.value).join('');
}

async function hoverOn(filePath, line, character) {
	return provider.provideHover(mock.createDocument(filePath), new Position(line, character), {});
}

beforeEach(() => {
	mock.reset();
	mock.setFile('d:/proj/rhai-defs/api.json', API_JSON);
	provider = new RhaiHoverProvider(new NativeApiIndex());
});

test("affiche la documentation fournie par l'hôte avec toutes les surcharges", async () => {
	mock.setFile('d:/proj/main.rhai', 'let x = regle_active("or");');

	const markdown = markdownOf(await hoverOn('d:/proj/main.rhai', 0, 10));

	assert.ok(markdown.includes('Fonction native (hôte)'));
	assert.ok(markdown.includes('regle_active(cle: string) -> bool'));
	assert.ok(markdown.includes('regle_active(cle: string, valeur: string) -> bool'));
	assert.ok(markdown.includes('📥 Arguments'));
	assert.ok(markdown.includes('📤 Returns'));
});

test("la documentation de l'hôte prime sur le hover générique", async () => {
	mock.setFile('d:/proj/main.rhai', 'let t = replace(texte, motif, autre);');

	const markdown = markdownOf(await hoverOn('d:/proj/main.rhai', 0, 10));

	assert.ok(markdown.includes("documentation fournie par l'hôte"));
	assert.strictEqual(markdown.includes('Fonction intégrée au langage Rhai'), false);
});

test('une fonction native Rhai non couverte garde le hover générique', async () => {
	mock.setFile('d:/proj/main.rhai', 'let t = type_of(valeur);');

	const markdown = markdownOf(await hoverOn('d:/proj/main.rhai', 0, 10));

	assert.ok(markdown.includes('Fonction intégrée au langage Rhai'));
	assert.ok(markdown.includes('🔷'));
});

test('une fonction du fichier courant prime sur la native homonyme', async () => {
	mock.setFile('d:/proj/main.rhai', [
		'/// Ma documentation locale.',
		'fn regle_active(cle) {',
		'}',
		'',
		'let x = regle_active("or");'
	].join('\n'));

	const markdown = markdownOf(await hoverOn('d:/proj/main.rhai', 4, 10));

	assert.ok(markdown.includes('Ma documentation locale'));
	assert.strictEqual(markdown.includes('Fonction native (hôte)'), false);
});

test('retourne null pour un nom inconnu', async () => {
	mock.setFile('d:/proj/main.rhai', 'let x = totalement_inconnu(1);');

	const hover = await hoverOn('d:/proj/main.rhai', 0, 10);

	assert.strictEqual(hover, null);
});

test('les liens de commande des docs de fichier ne sont pas cliquables', async () => {
	mock.setFile('d:/proj/main.rhai', [
		'/// Voir [ici](command:workbench.action.reloadWindow).',
		'fn regle_active(cle) {',
		'}',
		'',
		'let x = regle_active("or");'
	].join('\n'));

	const hover = await hoverOn('d:/proj/main.rhai', 4, 10);

	assert.ok(hover);
	assert.strictEqual(hover.contents[0].isTrusted, false);
	assert.strictEqual(hover.contents[0].supportHtml, false);
});

test('le hover natif reste non fiable et sans HTML', async () => {
	mock.setFile('d:/proj/main.rhai', 'let x = regle_active("or");');

	const hover = await hoverOn('d:/proj/main.rhai', 0, 10);

	assert.ok(hover);
	assert.strictEqual(hover.contents[0].isTrusted, false);
	assert.strictEqual(hover.contents[0].supportHtml, false);
});
