import { READ_API_ROUTES, READ_API_SCOPES, READ_API_BASE } from "../../shared/readApi";
import { readApiDataSchema, readApiSchemas } from "./openapiSchemas";
export function buildReadApiOpenApi(baseUrl = `https://mlmarketanl-kcmkt5tl.manus.space${READ_API_BASE}`) {
  const parameters = [
    { name: "limit", in: "query", description: "Máximo de registros da página (1 a 100).", schema: { type: "integer", minimum: 1, maximum: 100, default: 50 } },
    { name: "offset", in: "query", description: "Quantidade de registros a pular. Próxima página: offset + limit.", schema: { type: "integer", minimum: 0, maximum: 100000, default: 0 } },
    { name: "search", in: "query", description: "Busca textual nas rotas de catálogo/listas que a suportam.", schema: { type: "string", maxLength: 120 } },
    { name: "days", in: "query", description: "Janela das métricas Mercado Livre. O dia atual ainda está em andamento.", schema: { type: "integer", enum: [7, 30, 90], default: 30 } },
    { name: "productId", in: "query", description: "ID do produto do Projeto nos documentos; número comercial do produto nas rotas SKU/kits.", schema: { type: "integer", minimum: 1 } },
    { name: "rowId", in: "query", description: "ID da linha SKU para variações; ID do documento nos recursos de arquivos que suportam o filtro.", schema: { type: "integer", minimum: 1 } },
  ];
  const errorDescriptions: Record<number, string> = {
    400: "Parâmetro inválido", 401: "Chave ausente, inválida, expirada ou revogada",
    403: "Permissão insuficiente ou loja Mercado Livre diferente", 404: "Rota não disponível",
    405: "Somente GET e OPTIONS são permitidos", 429: "Limite de consultas ou concorrência atingido; respeitar Retry-After",
    502: "Fonte de dados indisponível", 503: "Serviço temporariamente indisponível",
  };
  const errors = Object.fromEntries(Object.entries(errorDescriptions).map(([code, description]) => [code, { description, content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } }]));
  const success = (path: string) => ({
    description: "Dados confirmados ou snapshot identificado por meta.stale. Verificar partial/capped e hasMore antes de concluir a análise.",
    content: { "application/json": { schema: { type: "object", required: ["data", "meta"], properties: { data: readApiDataSchema(path), meta: { $ref: "#/components/schemas/ReadApiMeta" } } } } },
  });
  const paths: Record<string, unknown> = {
    "/": { get: { operationId: "readApiIndex", summary: "Recursos disponíveis para a chave atual", responses: { "200": success("/"), ...errors } } },
  };
  for (const route of READ_API_ROUTES) {
    paths[route.path] = { get: { operationId: `read${route.path.replace(/\//g, "_").replace(/-/g, "_")}`, summary: route.title, description: `Permissão necessária: ${route.scope}. Este endpoint não modifica dados.`, "x-required-scope": route.scope, parameters, responses: { "200": success(route.path), ...errors } } };
  }
  return {
    openapi: "3.0.3",
    info: { title: "Mercato — API de leitura", version: "1.0.0", description: "API para IAs e integrações externas. Exige Authorization: Bearer SUA_CHAVE. Sem escrita em dados comerciais. Limite por instância: 60 requisições/minuto e 2 consultas simultâneas por chave. Mercado Livre usa cache até 5 minutos; pode retornar snapshot anterior explicitamente sinalizado. Nunca interpretar indisponibilidade como zero. Não aceita chaves em URL ou cookies. Permissões: " + READ_API_SCOPES.join(", ") },
    servers: [{ url: baseUrl }],
    security: [{ ReadApiKey: [] }],
    paths,
    components: {
      securitySchemes: { ReadApiKey: { type: "http", scheme: "bearer", description: "Chave de leitura gerada por administrador em Configurações > API de leitura." } },
      schemas: {
        ...readApiSchemas,
        ReadApiMeta: {
          type: "object", required: ["version", "readOnly", "generatedAt"],
          properties: {
            version: { type: "string", enum: ["1"] }, readOnly: { type: "boolean", enum: [true] },
            generatedAt: { type: "string", format: "date-time", description: "Instante UTC da geração da resposta; não substitui o momento da coleta." },
            stale: { type: "boolean", description: "Resultado anterior preservado após falha de atualização." },
            asOf: { type: "string", format: "date-time", description: "Instante UTC da coleta do snapshot." },
            partial: { type: "boolean", description: "Coleta incompleta ou truncada; agregados não são totais definitivos." },
            capped: { type: "boolean", description: "A coleta não cobre todos os registros da janela por causa dos tetos defensivos." },
            topProductsCapped: { type: "boolean", description: "Ranking de vendas pode ter atingido 100 produtos; não indica sozinho corte dos totais." },
            sellerId: { type: "integer", description: "Identidade do vendedor confirmado antes de usar o cache." },
            days: { type: "integer", enum: [7, 30, 90] }, attempted: { type: "integer", minimum: 0 }, resolved: { type: "integer", minimum: 0 },
            limit: { type: "integer", minimum: 1, maximum: 100 }, offset: { type: "integer", minimum: 0 }, hasMore: { type: "boolean", description: "Consultar a próxima página antes de contar a lista completa." },
          }, additionalProperties: true,
        },
        Error: { type: "object", required: ["error"], properties: { error: { type: "object", required: ["code", "message", "requestId"], properties: { code: { type: "string" }, message: { type: "string" }, requestId: { type: "string" } } }, meta: { type: "object", properties: { version: { type: "string" }, readOnly: { type: "boolean", enum: [true] } } } } },
      },
    },
  };
}
