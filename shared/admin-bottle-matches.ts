const key = (value: string) => value.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").trim();
export function rankBottleMatches<T extends { canonicalName: string; brand?: string; aliases: string[] }>(bottles: T[], query: string): T[] {
  const normalized = key(query);
  if (!normalized) return [];
  const tokens = normalized.split(" ");
  return bottles.map(bottle => {
    const names = [bottle.canonicalName, ...bottle.aliases].map(key);
    const score = Math.max(...names.map(name => {
      if (name === normalized) return 1000;
      const words = new Set(name.split(" "));
      const overlap = tokens.filter(t => words.has(t)).length / tokens.length;
      return overlap >= 0.5 ? overlap * 100 - Math.abs(words.size - tokens.length) : 0;
    }));
    return {bottle,score};
  }).filter(row => row.score > 0).sort((a,b) => b.score-a.score || a.bottle.canonicalName.localeCompare(b.bottle.canonicalName)).map(row => row.bottle);
}
