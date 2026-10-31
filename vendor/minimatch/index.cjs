// Older ESLint/glob consumers call require('minimatch') directly. Modern
// consumers use named exports. Both execute the same patched upstream parser.
const upstream = require('minimatch-upstream');
function minimatch(path, pattern, options) {
  return upstream.minimatch(path, pattern, options);
}
module.exports = Object.assign(minimatch, upstream);
