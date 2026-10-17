/** Use a moderate sensor frame with enough real label pixels; avoid 12–48 MP captures. */
export function labelPictureSize(sizes: readonly string[]) {
  return sizes.map(value => ({ value, sides: value.split('x').map(Number) }))
    .filter(({ sides }) => sides.length === 2 && sides.every(n => Number.isFinite(n) && n > 0)
      && Math.min(...sides) >= 1500 && Math.max(...sides) <= 3000)
    .sort((a, b) => a.sides[0] * a.sides[1] - b.sides[0] * b.sides[1])[0]?.value;
}
export const LABEL_FRAME_DELAY_MS = 900;
