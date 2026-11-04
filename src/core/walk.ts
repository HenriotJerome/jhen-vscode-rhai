import { Block, Expr, Stmt } from './ast';

export type ExprVisitor = (expr: Expr) => void;

export function walkBlock(block: Block, visit: ExprVisitor): void {
	for (const statement of block.statements) {
		walkStmt(statement, visit);
	}
}

export function walkStmt(stmt: Stmt, visit: ExprVisitor): void {
	switch (stmt.kind) {
		case 'let':
		case 'const':
			if (stmt.value) {
				walkExpr(stmt.value, visit);
			}
			break;
		case 'expr':
			walkExpr(stmt.expr, visit);
			break;
		case 'if':
			walkExpr(stmt.condition, visit);
			walkBlock(stmt.then, visit);
			if (stmt.else) {
				walkBlock(stmt.else, visit);
			}
			break;
		case 'while':
			walkExpr(stmt.condition, visit);
			walkBlock(stmt.body, visit);
			break;
		case 'for':
			walkExpr(stmt.iterable, visit);
			walkBlock(stmt.body, visit);
			break;
		case 'loop':
			walkBlock(stmt.body, visit);
			break;
		case 'return':
		case 'break':
		case 'throw':
			if (stmt.value) {
				walkExpr(stmt.value, visit);
			}
			break;
		case 'try':
			walkBlock(stmt.body, visit);
			if (stmt.catchBody) {
				walkBlock(stmt.catchBody, visit);
			}
			break;
		case 'switch':
			walkExpr(stmt.subject, visit);
			for (const switchCase of stmt.cases) {
				if (switchCase.test) {
					walkExpr(switchCase.test, visit);
				}
				walkBlock(switchCase.body, visit);
			}
			break;
		case 'fn':
			walkBlock(stmt.declaration.body, visit);
			break;
		case 'block':
			walkBlock(stmt.body, visit);
			break;
		case 'continue':
			break;
	}
}

export function walkExpr(expr: Expr, visit: ExprVisitor): void {
	visit(expr);

	switch (expr.kind) {
		case 'ident':
		case 'literal':
			break;
		case 'array':
			for (const element of expr.elements) {
				walkExpr(element, visit);
			}
			break;
		case 'map':
			for (const entry of expr.entries) {
				if (entry.value) {
					walkExpr(entry.value, visit);
				}
			}
			break;
		case 'call':
			walkExpr(expr.callee, visit);
			for (const argument of expr.args) {
				walkExpr(argument, visit);
			}
			break;
		case 'method':
			walkExpr(expr.receiver, visit);
			for (const argument of expr.args) {
				walkExpr(argument, visit);
			}
			break;
		case 'member':
			walkExpr(expr.receiver, visit);
			break;
		case 'index':
			walkExpr(expr.receiver, visit);
			walkExpr(expr.index, visit);
			break;
		case 'unary':
			walkExpr(expr.operand, visit);
			break;
		case 'binary':
			walkExpr(expr.left, visit);
			walkExpr(expr.right, visit);
			break;
		case 'paren':
			walkExpr(expr.expr, visit);
			break;
		case 'closure':
			walkBlock(expr.body, visit);
			break;
		case 'ifExpr':
			walkExpr(expr.condition, visit);
			walkBlock(expr.then, visit);
			if (expr.else) {
				walkBlock(expr.else, visit);
			}
			break;
		case 'blockExpr':
			walkBlock(expr.body, visit);
			break;
		case 'range':
			if (expr.from) {
				walkExpr(expr.from, visit);
			}
			if (expr.to) {
				walkExpr(expr.to, visit);
			}
			break;
	}
}
