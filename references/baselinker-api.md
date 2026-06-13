# BaseLinker API — Estudo para integração (lucro real)

## Autenticação
- Endpoint único (POST): `https://api.baselinker.com/connector.php`
- Header recomendado: `X-BLToken: <token>` (o param `token` no body está DEPRECATED)
- Body POST: `method=<nome>` + `parameters=<JSON>` (form-urlencoded)
- Token gerado pelo usuário em: BaseLinker → Conta e outros → Minha conta → API
- Limite: **100 requisições/minuto**. Encoding UTF-8.
- Resposta JSON: `status` = `SUCCESS` | `ERROR` (com `error_message`, `error_code`).

## O que resolve nosso problema (lucro real)

### 1. Custo do produto (CMV) — `getInventoryProductsData`
Campos por produto que importam para margem:
- `average_cost` (float) — **custo médio** na moeda principal da conta.
- `average_landed_cost` (float) — custo médio "posto" (com frete de compra/importação).
- `suppliers[].cost` — preço de compra por fornecedor.
- `stock_erp_units[].purchase_cost` — custo de compra por unidade ERP (lote).
- `tax_rate` (float) — alíquota de imposto do produto (0–100; valores especiais p/ isento etc.).
- `sku`, `ean`, `prices` (preços por grupo), `stock` por armazém.
Fluxo: `getInventories` (lista catálogos) → `getInventoryProductsList` (IDs) → `getInventoryProductsData` (detalhe com custo).

### 2. Pedidos e taxas — `getOrders`
- `getOrders` traz pedidos confirmados (paginação por `date_confirmed_from`, 100 por vez).
- Campo financeiro chave: `commission` (quando `with_commission=true`) → `{ net, gross, currency }` = **comissão que o marketplace cobra pelo pedido** (a tarifa do ML!).
- `delivery_price` (float) — preço de entrega (frete) bruto.
- `payment_done` — valor pago.
- `products[]`: `price_brutto` (preço unitário bruto), `tax_rate` (alíquota VAT do item), `quantity`, `sku`, `ean`, `auction_id` (ID do anúncio ML/Allegro/eBay!), `storage`/`product_id` (liga ao catálogo p/ buscar custo).
- `order_source` = "marketplace_code" (ex.: campo do ML); permite filtrar só Mercado Livre.
- `auction_id` no produto = **liga o pedido ao anúncio (MLB...)** → permite lucro por anúncio.

### 3. Documentos/compras (custo de aquisição histórico) — opcionais
- `getInventoryPurchaseOrders` / `getInventoryPurchaseOrderItems` — ordens de compra.
- `getInventoryDocuments` / `getInventoryDocumentItems` — documentos de estoque.

## Como montamos o LUCRO REAL (composição)
Por venda (pedido):
  Receita = soma(price_brutto * quantity)
  (-) Comissão marketplace = order.commission.gross   [API BL — automático]
  (-) Frete vendedor = delivery_price subsidiado       [API BL/ML]
  (-) CMV = soma(average_cost * quantity)               [API BL — automático]
  (-) Imposto = Receita * (tax_rate/100) OU alíquota do regime   [API BL ou config]
  (-) Ads (rateio por anúncio)                          [API ML Ads — já temos]
  = Margem de contribuição / Lucro líquido

Por anúncio (MLB):
  Agrupar pedidos por `auction_id` == itemId do ML; somar componentes acima.
  Cruza direto com a aba Anúncios atual (mesmo itemId).

## Pontos de atenção
- Conta BaseLinker pode ter sistema de custo "AVCO" (custo médio) — nesse caso `average_cost` é a fonte; `stock_erp_units` só existe para sistemas != AVCO.
- 100 req/min: sincronização deve ser em lote, com paginação e cache (snapshot diário, igual ao que já fazemos).
- Token é credencial sensível → guardar como secret/criptografado por usuário; nunca expor no frontend.
- BaseLinker é REST simples (POST form) → roda 100% em Node no nosso runtime, sem dependências externas. Compatível com deploy atual.
- Moeda: assumir BRL (conta BR). Confirmar moeda principal da conta.

## Próximos passos
1. Obter o token de API do usuário (com segurança) e descobrir o `inventory_id`.
2. Testar `getInventories`, `getInventoryProductsList/Data` e `getOrders(with_commission=true)` reais.
3. Modelar persistência (custos por SKU/itemId, snapshots de pedidos) e o cálculo de lucro.
4. Construir a aba "Lucratividade Real" cruzando com a aba Anúncios (por MLB).


---

## VALIDAÇÃO REAL — conta GRUPO FOX (13/06/2026)

Token "Mercato" criado, guardado como secret `BASELINKER_API_TOKEN`. Chamadas reais OK.

### Catálogo
- `getInventories` → 1 catálogo: **GRUPO FOX**, `inventory_id=54206`, idioma br, BRL.
- Grupos de preço: 54632 (default), 55676. Armazém: bl_62114.
- `getInventoryProductsList` → **34 produtos**.

### Produtos (custo CONFIRMADO preenchido)
- 97750437 Palito de Dente 1.000un — sku PADENTE1A1MIL — **average_cost 3.70**, supplier cost 2.97, preço 14,90/18.
- 98676065 Palito bambu unha 100un — sku PAUNHA-2P-125CM-100UN — average_cost 1.06.
- 98676198 Palito bambu unha 500un — sku PAUNHA-2P-125CM-500UN — average_cost 5.30, preço 29,90.
- OBS: `tax_rate` = 0 nos produtos (imposto NÃO cadastrado no produto) → alíquota virá da config de regime tributário do usuário (Simples), não do produto.
- `average_landed_cost` = 0 (não usam landed cost) → usar `average_cost`.

### Pedidos (comissão ML CONFIRMADA)
- `getOrders(date_confirmed_from, with_commission=true)` → 31 pedidos em 30 dias, **100% fonte `melibr`** (Mercado Livre BR), order_source_id 35869.
- Campos por pedido: `currency` BRL, `payment_done`, `delivery_price` (frete), `commission {net,gross,currency}` = **tarifa ML já calculada**.
  - Ex.: order 35606081 → payment_done 360,30 | commission 109,42 | delivery_price 0.
  - Ex.: order 35797543 → payment_done 138,89 | delivery 73,99 | commission 23,21.
- Produtos do pedido trazem `sku`, `auction_id` (= MLB do anúncio), `price_brutto`, `quantity`, `tax_rate`.
  - `auction_id` às vezes vem como `MLB6728481906_194260273300` (item + variação) → normalizar pegando o prefixo MLBxx...
  - `auction_id` puro (ex.: MLB6711834666) cruza direto com itemId da aba Anúncios.

### Veredito da composição do lucro (com dados reais)
Por pedido (melibr):
  Receita = soma(price_brutto*qty)
  - Comissão ML = commission.gross               ✅ BaseLinker
  - Frete vendedor = delivery_price               ✅ BaseLinker (quando subsidiado)
  - CMV = soma(average_cost*qty por sku/product)  ✅ BaseLinker
  - Imposto = Receita * alíquota_config           ⚙️ config do regime (tax_rate do produto=0)
  - Ads rateado por anúncio                        ✅ API ML Ads (já temos)
  = Lucro líquido por pedido e, agrupando por auction_id→MLB, por anúncio.

### Conclusão
TODOS os componentes essenciais estão disponíveis e preenchidos. Falta apenas:
1. Definir a alíquota de imposto (config única do regime tributário).
2. Mapear sku/product_id ↔ itemId(MLB) via auction_id dos pedidos (automático).
