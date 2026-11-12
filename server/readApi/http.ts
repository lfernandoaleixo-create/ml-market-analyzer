import express, { type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { READ_API_BASE, READ_API_ROUTES, READ_API_LIMIT_PER_MINUTE, type ReadApiQuery, type ReadApiResult } from "../../shared/readApi";
import { authenticateReadApiKey, type ReadApiPrincipal } from "./keys";
import { buildReadApiOpenApi } from "./openapi";
import { loadReadApiData } from "./data";

const integerQuery = (min: number, max: number) => z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(min).max(max));
const querySchema = z.object({
  limit: integerQuery(1, 100).default(50),
  offset: integerQuery(0, 100000).default(0),
  days: z.enum(["7", "30", "90"]).default("30").transform(Number),
  search: z.string().trim().max(120).optional(),
  productId: integerQuery(1, Number.MAX_SAFE_INTEGER).optional(),
  rowId: integerQuery(1, Number.MAX_SAFE_INTEGER).optional(),
}).strict();
export function parseReadApiQuery(value: unknown): ReadApiQuery { return querySchema.parse(value); }

/** Bounded, process-local abuse protection. Keys are still rechecked in DB for every request. */
export class ReadApiRateLimiter {
  private buckets = new Map<string, { count: number; end: number }>();
  constructor(private now = Date.now, private maxBuckets = 5000) {}
  take(key: string, max = READ_API_LIMIT_PER_MINUTE): number {
    const now = this.now();
    for (const [id, bucket] of this.buckets) if (bucket.end <= now) this.buckets.delete(id);
    let bucket = this.buckets.get(key);
    if (!bucket) {
      // Fail closed if too many distinct clients flood this process.
      if (this.buckets.size >= this.maxBuckets) return 60;
      bucket = { count: 0, end: now + 60000 };
      this.buckets.set(key, bucket);
    }
    if (bucket.count >= max) return Math.max(1, Math.ceil((bucket.end - now) / 1000));
    bucket.count++;
    return 0;
  }
}
export interface ReadApiHttpDependencies {
  authenticate: (authorization: string | undefined) => Promise<ReadApiPrincipal | null>;
  load: (path: string, ownerUserId: number, query: ReadApiQuery) => Promise<ReadApiResult>;
  limiter: ReadApiRateLimiter;
}
export function createReadApiRouter(overrides: Partial<ReadApiHttpDependencies> = {}) {
  const deps = { authenticate: authenticateReadApiKey, load: loadReadApiData, limiter: new ReadApiRateLimiter(), ...overrides };
  const api = express.Router();
  const active = new Map<number, number>();
  api.use((req, res, next) => {
    res.set({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Allow-Methods": "GET, OPTIONS", "X-Request-ID": randomUUID() });
    if (req.method === "OPTIONS") { res.status(204).end(); return; }
    if (req.method !== "GET") {
      res.set("Allow", "GET, OPTIONS");
      fail(res, 405, "READ_ONLY", "Esta API aceita somente consultas GET."); return;
    }
    next();
  });
  api.get("/openapi.json", (_req, res) => { res.json(buildReadApiOpenApi()); });
  api.use(async (req: Request, res: Response) => {
    let principal: ReadApiPrincipal | null = null;
    let ownsSlot = false;
    try {
      // Do not trust spoofable X-Forwarded-For. This guard is deliberately generous
      // because the managed reverse proxy can aggregate several genuine clients.
      const ingressRetry = deps.limiter.take(`ingress:${req.socket.remoteAddress ?? "unknown"}`, 600);
      if (ingressRetry) { res.set("Retry-After", String(ingressRetry)); fail(res, 429, "RATE_LIMITED", "Limite de consultas atingido. Aguarde antes de tentar novamente."); return; }
      principal = await deps.authenticate(req.get("authorization"));
      if (!principal) { res.set("WWW-Authenticate", "Bearer"); fail(res, 401, "INVALID_API_KEY", "Chave ausente, inválida, expirada ou revogada."); return; }
      const retry = deps.limiter.take(`key:${principal.id}`);
      if (retry) { res.set("Retry-After", String(retry)); fail(res, 429, "RATE_LIMITED", "Esta chave atingiu o limite de 60 consultas por minuto."); return; }
      const route = READ_API_ROUTES.find(route => route.path === req.path);
      if (req.path !== "/" && !route) { fail(res, 404, "NOT_FOUND", "Recurso não disponível nesta API."); return; }
      if (route && !principal.scopes.includes(route.scope)) { fail(res, 403, "INSUFFICIENT_SCOPE", "A chave não tem permissão para consultar este recurso."); return; }
      const parsed = querySchema.safeParse(req.query);
      if (!parsed.success) { fail(res, 400, "INVALID_QUERY", "Parâmetros inválidos. Consulte o OpenAPI; chaves não podem ser passadas na URL."); return; }
      if (req.path === "/") {
        res.json({ data: { name: "Mercato — API de leitura", resources: READ_API_ROUTES.filter(route => principal!.scopes.includes(route.scope)), documentation: `${READ_API_BASE}/openapi.json`, rateLimitPerMinute: READ_API_LIMIT_PER_MINUTE }, meta: { version: "1", readOnly: true, generatedAt: new Date().toISOString() } }); return;
      }
      if ((active.get(principal.id) ?? 0) >= 2) { res.set("Retry-After", "5"); fail(res, 429, "CONCURRENCY_LIMIT", "Aguarde as consultas em andamento desta chave."); return; }
      active.set(principal.id, (active.get(principal.id) ?? 0) + 1); ownsSlot = true;
      const result = await deps.load(req.path, principal.ownerUserId, parsed.data);
      const meta = { ...result.meta };
      if (typeof meta.asOf === "number" && Number.isFinite(meta.asOf)) meta.asOf = new Date(meta.asOf).toISOString();
      res.json({ data: result.data, meta: { ...meta, version: "1", readOnly: true, generatedAt: new Date().toISOString() } });
    } catch (error) {
      // Never reflect DB statements, bearer tokens, OAuth bodies or upstream errors.
      const code = error && typeof error === "object" ? (error as { code?: string }).code : undefined;
      const status = error && typeof error === "object" ? (error as { status?: number }).status : undefined;
      if (status === 403) { fail(res, 403, "STORE_MISMATCH", "A conexão Mercado Livre não corresponde à loja Toujours. Confira Configurações."); }
      else if (status === 429 || (error instanceof Error && error.name === "MLRateLimitError")) { res.set("Retry-After", "30"); fail(res, 429, "UPSTREAM_RATE_LIMIT", "O Mercado Livre limitou a consulta. Tente novamente em instantes."); }
      else if (status === 502 || code === "UPSTREAM_UNAVAILABLE" || (error instanceof Error && error.name === "MLDataUnavailableError")) { fail(res, 502, "UPSTREAM_UNAVAILABLE", "A fonte de dados não respondeu com um resultado confirmado. Isso não significa zero anúncios ou vendas."); }
      else { fail(res, 503, "SERVICE_UNAVAILABLE", "Não foi possível concluir a consulta agora. Tente novamente."); }
    } finally {
      if (ownsSlot && principal) { const count = (active.get(principal.id) ?? 1) - 1; if (count > 0) active.set(principal.id, count); else active.delete(principal.id); }
    }
  });
  return api;
}
function fail(res: Response, status: number, code: string, message: string) { res.status(status).json({ error: { code, message, requestId: res.getHeader("X-Request-ID") }, meta: { version: "1", readOnly: true } }); }
export function registerReadApiRoutes(app: express.Express) { app.use(READ_API_BASE, createReadApiRouter()); }
