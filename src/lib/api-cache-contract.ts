export function dropFeedCacheHeaders(isSignedIn: boolean) {
  return {
    "Cache-Control": isSignedIn
      ? "private, no-store"
      : "public, s-maxage=60, stale-while-revalidate=300",
    Vary: "Cookie, Authorization",
  } as const;
}
