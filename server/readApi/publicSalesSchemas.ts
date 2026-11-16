type Schema = Record<string, unknown>;
const text = (description: string, nullable = true): Schema => ({
  type: "string",
  description,
  nullable,
});
const money = (description: string): Schema => ({
  type: "number",
  nullable: true,
  description:
    description + " Valor em BRL, não centavos; null significa não confirmado.",
});
const count = (description: string): Schema => ({
  type: "integer",
  minimum: 0,
  nullable: true,
  description,
});
const object = (
  description: string,
  properties: Record<string, Schema>
): Schema => ({
  type: "object",
  description,
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const ref = (name: string): Schema => ({
  $ref: `#/components/schemas/${name}`,
});
const instant = (description: string, nullable = true): Schema => ({
  ...text(description, nullable),
  format: "date-time",
});
const array = (
  name: string,
  description: string,
  nullable = false
): Schema => ({
  type: "array",
  items: ref(name),
  description,
  ...(nullable ? { nullable: true } : {}),
});
const financial = {
  net: money(
    "Líquido confirmado pela fonte financeira; não é lucro; não é rateado entre produtos."
  ),
  saleFee: money("Total da categoria sale, somente quando informado."),
  processingFee: money(
    "Total da categoria processing, somente quando informado."
  ),
  shippingCost: money(
    "Custo de envio do vendedor explicitamente informado; não é o frete estimado da calculadora."
  ),
  financingFee: money(
    "Total da categoria financing, somente quando informado."
  ),
  otherCharges: money("Total de cobranças other, somente quando informado."),
  taxesWithheld: money(
    "Total retido informado pela fonte; não significa toda a tributação devida pela empresa."
  ),
};
export const publicSalesSchemas: Record<string, Schema> = {
  PublicSalesItem: object(
    "Item do pedido, sem alterar SKU ou inferir identidade por título.",
    {
      itemId: text("Código MLB informado pela fonte."),
      variationId: text(
        "ID de variação informado pela fonte, preservado como string."
      ),
      sku: text(
        "SKU exato da planilha quando vinculado inequivocamente; de outro modo, SKU do ML ou null."
      ),
      skuSource: {
        ...text(
          "Origem da identificação SKU; ambiguous indica falta de vínculo inequívoco."
        ),
        enum: ["sheet", "mercado_livre", "ambiguous", null],
      },
      title: text("Título recebido da fonte."),
      quantity: count("Unidades deste item; null quando não informadas."),
      unitPrice: money("Preço unitário recebido no pedido."),
      listingType: text(
        "Tipo de anúncio do pedido, por exemplo gold_special/gold_pro; não é o estado atual inferido do anúncio."
      ),
    }
  ),
  PublicSalesCharge: object(
    "Cobrança explicativa atribuída ao vendedor; não é novamente descontada de net.",
    {
      key: text("ID ou chave original da cobrança.", false),
      label: text("Nome original informado em charges_details.", false),
      category: {
        type: "string",
        enum: ["sale", "processing", "shipping", "financing", "tax", "other"],
        description:
          "Categoria de apresentação derivada do nome/tipo da fonte; não é classificação fiscal certificada.",
      },
      amount: {
        type: "number",
        description:
          "Valor em BRL após a devolução informada para esta cobrança.",
      },
    }
  ),
  PublicSalesTax: object(
    "Projeção fiscal permitida; JSON bruto e dados pessoais nunca são expostos.",
    {
      type: text("Tipo de tributo informado, sem presumir ICMS/II/PIS/COFINS."),
      amount: money("Valor do tributo explicitamente informado."),
      description: text("Descrição do tributo explicitamente informada."),
    }
  ),
  PublicSalesOrder: object(
    "Uma fotografia por pedido/operacão ML no período; nunca fornece dados pessoais do comprador.",
    {
      orderId: text(
        "ID da operação ou pedido como string. Relatórios sem vínculo ao pedido não criam ID fictício.",
        false
      ),
      packId: text("Pack ID informado pela fonte."),
      paymentIds: {
        type: "array",
        items: {
          type: "string",
          description:
            "Identificador textual de pagamento confirmado na referência do pedido.",
        },
        nullable: true,
        description:
          "IDs dos pagamentos explicitamente informados; null se a lista não foi recebida.",
      },
      createdAt: instant(
        "Data/hora real da venda em ISO; não usa a data de geração do arquivo como data de venda."
      ),
      saleDay: { ...text("Dia civil em America/Sao_Paulo."), format: "date" },
      paidAt: instant(
        "Data/hora de aprovação confirmada; null quando ausente."
      ),
      status: text(
        "Estado normalizado: paid, cancelled, refunded, partially_refunded, in_mediation ou estado conhecido da fonte."
      ),
      rawStatus: text("Estado original do pedido, quando disponível."),
      financiallyComplete: {
        type: "boolean",
        description:
          "Bruto/líquido confirmados e operação financeiramente resolvida na fotografia.",
      },
      financialStatus: {
        type: "string",
        enum: ["confirmed", "pending", "refund_pending"],
        description:
          "Estado da confirmação financeira; pending/refund_pending não equivale a líquido zero.",
      },
      items: array("PublicSalesItem", "Itens do pedido."),
      shipping: object(
        "Somente informações logísticas recebidas; sem endereço ou destinatário.",
        {
          logisticType: text(
            "Modalidade logística recebida, como fulfillment/cross_docking/self_service."
          ),
          payer: {
            ...text("Quem assumiu o frete, somente por evidência da fonte."),
            enum: ["buyer", "seller", "both", null],
          },
        }
      ),
      gross: money(
        "Bruto confirmado da operação, não necessariamente igual à soma dos preços dos itens."
      ),
      deductions: money(
        "gross menos net; não é somente imposto nem uma nova subtração."
      ),
      ...financial,
      charges: array(
        "PublicSalesCharge",
        "Lista dos detalhes válidos recebidos; array vazio não prova tarifa zero."
      ),
      taxDetail: array(
        "PublicSalesTax",
        "Detalhes tributários permitidos quando recebidos em formato reconhecido; null se não disponíveis.",
        true
      ),
      taxesDisaggregated: array(
        "PublicSalesTax",
        "Detalhamento tributário permitido quando recebido em formato reconhecido; não expõe JSON arbitrário.",
        true
      ),
      chargesExplainDeductions: {
        type: "boolean",
        nullable: true,
        description:
          "Soma dos detalhes fecha com deductions na tolerância de um centavo; null sem detalhe suficiente.",
      },
      source: {
        type: "string",
        enum: ["automatic", "imported_report"],
        description:
          "Origem da fotografia financeira, não necessariamente uma consulta atualizada de um relatório antigo.",
      },
      asOf: instant(
        "Instante da fotografia desta linha, não a geração da resposta.",
        false
      ),
      pendingReason: text(
        "Motivo de confirmação pendente, sem payloads privados."
      ),
    }
  ),
  PublicSalesHistory: object(
    "Período observado e agrupamento. Sem períodos inventados, rateios ou médias de margem.",
    {
      period: instant(
        "Início do período em ISO, segundo America/Sao_Paulo; semana de segunda a domingo.",
        false
      ),
      itemId: text("Anúncio quando groupBy=item; null se não se aplica."),
      sku: text(
        "SKU exato quando identificável e aplicável; não é atribuído por título."
      ),
      title: text(
        "Título quando o agrupamento representa um único produto identificável."
      ),
      orders: count(
        "Pedidos pagos distintos neste grupo/período; duas variações do mesmo pedido não contam como dois pedidos."
      ),
      unitsSold: count("Soma das quantidades confirmadas dos itens pagos."),
      revenue: money(
        "Bruto dos itens pagos: quantidade vezes preço unitário; não rateia frete ou descontos gerais do pedido por produto."
      ),
      cancelled: count(
        "Pedidos cancelados visíveis para o vendedor neste grupo/período."
      ),
      cancelledAmount: money(
        "Valores confirmados dos itens cancelados; informativo e não soma ao faturamento."
      ),
      ...financial,
    }
  ),
};
export const publicSalesDataSchema = (path: string): Schema => ({
  type: "array",
  description:
    path === "/sales/orders"
      ? "Página de pedidos filtrados."
      : "Página de períodos/grupos observados; ausências não equivalem a zero.",
  items: ref(
    path === "/sales/orders" ? "PublicSalesOrder" : "PublicSalesHistory"
  ),
});
export function publicSalesParameters(path: string): Schema[] {
  const common: Schema[] = [
    {
      name: "limit",
      in: "query",
      schema: { type: "integer", minimum: 1, maximum: 100, default: 50 },
      description: "Registros da página.",
    },
    {
      name: "offset",
      in: "query",
      schema: { type: "integer", minimum: 0, maximum: 100000, default: 0 },
      description:
        "Paginação após filtros/agregação; próxima página offset+limit.",
    },
    {
      name: "days",
      in: "query",
      schema: { type: "integer", enum: [7, 30, 90], default: 30 },
      description:
        "Dias civis inclusivos terminando hoje; ignorado quando from/to são fornecidos juntos.",
    },
    {
      name: "from",
      in: "query",
      schema: { type: "string", format: "date" },
      description:
        "YYYY-MM-DD em America/Sao_Paulo, inclusivo. Requer to. Janela máxima366dias; não garante retenção da fonte.",
    },
    {
      name: "to",
      in: "query",
      schema: { type: "string", format: "date" },
      description: "YYYY-MM-DD inclusivo, até hoje; dia atual em andamento.",
    },
    {
      name: "itemId",
      in: "query",
      schema: { type: "string", pattern: "^MLB[0-9]+$" },
      description: "Filtro exato de anúncio, sem alterar produtos.",
    },
    {
      name: "sku",
      in: "query",
      schema: { type: "string", maxLength: 200 },
      description:
        "Filtro exato do SKU preservado, incluindo espaços; não reescreve a planilha.",
    },
  ];
  return path === "/sales/orders"
    ? [
        ...common,
        {
          name: "status",
          in: "query",
          schema: {
            type: "string",
            enum: [
              "paid",
              "cancelled",
              "refunded",
              "partially_refunded",
              "in_mediation",
              "confirmed",
              "payment_required",
              "payment_in_process",
              "partially_paid",
              "invalid",
              "pending",
            ],
          },
          description: "Filtro por estado normalizado do pedido.",
        },
      ]
    : [
        ...common,
        {
          name: "granularity",
          in: "query",
          schema: {
            type: "string",
            enum: ["hour", "day", "week", "month"],
            default: "day",
          },
          description:
            "Períodos no fuso America/Sao_Paulo; semana começa na segunda.",
        },
        {
          name: "groupBy",
          in: "query",
          schema: {
            type: "string",
            enum: ["item", "sku", "none"],
            default: "none",
          },
          description:
            "Agrupamento. Financeiro permanece null se exigir rateio entre produtos; exige também vendas-detalhe:read.",
        },
      ];
}
