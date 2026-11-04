'use strict';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert');

const { createVscodeMock, Uri } = require('./helpers/vscode-mock');

const mock = createVscodeMock();
mock.install();

const { WorkspaceIndex } = require('../out/core/workspaceIndex.js');

beforeEach(() => mock.reset());

test('indexe les fonctions et constantes de plusieurs fichiers', async () => {
	mock.setFile('d:/proj/a.rhai', [
		'import "b" as b;',
		'',
		'/// Calcule.',
		'fn alpha(x) {',
		'    return b::beta(x);',
		'}',
		'',
		'const LIMITE = 10;'
	].join('\n'));
	mock.setFile('d:/proj/b.rhai', ['fn beta(y) {', '    return y;', '}'].join('\n'));

	const index = new WorkspaceIndex();
	await index.ensureLoaded();

	assert.strictEqual(index.getFunctions('alpha').length, 1);
	assert.strictEqual(index.getFunctions('alpha')[0].line, 3);
	assert.deepStrictEqual(index.getFunctions('alpha')[0].doc, ['Calcule.']);
	assert.strictEqual(index.getFunctions('beta').length, 1);
	assert.strictEqual(index.getConstants('LIMITE').length, 1);
	assert.strictEqual(index.getFunctions('inconnue').length, 0);
});

test('expose les imports du workspace', async () => {
	mock.setFile('d:/proj/a.rhai', 'import "utils" as u;\nimport "helpers/math" as m;');

	const index = new WorkspaceIndex();
	await index.ensureLoaded();

	const modules = index.getModules();
	assert.strictEqual(modules.length, 2);
	assert.strictEqual(modules[0].module, 'utils');
	assert.strictEqual(modules[0].alias, 'u');
	assert.strictEqual(modules[1].module, 'helpers/math');
});

test('met en cache l AST par fichier', async () => {
	mock.setFile('d:/proj/a.rhai', 'fn alpha() {\n}');

	const index = new WorkspaceIndex();
	await index.ensureLoaded();

	const uri = new Uri('d:/proj/a.rhai');
	assert.ok(index.getAst(uri));
	assert.strictEqual(index.getAst(uri).functions.length, 1);
	assert.strictEqual(index.getFiles().length, 1);
});

test('collecte les occurrences d identifiants', async () => {
	mock.setFile('d:/proj/a.rhai', [
		'fn alpha(x) {',
		'    let y = beta(x);',
		'    return beta(y);',
		'}'
	].join('\n'));

	const index = new WorkspaceIndex();
	await index.ensureLoaded();

	const occurrences = index.getReferences('beta');
	assert.strictEqual(occurrences.length, 2);
	assert.strictEqual(occurrences[0].range.start.line, 1);
	assert.strictEqual(occurrences[1].range.start.line, 2);
});

test('ignore les fichiers de définitions .d.rhai', async () => {
	mock.setFile('d:/proj/a.rhai', 'fn alpha() {\n}');
	mock.setFile('d:/proj/rhai-defs/api.d.rhai', 'module static;\nfn natif(x: int) -> int;');

	const index = new WorkspaceIndex();
	await index.ensureLoaded();

	assert.strictEqual(index.getFunctions('alpha').length, 1);
	assert.strictEqual(index.getFunctions('natif').length, 0);
	assert.strictEqual(index.getFiles().length, 1);
});

test('invalidate force un rechargement complet', async () => {
	mock.setFile('d:/proj/a.rhai', 'fn alpha() {\n}');

	const index = new WorkspaceIndex();
	await index.ensureLoaded();
	assert.strictEqual(index.getFunctions('alpha').length, 1);

	mock.setFile('d:/proj/a.rhai', 'fn gamma() {\n}');
	index.invalidate();
	await index.ensureLoaded();

	assert.strictEqual(index.getFunctions('alpha').length, 0);
	assert.strictEqual(index.getFunctions('gamma').length, 1);
});

test('un fichier illisible ne casse pas l index', async () => {
	mock.setFile('d:/proj/a.rhai', 'fn alpha() {\n}');
	mock.setFile('d:/proj/casse.rhai', 'fn casse( }');

	const index = new WorkspaceIndex();
	await index.ensureLoaded();

	assert.strictEqual(index.getFunctions('alpha').length, 1);
});

test('getAllFunctions agrège tout le workspace', async () => {
	mock.setFile('d:/proj/a.rhai', 'fn alpha() {\n}');
	mock.setFile('d:/proj/b.rhai', 'fn beta() {\n}');

	const index = new WorkspaceIndex();
	await index.ensureLoaded();

	assert.deepStrictEqual(index.getAllFunctions().map((ref) => ref.name).sort(), ['alpha', 'beta']);
});
