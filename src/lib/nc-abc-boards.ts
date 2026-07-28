import boardRegistry from "../config/nc-abc-boards.json" with { type: "json" };

type NcAbcBoard = {
  id: string;
  sourceId: string;
  label: string;
  filterLabel: string;
};

export const NC_ABC_BOARDS = Object.freeze(
  (boardRegistry.boards as NcAbcBoard[]).map((board) => Object.freeze({ ...board })),
);

export const NC_ABC_BOARD_OPTIONS = Object.freeze(
  NC_ABC_BOARDS.map((board) => board.filterLabel),
);

function normalize(value: unknown) {
  return typeof value === "string"
    ? value
      .normalize("NFKD")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .replace(/\s+/g, " ")
    : "";
}

function aliasesForBoard(board: NcAbcBoard) {
  const baseLabel = board.label.replace(/\s+ABC\s+(?:Board|Commission)$/i, "");
  const baseFilter = board.filterLabel.replace(/\s+ABC$/i, "");
  const legacyLabel = board.label
    .replace(/\babc\b/gi, " ")
    .replace(/\bboard\b/gi, " ")
    .replace(/\bcounty\b/gi, " ")
    .replace(/\bstores?\b/gi, " ")
    .replace(/[()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return [board.id, board.sourceId, board.label, board.filterLabel, baseLabel, baseFilter, legacyLabel];
}

const optionsByAlias = new Map<string, Set<string>>();
for (const board of NC_ABC_BOARDS) {
  for (const alias of aliasesForBoard(board)) {
    const key = normalize(alias);
    if (!key) continue;
    const options = optionsByAlias.get(key) || new Set<string>();
    options.add(board.filterLabel);
    optionsByAlias.set(key, options);
  }
}

function uniqueCanonicalOption(value: unknown) {
  const options = optionsByAlias.get(normalize(value));
  return options?.size === 1 ? [...options][0] : null;
}

export function canonicalNcAbcBoardPreference(value: unknown) {
  return uniqueCanonicalOption(value);
}

export function normalizeNcAbcBoardOptions(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(
    values
      .map((value) => canonicalNcAbcBoardPreference(value))
      .filter((value): value is string => Boolean(value)),
  ));
}

function candidateOptionsForField(value: unknown) {
  if (typeof value !== "string") return null;
  const candidates = [value, value.split(/\s+(?:-|–|—)\s+/)[0]];
  for (const candidate of candidates) {
    const options = optionsByAlias.get(normalize(candidate));
    if (options?.size === 1) return options;
  }
  return null;
}

export function matchedNcAbcBoardPreference(fields: readonly unknown[], preferences: readonly string[]) {
  const canonicalPreferences = normalizeNcAbcBoardOptions(preferences);
  if (!canonicalPreferences.length) return null;
  const candidateOptions = fields
    .map((field) => candidateOptionsForField(field))
    .filter((options): options is Set<string> => Boolean(options));
  return canonicalPreferences.find((preference) =>
    candidateOptions.some((options) => options.has(preference)),
  ) || null;
}

export function ncAbcBoardPreferencesMatch(fields: readonly unknown[], preferences: readonly string[]) {
  return matchedNcAbcBoardPreference(fields, preferences) !== null;
}
