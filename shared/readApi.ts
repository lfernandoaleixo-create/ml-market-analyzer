export const READ_API_SCOPES = ["mercado:read", "vendas:read", "ads:read", "projeto:read", "sku:read", "documentos:read", "calculadora:read"] as const;
export type ReadApiScope = typeof READ_API_SCOPES[number];
export const READ_API_SCOPE_LABELS: Record<ReadApiScope, string> = {
  "mercado:read": "Loja, anúncios, visitas e ficha técnica",
  "vendas:read": "Resumo de vendas (sem dados pessoais de compradores)",
  "ads:read": "Publicidade e campanhas (somente leitura)",
  "projeto:read": "Produtos e informações comerciais do Projeto",
  "sku:read": "Planilha SKU, variações, kits e embalagens",
  "documentos:read": "Documentos e fotos do Projeto (links dos arquivos)",
  "calculadora:read": "Catálogo e PDFs de precificação da conta principal",
};
export const READ_API_BASE = "/api/public/v1";
export const READ_API_LIMIT_PER_MINUTE = 60;
export const READ_API_ROUTES = [
  { path: "/store", scope: "mercado:read", title: "Identidade e reputação da loja" },
  { path: "/listings", scope: "mercado:read", title: "Anúncios e métricas" },
  { path: "/visits", scope: "mercado:read", title: "Série de visitas dos anúncios ativos" },
  { path: "/technical-specs", scope: "mercado:read", title: "Raio-X da ficha técnica" },
  { path: "/sales", scope: "vendas:read", title: "Resumo de vendas" },
  { path: "/ads", scope: "ads:read", title: "Resumo de publicidade" },
  { path: "/products", scope: "projeto:read", title: "Produtos do Projeto" },
  { path: "/sku", scope: "sku:read", title: "Linhas ativas da planilha SKU" },
  { path: "/sku/variations", scope: "sku:read", title: "Variações ativas de SKU" },
  { path: "/sku/columns", scope: "sku:read", title: "Colunas personalizadas da planilha" },
  { path: "/kits", scope: "sku:read", title: "Linhas de kits" },
  { path: "/packaging", scope: "sku:read", title: "Embalagens" },
  { path: "/documents", scope: "documentos:read", title: "Documentos e fotos do Projeto" },
  { path: "/pricing/products", scope: "calculadora:read", title: "Catálogo da calculadora" },
  { path: "/pricing/pdfs", scope: "calculadora:read", title: "PDFs salvos da calculadora" },
] as const satisfies ReadonlyArray<{ path: string; scope: ReadApiScope; title: string }>;
export interface ReadApiKeyMetadata {
  id: number;
  name: string;
  prefix: string;
  scopes: ReadApiScope[];
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}
export interface ReadApiQuery { limit: number; offset: number; days: number; search?: string; productId?: number; rowId?: number; }
export interface ReadApiResult { data: unknown; meta?: Record<string, unknown>; }
