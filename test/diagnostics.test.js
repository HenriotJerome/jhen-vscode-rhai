'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const { createVscodeMock } = require('./helpers/vscode-mock');

const mock = createVscodeMock();
mock.install();

const { computeDiagnostics, isRhaiDocument, RhaiDiagnosticsProvider } = require('../out/features/diagnostics.js');

function codes(text) {
	return computeDiagnostics(text).map((issue) => issue.code);
}

function first(text, code) {
	return computeDiagnostics(text).find((issue) => issue.code === code);
}

test('un fichier valide ne produit aucun diagnostic', () => {
	const issues = computeDiagnostics([
		'import "utils" as u;',
		'',
		'fn alpha(x) {',
		'    return u::beta(x);',
		'}',
		'',
		'alpha(1);'
	].join('\n'));

	assert.deepStrictEqual(issues, []);
});

test('signale une chaîne non terminée', () => {
	const issue = first('let s = "abc;\n', 'unterminated-string');

	assert.ok(issue);
	assert.strictEqual(issue.severity, 'error');
});

test('signale un délimiteur non fermé', () => {
	const issue = first('fn f(x {\n}\n', 'unclosed-delimiter');

	assert.ok(issue);
	assert.strictEqual(issue.severity, 'error');
});

test('signale un délimiteur fermant inattendu', () => {
	const issue = first('fn f() {\n}\n)\n', 'unbalanced-delimiter');

	assert.ok(issue);
});

test('signale un import sans alias', () => {
	const issue = first('import "utils";\n', 'import-missing-alias');

	assert.ok(issue);
	assert.strictEqual(issue.range.start.line, 0);
});

test('signale un import inutilisé', () => {
	const issue = first('import "utils" as u;\n\nlet x = 1;\n', 'unused-import');

	assert.ok(issue);
	assert.strictEqual(issue.severity, 'warning');
});

test('ne signale pas un import utilisé', () => {
	assert.strictEqual(codes('import "utils" as u;\nlet x = u::beta();\n').includes('unused-import'), false);
});

test('signale une constante inutilisée', () => {
	const issue = first('const LIMITE = 10;\n\nlet x = 1;\n', 'unused-constant');

	assert.ok(issue);
	assert.strictEqual(issue.severity, 'warning');
});

test('signale une variable inutilisée', () => {
	const issue = first('fn f() {\n    let inutilisee = 1;\n    return 2;\n}\n', 'unused-variable');

	assert.ok(issue);
	assert.strictEqual(issue.severity, 'warning');
});

test('signale le code inatteignable', () => {
	const issue = first('fn f() {\n    return 1;\n    let x = 2;\n}\n', 'unreachable-code');

	assert.ok(issue);
	assert.strictEqual(issue.range.start.line, 2);
});

test('signale un bloc de boucle vide', () => {
	const issue = first('fn f() {\n    while true { }\n}\n', 'empty-block');

	assert.ok(issue);
	assert.strictEqual(issue.severity, 'info');
});

test('signale les marqueurs TODO et FIXME', () => {
	const issues = computeDiagnostics('// TODO: plus tard\n// FIXME: cassé\n').filter((issue) => issue.code === 'todo-marker');

	assert.strictEqual(issues.length, 2);
});

test('remonte les erreurs de syntaxe du parser', () => {
	assert.ok(codes('fn casse(\n}\n').includes('parse'));
});

test('les positions sont en base zéro et cohérentes', () => {
	const issue = first('fn f() {\n    return 1;\n    let x = 2;\n}\n', 'unreachable-code');

	assert.strictEqual(issue.range.start.line, 2);
	assert.strictEqual(issue.range.start.character, 4);
});

test('seuls les documents Rhai sont diagnostiqués', () => {
	mock.setFile('d:/proj/main.rhai', 'fn f() {\n}\n');
	mock.setFile('d:/proj/data.json', '{ "a": 1 }\n');
	mock.setFile('d:/proj/notes.md', 'fn f( }\n');

	assert.strictEqual(isRhaiDocument(mock.createDocument('d:/proj/main.rhai')), true);
	assert.strictEqual(isRhaiDocument(mock.createDocument('d:/proj/data.json')), false);
	assert.strictEqual(isRhaiDocument(mock.createDocument('d:/proj/notes.md')), false);
});

test('aucun diagnostic n est publié sur un fichier non Rhai', () => {
	const provider = new RhaiDiagnosticsProvider();
	const collection = mock.diagnosticCollections[mock.diagnosticCollections.length - 1];

	const jsonDocument = mock.createDocument('d:/proj/data.json');
	provider.update(jsonDocument);

	assert.strictEqual(collection.get(jsonDocument.uri), undefined);

	const rhaiDocument = mock.createDocument('d:/proj/main.rhai');
	provider.update(rhaiDocument);

	assert.ok(Array.isArray(collection.get(rhaiDocument.uri)));

	provider.dispose();
});
