export interface Position {
	line: number;
	character: number;
}

export interface Range {
	start: Position;
	end: Position;
}

export type Visibility = 'private' | 'public';

export interface ImportDecl {
	module: string;
	alias: string;
	range: Range;
}

export interface Param {
	name: string;
	type?: string;
	default?: Expr;
	range: Range;
}

export interface Block {
	statements: Stmt[];
	range: Range;
}

export type Stmt =
	| LetStmt
	| ConstStmt
	| ExprStmt
	| IfStmt
	| WhileStmt
	| ForStmt
	| LoopStmt
	| ReturnStmt
	| BreakStmt
	| ContinueStmt
	| ThrowStmt
	| TryStmt
	| SwitchStmt
	| FnStmt
	| BlockStmt;

export interface LetStmt {
	kind: 'let';
	name: string;
	value?: Expr;
	range: Range;
}

export interface ConstStmt {
	kind: 'const';
	name: string;
	value?: Expr;
	range: Range;
}

export interface ExprStmt {
	kind: 'expr';
	expr: Expr;
	range: Range;
}

export interface IfStmt {
	kind: 'if';
	condition: Expr;
	then: Block;
	else?: Block;
	range: Range;
}

export interface WhileStmt {
	kind: 'while';
	condition: Expr;
	body: Block;
	until: boolean;
	range: Range;
}

export interface ForStmt {
	kind: 'for';
	variable: string;
	indexVariable?: string;
	iterable: Expr;
	body: Block;
	range: Range;
}

export interface LoopStmt {
	kind: 'loop';
	body: Block;
	range: Range;
}

export interface ReturnStmt {
	kind: 'return';
	value?: Expr;
	range: Range;
}

export interface BreakStmt {
	kind: 'break';
	value?: Expr;
	range: Range;
}

export interface ContinueStmt {
	kind: 'continue';
	range: Range;
}

export interface ThrowStmt {
	kind: 'throw';
	value?: Expr;
	range: Range;
}

export interface TryStmt {
	kind: 'try';
	body: Block;
	catchVariable?: string;
	catchBody?: Block;
	range: Range;
}

export interface SwitchCase {
	test?: Expr;
	body: Block;
	range: Range;
}

export interface SwitchStmt {
	kind: 'switch';
	subject: Expr;
	cases: SwitchCase[];
	range: Range;
}

export interface FnStmt {
	kind: 'fn';
	declaration: FunctionDecl;
	range: Range;
}

export interface BlockStmt {
	kind: 'block';
	body: Block;
	range: Range;
}

export type Expr =
	| LiteralExpr
	| IdentExpr
	| ArrayExpr
	| MapExpr
	| CallExpr
	| MethodCallExpr
	| MemberExpr
	| IndexExpr
	| UnaryExpr
	| BinaryExpr
	| ParenExpr
	| ClosureExpr
	| IfExpr
	| BlockExpr
	| RangeExpr;

export interface LiteralExpr {
	kind: 'literal';
	value: string;
	literalType: 'string' | 'number' | 'bool' | 'unit';
	range: Range;
}

export interface IdentExpr {
	kind: 'ident';
	name: string;
	range: Range;
}

export interface ArrayExpr {
	kind: 'array';
	elements: Expr[];
	range: Range;
}

export interface MapEntry {
	key: string;
	value?: Expr;
	range: Range;
}

export interface MapExpr {
	kind: 'map';
	entries: MapEntry[];
	range: Range;
}

export interface CallExpr {
	kind: 'call';
	callee: Expr;
	args: Expr[];
	range: Range;
}

export interface MethodCallExpr {
	kind: 'method';
	receiver: Expr;
	name: string;
	args: Expr[];
	range: Range;
}

export interface MemberExpr {
	kind: 'member';
	receiver: Expr;
	name: string;
	separator: '.' | '::';
	nameRange: Range;
	range: Range;
}

export interface IndexExpr {
	kind: 'index';
	receiver: Expr;
	index: Expr;
	range: Range;
}

export interface UnaryExpr {
	kind: 'unary';
	operator: string;
	operand: Expr;
	range: Range;
}

export interface BinaryExpr {
	kind: 'binary';
	operator: string;
	left: Expr;
	right: Expr;
	range: Range;
}

export interface ParenExpr {
	kind: 'paren';
	expr: Expr;
	range: Range;
}

export interface ClosureExpr {
	kind: 'closure';
	params: string[];
	body: Block;
	range: Range;
}

export interface IfExpr {
	kind: 'ifExpr';
	condition: Expr;
	then: Block;
	else?: Block;
	range: Range;
}

export interface BlockExpr {
	kind: 'blockExpr';
	body: Block;
	range: Range;
}

export interface RangeExpr {
	kind: 'range';
	from?: Expr;
	to?: Expr;
	inclusive: boolean;
	range: Range;
}

export interface FunctionDecl {
	name: string;
	params: Param[];
	body: Block;
	doc: string[];
	line: number;
	range: Range;
	nameRange: Range;
	visibility: Visibility;
}

export interface ConstDecl {
	name: string;
	value?: Expr;
	doc: string[];
	line: number;
	range: Range;
	nameRange: Range;
}

export interface ParseError {
	message: string;
	range: Range;
}

export interface ModuleAst {
	imports: ImportDecl[];
	functions: FunctionDecl[];
	constants: ConstDecl[];
	statements: Stmt[];
	errors: ParseError[];
}

export function emptyModuleAst(): ModuleAst {
	return { imports: [], functions: [], constants: [], statements: [], errors: [] };
}
