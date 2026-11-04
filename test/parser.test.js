'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const { parse } = require('../out/core/parser.js');

test('parse un import, une fonction et une constante', () => {
	const ast = parse([
		'import "utils" as u;',
		'',
		'/// Calcule une valeur.',
		'const MAX = 10;',
		'',
		'/// Fonction principale.',
		'fn compute(a, b) {',
		'    return a + b;',
		'}'
	].join('\n'));

	assert.deepStrictEqual(ast.errors, []);
	assert.strictEqual(ast.imports.length, 1);
	assert.strictEqual(ast.imports[0].module, 'utils');
	assert.strictEqual(ast.imports[0].alias, 'u');
	assert.strictEqual(ast.constants.length, 1);
	assert.strictEqual(ast.constants[0].name, 'MAX');
	assert.deepStrictEqual(ast.constants[0].doc, ['Calcule une valeur.']);
	assert.strictEqual(ast.functions.length, 1);
	assert.strictEqual(ast.functions[0].name, 'compute');
	assert.strictEqual(ast.functions[0].params.length, 2);
	assert.deepStrictEqual(ast.functions[0].doc, ['Fonction principale.']);
	assert.strictEqual(ast.functions[0].visibility, 'public');
});

test('parse les paramètres typés et les valeurs par défaut', () => {
	const ast = parse('fn f(a: int, b = 2, c: string = "x") {\n}');

	assert.deepStrictEqual(ast.errors, []);
	const params = ast.functions[0].params;
	assert.strictEqual(params[0].type, 'int');
	assert.strictEqual(params[1].default.literalType, 'number');
	assert.strictEqual(params[2].type, 'string');
});

test('détecte une fonction privée', () => {
	const ast = parse('private fn interne() {\n}');

	assert.strictEqual(ast.functions[0].visibility, 'private');
	assert.strictEqual(ast.functions[0].name, 'interne');
});

test('parse les structures de contrôle', () => {
	const ast = parse([
		'fn f(x) {',
		'    if x > 0 {',
		'        let y = 1;',
		'    } else {',
		'        let y = 2;',
		'    }',
		'    while x > 0 { x -= 1; }',
		'    for item in [1, 2] { }',
		'    loop { break; }',
		'}'
	].join('\n'));

	assert.deepStrictEqual(ast.errors, []);
	const statements = ast.functions[0].body.statements;
	assert.strictEqual(statements[0].kind, 'if');
	assert.ok(statements[0].else);
	assert.strictEqual(statements[1].kind, 'while');
	assert.strictEqual(statements[2].kind, 'for');
	assert.strictEqual(statements[2].variable, 'item');
	assert.strictEqual(statements[3].kind, 'loop');
});

test('parse les maps, tableaux et closures', () => {
	const ast = parse([
		'let m = #{ nom: "a", actif: true, vide };',
		'let a = [1, 2, 3];',
		'let f = |x, y| x + y;'
	].join('\n'));

	assert.deepStrictEqual(ast.errors, []);
	assert.strictEqual(ast.statements[0].value.kind, 'map');
	assert.strictEqual(ast.statements[0].value.entries.length, 3);
	assert.strictEqual(ast.statements[0].value.entries[2].value, undefined);
	assert.strictEqual(ast.statements[1].value.kind, 'array');
	assert.strictEqual(ast.statements[2].value.kind, 'closure');
	assert.deepStrictEqual(ast.statements[2].value.params, ['x', 'y']);
});

test('respecte la précédence des opérateurs', () => {
	const ast = parse('let x = 1 + 2 * 3;');
	const value = ast.statements[0].value;

	assert.strictEqual(value.kind, 'binary');
	assert.strictEqual(value.operator, '+');
	assert.strictEqual(value.right.kind, 'binary');
	assert.strictEqual(value.right.operator, '*');
});

test('associe correctement la puissance à droite', () => {
	const ast = parse('let x = 2 ** 3 ** 4;');
	const value = ast.statements[0].value;

	assert.strictEqual(value.operator, '**');
	assert.strictEqual(value.right.kind, 'binary');
	assert.strictEqual(value.right.operator, '**');
});

test('parse les appels, méthodes et accès de module', () => {
	const ast = parse([
		'let a = f(1, 2);',
		'let b = texte.len();',
		'let c = u::get_value(3);',
		'let d = m["cle"];'
	].join('\n'));

	assert.strictEqual(ast.statements[0].value.kind, 'call');
	assert.strictEqual(ast.statements[1].value.kind, 'method');
	assert.strictEqual(ast.statements[1].value.name, 'len');
	assert.strictEqual(ast.statements[2].value.kind, 'call');
	assert.strictEqual(ast.statements[2].value.callee.kind, 'member');
	assert.strictEqual(ast.statements[2].value.callee.name, 'get_value');
	assert.strictEqual(ast.statements[3].value.kind, 'index');
});

test('parse switch et try/catch', () => {
	const ast = parse([
		'fn f(x) {',
		'    switch x {',
		'        1 => { return "un"; }',
		'        _ => { return "autre"; }',
		'    }',
		'    try {',
		'        throw "erreur";',
		'    } catch (e) {',
		'        return e;',
		'    }',
		'}'
	].join('\n'));

	assert.deepStrictEqual(ast.errors, []);
	const statements = ast.functions[0].body.statements;
	assert.strictEqual(statements[0].kind, 'switch');
	assert.strictEqual(statements[0].cases.length, 2);
	assert.strictEqual(statements[1].kind, 'try');
	assert.strictEqual(statements[1].catchVariable, 'e');
});

test('récupère les erreurs sans perdre les déclarations suivantes', () => {
	const ast = parse([
		'fn casse(',
		'}',
		'',
		'fn ok() {',
		'    let x = 1;',
		'}'
	].join('\n'));

	assert.ok(ast.errors.length > 0);
	assert.ok(ast.functions.some((fn) => fn.name === 'ok'));
});

test('ne confond pas une chaîne avec du code', () => {
	const ast = parse('let s = "fn faux() { }";');

	assert.deepStrictEqual(ast.errors, []);
	assert.strictEqual(ast.functions.length, 0);
	assert.strictEqual(ast.statements[0].value.literalType, 'string');
});
