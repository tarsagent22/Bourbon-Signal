export function radarSwipeShouldStart(dx: number, dy: number) { return Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.5; }
export function radarSwipeDestination(offset: number) { return offset < -48 ? -144 : 0; }
