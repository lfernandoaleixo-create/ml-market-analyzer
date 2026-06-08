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
- [ ] Diagnosticar por que provider.search cai no fallback demo mesmo com token OAuth válido
- [ ] Corrigir chamada real à API oficial (search/bestSellers/categories) e mapeamento
- [ ] Garantir que o banner só diga "dados reais" quando os dados realmente vierem da API
- [ ] Testar com dados reais e publicar
