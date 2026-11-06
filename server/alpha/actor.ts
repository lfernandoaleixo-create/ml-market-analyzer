import { TRPCError } from "@trpc/server";

/** passwordLogin uses the shared store owner's session, not a per-person identity. */
export function alphaOwnerId(user: { id: number; isCron?: boolean }): number {
  if (user.isCron || !Number.isSafeInteger(user.id) || user.id <= 0) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Alpha exige uma sessão de usuário real autenticado." });
  }
  return user.id;
}
