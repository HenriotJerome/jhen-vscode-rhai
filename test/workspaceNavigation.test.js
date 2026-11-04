'use strict';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert');

const { createVscodeMock, Position } = require('./helpers/vscode-mock');

const mock = createVscodeMock();
mock.install();

const { RhaiWorkspaceSymbolProvider } = require('../out/features/workspaceSymbols.js');
const { computeFoldingRanges, RhaiFoldingRangeProvider } = require('../out/features/folding.js');
const { RhaiSelectionRangeProvider } = require('../out/features/selectionRange.js');
const { WorkspaceIndex } = require('../out/core/workspaceIndex.js');

beforeEach(() => mock.reset());

test('liste les symboles du workspace', async () => {
	mock.setFile('d:/proj/a.rhai', ['/// Doc.', 'fn alpha() {', '}', '', 'const LIMITE = 1;'].join('\n'));
	mock.setFile('d:/proj/b.rhai', ['fn beta() {', '}'].join('\n'));

	const provider = new RhaiWorkspaceSymbolProvider(new WorkspaceIndex());
	const symbols = await provider.provideWorkspaceSymbols('');

	assert.deepStrictEqual(symbols.map((symbol) => symbol.name).sort(), ['LIMITE', 'alpha', 'beta']);
});

test('filtre les symboles par requête', async () => {
	mock.setFile('d:/proj/a.rhai', ['fn alpha() {', '}', '', 'fn beta() {', '}'].join('\n'));

	const provider = new RhaiWorkspaceSymbolProvider(new WorkspaceIndex());
	const symbols = await provider.provideWorkspaceSymbols('ALP');

	assert.deepStrictEqual(symbols.map((symbol) => symbol.name), ['alpha']);
});

test('plie les blocs, régions et imports', () => {
	const text = [
		'import "a" as a;',
		'import "b" as b;',
		'',
		'// region: Zone',
		'fn alpha() {',
		'    let x = #{',
		'        cle: 1',
		'    };',
		'}',
		'// endregion: Zone'
	].join('\n');

	const ranges = computeFoldingRanges(text);
	const asPairs = ranges.map((range) => `${range.start}-${range.end}`);

	assert.ok(asPairs.includes('0-1'), 'groupe d imports');
	assert.ok(asPairs.includes('3-9'), 'région');
	assert.ok(asPairs.includes('4-8'), 'corps de fonction');
	assert.ok(asPairs.includes('5-7'), 'map multi-lignes');
});

test('le provider de pliage renvoie des FoldingRange', () => {
	mock.setFile('d:/proj/a.rhai', ['fn alpha() {', '    let x = 1;', '}'].join('\n'));
	const provider = new RhaiFoldingRangeProvider();

	const ranges = provider.provideFoldingRanges(mock.createDocument('d:/proj/a.rhai'), {}, {});

	assert.strictEqual(ranges.length, 1);
	assert.strictEqual(ranges[0].start, 0);
	assert.strictEqual(ranges[0].end, 2);
});

test('construit une chaîne de sélection emboîtée', () => {
	mock.setFile('d:/proj/a.rhai', [
		'fn alpha(x) {',
		'    let y = compute(x);',
		'}'
	].join('\n'));
	const provider = new RhaiSelectionRangeProvider();

	const [selection] = provider.provideSelectionRanges(
		mock.createDocument('d:/proj/a.rhai'),
		[new Position(1, 18)],
		{}
	);

	const labels = [];
	let node = selection;
	while (node) {
		labels.push(`${node.range.start.line}-${node.range.end.line}`);
		node = node.parent;
	}

	assert.ok(labels.length >= 3);
	assert.strictEqual(labels[0], '0-2');
});

test('la sélection reste stable hors de tout bloc', () => {
	mock.setFile('d:/proj/a.rhai', 'let x = 1;');
	const provider = new RhaiSelectionRangeProvider();

	const [selection] = provider.provideSelectionRanges(
		mock.createDocument('d:/proj/a.rhai'),
		[new Position(0, 4)],
		{}
	);

	assert.ok(selection);
	assert.strictEqual(selection.range.start.line, 0);
});
