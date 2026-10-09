import localities from "../config/nc-board-localities.json" with { type: "json" };

const byBoard = new Map(localities.boards.map(board => [board.value, board]));

// Presentation only: never register county/city labels as board evidence aliases.
export function ncBoardLocality(value: string) {
  const locality = byBoard.get(value);
  return {
    label: locality ? `${locality.county} · ${value}` : value,
    displayName: locality?.county || value,
    subtitle: locality ? [value, locality.cities.join(", ")].filter(Boolean).join(" · ") : undefined,
  };
}

export function ncBoardLocalityMatches(value: string, query: string) {
  const normalize = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const locality = ncBoardLocality(value);
  return normalize(`${value} ${locality.label} ${locality.subtitle || ""}`).includes(normalize(query));
}
