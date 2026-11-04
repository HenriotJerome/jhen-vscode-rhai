'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const { tokenize } = require('../out/core/lexer.js');

function kinds(tokens) {
	return tokens.map((token) => token.kind);
}

test('fn dans une chaîne reste un token string', () => {
	const tokens = tokenize('let x = "fn nom()";');

	assert.deepStrictEqual(kinds(tokens), ['keyword', 'ident', 'punct', 'string', 'punct', 'eof']);
	assert.strictEqual(tokens[3].value, '"fn nom()"');
});

test('fn dans un commentaire reste un token comment', () => {
	const tokens = tokenize('// fn nom() {}\nlet x = 1;');

	assert.strictEqual(tokens[0].kind, 'comment');
	assert.strictEqual(tokens[1].kind, 'keyword');
	assert.strictEqual(tokens[1].value, 'let');
});

test('distingue les doc-comments des commentaires simples', () => {
	const tokens = tokenize('/// doc\n//! module\n// simple\n');

	assert.strictEqual(tokens[0].kind, 'doc');
	assert.strictEqual(tokens[0].value, '/// doc');
	assert.strictEqual(tokens[1].kind, 'doc');
	assert.strictEqual(tokens[1].value, '//! module');
	assert.strictEqual(tokens[2].kind, 'comment');
});

test('gère les chaînes multi-lignes et l interpolation', () => {
	const tokens = tokenize('let s = `ligne 1\n${ "fn" } ligne 2`;');

	assert.strictEqual(tokens[3].kind, 'string');
	assert.ok(tokens[3].value.startsWith('`ligne 1'));
	assert.ok(tokens[3].value.endsWith('ligne 2`'));
	assert.strictEqual(tokens[4].kind, 'punct');
	assert.strictEqual(tokens[4].value, ';');
});

test('gère les commentaires de bloc imbriqués', () => {
	const tokens = tokenize('/* a /* b */ c */\nlet');

	assert.strictEqual(tokens[0].kind, 'comment');
	assert.strictEqual(tokens[1].kind, 'keyword');
	assert.strictEqual(tokens[1].line, 1);
});

test('tokenise les nombres', () => {
	const tokens = tokenize('1 0xFF 3.14 1e10 2_000');

	assert.deepStrictEqual(tokens.slice(0, 5).map((token) => token.kind), ['number', 'number', 'number', 'number', 'number']);
	assert.strictEqual(tokens[1].value, '0xFF');
	assert.strictEqual(tokens[2].value, '3.14');
	assert.strictEqual(tokens[3].value, '1e10');
});

test('tokenise les opérateurs multi-caractères', () => {
	const tokens = tokenize('a == b && c != d -> e :: f ..= g ** h');

	assert.deepStrictEqual(
		tokens.filter((token) => token.kind === 'punct').map((token) => token.value),
		['==', '&&', '!=', '->', '::', '..=', '**']
	);
});

test('suivi des lignes et des colonnes', () => {
	const tokens = tokenize('let a;\n  let b;');

	assert.strictEqual(tokens[0].line, 0);
	assert.strictEqual(tokens[0].column, 0);
	assert.strictEqual(tokens[3].line, 1);
	assert.strictEqual(tokens[3].column, 2);
});
