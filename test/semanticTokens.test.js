'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const { createVscodeMock } = require('./helpers/vscode-mock');

const mock = createVscodeMock();
mock.install();

const {
	computeSemanticTokens,
	TOKEN_TYPES,
	TOKEN_MODIFIERS,
	SEMANTIC_TOKENS_LEGEND
} = require('../out/features/semanticTokens.js');

function decode(data) {
	const tokens = [];
	let line = 0;
	let start = 0;

	for (let index = 0; index < data.length; index += 5) {
		const deltaLine = data[index];
		const deltaStart = data[index + 1];
		line += deltaLine;
		start = deltaLine === 0 ? start + deltaStart : deltaStart;
		tokens.push({
			line,
			start,
			length: data[index + 2],
			type: TOKEN_TYPES[data[index + 3]],
			modifiers: data[index + 4]
		});
	}

	return tokens;
}

function hasModifier(token, modifier) {
	return (token.modifiers & (1 << TOKEN_MODIFIERS.indexOf(modifier))) !== 0;
}

const REFERENCE = [
	'import "utils" as u;',
	'',
	'/// Doc.',
	'const LIMITE = 10;',
	'',
	'fn alpha(x) {',
	'    let y = u::beta(x);',
	'    return y;',
	'}'
].join('\n');

test('l encodage est bien formé', () => {
	const data = computeSemanticTokens(REFERENCE);

	assert.strictEqual(data.length % 5, 0);
	assert.ok(data.length > 0);
	for (let index = 0; index < data.length; index += 5) {
		assert.ok(data[index] >= 0, 'delta de ligne positif');
		assert.ok(data[index + 1] >= 0, 'delta de colonne positif');
		assert.ok(data[index + 2] > 0, 'longueur strictement positive');
	}
});

test('snapshot sur un extrait de référence', () => {
	const tokens = decode(computeSemanticTokens('let x = 1;'));

	assert.deepStrictEqual(
		tokens.map((token) => token.type),
		['keyword', 'variable', 'operator', 'number']
	);
	assert.ok(hasModifier(tokens[1], 'declaration'));
});

test('classe les déclarations de fonction, paramètres et constantes', () => {
	const tokens = decode(computeSemanticTokens(REFERENCE));

	const alpha = tokens.find((token) => token.line === 5 && token.type === 'function');
	assert.ok(alpha);
	assert.ok(hasModifier(alpha, 'declaration'));

	const parameter = tokens.find((token) => token.line === 5 && token.type === 'parameter');
	assert.ok(parameter);

	const constant = tokens.find((token) => token.line === 3 && token.type === 'variable');
	assert.ok(constant);
	assert.ok(hasModifier(constant, 'readonly'));
	assert.ok(hasModifier(constant, 'declaration'));
});

test('classe les alias d import en namespace', () => {
	const tokens = decode(computeSemanticTokens(REFERENCE));
	const namespace = tokens.find((token) => token.type === 'namespace');

	assert.ok(namespace);
	assert.strictEqual(namespace.line, 0);
	assert.ok(hasModifier(namespace, 'declaration'));
});

test('classe les appels et les accès de module en fonction', () => {
	const tokens = decode(computeSemanticTokens(REFERENCE));
	const functions = tokens.filter((token) => token.type === 'function');

	assert.ok(functions.length >= 2);
	assert.ok(functions.some((token) => token.line === 6));
});

test('classe les chaînes, nombres et commentaires', () => {
	const tokens = decode(computeSemanticTokens(REFERENCE));

	assert.ok(tokens.some((token) => token.type === 'string'));
	assert.ok(tokens.some((token) => token.type === 'number'));
	assert.ok(tokens.some((token) => token.type === 'comment' && token.line === 2));
});

test('les commentaires de bloc multi-lignes sont découpés par ligne', () => {
	const tokens = decode(computeSemanticTokens('/* a\n   b */\nlet x = 1;'));

	const comments = tokens.filter((token) => token.type === 'comment');
	assert.strictEqual(comments.length, 2);
	assert.strictEqual(comments[0].line, 0);
	assert.strictEqual(comments[1].line, 1);
});

test('la légende est stable et exposée', () => {
	assert.deepStrictEqual(TOKEN_TYPES, [
		'function', 'variable', 'parameter', 'property', 'keyword',
		'comment', 'string', 'number', 'operator', 'namespace'
	]);
	assert.deepStrictEqual(TOKEN_MODIFIERS, ['declaration', 'readonly', 'defaultLibrary']);
	assert.strictEqual(SEMANTIC_TOKENS_LEGEND.tokenTypes, TOKEN_TYPES);
});
