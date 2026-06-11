/**
 * Resolve the Mercado Livre seller user_id (e.g. 3308178634) for the connected
 * account. This is DISTINCT from the app's local user id.
 *
 * Why this matters: ML endpoints like `/users/{id}/items/search` only allow a
 * seller to query THEIR OWN id. Passing any other id (notably the local app id
 * such as `1`) makes ML reply "Searching another user items is restricted" and
 * the dashboard renders all zeros.
 *
 * Resolution order (most to least reliable):
 *   1. "db"    — the persisted mlUserId column (written by the OAuth exchange)
 *   2. "me"    — GET /users/me with the live access token (authoritative)
 *   3. "token" — the numeric suffix of the access token APP_USR-...-<userId>
 *
 * The token-suffix heuristic is last because it is brittle: a stale/mismatched
 * token can carry the wrong suffix. /users/me always reflects the token holder.
 */

export type MlUserIdSource = "db" | "me" | "token" | "none";

export interface ResolvedMlUserId {
  mlUserId: number;
  source: MlUserIdSource;
}

/** Extract the trailing numeric id from an ML access token, or 0. */
export function mlUserIdFromToken(token: string | null | undefined): number {
  if (!token) return 0;
  const parts = token.split("-");
  const tail = Number(parts[parts.length - 1]);
  return Number.isFinite(tail) && tail > 0 ? tail : 0;
}

/** Validate a candidate id (positive integer, not the obviously-wrong local id). */
function isPlausibleSellerId(id: unknown): id is number {
  // Real ML user ids are large (>= 7 digits in practice). We reject 0/negatives
  // and the tiny local app ids (1, 2, ...) that caused the original bug.
  return typeof id === "number" && Number.isInteger(id) && id > 1000;
}

type FetchLike = (token: string) => Promise<number | null>;

/** Default /users/me lookup. Returns the numeric id or null. */
const defaultMeLookup: FetchLike = async (token: string) => {
  try {
    const res = await fetch("https://api.mercadolibre.com/users/me", {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (!res.ok) return null;
    const me = (await res.json().catch(() => null)) as { id?: number } | null;
    return typeof me?.id === "number" ? me.id : null;
  } catch {
    return null;
  }
};

/**
 * Resolve the ML seller id given the live token and the persisted value.
 * `meLookup` is injectable for testing.
 */
export async function resolveMlUserId(
  token: string,
  persisted: number | null,
  meLookup: FetchLike = defaultMeLookup,
): Promise<ResolvedMlUserId> {
  // 1) Persisted column — fast and reliable once set.
  if (isPlausibleSellerId(persisted)) {
    return { mlUserId: persisted, source: "db" };
  }

  // 2) Authoritative lookup with the live token.
  const fromMe = await meLookup(token);
  if (isPlausibleSellerId(fromMe)) {
    return { mlUserId: fromMe as number, source: "me" };
  }

  // 3) Last-resort heuristic: the token suffix.
  const fromToken = mlUserIdFromToken(token);
  if (isPlausibleSellerId(fromToken)) {
    return { mlUserId: fromToken, source: "token" };
  }

  return { mlUserId: 0, source: "none" };
}
