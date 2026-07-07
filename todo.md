# ML Market Analyzer - TODO

## Fundação
- [x] Definir design system elegante (cores, tipografia, espaçamento) no index.css e index.html
- [x] Definir schema do banco de dados (produtos monitorados, snapshots históricos, alertas, config de credenciais)
- [x] Gerar e aplicar migrações

## Camada de Integração ML
- [x] Serviço de integração com a API do Mercado Livre (busca, item, categorias, tendências)
- [x] Configuração centralizada de credenciais (App ID/Secret) facilmente substituível
- [x] Provedor plugável: OfficialApiProvider (OAuth, pronto p/ futuro) + DemoDataProvider (dados realistas agora)
- [x] Seleção automática de provedor baseada em credenciais configuradas
- [x] Algoritmo de cálculo de "potencial" (crescimento de vendas, relação preço/avaliação, demanda)

## Backend (tRPC)
- [x] Procedure de busca de produtos por palavra-chave/categoria
- [x] Procedure de ranking de mais vendidos por categoria (filtros e ordenação)
- [x] Procedure de identificação de produtos com alto potencial
- [x] Procedure de comparação lado a lado de produtos similares
- [x] Procedure de listagem de categorias e tendências
- [x] Procedures de produtos monitorados (salvar, listar, remover)
- [x] Procedures de histórico (snapshots) e alertas

## Frontend
- [x] Layout com navegação lateral (DashboardLayout) e tema sofisticado
- [x] Página Home / Dashboard (visão geral, mais vendidos, oportunidades)
- [x] Página de Busca de produtos com resultados detalhados
- [x] Página de Categorias (navegação + tendências por categoria)
- [x] Página de Oportunidades (produtos com alto potencial + explicação dos critérios)
- [x] Página de Comparação lado a lado
- [x] Página de Monitoramento (produtos salvos + gráficos históricos)
- [x] Página de Alertas
- [x] Página de Configurações (credenciais do ML + cron + limiares)

## Monitoramento e Alertas
- [x] Cron job (Heartbeat) que registra snapshots de preço/vendas/posição
- [x] Detecção de variação significativa e geração de alertas
- [x] Gráficos de tendência histórica (preço, vendas, posição)
- [x] Backfill de histórico ao adicionar produto (modo demo) p/ gráficos imediatos

## Qualidade
- [x] Testes vitest para procedures principais (28 testes passando)
- [x] Validação do fluxo de dados via caller tRPC (end-to-end demo)
- [x] Ordenação server-side no ranking (vendas, preço, avaliação)
- [x] Checkpoint e entrega

## Integração OAuth real com a API oficial do Mercado Livre
- [x] Rota de conexão OAuth (`/api/oauth/ml/connect`) que redireciona para a tela de autorização do ML
- [x] Rota de callback (`/api/oauth/ml/callback`) que troca o code por access_token + refresh_token
- [x] Armazenamento seguro do token (na tabela ml_credentials: accessToken/refreshToken/tokenExpiresAt) com expiração
- [x] Renovação automática do access_token via refresh_token (ensureUserAccessToken)
- [x] Provedor de dados oficial: busca, item, categorias, tendências usando a API ao vivo (com fallback granular)
- [x] Mapeamento dos dados ao vivo para os tipos de domínio (MlProduct, etc.)
- [x] Seleção automática do provedor oficial quando houver token válido
- [x] Tela de Configurações: botão "Conectar ao Mercado Livre" + status da conexão (Pendente/Conectado)
- [x] UI segura para inserir App ID + Client Secret (campos + salvar) na tela de Configurações
- [x] Usuário inseriu o Client Secret real e salvou as credenciais
- [x] Usuário concluiu o fluxo OAuth (autorizou no ML) — status "Conectado / Ao Vivo" confirmado
- [x] Checkpoint da integração OAuth real
- [x] Travar redirect_uri no domínio público canônico (corrige erro "não foi possível conectar")
- [x] Corrigir erro de UI "removeChild" causado pela tradução automática do navegador (lang=pt-BR + notranslate + patch defensivo no DOM)

## BUG CRÍTICO: busca exibe dados de demonstração apesar de OAuth conectado
- [x] Diagnosticar: endpoint /sites/MLB/search descontinuado (403); migrado para /products/search
- [x] Corrigir chamada real à API oficial (products/search, highlights, categories, trends) e mapeamento
- [x] Banner reflete a fonte real dos dados
- [x] Busca retorna produtos reais (nome, marca, imagem) — confirmado ao vivo

## Descoberta: limitação de preços pela permissão da app ML
- [x] Diagnosticado: /items, /items?ids=, /sites/MLB/search => 403 access_denied; /products/{id}/items => 404 "No winners" na maioria
- [x] Conclusão: app "não certificada" libera catálogo (nome/imagem/ranking/tendências) mas bloqueia preço/vendas de anúncios
- [x] Pesquisa confirmou caso público idêntico (Reclame Aqui jan/2026): exige liberação via suporte ML

## Caminho A: liberação de preços/itens no Mercado Livre + UI honesta
- [x] Tratar preço/vendas/avaliação ausentes no provedor (flags priceAvailable/salesAvailable/ratingAvailable)
- [x] UI: quando preço indisponível, mostrar "Preço sob consulta" + link "Ver no Mercado Livre" (ProductCard)
- [x] UI: não exibir "0 vendidos"/"0,0" quando o dado não existir; mostrar "—" (ProductCard, MaisVendidos, Painel)
- [x] Banner: deixar claro que preços dependem de liberação ML
- [x] Teste do comportamento honesto de preço (priceAvailable=false)
- [x] Guia (documento) de como solicitar a liberação no ML, com texto pronto (GUIA_LIBERACAO_ML.md)
- [x] Validado ao vivo na preview; publicar é ação do usuário (botão Publish na UI)

## Diagnóstico técnico definitivo (token renovado) + melhoria de cobertura de preço
- [x] Testar endpoints reais com token renovado: /users/me 200, /sites/MLB/search 403, /products/search 200, /highlights 200, /trends 200
- [x] Confirmar que /products/{id}/items retorna PREÇO real mesmo sem buy_box
- [x] Medir cobertura: busca livre ~10% com preço; mais vendidos/destaques 90-100% com preço
- [x] Documento de solicitação ao ML com 3 versões + texto p/ assessor de conta + DPP (SOLICITACAO_ML_SUPORTE.md)
- [x] Melhorar provider: ordenação estável que prioriza produtos COM preço real na busca (sortPricedFirst)
- [x] Cruzar busca por categoria com destaques/highlights para elevar cobertura de preço (de-dup + priced first) + teste dedicado
- [x] Garantir menor-preço entre ofertas (offersCount/priceIsFrom) e marcar claramente "sem oferta ativa"
- [x] UI: ProductCard mostra "A partir de", nº de ofertas e "sem oferta ativa"
- [x] Atualizar mensagem do banner ao vivo (cobertura real de preços)
- [x] Atualizar/rodar testes vitest do provider (41 testes passando)
- [x] Validado ao vivo na preview; publicar é ação do usuário (botão Publish na UI)

## REORIENTAÇÃO: Central de Gestão da Loja (dados reais da conta própria)

### Diagnóstico validado (token proprietário funciona)
- [x] /users/me → reputação (5_green, 38 concluídas, 14 canceladas)
- [x] /users/{id}/items/search → 121 anúncios próprios
- [x] /items/{id} próprio → preço, estoque, sold_quantity, status, listing_type, permalink
- [x] /items/{id}/visits/time_window → visitas por anúncio (série temporal)
- [x] /orders/search?seller={id} → 56 pedidos reais (valor, item, frete, data, status, pagamento)
- [x] /post-purchase/v1/claims/search?status=opened → reclamações (0 abertas)

### Backend
- [x] Provider da conta (accountProvider): renovar token via refresh_token, helpers para orders/items/visits/claims/reputation
- [x] Rotas tRPC: account.salesDashboard, account.listings, account.postSale, account.reputation
- [x] Tratar conta nova / volumes baixos sem inventar dados

### Frontend - novo tema claro/clean (ref. DESIGN_REFERENCE.md)
- [x] Atualizar index.css: tema claro, verde-menta accent, fundo off-white, cards brancos, sombras suaves
- [x] Trocar ThemeProvider para light
- [x] Sidebar clara com seções "Minha loja" e "Pesquisa de mercado"
- [x] Linha de KPIs + cards + gráficos suaves (recharts/chart)

### Telas
- [x] Desempenho dos anúncios (lista: visitas, vendas, conversão, estoque, status, encalhados)
- [x] Dashboard de vendas (faturamento, nº pedidos, ticket médio, evolução, top produtos)
- [x] Pós-venda (devoluções, reclamações, cancelamentos)
- [x] Reputação & saúde da conta
- [x] Painel reformulado como visão geral da loja
- [x] Manter pesquisa de mercado como recurso secundário e honesto

### Qualidade
- [x] Testes vitest das novas rotas/provider (48 testes passando)
- [x] Validar todas as telas com dados reais (Painel, Vendas, Anúncios, Pós-venda, Reputação)
- [x] webdev_check_status OK + checkpoint
- [x] Orientar publicação e validar ao vivo (entregue ao usuário)

## MÓDULO: Radar de Concorrentes (Caminho B - Unwrangle, isolado da conta ML)

### Segurança (regra de ouro: conta ML NUNCA exposta)
- [x] Cliente Unwrangle em módulo separado (server/competitors/) sem acesso ao token ML
- [x] API key como secret (UNWRANGLE_API_KEY) - nunca no código/frontend
- [x] Garantir que nenhuma chamada externa envie token/CNPJ/user_id/cookies da conta ML (teste de isolamento dedicado)

### Backend
- [x] Tipos compartilhados (shared/competitors.ts): Competitor, CompetitorSet, Diagnosis
- [x] Cliente unwrangle.ts: search por palavra/categoria + detalhe de produto (com estado "não configurado")
- [x] Lógica de diagnóstico "por que ele vende mais" (reputação, Full, tipo anúncio, parcelas, fotos, preço)
- [x] Rotas tRPC: competitors.status, competitors.search, competitors.sellers, competitors.detail, competitors.diagnose
- [x] Estado "API não configurada" tratado com elegância (sem quebrar)

### Frontend
- [x] Tela "Radar de Concorrentes" (busca ativa + lista ordenada por força)
- [x] Painel "Diagnóstico" (meu anúncio vs concorrente, fatores além do preço)
- [x] Entrada no menu "Pesquisa de mercado"
- [x] Estado vazio/banner explicando que requer configuração da API

### Qualidade
- [x] Testes vitest do cliente e do diagnóstico (com mocks) — 14 testes passando (62 no total)
- [x] webdev_check_status + checkpoint
- [x] Criar campo de secret para o usuário inserir a chave quando tiver — chave recebida e configurada

### Ativação da chave + resiliência ao provedor (09/06)
- [x] Chave UNWRANGLE_API_KEY recebida do usuário e configurada como secret
- [x] Retry automático no cliente Unwrangle (até 5 tentativas, backoff) para erros 5xx/rede/success:false
- [x] Delay de retry configurável via env (UNWRANGLE_RETRY_DELAY_MS) para testes rápidos
- [x] Aviso amigável "serviço de dados temporariamente instável" no Radar e no Diagnóstico (BAD_GATEWAY) com botão Tentar novamente
- [x] Teste ao vivo resiliente: valida que a chave é válida (não 403) sem falhar quando o provedor está em 504
- [x] Suíte completa passando (64 testes)
- [x] SUPERADO: Unwrangle deixou de ser o caminho crítico — Oxylabs+ScrapingBee passaram a entregar produtos reais (Fases 1-2). Unwrangle segue como fonte complementar com estado honesto quando instável.
- [x] SUPERADO: busca real triangulada validada ao vivo com Oxylabs+ScrapingBee (não depende mais do retorno da Unwrangle)

## Confiabilidade da Pesquisa de Mercado (09/06)
- [x] Oportunidades: recalcular score apenas com fatores reais (preço competitivo, presença nos mais vendidos, reputação do vendedor, frete+fotos); avaliação só quando disponível
- [x] Oportunidades: remover fator "crescimento recente" sintético (hash do ID) e "demanda fixa" da categoria
- [x] Oportunidades: atualizar UI/explicações + cards (preço/posição/frete reais); tipo PotentialAnalysis sem campos sintéticos (priceScore/bestSellerScore)
- [x] Buscar produtos: descrição honesta + remoção das ordenações por avaliação/vendas
- [x] Comparar: avaliação e volume de vendas viram fatores condicionais (só quando todos os itens têm o dado)
- [x] Monitoramento: focar em preço como dado confiável; vendas/posição rotuladas "quando disponível"
- [x] Remover import órfão estimateSalesGrowth em monitoring.ts
- [x] Atualizar testes de analysis.ts (fatores reais + cenários de disponibilidade) e rodar suíte completa (69 testes passando)
- [x] webdev_check_status (TS/LSP limpos) + checkpoint


## Arquitetura de 4 fontes + triangulação (09/06)
- [x] Modelo normalizado de produto/concorrente compartilhado (shared/sources.ts): UnifiedCompetitor + FieldConsensus + SourceStatus
- [x] Camada agregadora server/competitors/aggregator.ts: normaliza, faz match de itens entre fontes e calcula consenso por campo (preço, frete, reputação, etc.) + score de força
- [x] Selo de confiança por concordância (Alta/Média/Baixa/single) + rastreio de origem por campo
- [x] Testes do agregador (match, consenso numérico/textual/booleano, score) — 16 testes passando
- [x] Provedor Oxylabs isolado (server/competitors/oxylabs.ts) com estado "não configurado" + retry
- [x] Provedor ScrapingBee isolado (server/competitors/scrapingbee.ts) com estado "não configurado" + retry
- [x] Adaptador da API oficial do ML como 4ª fonte para busca pública (server/competitors/officialSource.ts)
- [x] Integrar as 4 fontes no agregador (executa em paralelo apenas as configuradas; tolerante a falhas)
- [x] Rotas tRPC: competitors.sourcesStatus (status das 4) + busca triangulada (searchMulti)
- [~] Detalhe triangulado adiado: o detalhe por produto exige IDs por fonte (custo alto de créditos). Mantemos o detalhe via Unwrangle; a triangulação fica na busca. Reavaliar após ativar Oxylabs/ScrapingBee.
- [x] UI Radar: valor consolidado + selo de concordância + "ver detalhes" por fonte + painel de fontes (SourcesPanel) + RadarBanner multi-fonte
- [x] Secrets OXYLABS_USERNAME/OXYLABS_PASSWORD e SCRAPINGBEE_API_KEY configuradas e validadas ao vivo (60 ofertas cada)
- [x] Testes da triangulação (orchestrator: fault isolation/triangulação) e dos provedores (oxylabs/scrapingbee/officialSource — fetch mockado, isolamento) — 124 testes passando
- [x] webdev_check_status (TS/LSP limpos) + checkpoint
- [x] Chaves de Oxylabs/ScrapingBee recebidas, configuradas e validadas ao vivo no ambiente atual (preview/dev) — ambas entregando ofertas reais. Publicação em produção é ação do usuário (botão Publish).

## Ajuste Oxylabs (validação com credenciais reais) — SUPERADO pela Fase 1 (ver seção "Robustez total")
- [x] RESOLVIDO de forma diferente: a API pública JSON do ML retorna VAZIO via Oxylabs (status 613). Solução real: render JS + browser_instructions + parser de poly-cards compartilhado (Fase 1)
- [x] Isolamento mantido (teste dedicado): só keyword pública + credenciais Oxylabs
- [x] Testes unitários do oxylabs atualizados para HTML renderizado
- [x] Teste live: 60 ofertas reais
- [x] Suíte completa + checkpoint (b99c7a02)


## Decisão estratégica (09/jun): triangular as 4 APIs públicas, SEM OAuth oficial do ML
- [x] Avaliação da Seconds concluída: a robustez dela vem da integração OFICIAL do ML (parceira certificada), não de scraping melhor. Usuário decidiu NÃO buscar autorização oficial.
- [x] Rumo confirmado: triangular Oxylabs + ScrapingBee + Unwrangle + busca pública do ML, de forma segura e tolerante a falhas.
- [x] Oxylabs: alvo definido = render JS (browser_instructions) + parser de poly-cards. Ao vivo: 60 ofertas (Fase 1).
- [x] ScrapingBee: render + wait=1500 + parser compartilhado + retry em página vazia. Ao vivo: 60 ofertas (Fase 2).
- [x] Unwrangle: revalidada — chave válida, provedor intermitente; tratada com retry + estado honesto (Fase 2).
- [~] Busca pública ML como 4ª fonte: oficialSource existe, mas a busca pública sem token é instável; mantida como "não configurada" com transparência na UI. Oxylabs+ScrapingBee já dão triangulação real.
- [x] Orquestrador: paralelismo só com fontes configuradas, dedupe por MLB id/nome, timeout 150s, degradação graciosa (Fase 3).
- [x] Segurança: teste de isolamento garante que nenhuma credencial da conta ML trafega aos provedores (Fase 3).
- [x] UI: status honesto por fonte + "Fontes desta busca" + selo de consenso nos cards (Fase 4).
- [x] Suíte completa (136 unit + live gated) + checkpoint final b99c7a02 (Fase 5).


## Correção do dashboard de vendas (09/jun) — dados reais
- [x] Diagnóstico ao vivo: conta LOJADOSRWU conectada, token válido (não era "demo" para dados próprios)
- [x] Identificado bug: paginação de pedidos parava cedo + janela padrão de 60 dias cortava o início da loja
- [x] getSalesDashboard reescrito: usa filtro oficial order.status=paid (captura os 40 pagos) + contagem oficial de cancelados (18)
- [x] Janela padrão das rotas account ampliada para 180 dias (cobre toda a vida da loja)
- [x] Validado ao vivo: R$ 2.632,00 / 40 pedidos / 48 unidades / ticket R$ 65,80 / 18 cancelados
- [x] Testes do accountProvider atualizados (paid filter + cancelled count) — 7/7
- [x] Suíte completa: 125 testes passando (inclui live Oxylabs ok / Unwrangle chave válida, provedor instável)


## Busca assíncrona de concorrentes com cache (09/jun)
- [x] ScrapingBee ativada com render JS + premium proxy (Brasil) + parser cheerio (poly-card) — 60 produtos reais; ~96s/busca
- [x] Tabela competitor_searches (termo normalizado, status, timestamps, contagem)
- [x] Tabela competitor_results (resultados unificados por busca, JSON das fontes/consenso)
- [x] Migração SQL aplicada via webdev_execute_sql
- [x] Helpers de cache (searchStore.ts: criar busca, salvar resultados, ler por termo/id, listar recentes, normalizar, TTL)
- [x] Job em background (searchJob.ts: fire-and-forget, in-flight guard, status pending->running->done/failed)
- [x] Rotas tRPC: competitors.startSearch (dispara/retorna cache), competitors.getSearch (polling), competitors.recentSearches
- [x] Otimizar wait da ScrapingBee (wait=1500 + block_resources): 96s -> ~37s, mantém 60 produtos
- [x] UI Radar: estado "coletando..." com polling, resultado do cache, botão atualizar, lista de buscas recentes
- [x] Testes do fluxo assíncrono (searchJob: status pending->running->done/failed, falha graciosa, in-flight guard) — 5 testes
- [x] webdev_check_status + checkpoint (validado ao vivo: coleta em segundo plano → polling → 60 concorrentes → "Resultado em cache" ao reabrir a busca recente)


## Robustez total — triangulação real das 4 fontes (créditos liberados, 09/jun)
### Oxylabs (Fase 1) — CONCLUÍDA
- [x] Investigação ao vivo: API pública JSON do ML retorna VAZIO via Oxylabs (status interno 613); a busca HTML só funciona com render JS
- [x] Solução: render=html + browser_instructions (wait_for_element poly-card + scroll) — retorna 2,2MB de HTML com 300+ cards
- [x] Parser de poly-cards extraído para módulo compartilhado (mlSearchParser.ts), reutilizado por ScrapingBee e Oxylabs
- [x] Cliente Oxylabs reescrito: render JS + parser compartilhado, stamp source=oxylabs
- [x] Manter isolamento: somente keyword pública + credenciais Oxylabs; sem token/CNPJ/cookies/user_id do ML (teste de segurança)
- [x] Testes unitários atualizados (oxylabs 14 + scrapingbee 11 = 25 verdes)
- [x] Teste live (credenciais reais): 60 ofertas reais em ~35s (ex.: Head & Shoulders Antiqueda @ R$ 28,20)
### ScrapingBee + Unwrangle (Fase 2) — CONCLUÍDA
- [x] ScrapingBee revalidada ao vivo: 60 ofertas reais (~54s). Sonda confirmou 372 poly-cards com wait=1500; wait_for trava (>120s)
- [x] Retry inteligente: página renderizada com 0 produtos (proxy bloqueado) é retentada; busca legitimamente vazia (looksLikeEmptySearch) é aceita
- [x] Cap de tentativas na ScrapingBee (2) p/ caber no orçamento de tempo; aplicado também à Oxylabs (consistência)
- [x] Unwrangle: chave válida porém provedor intermitente (upstream); já tratada com 5 retries + estado honesto
- [x] Dedupe por MLB id (forte) + similaridade de nome/preço (fallback) no aggregator
### Orquestrador + Segurança (Fase 3) — CONCLUÍDA
- [x] Paralelismo só com fontes configuradas, isolamento de falha por fonte, timeout 150s (job assíncrono)
- [x] Triangulação real ao vivo: 62 concorrentes, 58 corroborados por >1 fonte (Oxylabs+ScrapingBee)
- [x] Teste de isolamento: nenhuma credencial da conta ML trafega aos provedores (Bearer/token/CNPJ/cookies)
- [x] Selo de consenso por concordância (Alta/Média/Baixa/single) calculado no aggregator
### Diagnóstico + UI (Fase 4) — CONCLUÍDA
- [x] UI: bloco "Fontes desta busca" (status honesto por fonte daquela coleta: não configurada / contribuiu / instável / credencial)
- [x] Selo de consenso visível nos cards + detalhamento por campo com contribuição de cada fonte (Oxylabs/ScrapingBee)
- [x] Regra de consenso corrigida: corroboração unânime entre 2 fontes = "Alta" (antes ficava presa em "Média")
- [x] Validado ao vivo: "creatina" → 62 concorrentes triangulados, produtos corroborados marcados como "Alta"
### Qualidade (Fase 5)
- [x] Suíte completa de unit verde: 136 testes, 16 arquivos; TS/LSP limpos
- [x] Testes live gated por env verdes (evidência direta 09/jun 19:53): oxylabs.live=60 ofertas; scrapingbee.live=60 ofertas; orchestrator.live=62 concorrentes, triangulated=true, 58 corroborados por 2 fontes (oxylabs:ok+scrapingbee:ok)
- [x] Robustez sob contenção corrigida: timeout por fonte 150s→240s (ScrapingBee pior caso ~165s sob contenção); antes dava corroborated=0, agora corroborated=58
- [x] NOTA DE ROBUSTEZ FUTURA registrada (não bloqueante): job de coleta é fire-and-forget; em Cloud Run min-instances=0, avaliar futuramente worker/heartbeat dedicado para garantir conclusão se a instância escalar a zero após a request
- [x] webdev_check_status: dev server running, sem erros de build/TS/LSP
- [x] Checkpoint final + entrega (version b99c7a02)
- [x] Validado ao vivo: "creatina" → 62 concorrentes triangulados, corroboração Oxylabs+ScrapingBee = "Alta"


## Enriquecimento pós-upgrade de planos (painel de consumo + dados ricos)

### Fase 1 — Painel de consumo das fontes — CONCLUÍDA
- [x] Backend: usage.ts consulta a cota da ScrapingBee (GET /usage: max/used/remaining + renovação) e trata falha graciosa por fonte
- [x] Backend: contagem de buscas por janela (hoje/30 dias) no searchStore (countSearchesSince)
- [x] Rota tRPC: competitors.usageStatus (créditos por fonte + buscas hoje/mês)
- [x] Testes unitários (12 verdes): cota parseada, erros graciosos, panel_only Oxylabs/Unwrangle, montagem do UsageStatus
- [x] UI: cartão "Consumo & limites" no Radar com barra de progresso, estado honesto (panel_only) e contador de buscas; invalidação após busca concluir
- [x] Validado ao vivo: ScrapingBee "250 mil restantes / 25 usados", Oxylabs+Unwrangle com "Abrir painel", "3 hoje · 3 em 30 dias"

### Fase 2 — Dados mais ricos por concorrente
- [x] Parser ML: extrair atributos do DOM — officialStore ("Loja oficial"), fulfillment ("Enviado pelo FULL"), hasCoupon (.poly-component__coupons), sponsored (is_advertising=true)
- [x] Propagar novos campos por RawSourceOffer -> aggregator (consenso boolean por maioria) -> UnifiedCompetitor
- [x] UI: badges coloridos no card (AttributeBadges: Loja oficial/FULL/Cupom/Patrocinado) com guarda defensiva para cache antigo (optional chaining)
- [x] Testes unitários do parser e do agregador para os novos campos

### Fase 3 — Qualidade e entrega — CONCLUÍDA
- [x] Suíte completa (unit) verde (154 testes) + TS/LSP limpos
- [x] Validação ao vivo: busca nova "cadeira gamer" (60 concorrentes) com badges populados (Loja oficial 48, FULL 54, Cupom 10, Patrocinado 12) e painel de consumo atualizando em tempo real
- [x] Correção do crash AttributeBadges em cache antigo (campos undefined -> optional chaining)
- [x] Checkpoint final + entrega

> Robustez futura (opcional): mover o job de coleta em segundo plano para um worker/heartbeat dedicado, evitando perda de jobs em andamento quando o processo reinicia (HMR em dev; min-instances=0 em produção).


## Robustez (worker resiliente) + Filtros de segmento — EM ANDAMENTO

### Worker resiliente a reinícios (Heartbeat/HTTP cron)
- [x] searchStore: isStalled + recoverStalledSearches/recoverStalledForUser (detecção por updatedAt > STALE_JOB_MS=6min)
- [x] searchStore: failStalledByIds marca órfãs como "failed" com nota honesta (idempotente, só flipa pending/running)
- [x] Fallback em runtime: getSearch/recentSearches recuperam órfãs (ciente de in-flight via isInFlight) — UI nunca fica presa
- [x] Endpoint /api/scheduled/radarSweep (cron-only, unknown-task skip, idempotente, try/catch + JSON no 500)
- [x] Handler montado em server/_core/index.ts antes do fallthrough
- [x] Coluna app_config.radarSweepCronTaskUid (migração aplicada)
- [x] Testes unitários: isStalled (4) + handler do sweep (5) verdes
- [x] Controle do cron pela própria UI: procedures get/setSweepSchedule (espelhando o monitor) + SweepScheduleCard (switch "Robustez da coleta", a cada 2 min, com nota honesta de que requer publicação)
- [x] Testes do fluxo de schedule (6): create/update/delete + estado (175 testes no total, verdes)
- [x] Implementação completa do cron entregável via UI

> Nota de fluxo (ação do usuário, não de implementação): após publicar o app, basta ativar o switch "Robustez da coleta" no Radar para registrar o cron no domínio publicado. Antes da publicação o switch fica disponível, mas o registro do cron só funciona no domínio público (o preview do sandbox não é alcançável pela plataforma).

### Filtros de segmento nos resultados
- [x] Lógica pura shared/competitorFilters (applyFilters/matchesFilters/countBySegment) tolerante a campos ausentes
- [x] UI: SegmentFilterBar (chips com ícone/cor + contador por segmento, AND, "Limpar") acima da lista
- [x] Lista filtrada memoizada (useMemo) + reset de filtros ao trocar de busca
- [x] Estado vazio honesto quando nenhum concorrente bate nos filtros
- [x] Testes unitários da função pura de filtragem (6 testes)


### Ordenação dos resultados (combinada com filtros) — CONCLUÍDA
- [x] Lógica pura shared/competitorSort (força, preço asc/desc, mais selos, mais avaliados) tolerante a campos ausentes; nulls last; ordem estável (tie-break por índice)
- [x] Pipeline filtra -> ordena na UI (useMemo); ordem da "força" preservada como padrão
- [x] UI: Select de ordenação à direita da barra de filtros (ArrowUpDown), com reset ao trocar de busca
- [x] Testes unitários da ordenação (8) + badgeCount cache-safe
- [x] Validação ao vivo: "Preço: menor → maior" reordenou 386,87 -> 475,90 -> 489,55 -> 499,99 (crescente); suíte completa verde (183 testes); TS/LSP limpos


## Reformulação nível de mercado (Opção B + Minha Loja real) — 09/jun

### Fase 1 — Consertos rápidos — CONCLUÍDA
- [x] Radar: fotos corrigidas via pickBestImage (srcset/data-srcset/data-src; ignora data:/gif placeholders; null honesto quando só placeholder)
- [x] Diagnóstico: classifyCompetitorError mapeia SyntaxError/TypeError/HTML para BAD_GATEWAY honesto (sem vazar stack "Unexpected token '<'")
- [x] Testes: pickBestImage (5) + thumbnail real no parser (2) + classify (6) — verdes; TS limpo

### Fase 2 — Buscar produtos e Mais vendidos com dados reais (scraping)
- [x] ScrapingProvider (implementa MercadoLivreProvider) via orchestrator de scraping; adaptador UnifiedCompetitor->MlProduct honesto (preco/rating reais; sem inventar vendas)
- [x] providerForUser: oficial -> scraping (se fontes configuradas) -> demo; status.mode passa a expor "scraping"
- [x] Buscar produtos e Mais vendidos consomem dados reais via scraping (cache 5min in-process)
- [x] DataSourceBanner: novo selo "Dados reais" (verde) com mensagem honesta sobre vendas
- [x] Testes unitários (9): adaptador, hasScrapingSources, search real/empty

### Fase 3 — Oportunidades, Comparar e Categorias com dados reais — CONCLUÍDA
- [x] Oportunidades: rankByPotential sobre produtos reais do scraping (fatores já honestos)
- [x] Comparar/analyzeProduct: getProduct resolve detalhe real via Unwrangle por id/URL (idToUrl), com vendas via parsePastSales
- [x] detailToMlProduct: mapeia detalhe real -> MlProduct com flags honestas (salesAvailable/priceAvailable/ratingAvailable; FULL/Loja oficial via labels)
- [x] Categorias: rótulos honestos ("Explorar tendências e destaques" / "interesse" com tooltip) em vez de contagem falsa; destaques e termos via dados reais
- [x] Testes unitários (4 novos): detailToMlProduct (vendas/FULL/sem venda/sem preço)

### Fase 4 — Vendas por período + monitoramento automático — CONCLUÍDA
- [x] shared/salesVelocity.ts: função pura que calcula velocidade de vendas (+X un. em N dias) a partir de snapshots reais
- [x] Monitoramento conectado à fonte real (oficial -> scraping -> demo) em server/ml/monitoring.ts; backfill sintético só quando NÃO há origem real (isRealOrigin=false)
- [x] UI Monitoramento.tsx exibe velocidade de vendas no diálogo de histórico; procedure de histórico passa a expor velocity
- [x] Testes unitários (5 novos): salesVelocity

### Fase 5 — Minha Loja real (API oficial + OAuth ML) — CONCLUÍDA
- [x] Provider oficial ativo (token OAuth do usuário já no DB) — isolado da coleta de concorrentes
- [x] Painel Minha Loja (Vendas, Anúncios, Pós-venda, Reputação) com dados reais da conta logada (R$ 2.632 / 40 pedidos / ticket R$ 65,80 / 48 un.)
- [x] Enriquecimento de miniaturas em "Produtos que mais venderam": captura thumbnail/permalink de order_items e multiget para preencher fotos faltantes (10/10 fotos reais validadas ao vivo)
- [x] Isolamento garantido: conta do usuário NUNCA usada na coleta de concorrentes

### Fase 6 — Qualidade e entrega — CONCLUÍDA
- [x] Suíte completa verde (216 testes / 26 arquivos) + TS/LSP limpos
- [x] Validação ao vivo das telas reais (Vendas com ranking + fotos)
- [x] Checkpoint + entrega + orientação de publicação/login


## URGENTE — Bugs reais reportados via gravação de tela (09/jun)
- [x] Radar de concorrentes: spinner infinito + botão "Buscar concorrentes" sem ação — RESOLVIDO (early-finish + teto global; validado: 51 concorrentes)
- [x] Categorias > "Produtos em destaque": cards em loading infinito — RESOLVIDO (timeout por requisição + fan-out limitado; validado: 48 termos + 6 produtos)
- [x] Banner verde de aviso com texto de erro — confirmado que era da versão publicada antiga; código atual já correto (grep sem ocorrências)
- [x] Validar ao vivo cada correção + suíte de testes verde (221 testes) + checkpoint (7f9c7e65)


## URGENTE — Correções da gravação de tela (09/06 20:44) — CONCLUÍDO
- [x] Radar travado (spinner infinito): orquestrador reescrito com early-finish + teto global do job; finaliza assim que fontes rápidas trazem resultados suficientes (validado ao vivo: 51 concorrentes reais para "vareta de bambu")
- [x] STALE_JOB_MS reduzido (6min → 2min) para destravar jobs órfãos rapidamente
- [x] Limiar de early-finish ajustado para 15 ofertas; logs de progresso por fonte
- [x] Categorias > Produtos em destaque / Termos em alta (loading infinito): timeout por requisição (AbortController, 8s) em authedFetch e no token OAuth do provider oficial; fan-out de getBestSellers limitado ao solicitado pela UI (validado ao vivo: 48 termos + 6 produtos reais carregam em ~12s)
- [x] Banner "verde com texto de erro": confirmado que o texto problemático era da versão publicada antiga; código atual já tem mensagens corretas (verificado por grep, sem ocorrências)
- [x] Suíte completa verde: 221 testes / 30 arquivos + TS/LSP limpos


## CAUSA RAIZ DE PRODUÇÃO — Radar travado SÓ no app publicado (10/06)
- [x] Diagnóstico: coleta era fire-and-forget (launchSearchJob) iniciada dentro do startSearch; no Cloud Run (min-instances=0) a instância congela/recicla após a resposta HTTP e perde o job em memória → linha fica "running" para sempre → spinner infinito SÓ em produção
- [x] Confirmado em produção: market.status responde (backend novo no ar), mas startSearch/getSearch são protected; reproduzido o modelo de falha
- [x] Reescrita: coleta agora roda SÍNCRONA dentro do polling vivo (ensureCollected no getSearch), bounded pelo deadline global ~70s do orquestrador (< 180s do Cloud Run); startSearch não faz mais fire-and-forget
- [x] Dedupe por processo com promise compartilhada; polls subsequentes não bloqueiam; stale-recovery mantido como rede de segurança
- [x] Testes: searchJob (8) atualizados + novo resilientCollection.test.ts (2) simulando perda de instância
- [x] Validado ao vivo: "hashi descartavel" → 52 concorrentes reais (Oxylabs contribuiu)
- [x] Suíte completa: 226 testes / 31 arquivos verdes + TS limpo


## IMAGENS EM BRANCO — RESOLVIDO (gravação 21:32/21:41)
- [x] Causa raiz: thumbnail vazio no fluxo de catalogo (buyBox?.thumbnail ?? pic escolhia string vazia) -> img src vazio em branco
- [x] Provider: corrigida prioridade do thumbnail em mapCatalogProduct (preferir foto do catalogo, secure_url, tratar string vazia como ausente)
- [x] Componente reutilizavel ProductImage.tsx: placeholder com icone quando sem foto, fallback onError, normalizacao https, referrerPolicy no-referrer (evita bloqueio de hotlink do ML)
- [x] Aplicado em TODAS as telas: MaisVendidos, Categorias, Comparar, Oportunidades, Painel, Monitoramento, Vendas, Anuncios, RadarConcorrentes, Diagnostico, ProductCard (Buscar)
- [x] Validado ao vivo: "Mais vendidos" exibe fotos reais (http2.mlstatic.com) com precos reais
- [x] Suite 226 testes verdes + TypeScript limpo
- [x] Esclarecimento: ranking traz eletronicos porque categoria padrao = Celulares; trocar no seletor para o nicho. NAO e dado de exemplo (vem da API oficial).


## DIAGNÓSTICO "serviço instável" — RESOLVIDO (2026-06-10)

- [x] Causa raiz: a procedure `diagnose` dependia EXCLUSIVAMENTE da Unwrangle (fonte mais instável) para o detalhe do concorrente — quando ela caía, a tela mostrava "Serviço de dados temporariamente instável", embora o Radar (Oxylabs+ScrapingBee) funcionasse
- [x] Correção: novo módulo `server/competitors/competitorDetail.ts` — detalhe resiliente multi-fonte (página renderizada via ScrapingBee → Oxylabs → Unwrangle como último recurso), parseando sinais estáveis do HTML (og:title, og:image, itemprop price, FULL/frete)
- [x] Lida com links de tracking do Radar (click1.mercadolivre.com.br/mclics/...) — o proxy segue o redirect até a página real do anúncio
- [x] Validado ao vivo: hashi /p/MLB46238945 → R$ 20,64 + foto real; e pela UI via "Diagnosticar" no Radar → "Hashi Redondo Sushi 1000 Pares" R$ 124,87 + FULL detectado
- [x] Testes: 6 novos (parseListingHtml + getCompetitorDetail com fallbacks e erro honesto); suíte total 232 testes verdes


## NOVA FRENTE — Aba Vendas (período + dia + gráfico de barras)

- [x] Backend: agregação por período (procedures `salesRange` e `salesPeriods`, com `getPeriodSummary` reaproveitando cache de pedidos pagos)
- [x] Backend: série diária densa cobrindo todos os dias do intervalo (opção `fill` + `fillDailySeries`, dias sem venda = 0)
- [x] Backend: vendas de um dia específico via `salesRange` com intervalo de 1 dia (faturamento, pedidos, unidades, ticket)
- [x] Frontend: card "Mês atual" e "Mês anterior" clicáveis — validado R$ 712,65 (jun) e R$ 1.568,00 (mai)
- [x] Frontend: seletor de período (Mês atual / Mês anterior / Personalizado com dois date inputs) recalculando KPIs
- [x] Frontend: card separado "Vendas do dia" com seletor de dia (validado 06/10 → R$ 23,65)
- [x] Frontend: gráfico de BARRAS mostrando todos os dias do mês (validado: 31 barras em maio)
- [x] Estabilização de inputs de query com useMemo (evita re-fetch infinito); lógica de datas pura em `shared/period.ts` (BRT GMT-3)
- [x] Testes: 14 de período (BRT) + 3 de KPIs/série por período; suíte total 245 verdes; TS/LSP limpos; validação ao vivo + checkpoint

## Painel — gráfico de barras + período + cancelamentos (jun/2026)
- [x] Backend: série diária inclui `cancelled` e `cancelledAmount` por dia (cache de pedidos cancelados, bucket por date_created)
- [x] Backend: `lastNMonthsRange` (BRT) para "Últimos 2 meses"
- [x] Painel: gráfico de BARRAS de faturamento por dia (substitui gráfico anterior)
- [x] Painel: seletor de período Mês atual / Mês anterior / Últimos 2 meses / Personalizado (date inputs)
- [x] Painel: barras dos dias com cancelamento destacadas em vermelho + legenda + tooltip com nº/valor cancelado
- [x] Eixo X adaptativo (dia do mês para spans curtos, dd/mm para spans longos)
- [x] Testes: 4 de lastNMonthsRange + 1 de cancelados-por-dia; suíte 250 verdes; TS limpo; validação ao vivo OK


## Painel — gráfico full-width + duas barras por dia (jun/2026)
- [x] Gráfico ocupa toda a largura da página (SectionCard fora do grid lateral)
- [x] Mostrar todos os dias do mês no eixo X (currentMonthFullRange: mês inteiro, dias futuros zerados)
- [x] Duas barras finas por dia: faturamento (verde) e valor cancelado (vermelho), maxBarSize=10
- [x] Eixo de valores com símbolo de dinheiro (R$ via formatBRLCompact)
- [x] Tooltip com 'Sem movimento' em dias vazios; Saúde da conta movida para linha de baixo
- [x] Validação ao vivo (30 dias de junho, dia 3 com barra vermelha) + 2 testes de currentMonthFullRange (22 de período); TS limpo + checkpoint

## Painel — resumo no gráfico + legibilidade (jun/2026)
- [x] Mini-cards dentro do card do gráfico: Vendas totais (verde), Cancelamentos (vermelho), Saldo = vendas - cancelado (SummaryStat)
- [x] Melhorar separação visual entre os dias (barCategoryGap 30% em mês, grid vertical + tickLine por dia, padding lateral)
- [x] Alinhar perfeitamente o eixo de valores R$ (YAxis width=72, textAnchor=end, tickMargin=8, allowDecimals=false) — inclui R$ 0
- [x] Validação via página isolada de inspeção (mini-cards + eixo alinhado + barras finas verde/vermelha); 252 testes verdes; TS limpo + checkpoint

## Painel — meses anteriores + 60 dias + centralização (jun/2026)
- [x] Diagnóstico: backend paginava só 1000 pedidos por status com sort date_desc; API retorna 41 pagos (abr/mai/jun) e 18 cancelados — meses anteriores existem. O card "2 meses" usava lastNMonthsRange e funcionava; ajustado conforme pedido.
- [x] Substituir card "Últimos 2 meses" por "60 dias" (lastNDaysRange: janela móvel de 60 dias, cruza meses anteriores com segurança)
- [x] Centralizar as 2 barras dentro do slot do dia (barCategoryGap 35-45%, barGap 2, maxBarSize 5-7) — não ficam mais coladas nas laterais
- [x] Gráfico continua full-width, todos os dias, eixo R$ alinhado
- [x] Testes: 3 novos de lastNDaysRange (suíte 255 verdes); TS limpo; validação via página isolada de inspeção (60 dias abr→jun)

## Resiliência à perda de sessão no preview (jun/2026)
- [x] QueryClient com staleTime (60s)/gcTime (30min) e retry que ignora erros de auth — mantém dados em cache durante revalidação
- [x] Silenciar console.error para erros de sessão/UNAUTHORIZED (isAuthError) — não dispara mais o badge global
- [x] Gate de "Conecte sua conta" só quando confirmado desconectado, sem isFetching e sem cache (Painel, Vendas, Anúncios, Pós-venda, Reputação)
- [x] Erros de query só derrubam a página quando não há dados em cache
- [x] Validado ao vivo (Painel sem badge, sem piscar) + 255 testes verdes + TS limpo + checkpoint

## Painel — redesenho do gráfico + Top 10 (jun/2026)
- [x] Redesenhar gráfico: cada dia em slot com tick/divisória sob o número do dia; duas barras (faturamento + cancelado) lado a lado dentro do slot
- [x] Barras grossas e legíveis (maxBarSize 14, barGap 3, barCategoryGap 20%) + scroll horizontal (minWidth ~34px/dia) em períodos longos
- [x] Top produtos do Painel: tabela com 10 mais vendidos, preço unitário (revenue/unidades), nº de vendas e valor total
- [x] Validado (inspeção isolada + dados reais: dia 3 com barra vermelha, Top 10 completo) + 255 testes verdes + TS limpo + checkpoint


## Painel — correções de gráfico/contagem (jun/2026)
- [x] Corrigir eixo de datas no modo "60 dias" (interval adaptativo no XAxis; datas em diagonal, sem sobreposição) — validado com dados reais (12/04...07/06)
- [x] Remover card "Saldo" do gráfico (manter apenas "Vendas totais" e "Cancelamentos", em 2 colunas)
- [x] Auditoria via API do ML: pagos jun=10, cancelados jun=1 (antes mostrava 18 = total de todos os tempos)
- [x] Backend: contar cancelados DENTRO do período (não o total global) — KPI agora reflete o período (jun=1, 60d=17)
- [x] Backend: bucketizar série diária por BRT (GMT-3) via brtDateKey (evita jogar venda noturna para o dia seguinte em UTC)
- [x] Testes atualizados (cancelled por período) + 2 novos de brtDateKey; suíte 257 verdes; TS limpo; validação ao vivo + checkpoint


## Painel — card "Desde o início da loja" (jun/2026)
- [x] Backend: getStoreLifetime — primeira venda (date_asc&limit=1), faturamento total acumulado e total de vendas (paging.total + soma dos pagos)
- [x] Shared: interface StoreLifetime (firstSaleMs, totalRevenue, totalOrders, currency)
- [x] Router: procedure storeLifetime (protected)
- [x] Frontend: card no Painel com data de início, dias de existência, total R$ e total de vendas
- [x] Atualização diária (dados recalculados a cada carregamento; dias de existência derivados da data atual)
- [x] Testes: getStoreLifetime (loja com vendas + loja sem vendas) — 263 testes verdes, TS limpo
- [x] Validado ao vivo: Primeira venda 24/04/2026 · 47 dias · R$ 2.655,65 · 41 pedidos
- [x] Testes + validação ao vivo + checkpoint


## Melhorias visuais + ajustes (jun/2026)
- [x] Renomear card para "Histórico acumulado" (título principal)
- [x] Gráfico mensal: mostrar todos os dias escritos no eixo X (interval=0, sem pular)
- [x] Top 10 sempre aberto: 10 linhas fixas; preencher com linha em branco quando houver menos vendas
- [x] Melhoria visual geral: paleta com mais realce/contraste, refinamento de cards, sombras, tipografia e detalhes
- [x] KpiCard com trilho de cor lateral + ícone destacado; SectionCard com cabeçalho separado; canvas-wash de fundo
- [x] Sidebar: wordmark com gradiente, item ativo com indicador lateral
- [x] Títulos com gradiente de marca (nome da loja, landing)
- [x] Validar ao vivo (60 dias: 56 dias no eixo, Top 10 completo, R$ 2.655,65) + TS limpo + checkpoint


## Ajustes de layout + vendas por dia (jun/2026)
- [x] Mover card "Histórico acumulado" para logo abaixo do título (antes dos KPIs)
- [x] Reduzir um pouco o tamanho do card Histórico acumulado para harmonizar (header e valores compactos)
- [x] Aumentar/melhorar a tipografia do rótulo do mês/período (badge com fundo de marca, fonte display bold)
- [x] Seletor de dia abaixo do gráfico: escolher um dia do período e listar produtos vendidos naquele dia (componente DaySales)
- [x] Backend: procedure account.productsByDay + AccountProvider.getProductsByDay (orders do dia BRT agrupados por item) + tipo DayProducts
- [x] Testes: getProductsByDay (dia com vendas + boundary BRT + dia sem vendas) — 265 testes verdes, TS limpo
- [x] Checkpoint (validação ao vivo bloqueada por indisponibilidade transitória do banco; coberto por testes)


## Lembrete de conexão ML expirada (jun/2026)
- [x] Backend: getCredentials expõe tokenExpired/tokenExpiresAt + helper isConnectionStale (reuso back/front)
- [x] Frontend: lembrete âmbar discreto no canto superior do Painel quando expirado/erro, com atalho para Configurações
- [x] Ocultar quando conexão estiver ativa (validado ao vivo: oculto) + 6 testes do isConnectionStale (271 testes verdes, TS limpo)
- [x] Causa raiz da reconexão resolvida: Client Secret estava vazio no banco; reconectado (status connected, secret 32 chars, token renovando)


## Campos de cancelamento (jun/2026)
- [x] Histórico acumulado: 5º campo = vendas canceladas (qtd acumulada) + 6º campo = valor cancelado acumulado (R$) — grid de 6 colunas
- [x] Backend: getStoreLifetime expõe canceledOrders + canceledRevenue (acumulado); SalesKpis ganha cancelledAmount
- [x] Card do mês "Faturamento": "10 pedidos pagos" agora aparece dentro deste card (sublabel)
- [x] Card do mês de pedidos: removido o "1 cancelado" e criado card novo "Cancelados" com qtd + valor (R$)
- [x] Testes (getStoreLifetime com/sem cancelados) + validação ao vivo (18 / R$ 2.442,40 · mês 1 / R$ 199,40) — 271 testes verdes, TS limpo


## Ajustes cards do mês + seletor (jun/2026)

- [x] Card Faturamento: rodapé só "10 pedidos" (número destacado em fonte maior/negrito) + plural condicional
- [x] Card Cancelados: valor (R$) em cima e nº de pedidos embaixo (mesma lógica do Faturamento) + plural condicional
- [x] Card Reputação: accent segue a cor real (verde/amarelo/laranja/vermelho) via reputationAccent
- [x] Seletor de período movido para entre Histórico acumulado e os cards do mês (controla cards + gráfico)
- [x] Validado ao vivo + 271 testes verdes + TS limpo + checkpoint


## Melhoria da aba Vendas (jun/2026)
- [x] Seletor de período + badge do mês idênticos ao Painel
- [x] Gráfico idêntico ao Painel (mesmo espaço/comportamento/tooltip/legenda)
- [x] Card "venda do dia" maior e mais rico: 5 KPIs (faturamento, pedidos, ticket, unidades, itens distintos) + tabela; default ao dia atual; seletor maior
- [x] Backend: getSalesDashboard ganha topLimit (0 = sem limite); enriquecimento de thumbs limitado a 80 itens p/ evitar timeout
- [x] Ranking expansível listando TODOS os produtos do período (topLimit:0); pódio + link do anúncio; expande quando >10
- [x] Testes (271 verdes) + TS limpo + validação ao vivo (jun/2026: ranking completo, venda do dia 10/06 enriquecida) + checkpoint

## Produtos clicáveis + interação no gráfico + busca no ranking (10/jun)
- [x] Link para o anúncio em TODO produto (clicável em qualquer lugar que apareça): Top 10 Painel, "produtos do dia" Painel/Vendas, ranking Vendas, e demais
- [x] Backend: garantir permalink em DayProducts (getProductsByDay) e em topProducts (getSalesDashboard)
- [x] Clicar numa barra do gráfico seleciona aquele dia no card de produtos do dia (Vendas e Painel)
- [x] Busca/filtro por nome no ranking de produtos (Vendas), com contagem e botão limpar
- [x] Testes + TS limpo + validação ao vivo + checkpoint

## Solicitação: produtos clicáveis + clique na barra + busca no ranking
- [x] Componente reutilizável ProductCell (nome+thumb como link para o anúncio no ML)
- [x] Painel: Top 10 com produtos clicáveis
- [x] Painel: "Produtos vendidos por dia" com produtos clicáveis
- [x] Painel: clicar numa barra do gráfico seleciona aquele dia
- [x] Vendas: tabela do dia e ranking com produtos clicáveis
- [x] Vendas: clicar numa barra do gráfico seleciona o dia no card "Vendas do dia"
- [x] Vendas: busca/filtro por nome no ranking de produtos
- [x] Utilitário filterProductsByName (case/acento-insensível) + teste vitest


## Ajustes Painel (10/jun, 2ª rodada)
- [x] Remover card "Pesquisa de mercado" do Painel
- [x] Ranking Top 10 mais largo (largura total) e card "Anúncios sem vendas" abaixo do ranking
- [x] Melhorar card de Anúncios: sem vendas, pausados sem venda, pausados com venda, sem estoque, ativos etc.
- [x] Corrigir alinhamento dos números nos cards de "Vendas do dia" (estavam deslocados à esquerda)


## Ajustes (10/jun, 3ª rodada)
- [x] Histórico acumulado: faturamento em verde, valor cancelado em vermelho (destaque visual)
- [x] Backend getProductsByDay: incluir produtos cancelados do dia
- [x] Lista de produtos do dia (Painel e Vendas): mostrar itens cancelados ao selecionar/clicar num dia com cancelamento
- [x] Card "Anúncios em detalhe": padronizar estética/tipografia dos tiles


## Ajustes (10/jun, 4ª rodada)
- [x] Painel: card "Produtos vendidos por dia" recolhível (expand/retrair), recolhido por padrão (abre auto ao clicar numa barra)
- [x] Painel: card "Top 10" recolhível (expand/retrair), recolhido por padrão


## Reformulação "Meus anúncios" (10/jun)
- [x] Backend: getListings escala p/ 500+ itens (paginação ampliada) e visitas em lote (/visits/items?ids=)
- [x] Backend: janela de visitas ajustável (7/30/60/90d) com fallback time_window quando custom
- [x] Backend: enriquecer ListingRow (createdMs/updatedMs, freeShipping, logisticType, catalogListing, stockValue)
- [x] Shared: funções puras de faixas (visitas, conversão, estoque, saúde) + classificação de insights + filtros/ordenação/CSV
- [x] Shared: testes vitest das faixas e insights (12 testes)
- [x] Frontend: KPIs ampliados (6) + painel de insights acionáveis (6 cards clicáveis)
- [x] Frontend: distribuição por faixas (visitas/conversão/estoque/saúde) com chips clicáveis
- [x] Frontend: filtros combináveis (status, tipo, faixa de preço, frete, faixas) + busca + resumo "X de Y"
- [x] Frontend: ordenação por coluna + janela de visitas ajustável (7/30/60/90d) + export CSV
- [x] Frontend: exportação CSV do conjunto filtrado
- [x] Testes + TS limpo + validação + checkpoint


## BUG: Meus anúncios carregando infinito (10/jun)
- [x] getListings: usar visitas em lote (/visits/items?ids=) sempre no carregamento (rápido)
- [x] Janela por data (7/60/90d) só 1 item por vez na API → opt-in (windowVisits) e limitada a 120 itens
- [x] Timeout defensivo por request (12s AbortController)
- [x] Frontend: modo "Total" por padrão + janelas opcionais com aviso
- [x] Testes (288, +1 garante load sem chamadas por item) + TS limpo + checkpoint


## Revisão precisão + UI Meus anúncios (10/jun)
- [x] Visitas: /visits/items?ids= é acumulado de ~2 anos → rótulo corrigido para "Visitas (2 anos)"
- [x] Janela recente (30/60/90d) permanece opt-in/limitada (API só 1 item por request)
- [x] Revisados números; removida métrica de capital imprecisa
- [x] Removido card "Capital em estoque" (KPI, coluna da tabela, resumo e coluna CSV)
- [x] Padronizado KpiCard (altura uniforme, rótulo+ícone no topo, valor ancorado)
- [x] Testes (288) + TS limpo + checkpoint


## BUG: Visitas erradas + remover seletor "2 anos" (10/jun)
- [x] Backend: card de Visitas usa time_window por item (período real 30/60/90d), não o total de 2 anos
- [x] Backend: visitas do período em paralelo (concorrência 15, cap 300) com timeout; sem dados = null
- [x] Frontend: removido seletor "2 anos"; seletor de período (30/60/90d) altera de fato as visitas
- [x] Frontend: rótulos do card de visitas refletindo o período selecionado
- [x] Testes (time_window por período + sem dados) + TS limpo + checkpoint


## Oportunidades + métricas de visitas (10/jun)
- [x] Remover card "Capital parado" das Oportunidades (frontend + insight no shared)
- [x] Ao selecionar um card de Oportunidades, mostrar a tabela de produtos logo abaixo (reposicionar bloco)
- [x] Backend: visitas desmembradas por status (ativos/pausados/encerrados) no summary
- [x] Frontend: novos cards de métricas (visitas por status e derivadas: ativos com/sem visitas, média por ativo)
- [x] Testes + TS limpo + checkpoint


## Gráfico de evolução + filtro de visitas (11/jun)
- [x] Backend: série diária (30d) de visitas agregadas dos anúncios ativos no listings result
- [x] Frontend: gráfico de evolução das visualizações dos ativos (sempre 30 dias, área com design do tema)
- [x] Frontend: remover card "Estoque por faixa" da distribuição
- [x] Frontend: seletor/filtro por número de visualizações na lista de anúncios (faixas)
- [x] Testes + TS limpo + checkpoint


## Raio-X da Ficha Técnica (fase 1: diagnóstico) (11/jun)
- [x] Backend: buscar atributos da categoria (GET /categories/{cat}/attributes) + atributos do item
- [x] Backend: calcular completude (faltantes, obrigatórios faltando, total) por anúncio (módulo puro technicalSpecs.ts)
- [x] Backend: rota tRPC account.technicalSpecs (resumo + por item)
- [x] Backend: testes do cálculo de completude (16 testes)
- [x] Frontend: card Raio-X com resumo (% completos, obrigatórios faltando, completude média)
- [x] Frontend: lista de anúncios com badge COMPLETA/INCOMPLETA + filtro (Todos/Incompletos/Faltam obrigatórios) + busca
- [x] Frontend: painel de detalhes (atributos faltantes / preenchidos) por anúncio (Sheet lateral)
- [x] Edição inline via API descartada nesta fase por decisão do usuário — fluxo adotado: copiar a ficha completa e colar no Mercado Livre (escrita direta fica como possível evolução futura)
- [x] Testes + TS limpo + checkpoint


## Raio-X Ficha Técnica — fase 2: correção + 100% dos ativos (11/jun)
- [x] Backend: analisar TODOS os anúncios ATIVOS da conta (search status=active, paginação completa, cap 5000)
- [x] Backend: lotes com concorrência limitada (multiget 20, concurrency 5/6) para não estourar tempo
- [x] Backend: expor catálogo editável por atributo (tipo, valores possíveis da lista, unidades, default unit, hint)
- [x] Backend: status global allComplete (true/false) + contagem de pendentes
- [x] Frontend: banner de status global claro (TUDO 100% vs X anúncios pendentes)
- [x] Frontend: área de correção por anúncio — preencher faltantes (texto/número/lista/unidade/sim-não)
- [x] Frontend: validação até ficar OK (barra de progresso + botão liberado quando 100%)
- [x] Frontend: copiar a FICHA COMPLETA ajustada (todos atributos) em bloco para colar no ML
- [x] Testes + TS limpo + checkpoint (20 testes do Raio-X, 98+ no total)

## Raio-X Ficha Técnica — ajustes (11/jun)
- [x] Opção "Não se aplica" em cada atributo faltante (conta como resolvido/preenchido; aparece como "Não se aplica" na ficha copiada)
- [x] Corrigir título distorcido do painel lateral (pr-12 no SheetHeader para não colidir com o X de fechar)

## Aba Anúncios — ajustes (11/jun)
- [x] Remover card "Conversão por faixa"
- [x] Remover card "Saúde do anúncio"
- [x] Padronizar tamanho dos mini-cards de seleção da lista (todos h-8: chips, Select de visualizações, inputs de preço, limpar filtros)
- [x] Revisar gráfico de linha de visitas: corrigido desalinhamento de fuso (chave de dia em UTC = a do ML); hoje (dia 11) entra como último ponto parcial em tempo real, ontem = dia 10; cards Hoje/Ontem; ponto de hoje destacado; refetch a cada 5min + ao focar; selo "Atualizado às HH:MM"
- [x] Testes + TS limpo + checkpoint (42 testes do provider/techspecs, incl. novo teste de alinhamento do dia atual)

## Gráfico de visitas — melhorias (11/jun)
- [x] Seletor de janela 7 / 30 / 90 dias (controle do topo agora usa 7/30/90; backend aceita lastDays=7)
- [x] Média móvel de 7 dias (linha tracejada) sobreposta ao gráfico via ComposedChart + Legend
- [x] Botão "Atualizar agora" no gráfico para forçar o refetch imediato das visitas

## Correção: ML Token Refresh (Conexão expirada — reconectar) — 11/jun
- [x] Lock por usuário em ensureUserAccessToken (uma renovação por vez; concorrentes aguardam o mesmo resultado)
- [x] Margem de segurança maior no refresh proativo (renovar antes de expirar)
- [x] Gravação atômica do novo par access_token + refresh_token
- [x] Tratamento de erro adequado quando refresh falha (status error + mensagem clara)
- [x] Retry-on-401 na camada de account/provider (refresh + 1 nova tentativa)
- [x] Testes: concorrência (uma única chamada de refresh), rotação do refresh_token, falha de refresh, retry 401
- [x] Rodar todos os testes e validar
- [x] CAUSA RAIZ: clientSecret vazio no banco impedia o refresh; protegido saveCredentials (não apaga secret vazio) e testCredentials (não rebaixa OAuth saudável)
- [x] Client Secret real regravado e renovação via refresh_token validada ao vivo (HTTP 200, novo par persistido, status=connected)
- [x] Checkpoint + reportar ao usuário

## Ajuste do gráfico de visitas (11/06)
- [x] Gráfico de visitas (Evolução das visitas, 30d): exibir rótulo de TODOS os 30 dias no eixo X
- [x] Cada rótulo com dia + dia da semana, na VERTICAL (rotacionado 90°), destacando hoje

## Ajustes de UX (11/06 - 2)
- [x] Gráfico de visitas: alinhar números dos dias (mesma linha de base) + sábado/domingo em vermelho
- [x] Card "Visitas" vira card de evolução (variação % vs. período anterior, seta verde/vermelha)
- [x] Navegação entre itens do menu sempre rola para o topo da página
- [x] Helpers compartilhados (shared/visitsTrend.ts) + testes (9 testes passando)

## Bug crítico: dados zerados em Anúncios (11/06)
- [x] Causa raiz: app usava userId LOCAL (1) em vez do ML user_id (3308178634) → ML responde "Searching another user items is restricted" → zeros
- [x] Adicionar coluna mlUserId em ml_credentials (schema + migração)
- [x] Salvar ml user_id no OAuth callback e no refresh
- [x] Provider usa mlUserId (fallback /users/me) em vez do userId local
- [x] Backfill da conta atual (mlUserId=3308178634)
- [x] Testes de regressão (resolveMlUserId, 8 testes)
- [x] Validar ao vivo (itens ativos + visitas reais retornam)

## Ajustes de UX em Meus anúncios (11/06 - 3)
- [x] KPIs: número proporcional ao card (clamp), todos alinhados, sublabel com slot reservado para harmonia
- [x] Gráfico de visitas: rótulo vertical único (dia + dia-da-semana) sem sobreposição
- [x] Card Raio-X: colapsável + sub-expansão (Ver todos / Ver menos) para muitos produtos
- [x] Oportunidades e alertas: colapsável
- [x] Lista de produtos: colapsável
- [x] Verificar status, salvar checkpoint (351 testes OK)

## Padronização visual global (11/06 - 4)
- [x] KpiCard: mais compacto/baixo e delicado, alinhamento de textos impecável (trilho de cor fino no topo, rótulo+ícone, número, sublabel reservada)
- [x] Cards expansíveis (SectionCard): cabeçalho fino em uma linha com chevron à direita
- [x] Regra global de gráficos: eixo de dias idêntico ao "Visitas diárias" (DayAxisTick compartilhado: vertical, dia + dia-da-semana, fim de semana vermelho)
- [x] Aplicar o eixo unificado a todos os gráficos (Anúncios, Painel, Vendas, Monitoramento)
- [x] dayAxisLabelParts pura no shared + 15 testes; suíte completa 357 testes
- [x] Verificar status, rodar testes, salvar checkpoint

## BUG: Meus anúncios zerado (rate limit 429 do ML) — 12/06
- [x] Causa: ML retorna 429 (Too Many Requests) e o get() devolvia null → tela zerada; items/search 403/vazio sob limite
- [x] Tratar 429 no AccountProvider.get(): respeitar Retry-After + backoff exponencial e retry (sem flipar para erro)
- [x] Reduzir concorrência das chamadas de visitas (15 → 6) para não provocar 429
- [x] mlUserId correto (3308178634) confirmado no banco; refresh com lock evita renovação redundante
- [x] Testes do comportamento de 429/backoff (27 testes do provider OK)
- [x] Validar ao vivo (12/06 23h): HTTP 200, rate limit baixou. Total=123 (active=15, paused=88, closed=20). 45 era valor antigo; hoje sao 15 ativos.

## GARANTIA: renovacao automatica do token + sistema nunca trava (travou na apresentacao) - 12/06
- [x] Servidor: timeout no fetch de refresh/exchange do OAuth (performRefresh + callback) para o lock nunca esperar para sempre
- [x] Servidor: timeout efetivo via fetchWithTimeout (10s) garante que o lock sempre libera; AbortError tratado como transitorio
- [x] Frontend: prazo (timeout 20s) no cliente tRPC (AbortController) para nunca ficar em loading infinito
- [x] Frontend: botao Reconectar com estado Redirecionando + protecao contra clique duplo (Configuracoes.tsx)
- [x] Frontend: ErrorState com Tentar novamente + mensagem amigavel de rate limit/timeout (Anuncios, Vendas, PosVenda, Reputacao)
- [x] Teste (vitest) cobrindo timeout/abort do refresh: nao trava, lock liberado, conexao preservada, proximo refresh OK
- [x] Rodar suite completa (364 testes OK), validar ao vivo e salvar checkpoint

## Melhorias pos-checkpoint (sugestoes 1 e 2)
- [x] Cache de servidor (5 min) por usuario+endpoint para dados da conta (accountCache.ts): reputacao, salesDashboard, salesRange, storeLifetime, listings, postSale, technicalSpecs
- [x] De-duplicacao de chamadas simultaneas (page burst => 1 fetch) e nao cacheia erros
- [x] connection deixada SEM cache (selo reflete estado real)
- [x] Selo "Conexao ativa - token renova automaticamente" nas Configuracoes com validade do token
- [x] Teste vitest do cache (6 casos): fresh hit, dedupe, TTL, nao cacheia erro, namespacing por usuario, invalidate
- [x] Suite completa: 366 testes OK; TS/LSP limpos

## CORREÇÃO: painel zerado / 4 erros (rate limit 429 do ML) — 12/jun
- [x] Diagnóstico: 429 do ML mascarado como resultado vazio -> painel R$ 0,00 falso
- [x] get() lança MLRateLimitError ao esgotar retries de 429 (não retorna mais null)
- [x] Router account: 429 vira TRPCError TOO_MANY_REQUESTS (erro honesto e retryável)
- [x] connection: 429 = conectado+rateLimited (não mostra "desconectado" falso)
- [x] Painel: banner honesto de rate limit com botão "Atualizar agora"
- [x] Cliente: sem auto-retry em 429 (não piora o throttle)
- [x] Painel não dispara mais o gráfico de visitas (~200 chamadas a menos por abertura)
- [x] includeVisitsSeries flag: série só na página de Anúncios
- [x] Concorrência das visitas reduzida de 6 para 4 (mais gentil com o ML)
- [x] Timeout do navegador 20s -> 45s (não corta o servidor antes da hora)
- [x] withBudget: visitas best-effort, nunca derrubam a página
- [x] Validação ao vivo: users/me 200, 123 anúncios, 46 vendas pagas (sem 429)
- [x] Testes: 368 passando, incluindo 4 de rate limit

## Navegação: separar Disponível x Em construção
- [x] Grupo "Disponível": Painel, Vendas, Meus anúncios
- [x] Grupo "Em construção": demais itens, com selo "Em breve" e aparência discreta
- [x] Itens em construção continuam navegáveis (mantêm rota) com indicação visual

## Módulo ADS (Mercado Ads) — leitura completa — 13/jun
- [x] Tipos compartilhados de Ads (shared/ads.ts)
- [x] Provider de Ads no servidor (leitura, cache 5min, tratamento 429)
- [x] Router tRPC ads (access, dashboard, campanhas, anúncios, inteligência)
- [x] Página /ads com abas (Dashboard, Campanhas, Anúncios, Inteligência)
- [x] Item "ADS" no grupo Disponível do menu lateral
- [x] Validação ao vivo (9 campanhas, ROAS 4.75x, ACOS 21%, 36% orgânico)
- [x] Testes vitest (buildSummary, buildAdsInsights, aggregateMetrics) — 8 casos
- [x] Suíte completa: 376 testes OK; TS limpo
- [ ] (Futuro) Escrita de Ads: liberar escopo write no DevCenter + reconexão
- [ ] (Futuro) Robôs internos de otimização 24/7 (após escrita liberada)
- [ ] (Futuro) Snapshots diários para gráfico de evolução por dia

## Aba Auditoria Mamba + Rastreio por Categoria (ADS) — 13/jun
- [x] Investigar campos auditáveis de campanha (ACOS-alvo, budget, status) e títulos dos anúncios ativos
- [x] Schema: snapshots diários de campanhas e anúncios (ads_campaign_snapshots, ads_item_snapshots) + log de mudanças (ads_change_log)
- [x] Heartbeat: job diário que registra snapshots e detecta mudanças da Mamba (endpoint /api/scheduled/adsSnapshot criado e registrado; cron a registrar via CLI após publicar)
- [x] Filtro de anúncios ATIVOS: helper isActiveAdStatus() robusto + opção activeOnly no getAds; snapshot e categorias seguem só os ativos (8 testes novos)
- [x] Após publicar: cron diário registrado (ads-snapshot-diario, 0 0 9 * * * UTC = 06:00 BRT, task_uid Rnfw8dvH6HaH2qwXZ4Q8Xo). Testado em produção: HTTP 200, 16 ativos / 9 campanhas, idempotente.
- [x] Backend: detecção de mudanças (diff entre snapshots) + avaliação de coerência + "o que faríamos"
- [x] Backend: categorização dos anúncios em 5 grupos (espetos, palito de manicure, aromatizador fibra/madeira, hashi, palitos de bambu)
- [x] Aba "Auditoria Mamba": linha do tempo de mudanças, coerência, recomendação própria, próximos 30 dias
- [x] Aba "Categorias" (ADS): visões e métricas por grupo em tempo real (visitas, vendas, conversão, gasto Ads)
- [x] Testes vitest (detecção de mudança, coerência, categorização) — 16 testes
- [x] Validação ao vivo + checkpoint

## Confiabilidade — eliminar tela "Não foi possível carregar" (13/jun)
- [x] Causa raiz: chamadas essenciais do getListings (getAllItemIds + getItemsDetails) fora do withBudget; um 429/timeout do ML quebrava a página inteira; cache apagava o último valor bom em falha
- [x] cachedAccountResilient (stale-while-error): mantém último snapshot bom por até 6h; em falha transitória serve o cache marcado como stale em vez de propagar erro
- [x] Procedure listings usa cachedAccountResilient e retorna { ...value, stale, asOf }
- [x] getItemsDetails: concorrência 5→3 (reduz chance de 429 na origem, chamada essencial)
- [x] Frontend Anúncios: aviso âmbar "Dados em cache · de HH:MM" quando stale, em vez da tela vermelha
- [x] 6 testes novos do cache resiliente (fresh/stale/no-fallback/staleMax/recover) — 401 testes OK, TS/LSP limpos
- [ ] Validar ao vivo em produção após publicar (carregar Meus Anúncios e confirmar ausência de erro)


## Lucratividade Real (integração BaseLinker + motor de imposto)
- [x] Pesquisar tributação Lucro Presumido (PIS/COFINS cumulativo, IRPJ/CSLL sobre presunção, ICMS)
- [x] Pesquisar ICMS interestadual (7%/12%) + DIFAL por estado de destino (venda a consumidor final)
- [x] Pesquisar benefício TTS-MG (Tratamento Tributário Setorial/Específico de Minas Gerais)
- [x] Motor de imposto com 2 cenários: COM TTS e SEM TTS (server/finance/taxEngine.ts, 15 testes)
- [x] Tratar DIFAL por UF de destino (delivery_state do pedido BaseLinker; carga = alíquota interna do destino sem TTS)
- [x] Sincronização BaseLinker: custos por SKU (average_cost) + pedidos (commission, delivery_price, auction_id)
- [x] Comissão/frete reais extraídos do campo admin_comments do pedido (feeParser.ts) — não vêm no campo numérico nesta conta
- [x] Cálculo de lucro por venda e por anúncio (cruzar auction_id -> MLB; rateio de comissão/frete por receita)
- [x] Aba Lucratividade Real no frontend com toggle de cenário TTS (botão hero + comparativo lado a lado)
- [x] Config editável de alíquotas (presunção, PIS/COFINS, ICMS por UF, carga TTS) + seletor de catálogo
- [x] Testes vitest: motor (15), provider (10), parser, lucratividade, router finance (6) — 446 testes no total
- [x] Cache resiliente (stale-while-error) na lucratividade, igual ao da página de Anúncios
- [x] Snapshot diário automático da lucratividade via Heartbeat (implementado — ver bloco abaixo)
- [ ] (Futuro) FCP por UF e adicional de 10% do IRPJ acima de R$ 60k/trimestre (campos já previstos, ligar quando necessário)

## Snapshot diário automático de Lucratividade (Heartbeat)
- [x] Tabela profit_snapshots (por usuário + dia) com totais de margem e quebra de custos
- [x] Função reutilizável captureProfitSnapshotForUser + computeProfitabilityForUser (compartilhada router/cron)
- [x] Handler /api/scheduled/profitSnapshot + registro no index.ts (cron-only, best-effort por usuário)
- [x] Procedure finance.history para expor o histórico de margem
- [x] Frontend: mini-evolução de margem (gráfico SVG sem TTS x com TTS) na aba Lucratividade
- [x] Testes vitest do handler (4) + snapshotDayKey (3) — 453 testes no total
- [ ] Após publicar: registrar cron diário (manus-heartbeat) e validar em produção

## Lucratividade — contar apenas vendas EFETIVADAS
- [x] Investigar status dos pedidos no BaseLinker (getOrderStatusList + order_status_id por pedido)
- [x] Mapear status efetivados vs cancelados/devolvidos (classifyStatusName por keyword; resiliente entre contas)
- [x] Filtrar pedidos não efetivados no provider/serviço (excluir da receita e do lucro; filterEffective ON por padrão)
- [x] Snapshot diário usa o mesmo serviço, logo já conta só efetivados
- [x] UI: aviso de vendas efetivadas x excluídas (com motivo) + label "vendas efetivadas" na Receita
- [x] Testes vitest do filtro de status (orderStatus + provider: exclusão e filterEffective=false) — 461 testes verdes
- [x] Validado com dados reais: 21 efetivados (10 excluídos) → receita R$ 1.972, margem real sobe de 5,1% para 12,6%
- [ ] Após publicar: validar em produção

## Padronização do seletor de período (sistema inteiro)
Regra única: Mês atual · Mês anterior · 60 dias · Base histórica (desde a 1ª venda) · Personalizado
- [x] Mapear todos os seletores de data/período existentes nas páginas
- [x] Criar componente único PeriodSelector (5 opções) reutilizável
- [x] Criar helper compartilhado de cálculo de ranges (mês atual, mês anterior, 60d, histórico, custom)
- [x] Backend: data da primeira venda já disponível via account.storeLifetime.firstSaleMs
- [x] Aplicar o PeriodSelector em Painel, Vendas, Lucratividade e Ads (Anúncios usa janela de visitas técnica do ML — exceção documentada)
- [x] Layout mantido: gráficos com scroll horizontal interno (não a página) já lidam com qualquer período
- [x] Testes vitest dos ranges (39 do módulo period + 57 das rotas) passando
- [x] Documentar a regra em references/period-selector.md

## Detalhamento de lucro por anúncio (Lucratividade)
- [x] Tornar cada linha da tabela "Lucro por anúncio" clicável
- [x] Abrir diálogo com cascata completa (receita → comissão → frete → CMV → impostos → Ads → lucro líquido) + lucro por unidade
- [x] Destacar visualmente anúncios em prejuízo (linha + ícone + diálogo) e filtro "só prejuízo"
- [x] Validar TS (limpo) e testes (47 verdes) e salvar checkpoint

## Lucratividade — preço unitário + card "Todos os anúncios"
- [x] Mostrar preço de venda unitário no diálogo de detalhe do anúncio
- [x] Mostrar etiqueta de status (ativo/pausado/encerrado) no diálogo do anúncio
- [x] Criar 2º card retrátil "Todos os anúncios" no fim da página
- [x] Card novo: seletor de data INDEPENDENTE (com base histórica)
- [x] Card novo: seletor de status (Todos/Ativo/Pausado/Encerrado)
- [x] Cruzar lucro por anúncio com status atual (mostrar pausados/encerrados que venderam)
- [x] Validar TS/testes e salvar checkpoint


## Robustez das visitas (nunca mostrar 0 falso) — 14/06
- [x] Backend: distinguir "visitas pendentes/indisponíveis" de "0 real" (flag visitsPending)
- [x] Backend: retentativa com backoff quando ML responde 429 no time_window (já existente, validado)
- [x] Backend: ampliar orçamento de tempo (9s->13s) e expor visitsAttempted/visitsResolved
- [x] Frontend (Meus anúncios): cards/coluna de visitas mostram "—/carregando" + aviso com botão Atualizar quando pendente
- [x] Frontend (Painel): breakdown não usa visitas (sem 0 falso) — nada a alterar
- [x] Testes vitest do estado pendente (3 casos: full miss, zero real, parcial) — 481 testes ok

## Card "Da receita ao resultado" no Painel (base histórica) — 14/06
- [x] Extrair ProfitFlow/FlowCard para componente compartilhado (components/finance/ProfitFlow.tsx)
- [x] Lucratividade passa a importar o ProfitFlow compartilhado (sem duplicação)
- [x] Painel: query finance.profitability com dias desde a primeira venda (base histórica) + finance.status
- [x] Painel: renderizar o card travado logo abaixo do "Histórico acumulado" (LifetimeCard) com estados carregando/não-configurado/sem-dados
- [x] TS limpo e 481 testes passando
- [x] Reestilizar o card para ficar idêntico ao "Histórico acumulado" (header gradiente + faixa de células), compacto/estreito


## Painel — reestruturar cards abaixo do seletor (14/06)
- [x] Aumentar a fonte da porcentagem no card "Da receita ao resultado" (topo)
- [x] Substituir os 4 KpiCards por faixa "Da receita ao resultado" que acompanha o período selecionado
- [x] Adicionar colunas "Anúncios ativos" e "Cancelados" nessa faixa
- [x] Remover o card de Reputação do bloco abaixo do seletor
- [x] TS limpo + testes + checkpoint

## Painel — substituir 4 KpiCards por faixa única "Da receita ao resultado" (15/06)
- [x] Faixa com Anúncios ativos | Receita | Comissão | Frete | CMV | Impostos | Ads | Cancelados | Resultado seguindo o período selecionado
- [x] Estilo idêntico ao card do topo (header gradiente + células com divisórias)
- [x] Remover card de Reputação da faixa de período
- [x] Tratar BaseLinker não configurado (colunas de custo como "—" + dica "configurar")
- [x] Limpeza de imports/função órfãos (KpiCard, DollarSign, ShoppingBag, reputationAccent)
- [x] TS limpo, 485 testes passando

## BUG Ads na Lucratividade (15/06) — relatado por Fernando
- [x] Totais (result.totals) ignoram o gasto de Ads (computeProfit forçado com ads:0) — Ads aparece zerado na faixa do Painel e some no card do topo
- [x] Lucro por anúncio conta Ads por LINHA (dupla contagem quando o item tem vários pedidos/linhas)
- [x] Corrigir buildProfitability: somar Ads UMA vez por item (totais e por anúncio)
- [x] Garantir que Ads não sofre imposto (já correto no taxEngine) e netProfit recalculado
- [x] Atualizar/adicionar testes vitest cobrindo Ads nos totais e ausência de dupla contagem
- [x] TS limpo + suíte verde + checkpoint

## Painel — ajustes faixa + remover card de anúncios (15/06) — Fernando
- [x] Remover o card "Anúncios em detalhe" do Painel (informação fica na aba Meus Anúncios)
- [x] Mover "Anúncios ativos" para o FINAL da faixa, começando pela Receita
- [x] Limpeza de imports órfãos (PauseCircle, Archive, LucideIcon, ListingRow) + remoção de ListingStat/ListingsBreakdown
- [x] TS limpo + 487 testes passando + checkpoint

## Painel — gráfico Evolução das visitas (15/06) — Fernando
- [x] Extrair VisitsEvolutionChart (+ helpers) para componente compartilhado em components/charts
- [x] Inserir o gráfico no Painel, entre o seletor de dias e o card "Da receita ao resultado"
- [x] Buscar a série de visitas no Painel (mesma fonte da aba Meus Anúncios)
- [x] TS limpo + testes + checkpoint


## BUG gráfico de visitas mostra "Sem visitas" + erro no rodapé (15/06) — Fernando
- [x] Backend: aumentar orçamento da série de visitas (6s) e/ou tornar coleta mais resiliente para contas grandes
- [x] Backend: série vazia por 429/timeout é sinalizada como pending (visitsSeriesPending), não como "zero real"
- [x] Frontend: distinguir "carregando/indisponível (429/budget)" de "zero real" — não exibir "Sem visitas registradas" enganoso
- [x] Frontend: ResponsiveContainer com minWidth/minHeight para mitigar aviso width(0)
- [x] Testes vitest (pending + resiliência por item) + TS limpo + 485 testes passando + checkpoint
- [x] Rodapé: rate limit (429) tratado rebaixado de console.error para console.warn (remove o "1 error" alarmante)


## BUG gráfico de visitas mostra dia futuro (segunda no domingo) (15/06) — Fernando
- [x] Causa: eixo da série de visitas ancorado em UTC; à noite no BRT virava o dia seguinte
- [x] Ancorar eixo da série no fuso de Brasília (BRT, UTC-3) usando brtDateKey + âncora 03:00:00Z
- [x] Datas do ML já vêm em offset BRT (-03:00); slice(0,10) mantém o dia BRT correto + frontend "hoje" em BRT
- [x] Último ponto é sempre HOJE (BRT), parcial, nunca um dia futuro (teste de noite de domingo)
- [x] Testes vitest (último ponto = hoje BRT + noite de domingo) + 486 testes passando + checkpoint


## BUG gráfico de visitas trava ~5 min carregando (15/06) — Fernando (CRÍTICO, lançamento amanhã)
- [x] Causa: fan-out de 200+ chamadas time_window por anúncio na query listings, bloqueante + loop de refetch quando pending
- [x] Criar procedure dedicada account.visitsSeries com cache stale-while-revalidate (swrAccount, TTL 10min)
- [x] Coleta da série em SEGUNDO PLANO (getVisitsSeriesOnly, não bloqueia a resposta); página serve último snapshot bom na hora; cold start retorna "loading"
- [x] Religar o gráfico do Painel e de Anúncios à nova procedure; remover includeVisitsSeries bloqueante
- [x] Remover o loop agressivo de refetch quando pending; refetch suave (60s) só para atualizar
- [x] Testes vitest (5 do swrAccount: cold/non-blocking/stale/fail/dedupe) + TS limpo + 491 testes verdes + checkpoint


## BUG gráfico de visitas ainda trava (15/06 noite) — Fernando (CRÍTICO, lançamento amanhã)
- [x] Diagnóstico empírico: conta tem só ~18 anúncios ativos (não 200+); volume NÃO era a causa
- [x] Confirmado na doc oficial: time_window e /items/visits NÃO aceitam multiget (1 item/chamada) — sem atalho de lote para a série diária
- [x] CAUSA RAIZ real: a 1ª chamada à API ML do egress falha por timeout/socket; get() só tinha retry de 429, então virava null e zerava a coleta de fundo (gráfico preso em "Carregando")
- [x] Adicionado RETRY de rede/timeout no get() (até 3 tentativas, backoff curto) — recupera a 1ª conexão que cai
- [x] getItemVisitsSeries distingue "falha" de "respondeu com 0 visitas" (flag ok) — item com 0 visitas conta como resolvido, não vira pending falso
- [x] Concorrência da coleta ajustada (4→6); validado real: 18/18 itens resolvidos em ~7s, 399 visitas/30 dias, hoje(BRT) como último ponto
- [x] Polling adaptativo no frontend (Painel + Anúncios): 4s enquanto pending, 60s após carregar — gráfico aparece em segundos no 1º acesso
- [x] Conexão no PUBLICADO: token válido no banco (connected, refresh ok); tela "Conecte sua conta" era efeito do mesmo timeout — agora protegida pelo retry de rede
- [x] Testes vitest novos (retry de rede + zero-resolvido) + TS limpo + suíte verde (493) + checkpoint


## Ajuste de layout: compactar gráficos do Painel (15/06) — Fernando
- [x] Reduzir altura do gráfico de visitas (h-80→h-56) e do gráfico de faturamento (h-72→h-56)
- [x] Diminuir espaços acima/abaixo: bodyClassName px-5 py-3 nos dois SectionCards + space-y-3 interno + margens do chart menores
- [x] Reduzir alturas dos estados loading/vazio/pending (h-64→h-52) para casar
- [x] Nova prop bodyClassName no SectionCard (sem afetar outros cards) + TS limpo + checkpoint


## Erros no rodapé ("5 errors") — má impressão (Fernando)
- [x] Diagnóstico: contador alimentado por ruído, não falhas reais — "signal is aborted without reason" (queries canceladas pelo polling/desmontagem) + NOT_FOUND transitório de reputação
- [x] main.tsx: ignorar AbortError/cancelamento no console.error global (query + mutation)
- [x] main.tsx: tratar NOT_FOUND (reputação/dados) como transitório (warn, não error) — UI já mostra mensagem e recupera no próximo poll
- [x] main.tsx: dar reason descritiva ao abort por timeout do cliente (TimeoutError, em vez de "without reason")
- [x] Validado: após reload e navegação entre páginas, console com 0 errors / 0 warnings; TS limpo; suíte verde (497)


## URGENTE: ADS estoura rate limit (429) "Não foi possível carregar" (Fernando, em produção)
- [x] Criar limitador de taxa GLOBAL serializado (fila com espaçamento mínimo) compartilhado por TODAS as chamadas ao ML — transforma rajadas paralelas em chamadas espaçadas (entregue no bloco abaixo: mlRateLimiter.ts)
- [x] Aplicar o limitador no AdsProvider.get() e no accountProvider.get() (gargalo único)
- [x] Cachear advertiserId por processo/usuário (evitar repetir a chamada de advertiser em cada aba)
- [x] Migrar leituras de ADS para cachedAccountResilient (stale-while-error) — em 429 transitório, servir último dado bom rotulado, nunca tela de erro
- [x] Testes vitest do limitador (serialização, espaçamento, respeito a Retry-After) + suíte verde + TS limpo
- [x] Validar a tela ADS ao vivo (sem 429) e checkpoint; orientar publicação


## URGENTE: ADS "Não foi possível carregar (429)" — Fernando (funcionava no início e parou)
- [x] Diagnóstico decisivo: endpoint PÚBLICO /sites/MLB (sem token) também retorna 429 a partir do nosso ambiente → o IP de saída do sandbox está limitado/bloqueado pelo ML (não é a conta, token ou volume da loja)
- [x] Confirmado com o Fernando: funcionava perfeitamente quando criamos → reforça limite de IP acumulado, não regressão de código
- [x] Defesa anti-burst: criado limitador GLOBAL serializado (server/ml/mlRateLimiter.ts) — todas as chamadas ML (AdsProvider + AccountProvider) passam por 1 fila, concorrência 1, espaçamento mínimo 350ms, cooldown global no 429/Retry-After
- [x] Reuso do advertiserId por token (cache 30min) → elimina chamadas repetidas de /advertising/advertisers em cada aba do ADS
- [x] Resiliência: leituras de ADS (dashboard, campaigns, ads, categories, insights) migradas para cachedAccountResilient → em 429 transitório a tela mostra o ÚLTIMO dado bom (stale) em vez do erro vermelho
- [x] Limitador transparente sob teste (bypass + spacing 0 + cooldown off) para não acoplar com fake timers/isolamento; comportamento real coberto por mlRateLimiter.test.ts (4 testes)
- [x] Suíte completa verde (501 testes) + TypeScript limpo + checkpoint
- [x] Reforço para produção: TTL de cache do ADS aumentado de 5min → 15min (as 6 abas batem quase tudo em cache, reduzindo o nº de chamadas ao ML — maior alavanca contra o 429) e aba Auditoria também migrada para cachedAccountResilient
- [x] Suíte verde após reforços (cache/limitador) + TypeScript limpo + checkpoint
- [ ] PENDENTE (fora do controle de código): se o 429 ainda persistir no site PUBLICADO mesmo com cache 15min, é limite de IP/cota do ML — validar no ambiente publicado (egress diferente do sandbox); se persistir, avaliar contato com o ML


## Bug: botão "Configurar" da Lucratividade não funcionava (15/06)
- [x] Causa: painel "Configuração de impostos" estava DENTRO do ramo else do ternário de profit (só renderizava com dados de lucro OK) + condição extra `&& cfg.data`
- [x] Mover o painel para FORA do ternário (logo após o seletor de período) → abre sempre que "Configurar" é clicado, independente do estado da query de lucro
- [x] Tratar estados de loading/erro da própria config (skeleton + ErrorState com retry) em vez de não renderizar nada
- [x] TypeScript limpo + validação visual na preview (botão abre o painel com campos editáveis + Salvar/Desfazer) + checkpoint


## Acesso por senha compartilhada (qualquer pessoa com o link entra)
- [x] Decisão de segurança alinhada com Fernando: acesso público protegido por senha única (não OAuth por visitante)
- [x] Backend: procedure pública auth.passwordLogin (valida senha vs secret ACCESS_PASSWORD; em acerto emite sessão do usuário dono e seta cookie) + auth.gateInfo (flag pública)
- [x] Comparação de senha em tempo ~constante; senha guardada como secret (ACCESS_PASSWORD), nunca no código
- [x] Frontend: AccessGate no DashboardLayout mostra campo de senha quando gate ativo; link discreto "Entrar como administrador (Mercado Livre)" para o dono
- [x] Testes vitest (4): gateInfo, senha correta emite cookie, senha errada UNAUTHORIZED, sem senha PRECONDITION_FAILED
- [x] Validação real ponta-a-ponta: gateInfo=on, senha errada=401, senha certa=200+cookie, auth.me reconhece dono (id 1, admin)
- [x] Validação visual: visitante deslogado vê a tela de senha; suíte verde (504; única falha é teste live externo de oxylabs, sem relação)


## Bug: login por senha "não está linkada com a página principal" (Fernando, 15/06)
- [x] Diagnóstico: visitantes digitavam a senha mas ficavam presos na tela de acesso (não redirecionava ao Painel)
- [x] Causa 1 (robustez do dono): auth.passwordLogin dependia de getUserByOpenId(OWNER_OPEN_ID); se a env estivesse ausente/dessincronizada no deploy, login falhava com a mensagem confusa "Conta principal não encontrada. Faça login uma vez com a conta dona"
- [x] Correção 1: novo helper getOwnerUser() em db.ts com fallback em cascata (OWNER_OPEN_ID → primeiro admin → primeiro usuário por id); passwordLogin religada a ele
- [x] Causa 2 (redirecionamento frágil): onSuccess do AccessGate fazia `await refresh()` antes do reload; um refetch transitório que rejeitasse engolia a navegação e prendia o usuário na tela de senha mesmo com cookie setado
- [x] Correção 2: onSuccess agora faz window.location.replace("/") direto (o reload re-busca auth.me com o cookie presente)
- [x] Testes vitest (2 novos): login via fallback de dono sem OWNER_OPEN_ID; erro claro quando não há usuário dono. Mock atualizado de getUserByOpenId → getOwnerUser
- [x] Validação ponta-a-ponta no dev: senha correta → "Entrando…" → redireciona ao Painel com dados reais da loja (Luiz Fernando Aleixo). 503 testes passando; TypeScript limpo; checkpoint 542fcc19
- [ ] Após publicar: Fernando valida em produção que visitantes entram com a senha e caem no Painel


## Configuração de impostos: Exportar PDF + Histórico com data (Fernando, 15/06)
- [x] Nova tabela tax_config_history (userId, config JSON, ttsEnabled, note, createdAt) + migração aplicada (0008)
- [x] Helpers em dbMl.ts: insertTaxConfigHistory, listTaxConfigHistory
- [x] saveConfig passa a gravar uma linha de histórico (com observação opcional) a cada salvamento; resiliente a falha no histórico
- [x] Nova procedure finance.configHistory (lista as últimas alterações com data)
- [x] Frontend: campo "Observação" no painel de configuração (o que mudou)
- [x] Frontend: lista "Histórico de alterações" com data/hora (BRT) e observação
- [x] Frontend: botão "Exportar PDF" (lib/taxConfigPdf.ts) que gera documento imprimível com a configuração atual para o contador
- [x] Testes vitest (histórico gravado no save; configHistory lista em ordem) — 13/13 finance + 508 total verde + TS limpo
- [x] Validação ponta-a-ponta na preview: salvou com data 15/06/2026 13:01 no histórico; geração do HTML do PDF validada
- [ ] Após publicar: Fernando confere o PDF impresso e o registro de datas no histórico em produção


## Bug: Exportar PDF dos impostos bloqueado como pop-up (Fernando, 15/06)
- [x] Causa: exportTaxConfigPdf usava window.open() → navegador bloqueava como pop-up
- [x] Correção: gera via iframe oculto na própria página (srcdoc + print), sem abrir janela nova — nunca é bloqueado; removido o <script> auto-print embutido
- [x] Fallback: se iframe falhar, baixa arquivo .html para o usuário abrir/imprimir
- [x] Validado na preview: clique aciona o diálogo de impressão in-page sem pop-up; 508 testes verdes; TS limpo


## Clareza do DIFAL na Lucratividade (Fernando, 15/06)
- [x] Engine: decompõe ICMS interestadual sem TTS em 2 linhas (ICMS interestadual origem 7%/12% + DIFAL destino), mantendo o total igual (icmsSplit)
- [x] Engine: novos campos no TaxBreakdown (icmsTotal, difalTotal, fcpTotal) e helper interstateExitRate (12% S/SE exceto ES, 7% demais)
- [x] Tela: novo card "Impostos do período: ICMS x DIFAL" (TaxBreakdownCard) com DIFAL destacado; taxDetail no ProfitabilityResult
- [x] Card de configuração: bloco explicativo "O que é o DIFAL" com exemplos (SP → 6%, BA → 13,5%)
- [x] PDF do contador: seção "DIFAL — como é calculado" + tabela por estado (Interna/Saída/DIFAL/FCP) + resumo do período em R$
- [x] "Quanto foi imposto x quanto foi DIFAL" claro no card do período e no resumo do PDF
- [x] Testes vitest (decomposição soma igual ao total; 7%/12%; DIFAL=interna-interestadual) — 514 testes verdes + TS limpo
- [x] Validado na preview: bloco DIFAL no painel + HTML do PDF (7/7 checagens true)
- [ ] Após publicar: Fernando confere o card ICMS x DIFAL com vendas reais e o PDF com o contador


## Bug: DIFAL zerado no modo TTS (Fernando, 15/06)
- [x] Engine modo com_tts (venda interestadual): cobra DIFAL normalmente (interna destino − saída 7%/12%) + FCP destino; ICMS de origem = ttsInterstate
- [x] Venda dentro de MG com TTS: continua só ttsInternal, sem DIFAL
- [x] taxRevenue preenche icmsInterstateTotal/difalTotal/fcpTotal também no TTS
- [x] Bloco explicativo (tela) e PDF atualizados (TTS reduz origem MG, mas DIFAL do destino continua devido)
- [x] Testes vitest: TTS interestadual DIFAL>0; TTS interno sem DIFAL; FCP no TTS; soma confere — 516 testes verdes + TS limpo
- [x] Validado na preview com TTS ligado e dados reais: DIFAL R$ 68,69 (38,2%), ICMS efetivo R$ 30,54, federais R$ 80,42
- [ ] Após publicar: Fernando confere os valores de DIFAL com o contador

## Bug: card VISITAS travado em "carregando" (Fernando, 15/06)
- [x] Coletor de visitas progressivo no provider: cache acumulado por item (visitsStore — merge entre execuções, nunca descarta o que já coletou) + refresh em background
- [x] getListings não-bloqueante: lê o mapa de visitas já coletado (readVisits/ensureCollecting) em vez do fan-out de 13s; dispara coleta em background
- [x] Card herói usa o total da série (seriesTotalVisits = soma de visitsSeries, endpoint rápido agregado) como fonte primária; coletor por item é fallback — card mostra 403 imediatamente
- [x] Expor cobertura (visitsResolved/visitsAttempted/visitsCollecting) no ListingsSummary para o front saber se ainda está parcial
- [x] Frontend: polling automático a cada 6s enquanto coletando, exibição parcial progressiva; banner só quando heroVisitsPending (nenhum número disponível)
- [x] Testes vitest (merge acumulado; pending só no zero absoluto; parcial renderiza) — 522 testes verdes + TS limpo
- [x] Validação na preview com a conta real: card "Visitas (30d)" = 403 imediato, sem banner; gráfico/Visualizações por status consistentes (Total 30d 403)
- [ ] Após publicar: Fernando valida em produção que o card de visitas mostra o número rápido no primeiro acesso

## Calculadora de Precificação — Hub com 2 modelos (modelo Mamba Nexus)

- [x] Mapear ferramentas da Mamba: Calculadora de Precificação e Ponto de Equilíbrio (campos, fórmulas, saídas)
- [x] Hub: tela inicial da aba /calculadora com 2 cards selecionáveis (Precificação | Ponto de Equilíbrio)
- [x] Roteamento interno: /calculadora (hub), /calculadora/precificacao, /calculadora/ponto-equilibrio + botão Voltar + alternador de modelos
- [x] Lógica pura de cálculo em arquivo compartilhado (shared/pricing.ts e shared/breakeven.ts) — markup divisor (precificação) e break-even (ponto de equilíbrio)
- [x] Modelo 1 — Calculadora de Precificação (campos, marketplace ML/Shopee/Outro, saídas, promoção, detalhamento) — validado: custo 30 + frete 7,75 + margem 20% + comissão 12% = R$ 55,51
- [x] Modelo 2 — Ponto de Equilíbrio (3 seções de entrada; saídas: PE R$/un, margens, donut, cenários) — validado: fat. 10k, CMV 5k, fixos 2k → PE R$ 4.000 (40 un.), lucro R$ 3.000
- [x] Testes vitest da lógica pura (22 testes) + suíte completa verde (548 testes) + TS limpo
- [x] Validar na preview (conta real LOJADOSRWU): ambas calculadoras reativas e com cálculos exatos
- [ ] Após publicar: Fernando confere as duas calculadoras em produção

## Calculadora de Precificação — Revisão fiel à Mamba + auto-alimentação ML

- [x] Reanalisar a calculadora da Mamba campo por campo (engenharia reversa do bundle JS) e listar o que faltou no Mercato
- [x] Mapear regras reais do Mercado Livre: taxa fixa (=0 no ML) e frete por tipo de anúncio/modelo logístico/peso/faixa de preço (tabelas oficiais qL/OLt/PLt/jLt/WL extraídas)
- [x] Integrar as tabelas reais como dados embarcados (shared/ml-shipping-tables.ts) — solver iterativo replica a Mamba
- [x] Auto-alimentar TAXA FIXA conforme opções (ML = R$ 0; Shopee R$ 6,25; Outro editável)
- [x] Auto-alimentar FRETE conforme opções selecionadas (modelo logístico, FGR, peso, faixa de preço), com switch Manual para edição
- [x] Adicionar todos os campos da Mamba que faltaram: modelo logístico, peso embalado (28 faixas), FGR, Campanhas Destaque (+6%), reputação (Cat. Especiais)
- [x] Testes vitest das novas regras (24 testes pricing) + suíte completa verde (558 testes) + TS limpo
- [x] Validar fielmente contra a Mamba na preview: peso Até 300g → frete R$ 7,75 → preço R$ 55,51; 1kg-2kg → R$ 8,15 → R$ 56,10; FGR → R$ 14,45 → R$ 65,37 (todos idênticos à Mamba)
- [ ] Após publicar: Fernando confere a auto-alimentação em produção

## Calculadora — Anúncios ativos (somente status ativo)

- [x] Backend: incluir SKU/seller_custom_field nos detalhes do anúncio para casar com custo Baselinker (resolve SKU via user_product_id em anúncios com variação)
- [x] Backend: endpoint que retorna SOMENTE anúncios com status `active`, com custo (Baselinker), comissão/taxa/frete reais e lucro real atual por anúncio
- [x] Backend: cálculo de preço-alvo por margem (reutilizar shared/pricing.ts) para 3 percentuais escolhidos
- [x] Frontend: tabela com TODAS as colunas possíveis (foto, título, MLB, SKU, status, tipo, preço, custo, estoque, vendidos, visitas, conversão, saúde, frete grátis, logística, catálogo, criado/atualizado, valor em estoque, lucro real R$/%, link)
- [x] Frontend: seletor de colunas (ligar/desligar visibilidade)
- [x] Frontend: 3 colunas de simulação de margem, cada uma com seletor de % (ex.: 20/30/40) → mostra preço-alvo para aquela margem
- [x] Frontend: exibir lucro real atual (R$ e %) com base no preço de hoje
- [x] Frontend: seletor de imposto (%) e KPIs (ativos, com custo, lucro real total, valor em estoque)
- [x] Atualizar título/subtítulo da aba e card do hub (remover "Em preparação")
- [x] Handler Heartbeat /api/scheduled/refreshActiveListings implementado e montado (aquece listings/visitas/custos por usuário, best-effort, idempotente) + 6 testes vitest
- [ ] Sincronização diária às 7h BRT — registrar o cron `0 0 10 * * *` UTC APÓS o deploy (sandbox de dev é inalcançável pela plataforma)
- [x] Testes vitest (filtro active; cálculo de lucro real; preço-alvo por margem) + suíte verde (568) + TS limpo
- [x] Validar na preview com a conta real (LOJADOSRWU) + checkpoint + orientar publicação
- [ ] Após publicar: registrar o cron das 7h e Fernando confere em produção

## Anúncios ativos — recalibrar métricas (reaproveitar Calculadora)
- [x] Sondar origem do peso real na conta: ML expoe SELLER_PACKAGE_WEIGHT em 100% dos anúncios (Baselinker inconsistente) → fonte = ML
- [x] Backend: extrair peso do anúncio (g) e mapear para a faixa de peso da calculadora (weightGramsToIndex/ML_WEIGHT_KG)
- [x] Backend: expor por anúncio peso/weightIndex e imposto; motor de cálculo aceita overrides completos (applyOverrides)
- [x] Backend: comissão efetiva (campanha destaque +6pp) e frete por peso real → lucro real total caiu de R$821 para R$668 (real)
- [x] Frontend: checkbox de seleção por linha + "marcar todos"; abre card ao selecionar
- [x] Frontend: card configurável em LOTE (estilo Calculadora) aplicando overrides aos selecionados
- [x] Frontend: ajuste fino individual quando 1 anúncio selecionado (custo da base + todos os campos editáveis) + selo "ajustado"
- [x] Sem persistência por enquanto (apenas simulação na sessão) — confirmado pelo Fernando
- [x] Testes vitest (peso->faixa, overrides em lote/individual, lucro real, preço-alvo) — 27 em activeListings, suite total 591 verdes + TS limpo
- [x] Validar na preview com a conta real (custo override R$5 → lucro recalculou de R$5,52 para R$1,58) + checkpoint + orientar publicação
- [x] Removido endpoint de diagnóstico /api/_debug/probeWeights e helpers de sondagem antes de publicar

## URGENTE: "conexão interrompida" em Anúncios ativos (timeout/502 em produção)
- [x] Diagnóstico: cold start bloqueante — cachedAccountResilient espera buildActiveListings (>45s/180s) → 502 SESSION_CONNECT_FAILED / "Tempo limite da requisição excedido"
- [x] Backend: converter activeListings para SWR não-bloqueante (swrAccount) — cold start retorna ready:false/status "loading" em ms e dispara montagem em background
- [x] Backend: manter parâmetros (margins/tax/tacos/afiliados) na chave de cache; retornar value|undefined + status + asOf; status "error" em falha de cold start (não fica preso em loading)
- [x] Frontend: tratar status loading com poll (refetchInterval) + "Preparando seus anúncios..."; status "error" com botão Tentar novamente; encerra poll em erro
- [x] Testes vitest (cold start ready:false → ready:true, dedup, erro de cold start) + TS limpo
- [ ] Validar na preview (primeiro acesso responde rápido e preenche) — BLOQUEADO pelo 429 de IP do ML (temporário); validar quando o limite reabrir + republicar

## Auditoria de precisão — Anúncios ativos (dados precisam bater com a realidade)
- [x] Diagnosticar divergência de VISITAS: a aba mostrava 0 enquanto o Painel mostrava 100+ — causa: a aba lia visitas só do fan-out por item (que sob 429/budget não resolvia), exibindo 0 falso
- [x] Unificar a FONTE de visitas: a aba passa a usar o mesmo visitsStore (coleta progressiva em background, concorrência 2), e expõe visitsResolved/visitsAttempted no summary
- [x] Corrigir exibição: quando a visita do item ainda não foi resolvida (visitsAvailable:false) mostra "carregando" em vez de 0; banner de progresso parcial de coleta
- [x] Frete por peso real do anúncio (SELLER_PACKAGE_WEIGHT do ML) → weightGramsToIndex alimenta a faixa de frete
- [x] Testes vitest (mapeamento de peso, overrides, colunas padrão, contrato SWR, erro de cold start) + TS limpo
- [ ] Validação final na conta real (visitas batendo com o Painel) — BLOQUEADO pelo 429 de IP do ML (temporário)

## Auto-cura do status preso em "error" (após 429 do ML) — 18/06
- [x] Diagnóstico: quando o ML retorna 429, o status persistido em ml_credentials podia ficar travado em "error"; mesmo com o token voltando a funcionar, a UI mostrava "desconectado" falso
- [x] account.connection: probe bem-sucedido (prova que o token funciona) reseta status="connected" no banco (best-effort, não quebra a resposta do probe)
- [x] 429 durante o probe NÃO rebaixa o status persistido (segue conectado-mas-limitado)
- [x] Testes vitest (cura de "error"→"connected"; não escreve se já connected; 429 não rebaixa) — 598 testes verdes; TS limpo

## Recalibração — mostrar valor automático + imposto dentro do card (Fernando, 18/06)
- [x] Card de recalibração: mover o seletor de Imposto (%) para DENTRO do card (topo do grid), removido do bloco de controles externo
- [x] Em cada campo "automático", exibir o valor real sendo usado para o anúncio selecionado (custo, imposto, comissão, frete, taxa fixa, peso com gramas reais, tipo, logística) — com 1 selecionado
- [x] Passar a linha real selecionada (autoRow) para o RecalibrarCard
- [x] Testes vitest (autoFieldValues + rótulos) + TS limpo + validação na preview com dados reais (602 testes verdes)

## Card "Anúncios ativos" na aba Meus anúncios (Fernando, 18/06)
- [x] Novo componente ActiveListingsCard (grid de cartões) — só status ativo, com foto, título, badge Ativo, tipo, frete grátis, preço, estoque, vendas e visitas (Nd)
- [x] Cartão clicável abre o anúncio no Mercado Livre; busca interna por nome/ID; contador "N de N ativos"
- [x] Inserido logo abaixo dos KPIs na página Meus anúncios; acompanha a janela 7/30/90d
- [x] Lógica testável selectActiveListings no shared + 5 testes vitest (607 verdes); TS limpo
- [x] Validado ao vivo: 27 de 27 ativos, visitas reais carregadas, links funcionando

## Nova aba "Projeto" — recriação do Portfólio de Importação China (paleta Mercato)
- [x] Backend: 5 tabelas project_* (products, timeline_steps, documents, todos, comments) com migração aplicada
- [x] Backend: helpers em projectDb.ts + router tRPC project.* (products/timeline/todos/documents/comments)
- [x] Banco semeado com os 16 produtos reais; timeline do "Matador de Mosquito" preservada (5/10 etapas, etapa atual Pedido)
- [x] Frontend: container Projeto.tsx com sub-navegação (Painel/Cronograma/Análise) e mini-roteamento sob /projeto
- [x] Frontend: Painel de Produtos, Cronograma, Análise e Ficha do Produto (dossiê, timeline, tarefas, documentos, comentários) com paleta verde do Mercato
- [x] Componentes de apoio: ProjectProductCard, GuestNameDialog, useGuestName
- [x] Aba "Projeto" na sidebar (grupo Disponível) com destaque mantido em /projeto/*
- [x] Lógica pura testável (shared/projectProgress.ts) + 8 testes vitest verdes; TS/LSP limpos
- [x] Validação ao vivo: Painel com 16 produtos e ficha do Matador de Mosquito conferidos
- [ ] Adaptações conscientes vs. original: removida a página "Colaboradores" (dependia de procedures de convite/role e /login inexistentes aqui); seletor de "Responsável" das tarefas ocultado (app é single-user por senha)

## Correção — consistência de progresso na aba Projeto (18/06)
- [x] Backend: getAllProjectProducts retorna completedCount/progressPct (régua única = etapas concluídas/10)
- [x] Card do Painel: usa progressPct/completedCount reais (acabou o "10% fantasma"); tracinhos refletem etapas concluídas
- [x] KPIs do Painel (Em andamento = 1..9 concluídas; Lançados = 10/10) coerentes com o gráfico
- [x] Gráfico da Análise: largura proporcional, base visível p/ 0%, rótulos -45° sem cortar, Lançados = 100%
- [x] Testes vitest da régua (progressFromCompleted, 13 verdes) + TS/LSP limpos + validado na preview

## Calculadora — Custo-alvo (China), câmbio em tempo real e Histórico (Fernando, 22/06)
- [x] Backend: câmbio USD/BRL + CNY/BRL em tempo real (AwesomeAPI) com cache curto + fallback; rota tRPC pricing.fxRate
- [x] Backend: lógica pura de custo-alvo (preço de venda -> quanto posso pagar pelo produto) por margem, descontando impostos + comissão ML + frete/logística (mesma régua do pricing existente)
- [x] Backend: suportar múltiplas margens numa simulação (ex.: 15/20/30%); resultado em BRL, USD e CNY
- [x] Backend: tabela pricing_simulations (usuário, nome, sku, preço, margens, snapshot de parâmetros, resultados, câmbio, createdAt)
- [x] Backend: rotas tRPC pricing.history.save/list/delete (protected)
- [x] Frontend: novo modo "Custo-alvo (China)" na Calculadora — preço de venda + chips de margens + resultado BRL/USD/CNY
- [x] Frontend: conversor tri-moeda BRL<->USD<->RMB com cotação ao vivo (editável)
- [x] Frontend: botão "Salvar no histórico" a partir do resultado
- [x] Frontend: aba "Histórico" elegante (lista nome/data/preço/margens, detalhe expandível, excluir)
- [x] Testes vitest (custo-alvo multi-margem, câmbio parse/fallback) + TS limpo + validação na preview + checkpoint
- [x] BUG: rota /calculadora/custo-alvo e /calculadora/historico retornavam 404 — rotas wouter adicionadas em App.tsx; validadas ao vivo (cálculo R$ 100 → custo máx R$ 58,65/53,65/43,65, salvar e listar no histórico OK). 636 testes verdes; TS limpo.

## Reformulação "Preço a ser pago para a Matriz" (conceito filial→matriz, Fernando 22/06)
- [x] Remover câmbio/US$/¥ da aba — cálculo só em R$
- [x] Alternador COM TTS (14%) / SEM TTS (24%), inicia em COM TTS; alíquota editável
- [x] Defaults editáveis: TACoS/ADS 3%, afiliados 0%, Clássico (comissão 12%), Padrão, peso escolhido, sem promoção
- [x] Múltiplas margens livres por pesquisa (chips add/remove), default 20/30/40
- [x] Resultado "Pagar à Matriz" por margem + detalhamento "Como chegamos nesse valor"
- [x] Histórico em formato de planilha: 1 linha por produto, colunas dinâmicas por margem (Matriz · X%)
- [x] Botão "Fixar no histórico" salva a linha; coluna de Regime (COM/SEM TTS)
- [x] Testes vitest TTS 14% vs 24% e múltiplas margens em R$ (9 testes no targetCost) + suíte completa 636+ verde; TS limpo
- [x] Validado ao vivo: R$100 COM TTS → 36,65/26,65/16,65; SEM TTS → 26,65/16,65/6,65; planilha OK

## Ajustes "Preço a ser pago para a Matriz" (2ª rodada, Fernando 22/06)
- [x] Frete grátis (full/flex) ativado por padrão na aba
- [x] BUG: botão "Fixar no histórico" vazava para fora do card — movido para dentro do corpo do card
- [x] BUG: preço R$ 100 virava R$ 99,99 no histórico — desabilitado scroll/wheel no input numérico (onWheel blur)
- [x] Histórico agrupado por produto (SKU quando houver, senão nome): cada simulação salva vira uma COLUNA de variação, NÃO uma nova linha
- [x] Planilha por produto: linhas de parâmetros (preço, regime, anúncio/comissão, peso, frete) + preço à Matriz por margem; cada variação é uma coluna
- [x] Textos da aba e do Histórico atualizados; validado ao vivo (Barraca: 2 variações COM/SEM TTS em colunas); 638 testes verdes; TS limpo

## Toggle de regime na planilha do histórico (Fernando 22/06)
- [ ] Backend: mutation pricing.toggleRegime que alterna COM TTS (14%) <-> SEM TTS (24%) de uma variação salva e recalcula os resultados
- [ ] Frontend: botão na coluna de variação para alternar regime; atualiza valores e badge (otimista + invalidate)
- [ ] Testes vitest do toggle + validação ao vivo + checkpoint
- [ ] Layout planilha real: 1 bloco por produto, colunas fixas base (Nome, Preço ML, Regime c/ botão TTS, Frete grátis) + 1 coluna por pesquisa salva (margem + valor Matriz)
- [x] Toggle de regime na planilha: botão COM TTS (14%) ↔ SEM TTS (24%) por variação; backend recalcula via calculateTargetCost e persiste; 640 testes verdes; verificado diff R$10 em todas as margens


## Planilha única invertida (preço de venda por margem) — v3
- [x] Lógica: dado preço de venda ML @20% -> derivar custo fixo Matriz -> recalcular preço de venda ML para cada margem (15/20/25/30/35/40 + adicionáveis)
- [x] shared/pricing: funções deriveMatrixCost + priceForMargin + computeMatrixRow + buildMatrixInput (mesma régua: comissão, imposto TTS, TACoS, afiliados, frete)
- [x] Schema: tabelas matrix_products (nome único por usuário) + matrix_settings (regime, anúncio, margens globais)
- [x] Backend: rotas spreadsheet.list/upsert/delete/updateSettings; nome duplicado tratado; histórico antigo limpo
- [x] UI: planilha única (linhas=produtos, colunas=margens), inputs preço @20%, células = preço de venda por margem
- [x] UI: controles globais COM/SEM TTS (14/24%) e Clássico (12%)/Premium (17%) recalculando tudo
- [x] UI: adicionar produto (form inline) e adicionar/remover coluna de margem; aba Histórico antiga removida
- [x] Testes vitest do cálculo invertido (10 testes) + suíte completa 650 verdes; TS limpo

## Ajustes de layout da planilha (Fernando 22/06)
- [x] Barra de controles COM/SEM TTS + Clássico/Premium fixa (sticky) no topo da planilha, em toolbar horizontal compacta (SegBtn) + TACoS/Afiliados/Frete grátis
- [x] Eliminar/minimizar scroll horizontal: table-fixed + colgroup, cabeçalho compacto ("20%" em vez de "Margem 20%"), paddings/fontes menores, ações estreitas
- [x] TS/LSP limpos; mudança apenas de UI (650 testes da engine seguem válidos); checkpoint

## Correções planilha (Fernando 22/06 - parte 2)
- [x] Botão excluir (lixeira): trocado clique-duplo silencioso por AlertDialog de confirmação explícito ("Excluir [nome]?")
- [x] Nome do produto cortado: removido truncate, nome quebra em linhas e aparece completo; coluna Produto ampliada (24%/min 180px)
- [x] TS limpo; checkpoint (validação ao vivo depende do login do usuário)

## Reposicionar barra de controles (Fernando 22/06 - parte 3)
- [x] Mover barra COM/SEM TTS + Clássico/Premium (+ TACoS/Afiliados/Frete) para dentro do card "Planilha de preços por margem", logo abaixo do título
- [x] Manter barra fixa (sticky top-2) para ficar sempre visível ao rolar planilha com muitas linhas
- [x] TS limpo + checkpoint

## Colunas fixas + coluna variável (Fernando 22/06 - parte 4)
- [x] Fixar margens base 20/15/25/30/35/40% para todos os produtos (removida UI de adicionar/remover coluna)
- [x] Adicionar coluna "Variável" com input de % no cabeçalho, recalculando preço de venda em tempo real (cliente, via computeMatrixRow)
- [x] Mesmo custo Matriz fixo; coluna variável não altera as colunas fixas
- [x] 3 testes vitest novos da coluna variável (13 no total no arquivo, verdes); TS limpo; checkpoint

## Ajustes visuais da planilha (Fernando 22/06 - parte 5)
- [x] Divisórias verticais entre colunas (cabeçalho + células) e zebra nas linhas para melhor leitura
- [x] Campo de % da coluna variável alargado (w-24) para não cortar o número (ex.: 45)

## Tipo de preço + persistência (Fernando 22/06 - parte 6)
- [x] Schema: campo price_type em matrix_products (medio | melhor | vazio/null)
- [x] Backend: aceitar/retornar priceType em upsert e list
- [x] UI: seletor "Tipo de preço" (Preço médio / Melhor preço / Vazio) no form de adicionar e na edição
- [x] UI: exibir o rótulo (badge) do tipo de preço na linha da planilha
- [x] Confirmar persistência: deleteMatrixProduct só remove por id+userId explícito (rota delete via confirmação); nenhuma rotina apaga automaticamente
- [x] Unicidade por (nome + priceType): mesmo produto pode ter linha 'Preço médio' e 'Melhor preço' separadas; bloqueia só a combinação duplicada
- [x] 653 testes verdes; TS limpo; checkpoint

## Ajustes coluna variável + default regime (Fernando 22/06 - parte 7)
- [x] Coluna variável: campo agora é string controlada (type=text), remove zero à esquerda em tempo real (ex.: "050" -> "50"); blur vazio vira "0"
- [x] COM TTS marcado por padrão: confirmado no front (regimeSemTts false quando settings undefined) e backend (resolveSettings default com_tts)
- [x] TS limpo + checkpoint

## Bug margem alta (70%) explodindo preço (Fernando 23/06)
- [x] Diagnóstico: markup divisor explode quando (margem + variáveis) -> ~100% (ex.: 70% + 29% = 99% -> denominador ~0,01 -> R$ 5.880)
- [x] Guard na engine: denomPct >= MAX_DEDUCTION_PCT (95%) retorna valid:false ("Margem inviável")
- [x] UI: célula sem valor agora mostra "inviável" (antes "—") com tooltip, nas colunas fixas e variável
- [x] 4 novos testes (70% inviável; varredura 67-95% sem explosão; viáveis <=50% crescentes; SEM TTS inviabiliza mais cedo) — 657 testes verdes
- [x] TypeScript limpo
- [x] Validado via engine com dados reais (Barraca R$34,15): 70% -> INVIÁVEL; 40% -> R$180; 50% -> R$280

## Simulador de 3 variáveis interligadas (Matriz / Margem / Preço ML)
- [x] solveSimulator na engine (pricing.ts) com solver bidirecional
- [x] Testes do solver (round-trip margem->preço->margem)
- [x] UI: painel expansível por produto na planilha de custo-alvo
- [x] Botão "Simular" na coluna Ações + botão Resetar
- [x] Validado no preview: margem->preço (30%->R$59,71) e preço->margem (R$45->16,6%)


## Ajustes simulador (pedido Fernando 23/06)
- [ ] Remover "inviável" — mostrar o valor calculado mesmo quando alto (reverter guard MAX_DEDUCTION_PCT na exibição)
- [ ] Trocar ícone dos controles (SlidersHorizontal) pelo ícone de Calculadora
- [ ] Melhorar layout do simulador: sem sobreposição, visual profissional

## Ajustes simulador (23/06) — concluído
- [x] Remover rótulo "inviável" para margens altas: exibir valor calculado (só >=100% deduções = "impossível")
- [x] Relaxar guard da engine (custo_para_preco) para bloquear apenas deduções >= 100%
- [x] Coluna variável global aceita até 99%
- [x] Trocar ícone do simulador (SlidersHorizontal -> Calculator) na dica e no botão Ações
- [x] Redesenhar painel do simulador em cartão profissional (cabeçalho + 3 campos + setas, sem sobreposição)
- [x] Atualizar testes ao novo comportamento (664 testes verdes)

## Planilha invertida: sempre exibir valores (Opção A - 23/06)
- [] Engine: permitir custo Matriz negativo (sem clamp0 no priceForMargin do modo planilha)
- [] Engine: célula válida sempre que preço finito; só inválida quando deduções% >= 100
- [] Exibir custo Matriz negativo na coluna âncora (sem "inviável")
- [] Atualizar testes (margens altas/negativas) e UI (remover "impossível"/"inviável" quando há valor)
- [] Validar vitest + tsc + preview da Marmita R$ 25

## Planilha invertida: preços altos e custo negativo (Opção A refinada) — CONCLUÍDO
- [x] Remover guard de 95%: só bloqueia quando deduções >= 100% (impossível)
- [x] Permitir custo Matriz negativo (deriveMatrixCost) e exibir o valor na coluna Matriz
- [x] Regra do usuário: célula só mostra preço quando o preço resolvido for > 0; senão, "—"
- [x] Âncora também segue a regra quando custo Matriz < 0
- [x] Selo "abaixo do custo" na coluna Matriz quando negativo (com explicação no tooltip)
- [x] Testes atualizados (Marmita R$25/300-500g => negativo; preços válidos sempre > 0); 666 testes verdes
- [x] Validado ao vivo: Marmita mostra -R$0,50 + "—"; simulador com Matriz R$6,10 @20% => R$37,94

## Visitas diárias por anúncio na Lista (hoje + 3 dias atrás)
- [ ] Backend: helper para extrair visitas por dia (4 dias) por item a partir do time_window
- [ ] Backend: endpoint leve account.visitsDaily (4 dias) por anúncio (hoje, ontem, anteontem, 3d atrás) + total
- [ ] Backend: testes do helper/endpoint (timezone BRT, dias ausentes = 0, falha = indisponível)
- [ ] Frontend: exibir os 4 dias por anúncio na Lista de anúncios com indicação de tendência
- [ ] Validar (vitest+tsc+preview), checkpoint e reportar

## Visitas por dia na Lista de anúncios (CONCLUÍDO)
- [x] Backend: endpoint account.visitsDaily (breakdown de 4 dias por anúncio) + visitsDailyStore progressivo
- [x] Helper getDailyVisitsBreakdown (BRT, dias ausentes = 0) + 3 testes
- [x] Frontend: coluna "Últimos dias" (dom/seg/hoje) com valores + seta de tendência hoje-vs-ontem
- [x] Validado ao vivo no preview e 39 testes do provider verdes

## Ordenação por dia + quebra diária por anúncio (pedido 23/06)
- [x] Lista de anúncios: ordenar por hoje / ontem / anteontem (setinhas como nas outras colunas)
- [x] Backend: quebra do total diário por anúncio (visitas por dia x anúncio) no gráfico Evolução das visitas
- [x] Frontend (Painel): ao olhar um dia do gráfico, ver quanto cada anúncio teve naquele dia

## Quebra do total diário de visitas por anúncio (Painel + Anúncios)
- [x] shared/account.ts: tipos ListingDailySeries e ListingDailyBreakdownResult
- [x] accountProvider.getDailyVisitsByListing(lastDays=30): séries por item + título/thumbnail/permalink, ordenado por total desc
- [x] Endpoint tRPC account.visitsByListing (protected, days 7/30/90, com flag collecting)
- [x] VisitsEvolutionChart: prop onSelectDay (clique no dia) + dica no tooltip
- [x] DayVisitsBreakdownDialog: modal com lista de anúncios por dia (thumbnail, título, visitas, %, link)
- [x] Ligado no Painel e em Meus Anúncios
- [x] 3 testes novos em accountProvider.test.ts (ordenação, soma por dia, fallback de permalink)
- [x] tsc limpo; 677 testes verdes

## Conexão ML compartilhada (corrigir "API desconectou" ao trocar de login) — 23/06
- [x] Causa: credencial ML é por usuário Manus; login diferente (gestao@grupo-fox vs Apple/dono) caía em conta sem credencial
- [x] Backend: resolveMlOwnerUserId() em dbMl.ts (dono com refresh -> qualquer linha com refresh -> próprio user)
- [x] ensureUserAccessToken/forceRefreshUserAccessToken resolvem o dono (renovação automática sempre na conexão real)
- [x] resolveAccount lê credenciais/mlUserId do dono; connection self-heal grava no dono
- [x] monitor.getCredentials reflete o dono; saveCredentials/testCredentials gravam no dono
- [x] OAuth /connect e /callback gravam tokens na linha do dono
- [x] Testes: 4 novos para resolveMlOwnerUserId + mocks atualizados; 681 testes verdes, tsc limpo

## Ajustes de layout (visitas por dia + modal) — 23/06
- [x] Modal "Visitas por anúncio": conter linhas dentro do card (sem vazamento horizontal)
- [x] Tabela de anúncios: ampliar de 3 para 4 dias (hoje + 3 anteriores)
- [x] Tabela de anúncios: layout das colunas de dia sem sobreposição (rótulo numa linha, número alinhado, larguras iguais)
- [x] Adicionar SortKey day3 e ordenação pelo 4º dia

## Meus anúncios — limpeza de layout (24/06)
- [x] Ocultar linha de KPIs do topo (Ativos, Visitas 30d, Pausados, Sem vendas, Sem estoque)
- [x] Ocultar bloco de cards "Anúncios ativos" (ActiveListingsCard), manter só a tabela
- [x] Mover "Lista de anúncios" (planilha) para o topo da página


## Melhorias solicitadas (2026-06-24)
- [x] Lista de anúncios: mostrar nome completo do anúncio (remover truncamento/reticências)
- [x] Colunas de visitas por dia: remover o selo de tendência -100%/+100% (desalinha os dias) e manter dias sempre alinhados
- [x] Remover as 3 abas: Ponto de Equilíbrio, Referência de preço, Anúncios ativos
- [x] Home: redesenhar com a logo TOUJOURS (moderno, sofisticado, profissional) + wordmark da sidebar
- [x] Meus Anúncios: botão Exportar PDF da seleção (anúncios + visitas)
- [x] Carrinhos abandonados por anúncio: DISPENSADO pelo usuário (ML não expõe via API pública).
- [x] Validar (tsc+vitest+preview): 0 erros TS, 689/690 testes (1 falha = teste live Oxylabs por timeout externo). Preview OK.
- [x] Performance: coletar visitas por dia somente de anúncios ATIVOS (filtro no cliente), ignorando pausados/encerrados
- [x] Testes: extrair buildListingsReportHtml para shared/ + 8 testes vitest (cabeçalho, linhas, escape HTML, "—" sem visitas, colunas de dias, subtítulo, status). Suíte completa: 694 testes verdes.


## Fornecedores por produto na Linha do Tempo Luís (2026-06-24)
- [x] Schema: tabela luis_suppliers (productId, name, position) + supplierId em luis_product_step_progress
- [x] Migração SQL aplicada via webdev_execute_sql (0014_wise_vulture)
- [ ] Backend: CRUD de fornecedores (criar/renomear/remover/reordenar) em luisTimelineDb.ts
- [ ] Backend: overview retorna produtos -> fornecedores -> timeline (steps + progresso/observação)
- [ ] Backend: setLuisStepDone/Note passam a usar supplierId
- [ ] Frontend: dentro do produto, listar fornecedores; cada um com sua timeline e progresso próprio
- [ ] Frontend: adicionar/renomear/remover fornecedor
- [ ] Testes vitest do novo modelo + suíte completa verde
- [ ] Checkpoint e reporte


## Reversão fornecedores + timeline horizontal (24/jun)
- [x] Cronograma Luís: remover UI/recurso de fornecedores (reverter)
- [x] Cronograma Luís: progresso por produto+etapa (supplierId NULL) no backend
- [x] Cronograma Luís: timeline HORIZONTAL de bolinhas por produto
- [x] Cronograma Luís: observação por etapa via popover na bolinha
- [x] Cronograma Luís: atualizar router (remover suppliers; setDone/Note por productId)
- [x] Cronograma Luís: atualizar testes do luisTimelineDb e rodar suíte
- [x] Cronograma Luís: corrigir clique (stopPropagation na bolinha + cabeçalho como div role=button) — marcar etapa agora persiste (validado ao vivo: Matador 2/4 · 50%)


## Ajustes UI/PDF anúncios (24/jun)
- [x] Sidebar redimensionável: alça de arraste para alargar/estreitar; largura persistida (localStorage) — validado: 268→420px
- [x] Remover botões 7d/30d/90d + CSV da aba de anúncios (janela fixa em 30d)
- [x] PDF anúncios: baixar direto (doc.save via jsPDF, sem tela de impressão) — validado: meus-anuncios-2026-06-24.pdf, 7 páginas
- [x] PDF anúncios: TODAS as colunas (Anúncio, SKU, Preço, Estoque, Vendas, Visitas, dom/seg/ter/hoje, Conversão, Saúde, Status)
- [x] Testes + checkpoint (705 testes verdes, 0 erros TS)


## Cronograma Luís — interação por clique e desmarcação (24/jun)
- [x] Permitir desmarcar qualquer etapa (inclusive a 1ª "Reunião de Alinhamento")
- [x] Mostrar nomes das etapas completos (sem abreviações/line-clamp) em cada produto
- [x] 1 clique = abre detalhes (popover); 2 cliques (duplo) = marca/desmarca a etapa
- [x] Corrigir bug de desmarcação travada (overview considera apenas progresso por produto, supplierId NULL)
- [x] Limpar linhas legadas de progresso por fornecedor no banco
- [x] Atualizar testes (706 verdes, 0 erros TS) e validar ao vivo (Matador alterna 0/6 <-> 1/6)


## Pedidos 24/jun (tarde)
- [x] Anuncios: filtro "Ativos" selecionado por padrao ao abrir a pagina
- [x] PDF anuncios: trocar preto solido por cor mais suave no cabecalho/tabela
- [x] PDF anuncios: remover colunas Estoque, Saude e Status
- [x] PDF anuncios: adicionar coluna Tipo de Anuncio (Premium/Classico)
- [x] PDF anuncios: adicionar coluna E anuncio de Catalogo (Sim/Nao)
- [x] PDF anuncios: adicionar coluna ADS (Sim/Nao - patrocinio)
- [x] PDF anuncios: destacar no cabecalho que o filtro aplicado e "Ativos"
- [x] PDF anuncios: centralizar e formatar todas as celulas (texto alinhado)
- [x] PDF anuncios: zebrado colorido (laranja suave intercalado) nas colunas de dias (dom/seg/ter/hoje)
- [x] Tabela on-screen anuncios: centralizar todas as colunas + zebrado laranja nas caixinhas de dias (espelha o PDF)
- [x] Cronograma Luis: etapas sequenciais - bloquear concluir se a anterior nao estiver concluida
- [x] Cronograma Luis: balao de aviso "etapa anterior nao concluida" ao tentar pular
- [x] Cronograma Luis: ao desmarcar uma etapa, desmarcar todas as posteriores


## Linha do Tempo Pedro (independente do Projeto/Luís)
- [x] Criar tabelas pedro_* no schema (products, timeline_steps, documents, todos, comments, stages, step_progress)
- [x] Gerar e aplicar migracao das tabelas pedro
- [x] Criar pedroDb.ts (clone de projectDb apontando para tabelas pedro)
- [x] Criar pedroTimelineDb.ts (clone de luisTimelineDb apontando para tabelas pedro)
- [x] Criar router trpc.pedro (espelha project) e trpc.pedroTimeline (espelha luisTimeline)
- [x] Tornar componentes Projeto* agnosticos ao namespace (ns prop + useProjectApi) e clonar PedroTimeline
- [x] Criar PedroTimelineContainer com sub-abas Painel/Cronograma/Analise
- [x] Registrar rotas /pedro-timeline/* no App.tsx
- [x] Adicionar item "Linha do Tempo Pedro" no menu lateral (DashboardLayout)
- [x] Validar tsc/vitest (718 testes verdes, 0 erros TS); logica sequencial coberta por luisSequential.test.ts (compartilhada)
- [x] Validar no preview (aba, sub-abas, criar produto, cronograma independente, isolamento no DB) e salvar checkpoint


## Ajustes Meus Anuncios (tela + PDF)
- [x] Remover coluna Saude da tabela on-screen
- [x] Remover coluna Saude do PDF (ja nao existia)
- [x] Renomear "Visitas" para "Total de Visitas" na tabela on-screen
- [x] Renomear "Visitas" para "Total de Visitas" no PDF


## Pedro: Painel e Analise leem dados do Projeto (Opcao A)
- [x] PedroTimelineContainer: Painel e Analise usam ns="project"; produto tambem ns="project"
- [x] Cronograma do Pedro permanece independente (ns pedroTimeline)
- [x] Validar no preview: contadores e analise do Pedro refletem o Projeto (16/5/1/0)
- [x] Checkpoint


## Pedro Cronograma: listar produtos do Projeto com progresso independente
- [x] Backend pedroTimelineDb.overview: usar produtos da tabela project_products (mesma lista do Projeto/Luis), mas progresso/observacoes das tabelas pedro
- [x] Etapas do Pedro comecam vazias (nenhuma etapa padrao)
- [x] setDone/setNote do Pedro continuam gravando em pedro_step_progress (independente)
- [x] Validar no preview: Cronograma do Pedro lista os 16 produtos, etapas vazias, progresso 0
- [x] tsc/vitest verdes (718) + checkpoint


## Pedro Cronograma: 10 etapas fixas (opcao B)
- [x] Criar/seed das 10 etapas do Pedro na ordem definida (pedro_timeline_stages)
- [x] Cada etapa com categoria/cor (Origem, Briefing, Analise, Financeiro, Fiscal, Conteudo, Gate, Cadastro, Go-live, Continuo)
- [x] UI: etiqueta colorida a direita de cada etapa + secao "Ver detalhes" expansivel (editavel + persistida via stages.updateMeta; popover da bolinha mostra etiqueta + detalhes)
- [x] Validar no preview (10 etapas na vertical, etiquetas, expandir, salvar detalhe) + tsc/vitest (718) + checkpoint 8228393c


## Pedro Cronograma: timeline VERTICAL por produto + checklist/perguntas por etapa
- [x] Backend: tabela de itens-padrao por etapa (pedro_stage_items): tipo (checkbox|text), label, ordem
- [x] Backend: tabela de override de itens por produto (pedro_product_stage_items) — quando existe, substitui o padrao naquele produto
- [x] Backend: tabela de respostas por produto (pedro_item_answers): productId, stageId, itemId, checked/textValue
- [x] Backend: helper getEffectivePedroItems(productId, stageId) = override do produto OU padrao
- [x] Backend: setItemAnswer; ao salvar, recalcular se TODOS os itens estao respondidos -> auto-concluir bolinha; se faltar algum -> done=false
- [x] Backend: Regra A — etapa SEM itens fica pendente (nunca conta como concluida)
- [x] Backend: overview retorna, por produto/etapa, os itens efetivos + respostas + done calculado
- [x] Backend: CRUD de itens-padrao por etapa e CRUD de override por produto (lapis dentro do produto)
- [x] Frontend: layout vertical (trilha de icones coloridos por categoria + cartoes #00, titulo, etiqueta categoria, Ver detalhes) dentro de cada produto
- [x] Frontend: expandir etapa mostra checklist/perguntas; marcar/responder salva e auto-tica a bolinha
- [x] Frontend: lapis (Personalizar) por produto para personalizar itens daquela etapa so naquele produto (+ Restaurar padrao)
- [x] Validar (vitest 718 + tsc + preview: criar item, auto-conclusao 10%, restaurar, Regra A)
- [ ] Editor de itens-padrao em "Etapas do Pedro" (definir as perguntas/checkboxes globais) — aguardando lista de perguntas do usuario
- [ ] Checkpoint da timeline vertical + checklist


## Pedro Checklist: grupos coloridos + perguntas com resposta verde + add pergunta/checkbox/lixeira
- [x] Backend: adicionar groupName + groupColor (e ordem de grupo) aos itens (pedro_stage_items e pedro_product_stage_items)
- [x] Backend: migração drizzle + apply SQL
- [x] Backend: seed das 23 perguntas do Kickoff (stage #01) em 6 grupos: Estrategia(navy), Compra(roxo), Mercado(verde), Operacao(amarelo), Fiscal(vermelho), Viabilidade(azul)
- [x] Backend: overview/effective items retornam group; create item aceita type(checkbox|text)+group
- [x] Frontend: Ver detalhes do Kickoff em cartoes por grupo (titulo colorido) com as perguntas
- [x] Frontend: cada pergunta = campo de resposta + salva no blur; ao salvar com texto fica VERDE (respondida)
- [x] Frontend: checkbox fica verde quando marcado
- [x] Frontend: botao "Adicionar pergunta" e "Adicionar checkbox" em TODAS as etapas
- [x] Frontend: lixeira (Editar itens) para excluir pergunta/checkbox em todas as etapas
- [x] Frontend: auto-conclusao da bolinha quando tudo respondido (Regra A para etapa vazia)
- [x] Validar (vitest 718 + tsc + preview no Kickoff: 6 grupos, resposta 1/23 persistida)
- [ ] Checkpoint da timeline com grupos/perguntas


## Pedro Checklist: refino visual dos cards de pergunta
- [x] Card de pergunta mais bonito/profissional: fundo claro, borda suave, cantos arredondados, sombra leve, melhor espacamento
- [x] Cada card de pergunta com botoes Salvar e Editar dentro do proprio card
- [x] Modo leitura apos salvar (texto exibido) + botao Editar para voltar a editar
- [x] Estado respondido com VERDE mais forte (borda+fundo+check destacados)
- [x] Validar no preview (responder/editar/salvar) + tsc + vitest 718


## Pedro Checklist: corrigir add checkbox, reordenar itens e estado vermelho
- [x] BUG: ao adicionar checkbox, as perguntas somem — checkbox e perguntas devem coexistir
- [x] Permitir reordenar itens (perguntas e checkboxes) dentro da etapa de cada produto (subir/descer)
- [x] Backend: procedure de reorder (atualiza position dos itens override do produto)
- [x] Visual: perguntas NAO respondidas em tom de vermelho (falta responder)
- [x] Validar no preview (add checkbox sem sumir perguntas, reordenar com setas, vermelho/verde) + tsc + vitest 718


## Pedro Checklist: posicionamento de itens sem grupo
- [x] Checkbox/item SEM grupo deve aparecer em bloco proprio no TOPO (bloco "Geral" renderizado antes dos cartoes de grupo)
- [x] Novo checkbox recebe posicao que o coloca antes das perguntas (backend: groupPosition=-1 para itens sem grupo)
- [x] Validar no preview (resposta verde em largura total; limpeza do override do Matador) + tsc + vitest 718
- [x] BUG: texto da resposta no card respondido quebra uma letra por linha -> card reestruturado: resposta em linha propria de largura total com break-words/whitespace-pre-wrap e botao Editar abaixo
- [x] Limpeza de dados de teste do Matador de Mosquito (volta a herdar 23 perguntas padrao)
- [ ] Checkpoint dos ajustes acima

## Pedro Checklist: subtitulos Checkboxes / Perguntas dentro dos grupos
- [x] Dentro de cada bloco (Geral e grupos coloridos), separar Checkboxes e Perguntas com subtitulos
- [x] Subtitulo so aparece quando o grupo tem ambos os tipos (helper renderGroupBody)
- [x] Aplicar no bloco Geral, nos grupos nomeados e no fallback sem grupos
- [x] Validar tsc + vitest 718 + checkpoint

## Pedro Checklist: etapa #04 + grupos coloridos arbitrarios
- [ ] Popular etapa #04 (Validacao Tecnica e Fiscal) com 5 grupos coloridos de CHECKBOXES: Cadastro(9), Conteudo(5), Imagens(5), Logistica(5), Pos-publicacao(5)
- [ ] Separacao visual por TIPO de item (Checkboxes vs Perguntas), cada secao podendo ter varios cards coloridos
- [ ] UI: criar novos grupos/cards coloridos (nome + cor) na edicao
- [ ] UI: botoes Adicionar pergunta/checkbox dentro de cada card colorido (alem dos gerais fora)
- [ ] Permitir escolher o grupo de destino ao adicionar item (geral ou um card existente)
- [x] Validar no preview (curl + visual) + tsc + vitest + checkpoint


## Pedro Checklist: etapa #04 + grupos coloridos arbitrarios (CONCLUIDO)
- [x] Popular etapa #04 (Validacao Tecnica e Fiscal, stageId=5) com 5 grupos coloridos de CHECKBOXES: Cadastro(9), Conteudo(5), Imagens(5), Logistica(5), Pos-publicacao(5) = 29 itens
- [x] Separacao visual por TIPO de item (Checkboxes vs Perguntas), cada secao com varios cards coloridos em grade
- [x] UI: criar novos grupos/cards coloridos (nome + tipo + cor com paleta) na edicao ("Novo card colorido")
- [x] UI: botao "+" dentro de cada card colorido para adicionar item daquele tipo no grupo
- [x] Botoes Adicionar pergunta/checkbox gerais (item vai pro card "Geral" sem grupo)
- [x] Validado no preview (#04 com 5 cards) + tsc 0 erros + vitest 718 + checkpoint


## Meus Anuncios: ranking estavel (CONCLUIDO)
- [x] BUG: lista de anuncios trocava de lugar mesmo sem o numero de visitas mudar (sort instavel em empates/null)
- [x] sortListings: desempate determinístico por itemId quando o valor da chave ativa empata ou esta nulo (durante carregamento)
- [x] Ordem so muda quando um numero realmente ultrapassa outro (atualizacao em tempo real)
- [x] Testes de estabilidade adicionados (empate por itemId + mapa de visitas diarias ainda carregando) + vitest 23 + tsc 0 erros


## Painel: badge data + linha do tempo dinamica
- [x] Remover badge "Sem data" do card de produto (Pedro) quando nao ha data
- [x] Remover badge "Sem data" do card de produto (Luis) quando nao ha data
- [x] Painel > clicar no produto > Linha do Tempo deve usar etapas dinamicas (Pedro/Luis) em vez do template fixo antigo (Fornecedor/Amostra/...)
- [x] ProjetoProduto: render dinamico (dynamicSteps), badge "Atual" na 1a pendente, contador answeredCount/itemCount opcional, nota como preview
- [x] Dialog de etapa: toggle "Etapa concluida" (done) + Observacoes (note), salva via progress.setDone + progress.setNote
- [x] Remover STEP_ORDER/STEP_LABELS/STEP_ICONS/STATUS_CONFIG/updateTimelineMutation/setEditingStep e query timeline antiga
- [x] Validar preview (concluir etapa 1 -> ✓ verde + nota + Atual avanca + 17%) + tsc 0 erros + vitest 720 + checkpoint

- [x] Pedro: ficha do produto puxava a linha do tempo do Luis (ns=project). Corrigido: ProjetoProduto agora aceita prop timelineNs; PedroTimelineContainer passa ns="project" (produtos compartilhados) + timelineNs="pedro" (etapas proprias). Luis continua com etapas do Luis.

## Painel como espelho do Cronograma (25/06)
- [ ] Painel deve ser ESPELHO do Cronograma (Luis e Pedro): etapas, % e KPIs derivados do overview dinamico, nao de STEP_ORDER fixo
- [ ] ProjetoPainel: usar timelineApi.overview para total/concluidas/% por produto + KPIs Em Andamento/Lancados
- [ ] ProjectProductCard: progresso e bolinhas de etapas baseados nas etapas dinamicas (totalSteps/completed do overview)
- [ ] Filtro "Etapa atual" do Painel usar etapas dinamicas do overview (nao STEP_ORDER)
- [ ] Sync automatico (refetch ao focar + intervalo) no Painel e ficha, para Luis e Pedro
- [x] Validar no preview (curl + visual): concluir/adicionar/remover etapa no Cronograma reflete no Painel; tsc 0; vitest; checkpoint

## Painel = espelho do Cronograma (sync automatico) — 25/06/2026
- [x] ProjetoPainel: KPIs/% e cards derivam do overview dinamico (etapas reais), nao mais STEP_ORDER fixo
- [x] ProjectProductCard: bolinhas/progresso/etapa atual vem por props do overview (totalSteps dinamico)
- [x] ProjetoPainel: nova prop timelineNs (eixo de timeline separado do eixo de produtos)
- [x] PedroTimelineContainer: Painel usa ns="project" (produtos) + timelineNs="pedro" (linha do tempo)
- [x] Sync automatico: refetchOnWindowFocus + refetchInterval 15s no overview do Painel
- [x] Validado preview: concluir etapa no Cronograma do Pedro reflete no Painel (Kickoff 10%, Em Andamento 1); Luis independente
- [x] tsc 0 erros + 720 testes passando
- [ ] FUTURO: Analise (grafico) ainda usa STEP_ORDER fixo — migrar para etapas dinamicas em proxima iteracao

## Planilha SKU (Cronograma do Pedro) — 26/06/2026
- [x] Botao "Planilha SKU" no topo do Cronograma do Pedro (acima da lista de produtos)
- [x] Planilha UNICA (nao por produto), editavel: adicionar/editar/excluir linhas, persistida no banco (tabela sku_sheet_rows)
- [x] Colunas: CADASTRADO ML, TIPO SKU, CATEGORIA, SUB CATEGORIA, PRODUTO, VARIANTE, SKU, GERAR SKU KIT?, SKU KIT DO PRODUTO, EAN/GTIN, NCM, GPC, CEST, PRECO CLASSICO, PRECO PREMIUM, PRECO ATACADO, EMBALAGEM (profundidade/largura/altura/kg), CARACTERISTICAS LIQUIDO
- [x] TIPO SKU = seletor com 4 opcoes: 1 (INSUMO), 2 (PRODUTO), 3 (KIT), 4 (CATALOGO)
- [x] CADASTRADO ML = seletor: ATIVO (verde), PENDENTE (amarelo), PAUSADO (azul), EXCLUIDO (vermelho)
- [x] CATEGORIA + SUB CATEGORIA = seletores em cascata com TODAS as categorias/subcategorias do ML (32 raiz + 444 sub), subcategoria limitada pela categoria
- [x] Baixar arvore COMPLETA de categorias do ML (raiz + children) como asset estatico (shared/mlCategories.json)
- [x] Coluna N (numero do produto, sequencial por nome) a esquerda do PRODUTO; coluna N (numero da variante, sequencial) a esquerda da VARIANTE
- [x] Importar/seed dos itens atuais da planilha do Google Drive como dados iniciais (58 linhas, 23 produtos)
- [x] Logica de cada coluna ensinada pelo usuario + geracao automatica de SKU/SKU KIT implementada
- [x] Design profissional/sofisticado (tabela editavel estilo planilha, sticky header, busca, status coloridos)
- [x] Validar preview (cascata ML funcionando) + tsc 0 erros + vitest 720 + checkpoint

## Planilha SKU — melhorias UX (26/06/2026)
- [x] Texto completo (nao cortar): Produto, Variante, NCM e demais colunas — quebra de linha / largura adequada
- [x] Conteudo justificado/alinhado e tipografia legivel
- [x] Incrementar cores (cabecalho, zebra, status) e visual sofisticado
- [x] Estilo Excel: colorir LINHAS (escolher cor de fundo por linha) — persistir cor no banco (coluna row_color)
- [x] Adicionar coluna row_color em sku_sheet_rows + migracao + backend update
- [x] tsc 0 erros + vitest + checkpoint

## Planilha SKU — geracao automatica de SKU (26/06/2026, concluido)
- [x] Regra SKU = [No TIPO]-[CATEGORIA abreviada]-[No produto]-[No variante]
- [x] SKU KIT = SKU + "-KITINS" quando checkbox "Gerar Kit?" marcado
- [x] 32 abreviacoes de categoria aprovadas (palavra-chave central, maiusc., sem acento) em shared/skuSheet.ts
- [x] Recalculo automatico ao mudar Tipo / Categoria / No produto / No variante / checkbox Kit
- [x] Campos SKU e SKU Kit derivados (somente leitura, exibem "auto" quando incompletos)
- [x] Validado no preview: Casa + Tipo 2 + prod 1 + var 1 => 2-CASA-1-1 / 2-CASA-1-1-KITINS
- [x] tsc 0 erros + vitest 720 + checkpoint
- [ ] FUTURO (opcional): integracao de escrita de volta no Google Sheets do Drive (requer OAuth Google)

## Planilha SKU — Nº do produto automatico pelo nome (26/06/2026)
- [x] Ao digitar/alterar o NOME do produto, se ja existir produto com mesmo nome (case-insensitive, trim), reaproveitar o mesmo Nº do produto
- [x] Se o nome for novo, atribuir o proximo Nº da sequencia (max + 1)
- [x] Recalcular SKU/SKU Kit apos definir o Nº do produto
- [x] Nº da variante permanece editavel manualmente (sem mudanca)
- [x] Nº do produto virou somente leitura (derivado do nome); helper resolveProductNumber em shared/skuSheet.ts
- [x] tsc 0 erros + vitest 732 (12 novos) + checkpoint

## Planilha SKU — Edicao por modal + Colunas personalizadas (26/06/2026)
- [x] DB: tabela sku_sheet_custom_columns (id, name, position, createdAt)
- [x] DB: armazenamento de valores das colunas custom por linha (JSON customValues em sku_sheet_rows)
- [x] Backend: procedures CRUD de colunas custom (listar, criar, renomear, excluir)
- [x] Backend: procedure para salvar valores custom por linha (setCustomValue com merge)
- [x] Frontend: modal "Editar linha" com todos os campos (SKU, SKU Kit, No produto somente leitura)
- [x] Frontend: botao de editar (icone) em cada linha abre o modal
- [x] Frontend: render dinamico das colunas custom na tabela (cabecalho + celula editavel por linha)
- [x] Frontend: UI para criar/renomear/excluir colunas custom
- [x] Testes vitest (8 novos: CRUD colunas + merge/limpeza JSON) + tsc 0 erros + validado no preview + checkpoint


## Bug: Gráfico de Evolução das visitas "parando na quinta" (28/06/2026)
- [x] Causa: cache SWR serve snapshot stale e recoleta em background morre no serverless (min-instances=0)
- [x] Correção: visitsSeries agora coleta de forma BLOQUEANTE quando não há valor fresco (cachedAccountResilient), devolvendo série até hoje
- [x] Mantido caminho rápido apenas quando o cache está realmente fresco (TTL)
- [x] Reduzido TTL de frescor da série de visitas para refletir o dia atual com frequência
- [x] Blindado parsing da data das visitas (helper visitBucketBrtKey aceita UTC "Z" e offsets) ancorando eixo em BRT
- [x] Testes vitest (5 novos visitBucketBrtKey) 745 passando + tsc 0 erros + validado no preview (gráfico vai até 28/dom) + checkpoint


## Importar abas KITS e EMBALAGENS da planilha do Pedro (29/06/2026)
- [x] DB: tabela kit_sheet_rows (colunas fixas das abas KITS) + kit_sheet_custom_columns + customValues JSON
- [x] DB: tabela embalagem_sheet_rows (colunas fixas EMBALAGENS) + embalagem_sheet_custom_columns + customValues JSON
- [x] Seed: importar 39 linhas de KITS (43 menos 4 verdes excluidas) e 3 de EMBALAGENS
- [x] Backend: helpers db + procedures tRPC CRUD (linhas + colunas custom + setCustomValue) para KITS e EMBALAGENS
- [x] Frontend: tela KITS editavel (celula + modal + colunas personalizadas + add/excluir linha) via GenericSheet
- [x] Frontend: tela EMBALAGENS editavel (celula + modal + colunas personalizadas + add/excluir linha) via GenericSheet
- [x] Navegacao: abas KITS e EMBALAGENS acessiveis (botoes na Linha do Tempo Pedro + rotas /pedro-timeline/kits e /embalagens)
- [x] Testes vitest + tsc 0 erros + validar no preview + checkpoint


## Unificar Kits e Embalagens DENTRO da Planilha SKU (29/06/2026)
- [x] Planilha SKU passa a ter abas internas no topo: Produtos | Kits | Embalagens (componente SheetTabs compartilhado)
- [x] Remover os botões separados Kits e Embalagens da tela Linha do Tempo Pedro (sobra apenas Planilha SKU)
- [x] Manter rotas /pedro-timeline/kits e /embalagens funcionando (abas navegam entre si, aba ativa destacada)
- [x] Validar no preview (trocar entre as 3 abas, edição preservada) + tsc 0 erros + checkpoint


## Exportar Excel e PDF nas planilhas (29/06/2026)
- [x] Instalar libs de exportacao (xlsx para Excel, jspdf + jspdf-autotable para PDF)
- [x] Criar util de exportacao compartilhado (sheetExport.ts: exportToExcel + exportToPdf)
- [x] Botao Exportar Excel no SkuSheet (Produtos) — menu dropdown
- [x] Botao Exportar PDF no SkuSheet (Produtos) — menu dropdown
- [x] Botoes Exportar Excel/PDF no GenericSheet (Kits e Embalagens)
- [x] Respeitar colunas (fixas + personalizadas) + busca ativa (linhas filtradas)
- [x] Validar no preview (baixados: xlsx 59x25, pdf 5 paginas A4) + tsc 0 erros + checkpoint


## Kits no formato SKU + Migração Kits→SKU + Histórico (29/06/2026)
- [x] BACKUP: tabelas _backup criadas no banco + dumps JSON em scripts/ antes de alterar
- [x] Schema: adicionadas à kit_sheet_rows todas as colunas do formato SKU
- [x] Schema: nova tabela migration_history (origem kit, destino sku, snapshot JSON da linha, data, usuário)
- [x] Migração de dados: novas colunas dos kits preenchidas a partir das colunas antigas (sem perda)
- [x] Backend: kitSheetDb + router kit atualizados para o formato SKU (mesmas colunas)
- [x] Backend: procedure migrateToSku (MOVE: insere na sku_sheet_rows, registra no histórico, deleta do kit)
- [x] Backend: procedure migrationHistory (listar)
- [x] Frontend: componente compartilhado SkuStyleSheet — Kits com layout idêntico ao SKU
- [x] Frontend: botão "Migrar para SKU" (move todas as linhas) com confirmação
- [x] Frontend: dialog "Histórico de Migração" (o que saiu do Kit e foi pro SKU, com data)
- [x] Testes vitest (migrationDb.test: mapeamento preserva dados, descarta id/position) — 772 testes passando
- [x] Validar no preview (Kits no formato SKU + botões Histórico/Migrar) + tsc 0 erros + checkpoint


## Kits: SKU automatico + migracao por selecao (concluido)

- [x] Limpar valores antigos de SKU e skuKit na tabela de Kits (UPDATE no banco)
- [x] Migracao gera SKU automaticamente pela regra padrao (buildSku/buildSkuKit) em migrationDb
- [x] Historico registra o SKU computado (nao mais o campo vazio)
- [x] Checkbox por linha + "selecionar todos" no SkuStyleSheet (prop selection)
- [x] Barra de selecao com "Migrar N para SKU" (so itens marcados) + "Limpar selecao"
- [x] Removida a migracao de "todos de uma vez" sem selecao (botao do header virou so Historico)
- [x] Testes migrationDb atualizados (SKU computado, fallbacks, sem categoria) + tsc 0 erros
- [x] Validado no preview (checkbox marca, barra aparece "Migrar 1 para SKU")


## Backup diario das planilhas no Google Drive (concluido)

- [x] Schema: tabela drive_backup_config (refresh token, conta, pasta, agendamento, status do ultimo backup)
- [x] ENV: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, ML_PUBLIC_ORIGIN expostos no server/_core/env.ts
- [x] Credenciais Google validadas (formato .apps.googleusercontent.com / GOCSPX- + aceitas pelo endpoint oficial)
- [x] Backend: geracao do XLSX das 3 planilhas (server/backup/sheetsXlsx.ts)
- [x] Backend: integracao Google Drive OAuth + upload (server/backup/googleDrive.ts)
- [x] Backend: orquestrador runDriveBackup (gera XLSX, renova token, garante pasta, faz upload, grava status)
- [x] Rotas OAuth /api/oauth/gdrive/connect e /callback (retorno padronizado: ?gdrive=conectado|erro|sem-credenciais)
- [x] Router tRPC driveBackup: status, backupNow, setSchedule (Heartbeat), disconnect
- [x] Handler agendado /api/scheduled/driveBackup (cron-only) para o backup diario
- [x] Frontend: card "Backup no Google Drive" em Configuracoes (conectar, backup agora, ligar diario, escolher horario)
- [x] Recriacao apos reversao de checkpoint: todos os arquivos do backup restaurados
- [x] Testes: 776 passando, tsc 0 erros, card validado no preview
- [x] PENDENTE DO USUARIO: publicar, clicar em "Conectar Google Drive" no site publicado, autorizar conta e testar "Backup agora" (CONCLUIDO 30/06: conectado, Drive API ativada + escopo drive.file, backup manual OK -> Planilha-SKU-2026-06-30_10h05.xlsx na pasta Backups Planilha SKU)
- [x] BUG: apos autorizar no Google, card continuava "Nao conectado". CAUSA: app sem Google Drive API ativada + escopo drive.file ausente na tela de consentimento. RESOLVIDO: token salvo, pasta criada e upload do XLSX OK.

## Filtros de coluna na Planilha SKU (Linha do Tempo Pedro)
- [x] Adicionar filtros nos cabecalhos: Cadastrado ML, Tipo SKU, Categoria, Subcategoria, Produto (pular Nº)
- [x] Opcoes do filtro = todos os valores presentes na coluna (multi-select); aplicar em conjunto com a busca livre
- [x] Indicador visual de filtro ativo + opcao "Limpar" (badge de contagem + botao "Limpar filtros (n)")
- [x] Testes vitest da logica de filtragem por coluna (14 testes passando)

## Cabecalho fixo (congelar paineis) na Planilha SKU - Pedro
- [x] Tornar a linha de titulos (thead) fixa no topo ao rolar verticalmente (estilo "congelar paineis" do Excel) - rolagem interna + thead sticky top-0, validado no preview (linhas 19-33 com header fixo)
- [x] Manter colunas sticky (#, selecao, Acoes) e os filtros funcionando
- [x] Garantir que o zoom 0.85 nao quebre o sticky do header (funcionou no Chrome)

## Correcoes Planilha SKU - Pedro (01/07)
- [x] CRITICO: SKU duplicado (linhas 65/66 ambas 1-SERVICOS-46-1). Garantir unicidade do SKU (sufixo deve incrementar; nunca repetir)
- [x] Investigar e corrigir por que a geracao de SKU nao incrementa o sufixo quando categoria+tipo+numero repetem
- [x] Performance: Planilha SKU esta lenta ao digitar/editar. Otimizar re-render (React.memo nas linhas com comparador, allRows enxuto/memoizado, callbacks estaveis via bindingRef, updates otimistas de cache, refetchOnWindowFocus:false)

## SKU - Opcao A (mesmo nome = mesmo Nº produto; variacao no Nº variante)
- [x] Lógica: nomes iguais SEMPRE compartilham Nº de produto; variante incrementa por variacao (SKU unico)
- [x] resolveVariantNumber garante unicidade em todos os pontos (nova linha, tabela, dialogo)
- [x] Testes vitest cobrindo Opcao A (21 testes)
- [x] Corrigir dados existentes: unificar Nº de produto de nomes iguais divergentes (ex.: CAIXA PRESENTE PREMIUM BRÁS 31 e 29) e resolver SKUs duplicados (65/66) - mostrar antes/depois antes de gravar
- [x] Rodar suite completa e validar no preview (796 testes passando; 3 falhas pre-existentes em accountProvider sensiveis a data)

## BUG REGRESSAO: SKU ainda duplica (linhas 65/67 - ENVELOPE PLASTICO) - 01/07
- [x] CAUSA: resolveVariantNumber so troca a variante quando "desired" colide no instante do calculo; se o grupo estava incompleto a variante 1 era aceita e nunca reavaliada. Linhas 65 e 67 ficaram ambas 1-SERVICOS-46-1
- [x] Reforcar resolveVariantNumber para SEMPRE atribuir o proximo livre quando ha colisao no grupo (comparacao com id deterministico)
- [x] Adicionar normalizeVariantNumbers(rows): reprocessa toda a planilha (2 passadas: preservar nao-colidentes por menor id, depois realocar) garantindo variante unica por grupo com mudanca minima
- [x] Backend: repairVariantNumbers(dryRun) em skuSheetDb + procedure trpc skuSheet.repairVariants (apply opcional), recalcula SKU e skuKit
- [x] Testes vitest cobrindo colisao, reparo em massa, 3 variacoes -> 1,2,3, unicidade do SKU (10 testes)
- [x] Corrigir a linha 60006 real no banco (variante 3 -> 1-SERVICOS-46-3); verificado 0 SKUs duplicados na planilha inteira

## PREVENCAO PERMANENTE: nunca mais SKU duplicado - 01/07
- [x] Backend (trava/ultima defesa): enforceUniqueSku em updateSkuRow/createSkuRow recalcula a variante para o proximo livre no grupo ANTES de gravar, garantindo SKU unico mesmo em colagem/importacao
- [x] Backend: helper enforceUniqueSku reaproveita resolveVariantNumber com as linhas atuais do banco e recompoe sku/skuKit
- [x] Frontend (alerta visual): linhas com SKU duplicado destacadas (borda/badge vermelho) via duplicateSkus + prop isDuplicate no SkuRowEditor (comparador do memo atualizado)
- [x] Frontend: banner/contador no topo com botao "Corrigir automaticamente" (chama skuSheet.repairVariants apply=true e invalida a lista)
- [x] Frontend (correcao automatica ao editar): update sincroniza o cache com a linha do servidor; se o sku retornar diferente do enviado, toast informa o ajuste automatico
- [x] Testes vitest backend: 4 testes de trava (salvar linha que geraria SKU duplicado -> variante incrementada, sku unico)
- [x] Validar no preview: inserida duplicata proposital -> banner+destaque apareceram; "Corrigir automaticamente" gerou 1-SERVICOS-46-4 e zerou duplicatas; linha de teste removida

## DOIS TIPOS DE ALERTA DE SKU/LINHA DUPLICADA - 01/07
- [x] Investigado: o banner antigo dependia do sku PERSISTIDO; como a trava do backend nunca grava sku repetido, o Tipo 2 quase nunca disparava, e o Tipo 1 (linha identica de conteudo) nem existia
- [x] ALERTA 1 (erro do usuario - LINHA IDENTICA): analyzeDuplicates detecta linhas com mesma identidade (tipoSku + categoria + produto + variante normalizados); banner ambar aponta as linhas X e diz "tem os mesmos dados identicos cadastrados"; NAO renumera
- [x] ALERTA 1: celula SKU destacada em ambar nas linhas envolvidas + mensagem com os numeros das linhas
- [x] ALERTA 2 (erro do sistema - SKU IGUAL): analyzeDuplicates.skuCollisions detecta mesmo sku em variacoes DIFERENTES; banner vermelho + botao "Corrigir automaticamente" (repairVariants)
- [x] Diferenciados no UI: Tipo 1 ambar (sem botao, exige acao manual) vs Tipo 2 vermelho (com botao de correcao); celulas destacadas com cores correspondentes
- [x] Testes vitest (7): linha identica, ignora caixa/espacos, variantes diferentes, colisao corrigivel, colisao+identico=Tipo1, sem problemas, sem produto
- [x] Validado no preview: inseri Tipo 1 (linhas 900/901 identicas -> banner ambar) e Tipo 2 (902/903 colisao -> banner vermelho); "Corrigir automaticamente" resolveu o Tipo 2; linhas de teste removidas; 0 duplicatas

## BOTAO COPIAR SKU - 06/07
- [x] Adicionar botao icone de copiar (clipboard) ao lado de cada SKU e SKU Kit gerado na Planilha SKU
- [x] Ao clicar, copia o valor para o clipboard e mostra feedback visual (icone muda para check por 1.5s)
- [x] Botao so aparece quando ha valor no campo (nao mostra no "auto" vazio)
- [x] Validar no preview + checkpoint

## BLOQUEIO DE EDICAO COM SENHA - 06/07
- [ ] Quando uma linha tem SKU completamente gerado (campo sku preenchido), bloquear edicao de TODOS os campos da linha
- [ ] Campos bloqueados: visual desabilitado (opacity reduzida, cursor not-allowed, inputs disabled)
- [ ] Para desbloquear: usuario clica num icone de cadeado na linha -> dialog pede senha -> se senha = "grupofox" -> libera edicao da linha por aquela sessao
- [ ] Enquanto SKU nao estiver gerado, campos permanecem editaveis normalmente
- [ ] Senha armazenada como env var ACCESS_PASSWORD (ja existe no projeto)
- [ ] Estado de desbloqueio por linha mantido em state local (Set de ids desbloqueados)
- [x] Validar no preview (curl + visual) + tsc + checkpoint

## BUG: Bloqueio prematuro na criacao - 07/07
- [x] O bloqueio ativa assim que o SKU e gerado (tipo+categoria+produto preenchidos), mas o cadastro ainda nao esta finalizado
- [x] Corrigir: bloqueio so deve ativar quando o cadastro estiver FINALIZADO (produto + variante preenchidos no minimo, alem do SKU gerado)
- [x] Validar que durante a criacao/edicao a linha permanece editavel ate estar completa
