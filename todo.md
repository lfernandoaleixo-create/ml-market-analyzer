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
