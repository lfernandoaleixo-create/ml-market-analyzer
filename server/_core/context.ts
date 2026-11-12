import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { TRPCError } from "@trpc/server";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

const ANONYMOUS_HTTP_PROCEDURES = new Set([
  "auth.me", "auth.gateInfo", "auth.passwordLogin", "auth.logout", "system.health",
]);

/** A legacy publicProcedure cannot bypass the scoped external read API. */
export function allowsAnonymousTrpcHttp(url: string): boolean {
  let path: string;
  try { path = decodeURIComponent(url.split("?")[0]); } catch { return false; }
  const prefix = "/api/trpc/";
  if (!path.startsWith(prefix)) return false;
  const procedures = path.slice(prefix.length).split(",");
  return procedures.length > 0 && procedures.every(name => ANONYMOUS_HTTP_PROCEDURES.has(name));
}

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Only the explicit login/health allowlist remains anonymous over HTTP.
    user = null;
  }

  if (!user && !allowsAnonymousTrpcHttp(opts.req.originalUrl ?? opts.req.url ?? "")) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Entre no Mercato para usar a API interna. Integrações externas devem usar a API de leitura com sua chave." });
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
