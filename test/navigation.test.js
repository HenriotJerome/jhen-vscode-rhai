'use strict';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert');

const { createVscodeMock, Position } = require('./helpers/vscode-mock');

const mock = createVscodeMock();
mock.install();

const { RhaiDefinitionProvider } = require('../out/extension.js');

const provider = new RhaiDefinitionProvider();

async function provideDefinition(filePath, line, character) {
	const document = mock.createDocument(filePath);
	return provider.provideDefinition(document, new Position(line, character), {});
}

function targetOf(result) {
	if (!result || result.length === 0) {
		return null;
	}
	const { targetUri, targetSelectionRange } = result[0];
	return `${targetUri.path}:${targetSelectionRange.start.line}`;
}

beforeEach(() => mock.reset());

test('trouve une fonction définie dans le fichier courant', async () => {
	mock.setFile('d:/proj/main.rhai', [
		'import "personnage" as p;',
		'',
		'fn local_fn() {',
		'}',
		'',
		'let a = local_fn();'
	].join('\n'));

	const result = await provideDefinition('d:/proj/main.rhai', 5, 10);

	assert.strictEqual(targetOf(result), 'd:/proj/main.rhai:2');
});

test('trouve une fonction définie dans un sous-répertoire', async () => {
	mock.setFile('d:/proj/main.rhai', 'let b = helper_fn();');
	mock.setFile('d:/proj/sub/helper.rhai', ['fn helper_fn(x) {', '}'].join('\n'));

	const result = await provideDefinition('d:/proj/main.rhai', 0, 10);

	assert.strictEqual(targetOf(result), 'd:/proj/sub/helper.rhai:0');
});

test('trouve une constante définie dans un sous-répertoire', async () => {
	mock.setFile('d:/proj/main.rhai', 'let y = LIMITE_MAX;');
	mock.setFile('d:/proj/config/limits.rhai', 'const LIMITE_MAX = 100;');

	const result = await provideDefinition('d:/proj/main.rhai', 0, 10);

	assert.strictEqual(targetOf(result), 'd:/proj/config/limits.rhai:0');
});

test('résout un module importé situé dans un sous-répertoire', async () => {
	mock.setFile('d:/proj/main.rhai', [
		'import "personnage" as p;',
		'let c = p::get_equipement(1);'
	].join('\n'));
	mock.setFile('d:/proj/data/personnage.rhai', [
		'const LIMITE = 10;',
		'',
		'fn get_equipement(n) {',
		'}'
	].join('\n'));

	const result = await provideDefinition('d:/proj/main.rhai', 1, 12);

	assert.strictEqual(targetOf(result), 'd:/proj/data/personnage.rhai:2');
});

test("ouvre le fichier module depuis un alias d'import", async () => {
	mock.setFile('d:/proj/main.rhai', 'import "personnage" as p;');
	mock.setFile('d:/proj/data/personnage.rhai', ['fn get_equipement(n) {', '}'].join('\n'));

	const result = await provideDefinition('d:/proj/main.rhai', 0, 23);

	assert.strictEqual(targetOf(result), 'd:/proj/data/personnage.rhai:0');
});

test('ne cherche pas dans les sous-répertoires quand le réglage est désactivé', async () => {
	mock.setFile('d:/proj/main.rhai', 'let b = helper_fn();');
	mock.setFile('d:/proj/sub/helper.rhai', ['fn helper_fn(x) {', '}'].join('\n'));
	mock.settings['navigation.searchSubdirectories'] = false;

	const result = await provideDefinition('d:/proj/main.rhai', 0, 10);

	assert.strictEqual(targetOf(result), null);
});

test('parcourt les sous-dossiers quand aucun workspace n\'est ouvert', async () => {
	mock.setFile('d:/standalone/main.rhai', [
		'import "utils" as u;',
		'let x = u::compute();'
	].join('\n'));
	mock.setFile('d:/standalone/lib/utils.rhai', ['fn compute() {', '}'].join('\n'));

	const result = await provideDefinition('d:/standalone/main.rhai', 1, 12);

	assert.strictEqual(targetOf(result), 'd:/standalone/lib/utils.rhai:0');
});

test('retourne null quand le symbole est introuvable', async () => {
	mock.setFile('d:/proj/main.rhai', 'let z = inconnu();');

	const result = await provideDefinition('d:/proj/main.rhai', 0, 10);

	assert.strictEqual(targetOf(result), null);
});
