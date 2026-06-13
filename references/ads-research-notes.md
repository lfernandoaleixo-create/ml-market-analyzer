# Notas de Pesquisa — Módulo de Mercado Ads (Product Ads)

## Objetivo
Avaliar se conseguimos criar um módulo de gestão de Ads na conta ML do usuário,
melhor que a Mamba, e entregar documento de decisão.

## Perguntas-chave
1. A API oficial de Mercado Ads permite: criar campanha? editar lance? pausar? ler métricas (ACOS, ROAS, cliques, impressões, CPC)?
2. Quais escopos/permissões o app ML precisa (advertising)?
3. Limites (rate limit, certificação, app não-certificada)?
4. O que a Mamba entrega e onde é fraca?
5. O token/app do usuário tem permissão de Ads hoje?

## Achados (preencher)

### API Mercado Ads (Product Ads) — CONFIRMADO via docs
- Base URL: https://api.mercadolibre.com — OAuth 2.0 Bearer + header `Api-Version: 1/2`
- Endpoints reais:
  - `advertising/advertisers?product_id=PADS` (GET) — lista anunciantes do usuário
  - `marketplace/advertising/{site_id}/advertisers/{advertiser_id}/product_ads/campaigns/search` (GET) — lista/busca campanhas com métricas (limit/offset/date_from/date_to)
  - `marketplace/advertising/{site_id}/advertisers/{advertiser_id}/product_ads/ads/search` (GET) — lista ads com métricas (aggregation_type)
  - `marketplace/advertising/{site_id}/product_ads/ads/{item_id}` (GET) — detalhe do ad
  - `advertising/advertisers/{advertiser_id}/product_ads/items` (GET) — métricas por item
- Capacidades (Medium/oficial): criar e gerenciar múltiplas campanhas; ajustar orçamento diário; pausar/reativar; editar; métricas nível ad: cliques, impressões, CPC, conversão, ROAS, ACOS; targeting por condição, faixa de preço, Buy Box, frete.
- LIMITES: métricas limitadas a janelas de 90 dias; paginação limit/offset; 403/404 "No permissions found for user_id" se Product Ads NÃO habilitado para o usuário.
- Escopo do app: precisa de permissão advertising/product_ads + Product Ads habilitado na conta (Gerenciar anúncios > Campanha de publicidade).
- Endpoints legados de métricas por campanha foram DEPRECADOS (404 após 26/02/2026) — usar os marketplace/search.
- IMPLICAÇÃO: criar campanha/editar lance via API exige permissão de escrita (advertising) — provavelmente requer app certificada/autorizada para Ads. A leitura de métricas é o caminho mais fácil.

### Modelo de Product Ads (oficial ML) — base para o produto
- Modelo de leilão: ad-rank = f(Max CPC, ad-score). Max CPC é DERIVADO do ACOS-alvo + histórico de conversão. Cobrança por second-best price (paga o mínimo para vencer o concorrente). Paga só por clique.
- ad-score = qualidade do anúncio (fotos, preço, reclamações, histórico de views/vendas). NÃO visível no gerenciador.
- 3 estratégias nativas: Rentabilidade (ROI, best-sellers), Crescimento (produtos médios), Visibilidade (novos/competitivos).
- Alavancas que o vendedor controla: ACOS-alvo, orçamento diário, quais anúncios entram, pausar/ativar, mover ads entre campanhas (1 ad = 1 campanha).
- INSIGHT para diferencial: como Max CPC e ad-score derivam de histórico/qualidade, um bom módulo deve cruzar dados de Ads com dados ORGÂNICOS da conta (visitas, conversão, estoque, reputação) — algo que temos via API da conta. Otimizar ACOS por produto com base em margem real e conversão orgânica é o grande diferencial possível vs ferramentas que só mexem em lance.

### Mamba (Mamba Digital) — perfil
- É uma ASSESSORIA/aceleradora de e-commerce, parceira Platinum certificada do ML (consultoria de performance + ERP).
- Modelo: serviço humano de gestão estratégica de performance (incl. gestão de Ads/ACOS), não primariamente um SaaS self-service. Mencionam acesso à plataforma "AdMan" em pacotes/masterclasses.
- Discurso deles: "desmontam a operação, identificam campanhas que distorcem o resultado e corrigem na raiz" (otimização de ACOS por campanha) — trabalho consultivo + ferramenta.
- FRAQUEZAS típicas de assessoria (a confirmar com o usuário): custo recorrente (fee mensal / % de faturamento ou de investimento em ads), tempo de resposta humano, falta de transparência em tempo real, decisões não 100% sob seu controle, conhecimento da sua margem real limitado, padronização entre clientes.
- DIFERENCIAL POSSÍVEL nosso: software proprietário, dados em tempo real, cruzamento Ads × orgânico × margem real × estoque, regras automáticas sob seu controle, custo fixo previsível (sem % do faturamento), e o conhecimento íntimo da SUA operação.
- NOTA: o usuário disse "uma empresa que chama mamba" — provável que seja a assessoria Mamba Digital. Confirmar se é assessoria (serviço) ou um software específico.

### RASTREIO DA CONTA DO USUÁRIO (ao vivo, 13/06/2026) — CRÍTICO
- Conta LOJADOSRWU, mlUserId 3308178634, advertiser_id 2669464, site MLB.
- LEITURA: OK total.
  - advertisers PADS -> 200
  - campaigns/search -> 200, 9 campanhas (ex.: "FIBRA - MLB6961949176" acos 25 budget 55 auto; "Campanha Mercado Livre" acos 16.67 budget 50; "Mamba Compra de Dados ...").
  - ads/search -> 200, total 130 anúncios elegíveis; traz item_id, campaign_id, ad_group_id, preço, título, status, buy_box_winner, logistic_type, image_quality, etc.
  - Métricas válidas (campanha e ad): clicks, prints, cost, cpc, ctr, direct_amount, indirect_amount, total_amount, direct_units_quantity, indirect_units_quantity, units_quantity, direct_items_quantity, indirect_items_quantity, organic_units_quantity, organic_items_quantity, acos, sov. Janela máx 90 dias.
  - Métricas zeradas no período testado pois campanhas recriadas em 13/06 (provável ação da Mamba).
- ESCRITA: BLOQUEADA hoje.
  - PUT campaigns -> 401 "User does not have permission to write" (mclics.campaigns.exceptions.UnauthorizedException).
  - Conclusão: o app atual tem escopo de leitura de advertising, mas NÃO de escrita. Para automatizar ações (pausar/editar ACOS/orçamento/criar campanha) é preciso solicitar escopo de escrita / certificação de app para Ads junto ao ML.
- Endpoints de detalhe single-campaign (GET por id) deram 404 nos paths testados; usar sempre o campaigns/search com filtro.

### Escopos do app ML (DevCenter) — confirmação
- App ML tem 3 escopos: read, write, offline_access. São marcados/configurados no DevCenter (My Apps) do dono da conta.
- O 401 "User does not have permission to write" bate exatamente com o relato do usuário: ao criar o app, NÃO marcaram o escopo "write" para reduzir risco.
- IMPLICAÇÃO: para habilitar escrita basta (a) marcar o escopo "write" no app no DevCenter e (b) o usuário re-autorizar (novo consentimento OAuth) para o token passar a carregar o escopo write. Não há código novo do nosso lado para "liberar" — é config do app + reconsentimento. Depois disso, os endpoints PUT/POST de Ads passam a aceitar.
- Pode haver, ainda, exigência de o produto Product Ads estar habilitado na conta (já está) e eventual certificação do app para ações de Ads — a confirmar no momento de ativar a escrita.
