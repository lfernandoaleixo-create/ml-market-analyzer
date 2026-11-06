export type BrowserDraftAction = "persist" | "clear" | "wait";

export function getBrowserDraftAction(
  privateOwner: number | null,
  authenticated: boolean,
  authLoading: boolean
): BrowserDraftAction {
  if (privateOwner !== null || authenticated) return "clear";
  return authLoading ? "wait" : "persist";
}

export function canPersistBrowserHistory(
  privateOwner: number | null,
  authenticated: boolean,
  authLoading: boolean
): boolean {
  return (
    getBrowserDraftAction(privateOwner, authenticated, authLoading) ===
    "persist"
  );
}

/** A private session may remove already-local records, never add or rewrite them. */
export function canPersistBrowserHistoryUpdate<T>(
  allowNewRecords: boolean,
  previous: readonly T[],
  next: readonly T[]
): boolean {
  return (
    allowNewRecords ||
    (next.length < previous.length &&
      next.every(record => previous.includes(record)))
  );
}
