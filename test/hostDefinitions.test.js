'use strict';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert');

const { createVscodeMock } = require('./helpers/vscode-mock');

const mock = createVscodeMock();
mock.install();

const {
	validateNativeApiPayload,
	checkCoherence,
	collectHostArtifacts,
	validateHostContract
} = require('../out/host/hostDefinitions.js');

function payload(functions) {
	return { functions };
}

const VALID = {
	access: 'public',
	name: 'greet',
	numParams: 1,
	params: [{ name: 'name', type: 'string' }],
	returnType: 'string',
	signature: 'greet(name: string) -> string',
	type: 'native'
};

beforeEach(() => mock.reset());

test('accepte un payload conforme', () => {
	assert.deepStrictEqual(validateNativeApiPayload(payload([VALID])), []);
});

test('signale un payload vide ou mal formé', () => {
	assert.strictEqual(validateNativeApiPayload({}).length, 1);
	assert.strictEqual(validateNativeApiPayload(null).length, 1);
	assert.strictEqual(validateNativeApiPayload(payload([])).length, 1);
});

test('signale les champs manquants ou invalides', () => {
	const issues = validateNativeApiPayload(payload([
		{ name: '', type: 'autre', access: 'ami', numParams: -1, signature: '' }
	]));

	assert.strictEqual(issues.length, 5);
});

test('vérifie la cohérence entre le JSON et les définitions', () => {
	const functions = [VALID, { ...VALID, name: 'absent', numParams: 0 }];

	const issues = checkCoherence(functions, ['greet', 'orphelin']);

	assert.strictEqual(issues.length, 2);
	assert.ok(issues.some((issue) => issue.includes('absent')));
	assert.ok(issues.some((issue) => issue.includes('orphelin')));
});

test('ignore les fonctions privées dans la cohérence', () => {
	const privateFn = { ...VALID, name: 'interne', access: 'private' };

	assert.deepStrictEqual(checkCoherence([privateFn], []), []);
});

test('collecte les artefacts avec leur date et leur nombre de fonctions', async () => {
	mock.setFile('d:/proj/rhai-defs/api.json', JSON.stringify(payload([VALID])));

	const artifacts = await collectHostArtifacts();

	assert.strictEqual(artifacts.length, 1);
	assert.strictEqual(artifacts[0].functions, 1);
});

test('valide le contrat et remonte les erreurs de JSON', async () => {
	mock.setFile('d:/proj/rhai-defs/api.json', '{ pas du json');

	const report = await validateHostContract();

	assert.strictEqual(report.artifacts.length, 1);
	assert.strictEqual(report.issues.length, 1);
	assert.ok(report.issues[0].includes('JSON invalide'));
});
