'use strict';
// Backport for GHSA-vfj7-8cjw-p6xm. Public AST walkers must not recurse
// beyond this bound, including caller-supplied ASTs and malformed patterns.
const MAX_AST_DEPTH = 64;
const depthError = () => {
  const error = new RangeError('Brace AST exceeds the safe nesting depth');
  error.code = 'ERR_BRACES_DEPTH';
  return error;
};
const assertSafeAst = ast => {
  const active = new WeakSet();
  const stack = [{ node: ast, depth: 0, exit: false }];
  while (stack.length) {
    const frame = stack.pop();
    const node = frame.node;
    if (!node || typeof node !== 'object') throw new TypeError('Invalid brace AST node');
    if (frame.exit) { active.delete(node); continue; }
    if (frame.depth > MAX_AST_DEPTH || active.has(node)) throw depthError();
    active.add(node);
    stack.push({ node, depth: frame.depth, exit: true });
    if (node.nodes) {
      if (!Array.isArray(node.nodes)) throw new TypeError('Invalid brace AST children');
      for (let index = node.nodes.length - 1; index >= 0; index--) {
        stack.push({ node: node.nodes[index], depth: frame.depth + 1, exit: false });
      }
    }
  }
};
module.exports = { MAX_AST_DEPTH, depthError, assertSafeAst };
