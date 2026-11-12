/**
 * Public response DTOs only. Keep property lists aligned with data.ts projections.
 * This module deliberately has no provider, database or credential dependencies.
 * Optional scalar properties preserve missing source values; no defaults/examples
 * imply that an unavailable metric is a confirmed zero.
 */
type Schema = Record<string, unknown>;

const ref = (name: string): Schema => ({
  $ref: `#/components/schemas/${name}`,
});
const text = (description: string, nullable = false): Schema => ({
  type: "string",
  description,
  ...(nullable ? { nullable: true } : {}),
});
const number = (description: string, nullable = false): Schema => ({
  type: "number",
  description,
  ...(nullable ? { nullable: true } : {}),
});
const count = (description: string, nullable = false): Schema => ({
  type: "integer",
  minimum: 0,
  description,
  ...(nullable ? { nullable: true } : {}),
});
const flag = (description: string): Schema => ({
  type: "boolean",
  description,
});
const money = (description: string, nullable = false): Schema =>
  number(`${description} Valor em reais (BRL), não em centavos.`, nullable);
const percent = (description: string, nullable = false): Schema =>
  number(
    `${description} Em pontos percentuais; não é uma fração de 0 a 1.`,
    nullable
  );
const ratio = (description: string, nullable = false): Schema => ({
  ...number(`${description} Razão adimensional (não percentual).`, nullable),
  minimum: 0,
});
const fraction = (description: string, nullable = false): Schema => ({
  ...ratio(description, nullable),
  maximum: 1,
});
const instant = (description: string, nullable = false): Schema => ({
  ...text(description, nullable),
  format: "date-time",
});
const unixMs = (description: string, nullable = false): Schema => ({
  ...count(`${description} Timestamp Unix em milissegundos (UTC).`, nullable),
  format: "int64",
});
const date = (description: string): Schema => ({
  ...text(description),
  format: "date",
});
const object = (
  description: string,
  properties: Record<string, Schema>,
  required: string[] = []
): Schema => ({
  type: "object",
  description,
  properties,
  additionalProperties: false,
  ...(required.length ? { required } : {}),
});
const array = (description: string, item: string): Schema => ({
  type: "array",
  description,
  items: ref(item),
});

const identityProperties = {
  itemId: text("Código público do anúncio no Mercado Livre."),
  title: text("Título do anúncio."),
  thumbnail: text("URL da miniatura, quando informada pela fonte."),
  permalink: text("URL pública do anúncio, quando informada pela fonte."),
};
const auditDates = {
  createdAt: instant("Data/hora de criação do registro."),
  updatedAt: instant("Data/hora da última alteração do registro."),
};
const sheetProperties = {
  id: count("Identificador do registro comercial da planilha."),
  position: count("Posição de exibição da linha."),
  productNumber: count(
    "Número comercial do produto; nulo quando não atribuído.",
    true
  ),
  variantNumber: count(
    "Número comercial da variante; nulo quando não atribuído.",
    true
  ),
  cadastradoMl: text(
    "Estado de cadastro na planilha; preserva o texto e o valor vazio."
  ),
  tipoSku: text("Tipo SKU registrado na planilha, preservado como texto."),
  categoryId: text("Código público da categoria ML.", true),
  categoryName: text("Nome da categoria.", true),
  subCategoryId: text("Código público da subcategoria ML.", true),
  subCategoryName: text("Nome da subcategoria.", true),
  produto: text("Nome do produto."),
  variante: text("Nome da variante."),
  sku: text("SKU comercial do produto."),
  gerarSkuKit: flag(
    "Indica a opção de geração de SKU de kit registrada na planilha."
  ),
  skuKit: text("SKU comercial do kit."),
  eanGtin: text("EAN/GTIN como texto, preservando zeros iniciais."),
  ncm: text("Código fiscal NCM como texto."),
  gpc: text("Código GPC como texto."),
  cest: text("Código fiscal CEST como texto."),
  precoClassico: text(
    "Preço clássico em BRL como texto livre; pode conter formatação monetária ou estar vazio."
  ),
  precoPremium: text(
    "Preço premium em BRL como texto livre; não é um número normalizado."
  ),
  precoAtacado: text(
    "Preço de atacado em BRL como texto livre; não é um número normalizado."
  ),
  embProfundidade: text(
    "Profundidade da embalagem como texto livre, preservando a unidade digitada."
  ),
  embLargura: text(
    "Largura da embalagem como texto livre, preservando a unidade digitada."
  ),
  embAltura: text(
    "Altura da embalagem como texto livre, preservando a unidade digitada."
  ),
  embPeso: text(
    "Peso da embalagem como texto livre, preservando a unidade digitada."
  ),
  caracteristicas: text("Características comerciais do produto.", true),
  rowColor: text(
    "Cor de exibição da linha; texto vazio indica ausência de cor."
  ),
  customValues: text(
    "Texto JSON armazenado com valores das colunas personalizadas; não é um objeto JSON na resposta.",
    true
  ),
  ...auditDates,
};

const storeMetrics = object(
  "Taxas de reputação informadas pela fonte; valores indisponíveis podem ser nulos.",
  {
    claimsRate: fraction("Taxa de reclamações.", true),
    delayedRate: fraction("Taxa de atrasos.", true),
    cancellationsRate: fraction("Taxa de cancelamentos.", true),
  }
);
const adsSummary = object(
  "Agregado de campanhas na janela selecionada, sem informações de autenticação.",
  {
    advertiserId: count("Identificador público do anunciante Mercado Ads."),
    currency: text("Código de moeda do agregado; BRL para esta loja."),
    campaignCount: count("Quantidade de campanhas consideradas."),
    activeCampaignCount: count("Quantidade de campanhas ativas consideradas."),
    metrics: ref("ReadApiAdsMetrics"),
    derived: ref("ReadApiAdsDerived"),
  }
);
const categoryAnswer = object(
  "Classificação comercial salva; não inclui alternativas ou conteúdo bruto do classificador.",
  {
    category: text("Categoria sugerida."),
    categoryId: text("Código público da categoria, quando identificado.", true),
    source: text("Origem informada da classificação."),
    explanation: text("Justificativa comercial da classificação."),
    confidence: {
      description:
        "Confiança preservada do catálogo: texto descritivo ou fração numérica de 0 a 1.",
      anyOf: [text("Confiança textual."), fraction("Confiança numérica.")],
    },
  }
);

export const readApiSchemas: Record<string, unknown> = {
  ReadApiIndexResource: object(
    "Recurso de leitura disponível para as permissões da chave atual.",
    {
      path: text("Caminho relativo do recurso existente."),
      scope: text("Permissão necessária para leitura do recurso."),
      title: text("Descrição do recurso."),
    }
  ),
  ReadApiIndexData: object(
    "Índice da API com os recursos autorizados para a chave atual.",
    {
      name: text("Nome da API."),
      resources: array(
        "Recursos autorizados, não necessariamente todas as rotas.",
        "ReadApiIndexResource"
      ),
      documentation: text("Caminho do documento OpenAPI."),
      rateLimitPerMinute: count("Limite de requisições por minuto."),
    }
  ),
  ReadApiStoreMetrics: storeMetrics,
  ReadApiStoreData: object(
    "Identidade pública e reputação da loja autorizada.",
    {
      sellerId: count("Identificador público da loja no Mercado Livre."),
      nickname: text("Apelido público da loja."),
      levelId: text("Nível de reputação informado pela fonte.", true),
      powerSellerStatus: text(
        "Classificação MercadoLíder, quando disponível.",
        true
      ),
      sellerExperience: text(
        "Experiência do vendedor informada pela fonte.",
        true
      ),
      transactionsTotal: count("Total de transações da reputação."),
      transactionsCompleted: count("Transações concluídas."),
      transactionsCanceled: count("Transações canceladas."),
      ratingsPositive: fraction("Parcela de avaliações positivas."),
      ratingsNeutral: fraction("Parcela de avaliações neutras."),
      ratingsNegative: fraction("Parcela de avaliações negativas."),
      points: count("Pontos de reputação."),
      registrationDate: instant("Data/hora de registro da loja."),
      permalink: text("URL pública do perfil da loja."),
      metrics: ref("ReadApiStoreMetrics"),
    }
  ),
  ReadApiListingSummary: object(
    "Resumo do conjunto consultado antes da paginação e busca; contagens dependentes de visitas podem ser nulas enquanto não confirmadas.",
    {
      total: count("Anúncios considerados."),
      active: count("Anúncios ativos."),
      paused: count("Anúncios pausados."),
      closed: count("Anúncios encerrados."),
      stagnant: count("Anúncios com estoque e sem vendas acumuladas."),
      outOfStock: count("Anúncios sem estoque disponível."),
      totalVisits: count(
        "Visitas confirmadas na janela; nulo quando nenhuma consulta foi resolvida.",
        true
      ),
      visitsPending: flag("Há consultas de visitas pendentes."),
      visitsCollecting: flag("A coleta de visitas ainda está em andamento."),
      visitsAttempted: count(
        "Anúncios para os quais se tentou consultar visitas."
      ),
      visitsResolved: count("Anúncios com consulta de visitas resolvida."),
      visitsActive: count("Visitas confirmadas dos anúncios ativos.", true),
      visitsPaused: count("Visitas confirmadas dos anúncios pausados.", true),
      visitsClosed: count("Visitas confirmadas dos anúncios encerrados.", true),
      activeWithVisits: count(
        "Anúncios ativos com visitas confirmadas na janela.",
        true
      ),
      activeNoVisits: count(
        "Anúncios ativos com zero visitas confirmado na janela.",
        true
      ),
      avgVisitsPerActive: number(
        "Média de visitas por anúncio ativo; admite valor fracionário ou nulo quando não confirmado.",
        true
      ),
      totalStockValue: money("Valor total do estoque disponível."),
      totalSold: count(
        "Unidades vendidas acumuladas dos anúncios, não apenas na janela de visitas."
      ),
      windowDays: count("Dias da janela de visitas."),
      capped: flag(
        "O conjunto atingiu o limite de segurança e pode omitir anúncios."
      ),
    }
  ),
  ReadApiListing: object(
    "Anúncio e métricas permitidas. Um valor nulo de visitas/conversão não representa zero confirmado.",
    {
      ...identityProperties,
      price: money("Preço do anúncio."),
      currency: text("Código da moeda do anúncio; BRL para esta loja."),
      availableQuantity: count("Estoque disponível."),
      soldQuantity: count("Unidades vendidas acumuladas do anúncio."),
      status: text("Estado do anúncio informado pela fonte."),
      listingType: text("Tipo de anúncio informado pela fonte."),
      visits: count(
        "Visitas na janela selecionada; nulo quando a coleta está pendente.",
        true
      ),
      visitsAvailable: flag("A fonte confirmou o número de visitas."),
      pending: flag(
        "As visitas ainda não foram confirmadas; não interpretar como zero."
      ),
      conversion: ratio(
        "soldQuantity / visitas da janela. Nulo sem visitas ou com coleta pendente; o numerador acumulado pode produzir razão maior que 1.",
        true
      ),
      health: fraction("Índice de saúde do anúncio, quando informado.", true),
      categoryId: text("Código público da categoria ML."),
      createdMs: unixMs("Criação do anúncio.", true),
      updatedMs: unixMs("Última alteração do anúncio.", true),
      freeShipping: flag("O anúncio oferece frete grátis."),
      logisticType: text("Modalidade logística do anúncio.", true),
      catalogListing: flag(
        "O anúncio está associado a um produto de catálogo."
      ),
      stockValue: money("Preço multiplicado pelo estoque disponível."),
      sku: text("SKU comercial do vendedor; pode estar vazio."),
      packageWeightGrams: number(
        "Peso declarado da embalagem em gramas; nulo quando não declarado.",
        true
      ),
    }
  ),
  ReadApiListingsData: object(
    "Resumo global e página de anúncios; o resumo não é recalculado a partir da página.",
    {
      summary: ref("ReadApiListingSummary"),
      items: array(
        "Página de anúncios, após busca e paginação.",
        "ReadApiListing"
      ),
    },
    ["summary", "items"]
  ),
  ReadApiVisitsSummary: object(
    "Cobertura da consulta de visitas dos anúncios ativos.",
    {
      days: count("Dias da janela solicitada."),
      attempted: count("Anúncios ativos cuja consulta de visitas foi tentada."),
      resolved: count(
        "Anúncios ativos com visitas resolvidas; pode ser menor que attempted."
      ),
      totalActive: count(
        "Total de anúncios ativos, somente quando informado pela fonte."
      ),
    }
  ),
  ReadApiVisitDay: object(
    "Visitas diárias confirmadas dos anúncios ativos; a data corrente ainda pode ser parcial.",
    {
      date: date("Dia da série no formato YYYY-MM-DD."),
      visits: count(
        "Visitas agregadas dos anúncios ativos resolvidos neste dia."
      ),
    }
  ),
  ReadApiVisitsData: object(
    "Resumo de cobertura e página da série diária de visitas.",
    {
      summary: ref("ReadApiVisitsSummary"),
      items: array("Página da série diária de visitas.", "ReadApiVisitDay"),
    },
    ["summary", "items"]
  ),
  ReadApiTechnicalSummary: object(
    "Resumo do diagnóstico das fichas técnicas antes da paginação.",
    {
      total: count("Anúncios analisados."),
      complete: count("Fichas técnicas completas."),
      incomplete: count("Fichas técnicas com atributos ausentes."),
      withMissingRequired: count("Fichas com atributos obrigatórios ausentes."),
      avgCompleteness: fraction(
        "Média de preenchimento das fichas analisadas."
      ),
      totalMissing: count("Atributos ausentes no conjunto analisado."),
      totalMissingRequired: count(
        "Atributos obrigatórios ausentes no conjunto analisado."
      ),
      capped: flag("O diagnóstico atingiu o limite de segurança."),
      allComplete: flag("Todas as fichas analisadas estão completas."),
    }
  ),
  ReadApiTechnicalAttribute: object(
    "Projeção de um atributo; não expõe listas internas de opções ou unidades permitidas.",
    {
      id: text("Código público do atributo ML."),
      name: text("Nome do atributo."),
      valueType: {
        ...text("Tipo de valor do atributo."),
        enum: ["string", "number", "number_unit", "list", "boolean"],
      },
      required: flag("O atributo é obrigatório na categoria."),
      valueName: text(
        "Valor atual do atributo; nulo quando não preenchido.",
        true
      ),
      isMissing: flag("O atributo está sem valor."),
      defaultUnit: text("Unidade padrão sugerida, quando disponível."),
      multivalued: flag("O atributo aceita múltiplos valores."),
      hint: text("Orientação de preenchimento informada pela fonte."),
    }
  ),
  ReadApiTechnicalListing: object(
    "Diagnóstico de preenchimento da ficha técnica de um anúncio.",
    {
      ...identityProperties,
      status: text("Estado do anúncio."),
      categoryId: text("Código público da categoria ML."),
      totalAttributes: count("Atributos considerados."),
      filledAttributes: count("Atributos preenchidos."),
      missingAttributes: count("Atributos ausentes."),
      missingRequired: count("Atributos obrigatórios ausentes."),
      completeness: fraction("Atributos preenchidos / atributos considerados."),
      complete: flag("Não há atributos ausentes."),
      attributes: array(
        "Atributos projetados da ficha técnica.",
        "ReadApiTechnicalAttribute"
      ),
    }
  ),
  ReadApiTechnicalData: object(
    "Resumo global e página de fichas técnicas.",
    {
      summary: ref("ReadApiTechnicalSummary"),
      items: array(
        "Página de anúncios diagnosticados.",
        "ReadApiTechnicalListing"
      ),
    },
    ["summary", "items"]
  ),
  ReadApiSalesSummary: object(
    "Vendas e cancelamentos agregados na janela consultada, sem compradores ou pedidos individuais.",
    {
      from: unixMs("Início do período consultado."),
      to: unixMs("Fim do período consultado."),
      revenue: money("Receita dos pedidos pagos considerados no período."),
      orders: count("Pedidos pagos considerados."),
      unitsSold: count("Unidades vendidas nos pedidos considerados."),
      avgTicket: money("Receita dividida pela quantidade de pedidos pagos."),
      cancelled: count("Pedidos cancelados no período."),
      cancelledAmount: money(
        "Valor dos pedidos cancelados, de caráter informativo."
      ),
      currency: text("Código da moeda; BRL para esta loja."),
    }
  ),
  ReadApiSalesDay: object(
    "Agregado diário de vendas e cancelamentos, sem dados pessoais.",
    {
      date: date("Dia do agregado no formato YYYY-MM-DD."),
      revenue: money("Receita diária dos pedidos pagos considerados."),
      orders: count("Pedidos pagos do dia."),
      cancelled: count("Pedidos cancelados criados neste dia."),
      cancelledAmount: money("Valor dos pedidos cancelados criados neste dia."),
    }
  ),
  ReadApiSalesProduct: object(
    "Produto agregado por vendas no período, sem pedidos individuais.",
    {
      ...identityProperties,
      unitsSold: count("Unidades vendidas do produto no período."),
      revenue: money("Receita atribuída ao produto no período."),
    }
  ),
  ReadApiSalesData: object(
    "Resumo de vendas, série diária e produtos de maior receita do período.",
    {
      summary: ref("ReadApiSalesSummary"),
      daily: array(
        "Série diária agregada; o dia corrente pode ser parcial.",
        "ReadApiSalesDay"
      ),
      topProducts: array(
        "Produtos destacados pelo agregado de vendas, não uma lista de pedidos.",
        "ReadApiSalesProduct"
      ),
    },
    ["summary", "daily", "topProducts"]
  ),
  ReadApiAdsMetrics: object(
    "Métricas de Product Ads na janela selecionada. Valores monetários em BRL; taxas em pontos percentuais.",
    {
      clicks: count("Cliques."),
      prints: count("Impressões."),
      cost: money("Investimento publicitário."),
      cpc: money("Custo médio por clique."),
      ctr: percent("Taxa de cliques por impressão."),
      acos: percent("Custo publicitário / receita atribuída × 100."),
      sov: percent(
        "Participação de voz informada pela fonte; no agregado o provedor não soma esta taxa."
      ),
      directAmount: money("Receita atribuída diretamente aos cliques."),
      indirectAmount: money("Receita atribuída indiretamente."),
      totalAmount: money("Receita atribuída total."),
      directUnits: count("Unidades atribuídas diretamente."),
      indirectUnits: count("Unidades atribuídas indiretamente."),
      units: count("Unidades atribuídas totais."),
      organicUnits: count("Unidades orgânicas na janela."),
      organicItems: count("Itens orgânicos na janela."),
    }
  ),
  ReadApiAdsDerived: object(
    "Indicadores calculados pelo provedor; divisão sem denominador disponível retorna nulo.",
    {
      roas: ratio("Receita atribuída total / investimento publicitário.", true),
      acos: percent(
        "Investimento / receita atribuída total × 100; nulo sem receita atribuída.",
        true
      ),
      conversionRate: percent(
        "Unidades atribuídas / cliques × 100; nulo sem cliques.",
        true
      ),
      totalBudget: money(
        "Soma dos orçamentos diários das campanhas consideradas."
      ),
      organicShare: percent(
        "Unidades orgânicas / (unidades atribuídas + orgânicas) × 100; nulo sem unidades.",
        true
      ),
    }
  ),
  ReadApiAdsSummary: adsSummary,
  ReadApiAdsCampaign: object(
    "Campanha projetada com métricas; sem configurações internas de conexão.",
    {
      id: count("Identificador público da campanha."),
      name: text("Nome da campanha."),
      status: text("Estado da campanha informado pela fonte."),
      strategy: text("Estratégia da campanha informada pela fonte."),
      acosTarget: percent("Meta de ACOS, quando definida.", true),
      roasTarget: ratio("Meta de ROAS, quando definida.", true),
      budget: money("Orçamento diário da campanha, quando definido.", true),
      automaticBudget: flag("A campanha usa orçamento automático."),
      channel: text("Canal da campanha."),
      dateCreated: instant(
        "Data/hora de criação da campanha, quando disponível.",
        true
      ),
      lastUpdated: instant(
        "Data/hora da última atualização da campanha, quando disponível.",
        true
      ),
      metrics: ref("ReadApiAdsMetrics"),
    }
  ),
  ReadApiAdsAd: object("Anúncio publicitário projetado com métricas.", {
    ...identityProperties,
    campaignId: count("Identificador público da campanha associada."),
    price: money("Preço do anúncio publicitário."),
    status: text("Estado do anúncio publicitário."),
    thumbnail: text("URL da miniatura, quando disponível.", true),
    permalink: text("URL pública do anúncio, quando disponível.", true),
    listingTypeId: text("Tipo de anúncio ML, quando disponível.", true),
    logisticType: text("Modalidade logística, quando disponível.", true),
    buyBoxWinner: flag("O anúncio é vencedor da Buy Box."),
    catalogListing: flag("O anúncio está associado ao catálogo."),
    brand: text("Marca informada pela fonte.", true),
    imageQuality: text("Qualidade da imagem informada pela fonte.", true),
    hasDiscount: flag("O anúncio possui desconto."),
    metrics: ref("ReadApiAdsMetrics"),
  }),
  ReadApiAdsData: object(
    "Painel de publicidade. no_ads_access significa ausência de acesso a Ads, não confirmação de investimento zero; summary é nulo neste caso.",
    {
      connection: {
        ...text("Estado de acesso ao Mercado Ads."),
        enum: ["connected", "no_ads_access"],
      },
      // In OpenAPI 3.0 a $ref sibling `nullable` is ignored. Use a typed inline
      // object so summary:null is valid without unsupported type:[object,null].
      summary: { ...adsSummary, nullable: true },
      topCampaigns: array(
        "Campanhas destacadas pelo investimento; vazio quando não há acesso a Ads.",
        "ReadApiAdsCampaign"
      ),
      topAds: array(
        "Anúncios destacados pelo investimento; vazio quando não há acesso a Ads.",
        "ReadApiAdsAd"
      ),
      insightsCount: count(
        "Quantidade de recomendações calculadas, sem conteúdo interno das recomendações."
      ),
    },
    ["connection", "summary", "topCampaigns", "topAds"]
  ),
  ReadApiProduct: object("Projeção comercial de produto do Projeto.", {
    id: count("Identificador comercial do produto do Projeto."),
    name: text("Nome do produto."),
    description: text("Descrição do produto.", true),
    priority: {
      ...text("Prioridade do produto."),
      enum: ["alta", "media", "baixa"],
    },
    currentStep: {
      ...text("Etapa atual do pipeline."),
      enum: [
        "fornecedor",
        "amostra",
        "aprovacao",
        "embalagem",
        "pedido",
        "producao",
        "inspecao",
        "embarque",
        "chegada",
        "lancamento",
      ],
    },
    supplier: text("Nome comercial do fornecedor.", true),
    notes: text("Observações comerciais.", true),
    imageUrl: text("URL da imagem do produto.", true),
    expectedArrival: instant("Previsão de chegada.", true),
    orderDeadline: instant("Prazo do pedido.", true),
    ...auditDates,
  }),
  ReadApiSkuRow: object(
    "Linha ativa da planilha SKU; valores de preços e medidas são preservados como texto livre.",
    {
      ...sheetProperties,
      mainMlb: text(
        "Código público ML do anúncio principal; pode estar vazio."
      ),
      mainDone: flag("A conclusão do SKU principal está marcada."),
      skuMode: text("Modo registrado de definição do SKU principal."),
    }
  ),
  ReadApiSkuVariation: object("Variação ativa de uma linha SKU ativa.", {
    id: count("Identificador comercial da variação."),
    skuRowId: count("Identificador da linha SKU associada."),
    variationIndex: count("Índice permanente da variação."),
    variationSku: text("SKU comercial da variação."),
    ean: text("EAN/GTIN como texto."),
    mlb: text("Código público do anúncio ML associado."),
    done: flag("A conclusão da variação está marcada."),
    ...auditDates,
  }),
  ReadApiSkuColumn: object(
    "Cabeçalho de coluna personalizada da planilha SKU.",
    {
      id: count("Identificador comercial da coluna."),
      name: text("Texto do cabeçalho."),
      position: count("Posição de exibição da coluna."),
      ...auditDates,
    }
  ),
  ReadApiKitRow: object(
    "Linha de kit: campos do formato SKU e campos comerciais legados preservados.",
    {
      ...sheetProperties,
      kit: text("Nome legado do kit."),
      embalagem: text("Descrição legada da embalagem."),
      profundidade: text(
        "Profundidade legada como texto livre, com unidade preservada."
      ),
      largura: text("Largura legada como texto livre, com unidade preservada."),
      alturaComprimento: text(
        "Altura/comprimento legado como texto livre, com unidade preservada."
      ),
      kg: text("Peso legado em kg como texto livre."),
      categoria: text("Categoria comercial legada."),
      dimensoesGs1: text("Indicador GS1 legado, preservado como texto."),
      baseAjustado: text(
        "Indicador legado de ajuste de base, preservado como texto."
      ),
      mlAjustado: text("Indicador legado de ajuste ML, preservado como texto."),
      formadoPor: text("Composição comercial legada do kit como texto."),
      observacao: text("Observações comerciais do kit.", true),
    }
  ),
  ReadApiPackagingRow: object(
    "Linha de embalagem com preços e medidas preservados como texto livre.",
    {
      id: sheetProperties.id,
      position: sheetProperties.position,
      produto: text("Nome comercial da embalagem."),
      eanGtin: sheetProperties.eanGtin,
      sku: sheetProperties.sku,
      embalagem: text("Descrição da embalagem."),
      ncm: sheetProperties.ncm,
      gpc: sheetProperties.gpc,
      cest: sheetProperties.cest,
      precoClassico: sheetProperties.precoClassico,
      precoPremium: sheetProperties.precoPremium,
      altura: text("Altura como texto livre, preservando a unidade digitada."),
      largura: text(
        "Largura como texto livre, preservando a unidade digitada."
      ),
      comprimento: text(
        "Comprimento como texto livre, preservando a unidade digitada."
      ),
      kg: text("Peso em kg como texto livre."),
      categoria: text("Categoria comercial da embalagem."),
      observacao: text("Observações comerciais.", true),
      rowColor: sheetProperties.rowColor,
      customValues: sheetProperties.customValues,
      ...auditDates,
    }
  ),
  ReadApiDocument: object(
    "Metadados comerciais e URL de documento ou foto do Projeto.",
    {
      id: count("Identificador comercial do documento."),
      productId: count("Identificador do produto do Projeto associado."),
      name: text("Nome do documento."),
      url: text("URL do arquivo; a resposta não contém bytes do arquivo."),
      type: { ...text("Tipo do anexo."), enum: ["documento", "foto"] },
      createdAt: auditDates.createdAt,
    }
  ),
  ReadApiPricingKitItem: object(
    "Componente de kit salvo no catálogo de precificação; apenas campos comerciais permitidos.",
    {
      id: text("Identificador comercial do componente."),
      description: text("Descrição do componente."),
      sku: text("SKU comercial do componente."),
      quantity: count("Quantidade de unidades do componente."),
      unitCost: money("Custo por unidade do componente."),
    }
  ),
  ReadApiPricingInput: object(
    "Entrada salva do catálogo Alpha, sem preencher campos ausentes de rascunhos. Campos não finitos omitidos pela projeção não são convertidos em zero.",
    {
      description: text("Descrição do produto."),
      productSku: text("SKU comercial do produto individual."),
      kitSku: text("SKU comercial do kit."),
      productType: text("Tipo de produto: single ou kit."),
      category: text("Categoria comercial salva."),
      categoryDiscountEligible: flag(
        "Categoria elegível ao desconto de comissão."
      ),
      calculationType: text("Tipo de cálculo salvo: estimated ou real."),
      packagingPreset: text("Identificador comercial do modelo de embalagem."),
      costMode: text("Base do custo de aquisição: unit (unidade) ou kg."),
      cost: money(
        "Custo de aquisição por unidade ou por kg, conforme costMode."
      ),
      productKg: number("Peso de mercadoria por item em kg."),
      itemQuantity: count("Quantidade de itens do produto individual."),
      operation: money("Custo operacional informado."),
      packaging: money("Custo de embalagem informado."),
      promotion: money("Custo de promoção informado."),
      adsMode: text(
        "Base da publicidade: rs (BRL) ou percent (pontos percentuais)."
      ),
      ads: number(
        "Publicidade: valor em reais (BRL) se adsMode=rs; pontos percentuais se adsMode=percent."
      ),
      taxFederal: percent("Alíquota federal."),
      taxPis: percent("Alíquota PIS."),
      taxCofins: percent("Alíquota COFINS."),
      taxIrpj: percent("Alíquota IRPJ."),
      taxCsll: percent("Alíquota CSLL."),
      taxIcms: percent("Alíquota ICMS."),
      useDestinationTaxes: flag("Usar tributação por destino."),
      saleDestination: text("Destino da venda: inside ou outside."),
      taxIcmsInside: percent("ICMS na venda interna."),
      taxIcmsOutside: percent("ICMS na venda interestadual."),
      taxIcmsTransfer: percent("ICMS de transferência."),
      taxDifal: percent("Alíquota DIFAL."),
      difalMode: text("Base do DIFAL: percent ou rs."),
      taxDifalValue: money("Valor fixo de DIFAL quando difalMode=rs."),
      listing: text("Modalidade de anúncio: classic ou premium."),
      classicRate: percent("Comissão do anúncio clássico."),
      premiumRate: percent("Comissão do anúncio premium."),
      price: money("Preço de venda informado."),
      weight: number("Peso de referência em kg."),
      weightInputMode: text("Modo de peso: exact ou band."),
      weightExact: number("Peso exato da embalagem em kg."),
      length: number("Comprimento da embalagem em cm."),
      width: number("Largura da embalagem em cm."),
      height: number("Altura da embalagem em cm."),
      reputation: text("Reputação selecionada para o cálculo."),
      condition: text("Condição do produto selecionada para o cálculo."),
      logistic: text("Modalidade logística selecionada para o cálculo."),
      shippingMode: text("Modo de frete: auto, rapid ou manual."),
      automaticShippingOnly: flag("Usar somente frete automático."),
      manualShipping: money("Frete manual informado."),
      manualFixedFee: money("Tarifa fixa manual."),
      manualFixedLimit: money("Limite de preço da tarifa fixa manual."),
      fullExtra: money("Custo adicional de Full."),
      reservePercent: percent("Reserva sobre o preço de venda."),
      kitItems: array(
        "Componentes comerciais do kit, quando presentes.",
        "ReadApiPricingKitItem"
      ),
    }
  ),
  ReadApiPricingCategoryAnswer: categoryAnswer,
  ReadApiPricingProduct: object(
    "Registro comercial projetado do catálogo Alpha. Datas numéricas vêm da tabela, não dos textos do registro salvo.",
    {
      id: text(
        "Identificador comercial do catálogo Alpha; é textual, não o ID de produto do Projeto."
      ),
      version: count("Versão persistida do registro."),
      createdAt: unixMs("Criação do registro do catálogo."),
      updatedAt: unixMs("Última alteração do registro do catálogo."),
      goal: percent("Margem alvo salva."),
      mode: { ...text("Modo salvo do produto."), enum: ["target", "sale"] },
      status: { ...text("Estado comercial salvo."), enum: ["draft", "ready"] },
      resultPrice: money("Preço calculado salvo; nulo para rascunhos.", true),
      input: ref("ReadApiPricingInput"),
      categoryAnswer: { ...categoryAnswer, nullable: true },
    }
  ),
  ReadApiPricingPdf: object(
    "Metadados e URL de exportação PDF pronta do catálogo Alpha; sem bytes ou campos operacionais de armazenamento.",
    {
      exportId: text("Identificador comercial da exportação."),
      reportId: text("Identificador comercial do relatório."),
      filename: text("Nome do arquivo PDF."),
      description: text("Descrição comercial do produto."),
      sku: text("SKU comercial do produto."),
      projectId: count(
        "Identificador do produto do Projeto associado, quando houver.",
        true
      ),
      documentId: count(
        "Identificador do documento do Projeto associado, quando houver.",
        true
      ),
      byteSize: count("Tamanho do arquivo em bytes."),
      status: {
        ...text("Somente exportações prontas são retornadas."),
        enum: ["ready"],
      },
      url: text("URL do PDF, quando disponível.", true),
      uploadedAt: unixMs(
        "Conclusão do envio do arquivo, quando informada.",
        true
      ),
      createdAt: unixMs("Criação da exportação."),
      updatedAt: unixMs("Última alteração da exportação."),
    }
  ),
};

const dataByPath: Record<string, Schema> = {
  "/": ref("ReadApiIndexData"),
  "/store": ref("ReadApiStoreData"),
  "/listings": ref("ReadApiListingsData"),
  "/visits": ref("ReadApiVisitsData"),
  "/technical-specs": ref("ReadApiTechnicalData"),
  "/sales": ref("ReadApiSalesData"),
  "/ads": ref("ReadApiAdsData"),
  "/products": array(
    "Página de produtos comerciais do Projeto.",
    "ReadApiProduct"
  ),
  "/sku": array("Página de linhas SKU ativas.", "ReadApiSkuRow"),
  "/sku/variations": array(
    "Página de variações SKU ativas.",
    "ReadApiSkuVariation"
  ),
  "/sku/columns": array(
    "Página de cabeçalhos de colunas personalizadas.",
    "ReadApiSkuColumn"
  ),
  "/kits": array("Página de linhas comerciais de kits.", "ReadApiKitRow"),
  "/packaging": array(
    "Página de linhas comerciais de embalagens.",
    "ReadApiPackagingRow"
  ),
  "/documents": array(
    "Página de documentos e fotos do Projeto.",
    "ReadApiDocument"
  ),
  "/pricing/products": array(
    "Página de registros comerciais do catálogo Alpha.",
    "ReadApiPricingProduct"
  ),
  "/pricing/pdfs": array(
    "Página de exportações PDF prontas da conta autorizada.",
    "ReadApiPricingPdf"
  ),
};

/** Schema for the envelope's data property, not an envelope or its metadata. */
export function readApiDataSchema(path: string): unknown {
  if (!Object.prototype.hasOwnProperty.call(dataByPath, path)) {
    throw new Error(`No read API data schema registered for path: ${path}`);
  }
  return dataByPath[path];
}
