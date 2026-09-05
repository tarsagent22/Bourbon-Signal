// Webpack-only adapter for the evidence-pinned MS collector. No source writes,
// global hooks, policy changes, or general-purpose filesystem rewriting.
module.exports = function msRegistryBoundary(source) {
  const fsImport = "import { readFileSync } from 'node:fs';";
  const read = "const REGISTRY = JSON.parse(readFileSync(new URL('../../data/mississippi-retailer-registry.json', import.meta.url), 'utf8'));";
  if (source.split(fsImport).length !== 2 || source.split(read).length !== 2) {
    throw new Error('MS registry boundary changed; review the pinned implementation before bundling');
  }
  return source.replace(fsImport, '// MS registry read is bundled statically.')
    .replace(read, "import REGISTRY from '../../data/mississippi-retailer-registry.json' with { type: 'json' };");
};
