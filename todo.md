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
- [ ] Publicar e validar

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
- [ ] Publicar (ação do usuário no botão Publish) e validar ao vivo

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
- [ ] BLOQUEIO EXTERNO: bug 504/parser no scraper Mercado Livre da Unwrangle — aguardando correção do provedor (suporte acionado, resposta em até 4h)
- [ ] Quando o provedor voltar: rodar busca real e primeira análise de concorrente com o usuário

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
