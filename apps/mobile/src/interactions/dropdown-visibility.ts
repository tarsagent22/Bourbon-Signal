export function dropdownRevealOffset(offset: number, top: number, height: number, viewportTop: number, viewportHeight: number) {
  const upper = viewportTop + 12;
  const lower = viewportTop + viewportHeight - 12;
  const delta = top < upper ? top - upper : top + height > lower ? Math.min(top + height - lower, top - upper) : 0;
  return Math.max(0, offset + delta);
}
