import {
  READ_API_ROUTES,
  READ_API_SCOPES,
  READ_API_BASE,
} from "../../shared/readApi";
import { readApiDataSchema, readApiSchemas } from "./openapiSchemas";
import { publicSalesParameters } from "./publicSalesSchemas";
export function buildReadApiOpenApi(
  baseUrl = `https://mlmarketanl-kcmkt5tl.manus.space${READ_API_BASE}`
) {
  const parameters = [
    {
      name: "limit",
      in: "query",
      description: "Máximo de registros da página (1 a 100).",
      schema: { type: "integer", minimum: 1, maximum: 100, default: 50 },
    },
    {
      name: "offset",
      in: "query",
      description:
        "Quantidade de registros a pular. Próxima página: offset + limit.",
      schema: { type: "integer", minimum: 0, maximum: 100000, default: 0 },
    },
    {
      name: "search",
      in: "query",
      description: "Busca textual nas rotas de catálogo/listas que a suportam.",
      schema: { type: "string", maxLength: 120 },
    },
    {
      name: "days",
      in: "query",
      description:
        "Janela das métricas Mercado Livre. O dia atual ainda está em andamento.",
      schema: { type: "integer", enum: [7, 30, 90], default: 30 },
    },
    {
      name: "productId",
      in: "query",
      description:
        "ID do produto do Projeto nos documentos; número comercial do produto nas rotas SKU/kits.",
      schema: { type: "integer", minimum: 1 },
    },
    {
      name: "rowId",
      in: "query",
      description:
        "ID da linha SKU para variações; ID do documento nos recursos de arquivos que suportam o filtro.",
      schema: { type: "integer", minimum: 1 },
    },
  ];
  const errorDescriptions: Record<number, string> = {
    400: "Parâmetro inválido",
    401: "Chave ausente, inválida, expirada ou revogada",
    403: "Permissão insuficiente ou loja Mercado Livre diferente",
    404: "Rota não disponível",
    405: "Somente GET e OPTIONS são permitidos",
    429: "Limite de consultas ou concorrência atingido; respeitar Retry-After",
    502: "Fonte de dados indisponível",
    503: "Serviço temporariamente indisponível",
  };
  const errors = Object.fromEntries(
    Object.entries(errorDescriptions).map(([code, description]) => [
      code,
      {
        description,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
          },
        },
      },
    ])
  );
  const success = (path: string) => ({
    description:
      "Dados confirmados ou snapshot identificado por meta.stale. Verificar partial/capped e hasMore antes de concluir a análise.",
    content: {
      "application/json": {
        schema: {
          type: "object",
          required: ["data", "meta"],
          properties: {
            data: readApiDataSchema(path),
            meta: { $ref: "#/components/schemas/ReadApiMeta" },
          },
        },
      },
    },
  });
  const paths: Record<string, unknown> = {
    "/": {
      get: {
        operationId: "readApiIndex",
        summary: "Recursos disponíveis para a chave atual",
        responses: { "200": success("/"), ...errors },
      },
    },
  };
  for (const route of READ_API_ROUTES) {
    const expandedSales =
      route.path === "/sales/orders" || route.path === "/sales/history";
    const details =
      route.path === "/sales/history"
        ? " Financeiro agregado exige também vendas-detalhe:read e não é rateado por produto. Períodos sem registros são ausentes. Até 366 dias por requisição, sujeito à retenção/cobertura da fonte e aos limites de coleta."
        : route.path === "/sales/orders"
          ? " Uma linha por pedido; valores ausentes são null. Até 366 dias por requisição, sem garantir retenção completa. Não calcula impostos ou custos presumidos."
          : "";
    paths[route.path] = {
      get: {
        operationId: `read${route.path.replace(/\//g, "_").replace(/-/g, "_")}`,
        summary: route.title,
        description: `Permissão necessária: ${route.scope}. Este endpoint não modifica dados comerciais.${details}`,
        "x-required-scope": route.scope,
        parameters: expandedSales
          ? publicSalesParameters(route.path)
          : parameters,
        responses: { "200": success(route.path), ...errors },
      },
    };
  }
  return {
    openapi: "3.0.3",
    info: {
      title: "Mercato — API de leitura",
      version: "1.1.0",
      description:
        "API para IAs e integrações externas. Exige Authorization: Bearer SUA_CHAVE. Sem escrita em dados comerciais. Ampliação compatível: /sales preservado; /sales/orders exige vendas-detalhe:read; /sales/history exige vendas:read, com financeiro protegido pelo escopo adicional. Limite por instância: 60 requisições/minuto e 2 consultas simultâneas por chave. Mercado Livre usa cache até 5 minutos (novas rotas até 2 minutos); pode retornar snapshot anterior explicitamente sinalizado. Nunca interpretar indisponibilidade como zero. Não aceita chaves em URL ou cookies. Permissões: " +
        READ_API_SCOPES.join(", "),
    },
    servers: [{ url: baseUrl }],
    security: [{ ReadApiKey: [] }],
    paths,
    components: {
      securitySchemes: {
        ReadApiKey: {
          type: "http",
          scheme: "bearer",
          description:
            "Chave de leitura gerada por administrador em Configurações > API de leitura.",
        },
      },
      schemas: {
        ...readApiSchemas,
        ReadApiMeta: {
          type: "object",
          required: ["version", "readOnly", "generatedAt"],
          properties: {
            version: { type: "string", enum: ["1"] },
            readOnly: { type: "boolean", enum: [true] },
            generatedAt: {
              type: "string",
              format: "date-time",
              description:
                "Instante UTC da geração da resposta; não substitui o momento da coleta.",
            },
            requestId: {
              type: "string",
              description:
                "Identificador de rastreio da requisição nas novas rotas, igual a X-Request-ID.",
            },
            stale: {
              type: "boolean",
              description:
                "Resultado anterior preservado após falha de atualização.",
            },
            asOf: {
              type: "string",
              format: "date-time",
              nullable: true,
              description:
                "Instante UTC da coleta do snapshot; null se não confirmado.",
            },
            partial: {
              type: "boolean",
              description:
                "Coleta incompleta ou truncada; agregados não são totais definitivos.",
            },
            capped: {
              type: "boolean",
              description:
                "A coleta não cobre todos os registros da janela por causa dos tetos defensivos.",
            },
            topProductsCapped: {
              type: "boolean",
              description:
                "Ranking de vendas pode ter atingido 100 produtos; não indica sozinho corte dos totais.",
            },
            sellerId: {
              type: "integer",
              description:
                "Identidade do vendedor confirmado antes de usar o cache.",
            },
            days: { type: "integer", enum: [7, 30, 90] },
            attempted: { type: "integer", minimum: 0 },
            resolved: { type: "integer", minimum: 0 },
            limit: { type: "integer", minimum: 1, maximum: 100 },
            offset: { type: "integer", minimum: 0 },
            hasMore: {
              type: "boolean",
              description:
                "Consultar a próxima página antes de contar a lista completa.",
            },
            from: {
              type: "string",
              format: "date",
              description:
                "Dia inicial solicitado, inclusivo em America/Sao_Paulo.",
            },
            to: {
              type: "string",
              format: "date",
              description:
                "Dia final solicitado, inclusivo em America/Sao_Paulo.",
            },
            dataStart: {
              type: "string",
              format: "date",
              nullable: true,
              description:
                "Primeiro dia efetivamente observado na fonte/relatórios; não garante cobertura contínua ou início da conta.",
            },
            coverageFrom: {
              type: "string",
              format: "date",
              nullable: true,
              description:
                "Limite inicial de cobertura confirmado, quando disponível.",
            },
            coverageTo: {
              type: "string",
              format: "date",
              nullable: true,
              description:
                "Limite final de cobertura confirmado, quando disponível.",
            },
            timezone: { type: "string", enum: ["America/Sao_Paulo"] },
            financialScopeMissing: {
              type: "boolean",
              description:
                "Chave não possui vendas-detalhe:read: campos financeiros do histórico permanecem null.",
            },
            financialScopeRequired: {
              type: "string",
              enum: ["vendas-detalhe:read"],
              description:
                "Escopo adicional necessário ao financeiro do histórico.",
            },
            financialRequested: {
              type: "boolean",
              description:
                "Pagamentos foram solicitados nesta coleta; false sem escopo ou na janela de histórico acima de31dias.",
            },
            financialWindowMaxDays: {
              type: "integer",
              enum: [31],
              description:
                "Histórico financeiro automático limitado a31dias por consulta; dividir períodos longos em blocos menores.",
            },
            windowDays: { type: "integer", minimum: 1, maximum: 366 },
            maxWindowDays: { type: "integer", enum: [366] },
            ordersPartial: {
              type: "boolean",
              description:
                "Enumeração comercial incompleta; uma pendência apenas financeira não apaga contagem/unidades/faturamento confirmados.",
            },
            dataStartConfirmed: {
              type: "boolean",
              description:
                "Busca global do primeiro pedido visível foi confirmada; não prova criação da conta nem pedidos fora da retenção.",
            },
            dataStartEvidence: { type: "string", nullable: true },
            beforeDataStart: {
              type: "boolean",
              description:
                "Janela começa antes do primeiro pedido visível confirmado na API.",
            },
            coverage: {
              type: "object",
              properties: {
                from: { type: "string", format: "date", nullable: true },
                to: { type: "string", format: "date", nullable: true },
                complete: { type: "boolean" },
              },
              description:
                "Cobertura da enumeração comercial; não garante que tarifas ou tributos estejam discriminados.",
            },
            coverageScope: {
              type: "string",
              description:
                "Limita cobertura aos pedidos visíveis para vendedor; não é arquivo da vida inteira da conta.",
            },
            availableHistory: {
              type: "object",
              properties: {
                from: { type: "string", format: "date", nullable: true },
                to: { type: "string", format: "date", nullable: true },
                continuous: { type: "boolean" },
                sources: { type: "array", items: { type: "string" } },
              },
              description:
                "Evidência observada; relatório esparso não comprova continuidade.",
            },
            emptyPeriodsReason: { type: "string" },
            sparseEmptyPeriodsReason: { type: "string" },
            financePartial: {
              type: "boolean",
              description:
                "Um ou mais valores financeiros não têm total confirmado.",
            },
            financePartialKnown: {
              type: "object",
              description:
                "Somente subtotais conhecidos e atribuíveis, nunca totais completos; forma varia por rota.",
              additionalProperties: true,
            },
            financialAllocationReasons: {
              type: "array",
              items: { type: "string" },
              description:
                "Motivos de financeiro null: pedido multi-grupo, filtro parcial, identidade ausente ou referência importada não comprovada.",
            },
            unallocatedOrders: { type: "integer", minimum: 0 },
            ordersObserved: { type: "integer", minimum: 0 },
            excludedUnknownDates: { type: "integer", minimum: 0 },
            reportCount: { type: "integer", minimum: 0 },
            reportLimit: { type: "integer", enum: [1000] },
            unverifiedImportedReferences: {
              type: "integer",
              minimum: 0,
              description:
                "Referências importadas não comprovadas comoorderId: omitidas de /sales/orders e não sustentam financeiro deduplicado no histórico.",
            },
            importedOrderIdentityPolicy: {
              type: "string",
              description:
                "Condição de vínculo entre operação importada e pedido ML verificado; pack/payment IDs não sãoorderId.",
            },
            warnings: {
              type: "array",
              items: { type: "string" },
              description:
                "Motivos de lacunas, limitações e impossibilidade de rateio financeiro.",
            },
          },
          additionalProperties: true,
        },
        Error: {
          type: "object",
          required: ["error"],
          properties: {
            error: {
              type: "object",
              required: ["code", "message", "requestId"],
              properties: {
                code: { type: "string" },
                message: { type: "string" },
                requestId: { type: "string" },
              },
            },
            meta: {
              type: "object",
              properties: {
                version: { type: "string" },
                readOnly: { type: "boolean", enum: [true] },
              },
            },
          },
        },
      },
    },
  };
}
