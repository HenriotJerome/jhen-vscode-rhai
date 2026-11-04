'use strict';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert');

const { createVscodeMock } = require('./helpers/vscode-mock');

const mock = createVscodeMock();
mock.install();

const { activate } = require('../out/extension.js');

function runActivate() {
	mock.registrations.length = 0;
	mock.registeredCommands.length = 0;
	activate({ subscriptions: [] });
}

beforeEach(() => mock.reset());

test('tous les providers de document sont limités au langage rhai', () => {
	runActivate();

	const documentProviders = mock.registrations.filter((entry) => entry.kind !== 'workspaceSymbol');
	assert.ok(documentProviders.length >= 15, `providers trouvés : ${documentProviders.length}`);

	for (const entry of documentProviders) {
		assert.ok(entry.selector, `${entry.kind} n'a pas de sélecteur`);
		assert.strictEqual(
			entry.selector.language,
			'rhai',
			`${entry.kind} n'est pas limité au langage rhai`
		);
		assert.strictEqual(entry.selector.scheme, 'file', `${entry.kind} n'est pas limité au scheme file`);
	}
});

test('le provider de symboles du workspace reste global par nature', () => {
	runActivate();

	const workspaceSymbol = mock.registrations.find((entry) => entry.kind === 'workspaceSymbol');
	assert.ok(workspaceSymbol);
	assert.strictEqual(workspaceSymbol.selector, undefined);
});

test('les deux commandes sont enregistrées', () => {
	runActivate();

	const ids = mock.registeredCommands.map((command) => command.id).sort();
	assert.deepStrictEqual(ids, ['rhai.regenerateHostDefinitions', 'rhai.validateHostContract']);
});

test('la collection de diagnostics est créée une seule fois', () => {
	mock.diagnosticCollections.length = 0;
	runActivate();

	assert.strictEqual(mock.diagnosticCollections.length, 1);
});
