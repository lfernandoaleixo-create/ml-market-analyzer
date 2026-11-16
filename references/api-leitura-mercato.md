# Mercato — guia da API de leitura

**Versão da documentação:** 1.3 — 16/11/2026, vendas detalhadas e histórico externo\
**Contrato:** OpenAPI 3.0.3, versão informativa 1.1.0; prefixo `/api/public/v1` preservado\
**Destinatário:** GRUPO FOX

A API permite consultar o Mercato pela internet com uma chave própria e apenas operações de leitura. Não oferece criação, edição ou exclusão de anúncios, campanhas, produtos, SKUs ou documentos. A chave externa não é uma senha do Mercato nem um token Mercado Livre.

**Novidade:** foram implementadas `GET /sales/orders`, com detalhe financeiro por pedido, e `GET /sales/history`, com períodos e produtos agrupados. **Publicação e leitura em produção confirmadas em 16/11/2026, aproximadamente 08:46 BRT.** `GET /sales` conserva o formato anterior. O financeiro exige o novo escopo; a chave atual não foi ampliada automaticamente.

## 1. Endereços e autenticação

**URL base de produção:**

```text
https://mlmarketanl-kcmkt5tl.manus.space/api/public/v1
```

**Contrato OpenAPI público:**

```text
https://mlmarketanl-kcmkt5tl.manus.space/api/public/v1/openapi.json
```

O OpenAPI descreve operações e campos sem revelar dados comerciais ou chaves. As consultas de dados exigem:

```http
Authorization: Bearer SUA_CHAVE_DE_LEITURA
```

A chave não é aceita na URL nem substituída por cookie do aplicativo. A API aceita `GET` e `OPTIONS`; métodos de escrita e `HEAD` são rejeitados. Nunca coloque o segredo em arquivos compartilhados, prints, logs de cabeçalhos ou prompts públicos. Use o cofre de segredos da integração.

`GET /` lista somente os recursos autorizados pela chave. A leitura Mercado Livre verifica a Toujours pelo vendedor **3308178634** antes de utilizar cache; nickname não substitui essa identidade. A API não permite escolher outro vendedor, usuário ou tabela por parâmetro.

## 2. Escopos e a chave atual do Grupo Fox

Em **Configurações → API de leitura**, um administrador escolhe as permissões e a validade ao gerar uma chave. O segredo aparece uma única vez; o banco guarda somente seu hash SHA-256. Não há recuperação da chave completa pela listagem.

- `mercado:read`: `/store`, `/listings`, `/visits`, `/technical-specs`.
- `vendas:read`: `/sales` e **`/sales/history`**.
- **`vendas-detalhe:read`**: **`/sales/orders`** e habilitação do financeiro em `/sales/history`, que também exige `vendas:read`.
- `ads:read`: `/ads`.
- `projeto:read`: `/products`.
- `sku:read`: `/sku`, `/sku/variations`, `/sku/columns`, `/kits`, `/packaging`.
- `documentos:read`: `/documents`.
- `calculadora:read`: `/pricing/products`, `/pricing/pdfs`.

**A chave atual não recebe o escopo novo automaticamente.** Para ler o detalhe financeiro, gere outra chave com `vendas-detalhe:read`, conservando as demais permissões necessárias, e atualize o segredo no servidor Node do Grupo Fox. Teste a substituição e só então revogue a chave antiga. Esta implementação não revoga, modifica ou entrega outra chave automaticamente.

A chave antiga continua atendendo aos recursos anteriores e pode consultar o histórico comercial se possuir `vendas:read`. Sem o escopo novo, o histórico não consulta pagamentos nem expõe valores financeiros de relatórios importados: esses campos ficam `null`, com motivo explícito. Acrescentar `includeFinancial` à URL não concede permissão; parâmetros não registrados são rejeitados.

A gestão de chaves exige sessão de administrador do aplicativo. Uma chave externa não gera chaves, não altera escopos e não autoriza salvar custos ou importar relatórios. Revogação impede consultas futuras, mas não apaga dados que a integração já tenha copiado.

## 3. Recursos antigos preservados

`GET /sales` continua sendo o resumo agregado existente, com `summary`, `daily` e `topProducts`. Não foi substituído pelo detalhe por pedido e não ganhou os parâmetros `from`, `to` ou os campos das rotas novas. Os filtros antigos continuam próprios de cada recurso; não envie parâmetros das rotas novas a `/sales`.

`/store` informa identidade/reputação; `/listings` apresenta anúncios; `/visits` retorna visitas diárias; `/technical-specs` apresenta fichas técnicas. `/ads` não modifica campanhas. `/products` expõe informações comerciais do Projeto. `/sku` e suas variações leem valores persistidos, sem recalcular ou renumerar; tombstones e reservas internas não são publicados. `/documents` oferece metadados e links, não transcrição de arquivos. Os recursos da calculadora são limitados ao catálogo/PDF da conta principal autorizada.

O prefixo, o Bearer, o envelope e os limites de consumo permanecem iguais. Não foram criadas rotas alternativas `/orders`, `/margin` ou `/sales/margin`. Consulte os nomes efetivamente presentes no OpenAPI.

## 4. Parâmetros das duas rotas novas

`limit`: 1 a 100, padrão 50. `offset`: 0 a 100.000, padrão zero. A paginação ocorre **depois dos filtros e da agregação**. Consulte páginas seguintes enquanto `meta.hasMore=true`, usando `offset + limit`. Esse indicador percorre os registros coletados; não remove um corte sinalizado por `capped`.

`from` e `to`: dias `YYYY-MM-DD`, fornecidos juntos, inclusivos em **America/Sao_Paulo**, com `to` até o dia atual. Datas impossíveis, invertidas, anteriores a 1970 e janelas acima de **366 dias civis** são rejeitadas. Sem o par, `days` aceita 7, 30 ou 90, padrão 30, terminando hoje. Com o par, `days` não define outra janela.

`itemId`: código MLB exato. `sku`: texto exato, até 200 caracteres, preservando espaços. Se os dois forem enviados, precisam corresponder ao mesmo item do pedido, não a itens diferentes. O filtro não altera anúncios ou a planilha.

`/sales/orders` também aceita `status`, normalizado: `paid`, `cancelled`, `refunded`, `partially_refunded`, `in_mediation`, `confirmed`, `payment_required`, `payment_in_process`, `partially_paid`, `invalid` ou `pending`.

`/sales/history` aceita `granularity=hour|day|week|month`, padrão `day`, e `groupBy=item|sku|none`, padrão `none`. Sem filtro e com `groupBy=none`, reúne os produtos por período; `item` separa MLBs e `sku` reúne o texto exato do SKU. Semana começa na segunda-feira e termina no domingo. Datas de período são ISO UTC, mas seus limites seguem o calendário de Brasília, incluindo regras históricas de horário de verão.

**Limite financeiro do histórico:** com ambos os escopos, a consulta automática dos pagamentos ocorre em janelas de até **31 dias**. Acima disso, o histórico busca pedidos e retorna financeiro `null`, também para fotografias importadas, com aviso. Para histórico financeiro longo, divida a consulta em blocos de até 31 dias e verifique cada cobertura antes de agregá-los. Não some períodos parcialmente sobrepostos.

## 5. GET /sales/orders: uma fotografia financeira por pedido

A rota exige `vendas-detalhe:read`. Retorna uma linha por **orderId ML verificado**, com objetos explicitamente projetados, sem cadastro de comprador, pagador, endereço, documento, telefone, e-mail ou apelido.

### Identificação e datas

`orderId` é o pedido ML, como string, não um paymentId ou packId presumido. `packId` e `paymentIds` são referências informadas pela fonte; lista de pagamentos ausente permanece `null`, diferente de um array vazio explícito. `createdAt` é a data/hora real de criação da venda; `saleDay` é seu dia em Brasília; `paidAt` é aprovação confirmada, quando recebida. Horário ausente não é inventado como meia-noite.

`status` expressa o estado normalizado, incluindo estornos; `rawStatus` conserva o estado do pedido. `financiallyComplete` indica bruto/líquido confirmados na fotografia; não significa que todos os custos empresariais estejam preenchidos. `financialStatus` é `confirmed`, `pending` ou `refund_pending`. Operações incompletas, pagamentos parciais, estornos em aberto e contestações não ganham líquido zero ou liquidação presumida.

### Itens e frete

Cada `items[]` contém `itemId`, `variationId`, `sku`, `skuSource`, `title`, `quantity`, `unitPrice` e `listingType`. São dados recebidos, não preço atual estimado do anúncio. `variationId` não é o índice local de variação da planilha. Quantidade/preço ausentes permanecem `null`.

O SKU exato da planilha tem preferência quando o vínculo é inequívoco. SKU repetido manualmente é preservado e pode reunir produtos distintos. Se um MLB apontar a vários SKUs sem correspondência exata, a API conserva o original, marca `skuSource=ambiguous` e avisa; não escolhe por título nem reescreve a planilha. Não consulta tabelas internas de reservas para gerar números.

`shipping.logisticType` é modalidade recebida, por exemplo `fulfillment`, `cross_docking` ou outra modalidade informada. `shipping.payer` é `buyer`, `seller`, `both` ou `null`, somente quando evidência explícita de custos confirma quem pagou. Não é inferido pelo simples fato de existir cobrança de envio.

### Bruto, líquido e cobranças

`gross` é o bruto da operação financeira confirmada, que pode diferir da soma dos itens. `net` é o líquido informado pelo Mercado Pago, **não lucro**. `deductions = gross − net`; essa diferença não identifica sozinha impostos.

`charges[]` conserva detalhes válidos de `charges_details` atribuídos ao vendedor: `key`, `label` original, `category` e `amount` em reais após a devolução informada. Categorias de apresentação: `sale`, `processing`, `shipping`, `financing`, `tax`, `other`. A classificação pelo nome/tipo não é classificação fiscal certificada.

`saleFee`, `processingFee`, `shippingCost`, `financingFee` e `otherCharges` totalizam categorias somente quando sua lista está confirmada. Ausência não vira zero. Se faltarem valores ou detalhes de um pagamento, a lista pode conservar o que foi recebido, mas o subtotal não é apresentado como total de categoria. O líquido confirmado permanece válido, com pendência explícita dos detalhes.

`chargesExplainDeductions` é `true` ou `false` quando a lista confirmada fecha, ou não, com as deduções, usando tolerância de um centavo. É `null` quando falta detalhe suficiente. Array `charges=[]` não comprova venda sem tarifas.

`taxesWithheld` é o total de impostos retidos explicitamente informado, `null` quando não recebido. Zero informado significa zero retido nessa fonte, não isenção ou ausência de tributos empresariais. `taxDetail` e `taxesDisaggregated`, quando recebidos em estrutura reconhecida, projetam apenas `type`, `amount` e `description`; JSON arbitrário e metadados de compradores são excluídos. Textos/operações fiscais não reconhecidos continuam `null`.

`source` identifica `automatic` ou `imported_report`. `asOf` é o instante da fotografia financeira registrada, não a geração da resposta. `pendingReason` informa pendências sem payloads privados.

## 6. GET /sales/history: períodos e produtos

A rota exige `vendas:read`. Cada linha contém `period`, `itemId`, `sku`, `title`, `orders`, `unitsSold`, `revenue`, `cancelled`, `cancelledAmount` e, quando autorizados/confirmados, `net` e os totais financeiros.

`orders` conta pedidos pagos distintos dentro do grupo/período. Várias variações do mesmo pedido não contam como pedidos adicionais no mesmo grupo. `unitsSold` soma quantidades confirmadas. `revenue` é o bruto dos itens pagos, calculado por **quantidade × preço unitário**, não pelo rateio de `gross`, frete ou descontos gerais.

Um pedido originalmente pago que depois recebe estorno parcial não desaparece como 0 pedidos/0 unidades/0 faturamento apenas porque a coleta financeira normalizou seu estado. As métricas comerciais usam a evidência original de pagamento; o líquido e o estado de estorno continuam sujeitos à confirmação. `cancelled` e `cancelledAmount` são informações dos cancelamentos visíveis e não acrescentam faturamento.

**Sem rateio financeiro:** líquido e tarifas só são atribuídos quando o pedido inteiro pertence a um grupo identificável. Se um pedido contiver vários MLBs ou SKUs em grupos diferentes, ou o filtro selecionar só parte dos itens, o financeiro dos grupos permanece `null`; o motivo aparece em `financialAllocationReasons`. `groupBy=none` sem filtro parcial permite totalizar pedidos inteiros. Valores com identidade ou cobertura desconhecida não viram totais definitivos.

Agrupar por SKU não transforma SKU reutilizado em identidade única de produto; contagens por grupos não devem ser somadas como total único de pedidos, pois um pedido pode aparecer em grupos diferentes. Um título não inequívoco permanece `null`.

Só são emitidos períodos observados. Horas/dias sem registro confirmado não são preenchidos por zeros. Registros sem horário suficiente não entram no gráfico horário. Uma falha apenas no pagamento não apaga unidades e faturamento conhecidos; `ordersPartial` distingue enumeração incompleta de detalhe financeiro pendente.

## 7. Cobertura, histórico e metadados

Cada resposta HTTP contém `{ data, meta }`. `meta.version` continua `"1"`, `readOnly=true`, `generatedAt` em ISO UTC e `requestId`, igual ao cabeçalho `X-Request-ID` nas rotas novas. `generatedAt` não substitui `asOf`.

`partial` indica pendência ou cobertura incompleta; não significa que cada campo seja desconhecido. `ordersPartial` informa corte/falha da enumeração comercial. `financePartial` indica valores financeiros sem total confirmado. Um payload pode ter `coverage.complete=true` para pedidos e `partial=true` porque faltam tarifas discriminadas. Verifique também os valores `null` e os motivos.

`stale=true` identifica um resultado anterior após falha de atualização; confira `asOf`. `capped=true` identifica teto de coleta. Cache das rotas novas dura até **dois minutos**; fallback anterior é limitado a **seis horas**, sempre com aviso e sem ignorar divergência da loja. Identidade é conferida antes de hits de cache.

`dataStart` é o primeiro dia observado nas buscas globais de pedidos visíveis e/ou fotografias disponíveis. `dataStartConfirmed` distingue confirmação da busca global de mera observação na janela. Não é data de criação da conta nem garantia de histórico desde o início. `beforeDataStart=true` e `partial=true` avisam quando a janela começa antes do primeiro pedido visível confirmado.

`coverageFrom`, `coverageTo` e `coverage.complete` descrevem enumeração comprovada da janela. `availableHistory.from/to` são extremos observados; `continuous=false` avisa que extremos de um relatório esparso não comprovam continuidade. `coverageScope` limita a afirmação aos pedidos visíveis ao vendedor, não à vida inteira da conta. `emptyPeriodsReason` e `sparseEmptyPeriodsReason` explicam períodos omitidos.

A documentação oficial informa retenção atual de pedidos de até **doze meses**, com limitações de cancelamentos nas buscas do vendedor. Isso não garante visibilidade de todos os eventos ou pedidos antigos. O Mercato consulta também cancelamentos explicitamente, mas não contorna pedidos ocultos. **Não existe um novo arquivo permanente ou automação de arquivamento de todos os pedidos nesta entrega.** [3]

Tetos das rotas novas: **1.000 pedidos** na coleta financeira e **10.000 pedidos** na coleta comercial de histórico, com até **80 segundos** por coleta, até **12 segundos** por chamada e concorrência interna limitada. A leitura de fotografias usa até **1.000 relatórios** existentes. Limites, rate limit da fonte ou interrupção podem deixar a janela parcial; paginação HTTP não estende esses tetos. Consulte janelas menores se necessário.

`financePartialKnown` contém somente subtotais conhecidos e atribuíveis, não o total completo. Não some esse bloco ao financeiro das linhas: eles podem representar o mesmo dinheiro. Outros metadados incluem `financialRequested`, `financialScopeMissing`, `financialWindowMaxDays=31`, `ordersObserved`, `excludedUnknownDates`, `unallocatedOrders`, `reportCount`, `reportLimit`, `unverifiedImportedReferences` e `warnings`.

## 8. Relatórios importados e discriminação fiscal

As novas rotas reutilizam fotografias já guardadas em `sales_margin_reports`, sem importar arquivos pela API externa. A fotografia financeira importada mais recente substitui a anterior por operação; relatórios sobrepostos não são somados. Dados reais não financeiros de um pedido ML verificado são preservados. Um relatório anterior a estorno/cancelamento/disputa posterior observado não confirma o líquido atual.

O armazenamento existente não conserva toda a proveniência `ORDER_ID/EXTERNAL_REFERENCE`. Portanto, uma referência importada só aparece em `/sales/orders` quando coincide com **orderId efetivamente verificado** na coleta automática. Formato numérico, packId ou paymentId não provam esse vínculo. Referências sem prova são omitidas, com `unverifiedImportedReferences` e aviso. No histórico podem sustentar datas/itens observados, mas não contagem de pedidos pagos/cancelados ou financeiro deduplicado.

A data do upload não vira data da venda. Fotografias importadas não se atualizam sozinhas. O relatório Por venda e o relatório Por liberação têm objetivos/datas distintos; não se considera uma linha isolada automaticamente o resultado final. [4]

O importador atual conserva `TAXES_AMOUNT` quando completo, mas não interpreta `TAX_DETAIL`, `TAXES_DISAGGREGATED` ou detalhes individuais de tarifas do arquivo como cobranças nativas. A linha consolidada derivada de bruto menos líquido não aparece como `charges_details` original na API nova. Os detalhes tributários novos vêm somente de estrutura reconhecida recebida na consulta de pagamento. A existência de campos na documentação Mercado Pago não garante seu preenchimento pela Toujours. [5]

Não há campos fixos ou cálculo automático completo de II, IPI, ICMS, PIS ou COFINS. Categorias de tarifas e imposto retido não são toda a tributação da empresa. Nunca estime tributo ausente nem transforme toda a diferença bruto/líquido em imposto.

## 9. Exemplo fictício de /sales/orders

**Todos os IDs, produto, datas de fotografia e valores abaixo são didáticos, não um pedido real da Toujours.** Campos opcionais de meta foram reduzidos para legibilidade; schemas completos estão no OpenAPI.

```json
{
  "data": [{
    "orderId": "2000000000000001",
    "packId": null,
    "paymentIds": ["100000000001"],
    "createdAt": "2026-11-11T15:00:00.000Z",
    "saleDay": "2026-11-11",
    "paidAt": "2026-11-11T15:01:00.000Z",
    "status": "paid",
    "rawStatus": "paid",
    "financiallyComplete": true,
    "financialStatus": "confirmed",
    "items": [{
      "itemId": "MLB1234567890",
      "variationId": null,
      "sku": "EXEMPLO-01",
      "skuSource": "sheet",
      "title": "Produto de exemplo",
      "quantity": 2,
      "unitPrice": 100,
      "listingType": "gold_special"
    }],
    "shipping": {"logisticType": "cross_docking", "payer": "seller"},
    "gross": 200,
    "net": 144,
    "deductions": 56,
    "charges": [
      {"key":"fee-1","label":"ml_sale_fee","category":"sale","amount":26},
      {"key":"fee-2","label":"mp_processing_fee","category":"processing","amount":2},
      {"key":"fee-3","label":"shp_cross_docking","category":"shipping","amount":20},
      {"key":"tax-1","label":"tax_exemplo","category":"tax","amount":8}
    ],
    "saleFee": 26,
    "processingFee": 2,
    "shippingCost": 20,
    "financingFee": null,
    "otherCharges": null,
    "taxesWithheld": 8,
    "taxDetail": [{"type":"EXEMPLO","amount":8,"description":"Retenção didática"}],
    "taxesDisaggregated": null,
    "chargesExplainDeductions": true,
    "source": "automatic",
    "asOf": "2026-11-16T11:00:00.000Z",
    "pendingReason": null
  }],
  "meta": {
    "version":"1", "readOnly":true,
    "generatedAt":"2026-11-16T11:01:00.000Z", "requestId":"exemplo-pedido",
    "asOf":"2026-11-16T11:00:00.000Z", "partial":true,
    "stale":false, "capped":false, "ordersPartial":false,
    "currency":"BRL", "timezone":"America/Sao_Paulo",
    "from":"2026-11-11", "to":"2026-11-11",
    "limit":50, "offset":0, "hasMore":false,
    "financePartial":true,
    "warnings":["Algumas categorias financeiras não foram informadas."]
  }
}
```

`partial=true` no exemplo não desfaz bruto/líquido confirmados: tarifas de categorias não informadas continuam `null`.

## 10. Exemplo fictício de /sales/history

Exemplo correspondente, `granularity=day`, `groupBy=none`, com ambos os escopos e janela financeira curta. Não representa contagem ou fotografia real.

```json
{
  "data": [{
    "period":"2026-11-11T03:00:00.000Z",
    "itemId":null, "sku":null, "title":null,
    "orders":1, "unitsSold":2, "revenue":200,
    "cancelled":0, "cancelledAmount":0,
    "net":144, "saleFee":26, "processingFee":2,
    "shippingCost":20, "financingFee":null,
    "otherCharges":null, "taxesWithheld":8
  }],
  "meta": {
    "version":"1", "readOnly":true,
    "generatedAt":"2026-11-16T11:01:00.000Z", "requestId":"exemplo-historico",
    "asOf":"2026-11-16T11:00:00.000Z",
    "partial":true, "stale":false, "capped":false,
    "ordersPartial":false, "financePartial":true,
    "timezone":"America/Sao_Paulo", "currency":"BRL",
    "granularity":"day", "groupBy":"none",
    "from":"2026-11-11", "to":"2026-11-11",
    "financialScopeMissing":false, "financialRequested":true,
    "financialWindowMaxDays":31,
    "limit":50, "offset":0, "hasMore":false,
    "warnings":["Algumas categorias financeiras não foram informadas."]
  }
}
```

Se a chave tiver apenas `vendas:read`, as métricas comerciais podem continuar conhecidas, mas `net` e tarifas ficam `null`, com `financialScopeMissing=true`. Não substitua esses nulos por zero no servidor Node ou nos gráficos.

## 11. Consultas no servidor Node do Grupo Fox

Configure `MERCATO_READ_KEY` no ambiente privado. Node com `fetch` nativo pode fazer uma requisição por vez e percorrer as páginas. Não registre o segredo.

```javascript
const base = "https://mlmarketanl-kcmkt5tl.manus.space/api/public/v1";
const key = process.env.MERCATO_READ_KEY;
if (!key) throw new Error("Configure a chave no cofre do servidor");
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function readPage(path, params) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const url = new URL(base + path);
    for (const [name, value] of Object.entries(params))
      url.searchParams.set(name, String(value));
    const response = await fetch(url, {
      headers: { Authorization: "Bearer " + key, Accept: "application/json" },
      signal: AbortSignal.timeout(180000)
    });
    if (response.status === 429 && attempt < 3) {
      const seconds = Number(response.headers.get("Retry-After")) || 5;
      await wait(Math.max(1, seconds) * 1000);
      continue;
    }
    if (!response.ok) throw new Error("Consulta não confirmada. HTTP " + response.status);
    return response.json();
  }
}

async function* pages(path, params) {
  let offset = 0;
  while (true) {
    const payload = await readPage(path, { ...params, limit: 100, offset });
    // Processar meta antes de assumir que os campos são totais confirmados.
    yield payload;
    if (!payload.meta.hasMore) break;
    offset += 100;
    await wait(1100); // não ultrapassar a cota em uma varredura sequencial
  }
}

// Exemplo: detalhe de uma janela, sem expor o segredo.
for await (const payload of pages("/sales/orders", {
  from: "2026-11-01", to: "2026-11-15"
})) {
  console.log({ requestId: payload.meta.requestId,
    partial: payload.meta.partial, count: payload.data.length });
  // Armazenar/analisar apenas conforme a política de dados do Grupo Fox.
}
```

Para gráficos use `/sales/history` e acrescente `granularity` e `groupBy`. Para conferir identidade use `/store` e para descoberta use `/`. Exemplos de query:

```text
/sales/orders?from=2026-11-01&to=2026-11-15&limit=100&offset=0
/sales/orders?days=7&sku=EXEMPLO-01&status=paid
/sales/history?from=2026-01-01&to=2026-11-15&granularity=month&groupBy=item
/sales/history?from=2026-11-01&to=2026-11-15&granularity=day&groupBy=none
```

O primeiro exemplo de histórico longo pede somente a cobertura disponível; não prova dados de janeiro nem financeiro anual. Espaços e caracteres do SKU devem ser codificados por `URLSearchParams`, não removidos. A data atual continua em andamento.

## 12. Margem de lucro: uso correto do detalhamento

As rotas novas entregam valores financeiros e ajudam a explicar os descontos, mas **não oferecem um campo de lucro final nem custos presumidos**. A aba interna **Vendas → Margem por pedido** continua com a edição explícita dos custos; a chave externa não autoriza seus procedimentos `refresh`, `previewReport`, `importReport` ou `saveCost`.

As fórmulas da aba são: **percentual restante = net ÷ gross × 100**; **resultado após custos = net − custo total dos produtos do pedido − despesas extras**; **margem após custos = resultado ÷ gross × 100**. Não calcule percentuais com bruto não positivo nem faça média simples dos percentuais dos pedidos para a margem agregada.

Taxas e impostos já refletidos em `net` não são subtraídos outra vez. `charges` e `taxesWithheld` explicam valores, não novas parcelas de desconto. Custo é total dos produtos do pedido, não unitário presumido. Tributos fora da plataforma, embalagem, ADS, Full e despesas em faturas separadas só entram se ainda não tiverem sido considerados no líquido/custo. A soma das cobranças pode não explicar o líquido; não invente uma taxa para fechar a diferença.

No exemplo fictício, bruto R$ 200 e líquido R$ 144 deixam 72% antes dos custos. Com custo total R$ 60 e despesas extras R$ 4, o resultado é R$ 80 e a margem 40%. O imposto retido R$ 8 já foi considerado no líquido. Se faltarem custos ou tributos fora da plataforma, isso não é lucro contábil completo.

Mercadorias importadas exigem custo efetivo e tributos/benefícios realmente aplicáveis, inclusive eventual TTS conforme a apuração da empresa. Não existe alíquota genérica automática, simulação de II/IPI/ICMS/PIS/COFINS ou cálculo integral de benefício fiscal. Sem custos conhecidos, resultado e margem não devem ser declarados confirmados.

## 13. Limites, erros e arquitetura

Permanecem **60 requisições por minuto por chave** e **duas consultas de dados simultâneas por chave**, por instância. Memória de limites reinicia com a instância e não é cota distribuída global. Respeite `Retry-After`; evite tentativas paralelas contínuas.

HTTP **400**: parâmetros inválidos; **401**: chave ausente/inválida/expirada/revogada; **403**: falta escopo ou loja divergente; **404**: rota não registrada; **405**: método rejeitado; **429**: excesso de consumo/concorrência; **502/503**: fonte/serviço indisponíveis. Use `requestId` para relatar falhas, nunca a chave.

A entrada Express continua isolada em `server/readApi/http.ts`. Contratos e escopos ficam em `shared/readApi.ts` e `shared/publicSales.ts`; consulta, calendário IANA, disponibilidade, relatórios e projeção SKU ficam em módulos `publicSales*`. O OpenAPI descreve schemas por recurso. As consultas aplicam whitelists inclusive nos objetos aninhados e não oferecem SQL, tabelas arbitrárias ou payloads brutos.

O adapter de pagamentos reutiliza o coletor da aba de margem e seus valores autoritativos, acrescentando metadados seguros para a leitura externa. Não substitui o motor de preços, a lógica da planilha, o OAuth ou os contratos antigos. A extensão não cria tabela, migração ou automação de arquivamento. A gestão de chave permanece na tabela de hashes existente; o backup de relatórios/custos já possui as abas próprias da margem.

Rotas tRPC legadas exigem sessão do Mercato. Uma chave externa não vira login nem acesso a mutations. As projeções públicas não incluem identidade interna de usuário, credenciais, token OAuth, Client Secret ou dados pessoais de compradores. Isso é evidência de controles implementados, não garantia de invulnerabilidade ou teste de invasão completo. A segurança também exige proteção do administrador e do segredo na integração. [1][2]

## 14. Validação e estado de publicação

Na leitura real de **16/11/2026, aproximadamente 08:20 BRT**, para **11/11/2026**, a Toujours retornou **15 pedidos financeiramente confirmados**, bruto **R$ 2.070,61**, líquido **R$ 1.488,97** e **16 unidades** no histórico diário. A comparação com a aba de margem não encontrou divergência de bruto/líquido por pedido. Esses valores são uma fotografia datada, não métricas fixas ou uma consulta atual de produção.

A busca global confirmou o primeiro pedido visível em **11/04/2026**. Isso não prova a criação da conta ou disponibilidade contínua anterior. A janela de 11/11 teve enumeração comercial completa e sem corte, mas **partial=true** porque detalhes de algumas cobranças não tinham total confirmado. A API conservou o líquido recebido e manteve as categorias afetadas nulas, em vez de publicar subtotais como totais.

O código passou por testes de autenticação/escopos, parâmetros, paginação, estados parcial/anterior, calendário, SKUs, estornos, pagamentos incompletos, projeção sem compradores e coerência de OpenAPI. A contagem final e a auditoria de preservação ficam no registro de release do projeto. Os testes e a prévia não comprovam que as rotas foram publicadas.

**Produção confirmada em 16/11/2026, aproximadamente 08:46 BRT:** o domínio oficial retornou OpenAPI **1.1.0**, o índice autenticado listou as rotas com os escopos previstos e uma página de cada rota nova retornou **HTTP 200**, com `requestId` correspondente ao cabeçalho e `asOf` ISO UTC. `GET /sales?days=7` retornou HTTP 200 mantendo `summary`, `daily` e `topProducts`. Sem escopo financeiro, o detalhe retornou HTTP 403 e o histórico ocultou o financeiro; sem chave houve HTTP 401; `/margin` continuou inexistente, HTTP 404.

A validação de produção utilizou duas chaves exclusivamente temporárias, ambas revogadas ao terminar, sem alterar a chave atual do Grupo Fox. **Para ativar a leitura financeira no servidor Node, um administrador deve gerar uma chave com `vendas-detalhe:read`, conservar os demais escopos necessários e atualizar seu segredo após testar a troca.** A publicação não concede esse escopo a uma chave antiga. Esta revisão documental não muda código ou exige uma nova publicação funcional.

## Referências oficiais

1. [OpenAPI Initiative — Describing API Security](https://learn.openapis.org/specification/security.html). Autenticação HTTP Bearer e requisitos de segurança.
2. [OWASP — REST Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html). Controle por endpoint, HTTPS, chaves fora da URL e limites.
3. [Mercado Libre Developers — Manage sales](https://developers.mercadolibre.com.ni/en_us/custom-shipping/manage-sales). Filtros de pedidos, ordenação, retenção atual e limitações das buscas do vendedor.
4. [Mercado Livre — Conciliação por venda e liberação](https://vendedores.mercadolivre.com.br/aprender/nota/como-conciliar-usando-os-relatorios-de-venda-e-liberacao-de-dinheiro). Datas, eventos e conferência de cobranças.
5. [Mercado Pago — Campos do relatório dinheiro em conta](https://www.mercadopago.com.br/developers/pt/docs/reports/account-money/report-fields). FEE_AMOUNT, TAXES_AMOUNT, TAX_DETAIL e TAXES_DISAGGREGATED; disponibilidade na fonte não implica leitura integral do importador.
