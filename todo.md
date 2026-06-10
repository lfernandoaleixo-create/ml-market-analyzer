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
