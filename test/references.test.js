'use strict';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert');

const { createVscodeMock, Position } = require('./helpers/vscode-mock');

const mock = createVscodeMock();
mock.install();

const { RhaiReferenceProvider } = require('../out/features/references.js');
const { RhaiDocumentHighlightProvider } = require('../out/features/documentHighlight.js');
const { RhaiRenameProvider } = require('../out/features/rename.js');
const { WorkspaceIndex } = require('../out/core/workspaceIndex.js');
const { NativeApiIndex } = require('../out/host/nativeApi.js');

const API_JSON = JSON.stringify({
	functions: [
		{
			access: 'public',
			name: 'native_fn',
			numParams: 0,
			signature: 'native_fn()',
			type: 'native'
		}
	]
});

let index;
let references;
let rename;

async function referencesAt(filePath, line, character, includeDeclaration = false) {
	return references.provideReferences(
		mock.createDocument(filePath),
		new Position(line, character),
		{ includeDeclaration },
		{}
	);
}

beforeEach(() => {
	mock.reset();
	mock.setFile('d:/proj/rhai-defs/api.json', API_JSON);
	index = new WorkspaceIndex();
	references = new RhaiReferenceProvider(index);
	rename = new RhaiRenameProvider(index, new NativeApiIndex());
});

test('trouve les références dans plusieurs fichiers', async () => {
	mock.setFile('d:/proj/a.rhai', ['fn alpha() {', '}', '', 'let x = alpha();'].join('\n'));
	mock.setFile('d:/proj/b.rhai', ['fn beta() {', '    return alpha();', '}'].join('\n'));

	const locations = await referencesAt('d:/proj/a.rhai', 3, 9);

	const files = locations.map((location) => location.uri.path).sort();
	assert.deepStrictEqual(files, ['d:/proj/a.rhai', 'd:/proj/b.rhai']);
});

test('trouve les références via alias::', async () => {
	mock.setFile('d:/proj/a.rhai', ['import "b" as b;', '', 'let x = b::beta();'].join('\n'));
	mock.setFile('d:/proj/b.rhai', ['fn beta() {', '}'].join('\n'));

	const locations = await referencesAt('d:/proj/a.rhai', 2, 13);

	assert.ok(locations.some((location) => location.uri.path === 'd:/proj/a.rhai'));
});

test('inclut la déclaration quand demandé', async () => {
	mock.setFile('d:/proj/a.rhai', ['fn alpha() {', '}', '', 'let x = alpha();'].join('\n'));

	const withoutDeclaration = await referencesAt('d:/proj/a.rhai', 3, 9, false);
	const withDeclaration = await referencesAt('d:/proj/a.rhai', 3, 9, true);

	assert.strictEqual(withDeclaration.length, withoutDeclaration.length + 1);
});

test('met en évidence les occurrences dans le document', async () => {
	mock.setFile('d:/proj/a.rhai', ['fn alpha() {', '}', '', 'alpha();', 'alpha();'].join('\n'));
	const provider = new RhaiDocumentHighlightProvider();

	const highlights = provider.provideDocumentHighlights(
		mock.createDocument('d:/proj/a.rhai'),
		new Position(3, 2),
		{}
	);

	assert.strictEqual(highlights.length, 2);
	assert.strictEqual(highlights[0].kind, 1);
});

test('renomme une fonction utilisée dans plusieurs fichiers', async () => {
	mock.setFile('d:/proj/a.rhai', ['fn alpha() {', '}', '', 'alpha();'].join('\n'));
	mock.setFile('d:/proj/b.rhai', ['fn beta() {', '    alpha();', '}'].join('\n'));

	const edit = await rename.provideRenameEdits(
		mock.createDocument('d:/proj/a.rhai'),
		new Position(3, 2),
		'gamma',
		{}
	);

	const targets = edit.operations.map((operation) => operation.uri.path);
	assert.ok(targets.includes('d:/proj/a.rhai'));
	assert.ok(targets.includes('d:/proj/b.rhai'));
	assert.ok(edit.operations.every((operation) => operation.text === 'gamma'));
});

test('refuse de renommer une fonction fournie par l hôte', async () => {
	await rename.index.ensureLoaded();
	mock.setFile('d:/proj/a.rhai', 'native_fn();');

	await assert.rejects(
		() => rename.prepareRename(mock.createDocument('d:/proj/a.rhai'), new Position(0, 2), {}),
		/ fourni par l'hôte /
	);
});

test('refuse de renommer un mot-clé', async () => {
	mock.setFile('d:/proj/a.rhai', 'let x = 1;');

	await assert.rejects(
		() => rename.prepareRename(mock.createDocument('d:/proj/a.rhai'), new Position(0, 1), {}),
		/mot-clé/
	);
});

test('refuse un symbole ambigu', async () => {
	mock.setFile('d:/proj/a.rhai', ['fn alpha() {', '}', '', 'alpha();'].join('\n'));
	mock.setFile('d:/proj/b.rhai', ['fn alpha() {', '}'].join('\n'));

	await assert.rejects(
		() => rename.prepareRename(mock.createDocument('d:/proj/a.rhai'), new Position(3, 2), {}),
		/ambigu/
	);
});

test('renomme un alias d import', async () => {
	mock.setFile('d:/proj/a.rhai', ['import "b" as bb;', '', 'let x = bb::beta();'].join('\n'));
	mock.setFile('d:/proj/b.rhai', ['fn beta() {', '}'].join('\n'));

	const edit = await rename.provideRenameEdits(
		mock.createDocument('d:/proj/a.rhai'),
		new Position(2, 9),
		'cc',
		{}
	);

	assert.ok(edit.operations.length >= 1);
	assert.ok(edit.operations.every((operation) => operation.text === 'cc'));
});
