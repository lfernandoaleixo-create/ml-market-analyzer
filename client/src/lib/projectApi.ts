import { trpc } from "@/lib/trpc";

/**
 * Namespace de portfólio: identifica qual conjunto de dados/rotas usar.
 * - "project": Projeto + Linha do Tempo Luís (compartilham os mesmos produtos)
 * - "pedro":   Linha do Tempo Pedro (totalmente independente)
 *
 * Os routers `trpc.project` e `trpc.pedro` são ESPELHADOS (mesma forma e tipos),
 * portanto as páginas podem ser reaproveitadas apenas trocando o namespace.
 */
export type PortfolioNamespace = "project" | "pedro";

/**
 * Retorna o sub-router tRPC (products/timeline/todos/documents/comments)
 * correspondente ao namespace informado. Default = "project".
 *
 * Uso: `const api = useProjectApi(ns); api.products.list.useQuery(...)`.
 */
export function useProjectApi(ns: PortfolioNamespace = "project") {
  return ns === "pedro" ? trpc.pedro : trpc.project;
}

/** Versão para o Cronograma (stages/progress/overview). */
export function useTimelineApi(ns: PortfolioNamespace = "project") {
  return ns === "pedro" ? trpc.pedroTimeline : trpc.luisTimeline;
}
