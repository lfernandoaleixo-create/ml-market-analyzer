# Mercato — arquitetura e fluxos atuais

Autoria: Manus e Fernando. Inspeção dos fontes em 18/11/2026.

As seções abaixo descrevem o comportamento observado, incluindo limitações; não constituem certificação de execução de todas as funções nem autorização para corrigir dados.

# 01 — Conta: Painel e Meus anúncios

## Escopo

Inspeção estática em **18/11/2026**, em `/home/ubuntu/ml-market-analyzer`, restrita à conta e dependências necessárias. Nenhum código, migração ou dado comercial alterado; nenhum teste, backup, navegador, banco, API ou arquivo de segredos acessado. Fontes não certificam produção nem valores atuais.

## Implementado

`client/src/App.tsx` registra `/` → `client/src/pages/Painel.tsx` e `/anuncios` → `client/src/pages/Anuncios.tsx`. Painel consulta conexão, histórico, vendas, anúncios, reputação e visitas; exibe faturamento/cancelamentos diários, produtos do dia, Top 10 inicialmente recolhido e saúde da conta. `client/src/hooks/usePeriod.ts` fornece períodos; vendas recebem limites explícitos, mas lucratividade recebe somente `period.days`: equivalência com períodos personalizados não está comprovada.

Meus anúncios inicia com ativos, ordenados por visitas decrescentes. Busca, filtros e ordenação são locais (`shared/listingsAnalytics.ts`), sem paginação da tabela. Mostra contagens/status, visitas, alertas, distribuição, quatro dias por anúncio e PDF dos filtrados (`client/src/lib/exportListingsPdf.ts`). Janela efetiva da UI: 30 dias; estado admite 7/30/90, sem seletor renderizado encontrado.

`client/src/components/account/TechSpecsCard.tsx` mantém Raio-X independente da listagem, lista completa inicialmente e redução opcional a oito itens. Correções são locais, copiadas para clipboard, não publicadas no Mercado Livre.

## Fluxo e fontes

UI → tRPC protegido (`server/routers/account.ts`) → `resolveAccount` → OAuth/proprietário compartilhado → `server/ml/accountProvider.ts` → contratos `shared/account.ts`. `server/dbMl.ts` seleciona proprietário com conexão renovável, outra linha renovável ou solicitante. Tabelas centrais: `users`, `ml_credentials` (`drizzle/schema.ts`); ID local e `mlUserId` são distintos. Seller resolve por persistência, `/users/me`, depois heurística do token. Execução normal pode preencher `mlUserId` e sanar status da conexão; não executamos essas escritas.

Provider lê GETs oficiais: perfil/reputação, IDs, multiget, pedidos pagos/cancelados, categorias e visitas `time_window`. Receita prefere pagamentos aprovados/acreditados, depois `total_amount`; ranking soma preço × quantidade. Conversão divide `sold_quantity` acumulado pelas visitas da janela, não vendas daquele período. Painel depende de `finance.status/profitability` e BaseLinker; PDF consulta Ads. Cálculos internos dessas integrações ficaram fora do escopo.

## Cache, BRT e limites

`server/ml/accountCache.ts` deduplica; TTL padrão 5 minutos, anúncios 12 segundos, série 3 minutos, fallback stale até 6 horas. Chaves de anúncios/série/ficha incluem seller; vendas/reputação/histórico não. `refreshDashboard` expira somente esses três prefixos, preservando snapshot e chamadas em andamento; não força todos os indicadores.

Série agregada coleta **na requisição**, apesar de comentários antigos de background; retorna `fresh/partial/stale`, `asOf`, `attempted/resolved`. Falha total não vira zero. `server/ml/visitsStore.ts` e `visitsDailyStore.ts` ainda coletam em background, em memória, TTLs 15/10 minutos. Comentários citam Cloud Run autoscale, mínimo zero e orçamento 180s; implantação não verificada. `server/ml/mlRateLimiter.ts`: concorrência 1, intervalo efetivo padrão 350ms, retries de rede/429.

IDs paginam por 50, deduplicados; limites: anúncios 600, ficha 5000, série/modal 200; multiget 20. Série descarta `capped`, podendo parecer completa. Pedidos: 1000 por status; histórico monetário pode truncar. Busca/detalhes inválidos geram erro, mas pedidos e alguns cards ainda convertem indisponibilidade em zero: lacuna.

`brtDateKey` aplica UTC−3; `visitBucketBrtKey` preserva dia escrito no bucket, inclusive `Z`. Hoje é parcial. `VisitsEvolutionChart.tsx` distingue dia ausente; `DayVisitsBreakdownDialog.tsx` fixa 30 dias e usa zero para dia ausente, sem estado explícito de erro.

## Invariantes e reprodução

Loja-alvo: **Toujours, seller 3308178634**. Não encontrei símbolo `sellerToujours` nem trava desse seller no router. Nunca alterar, renumerar, reconstruir SKUs ou reutilizar excluídos automaticamente; duplicação **manual deliberada** permitida. Provider apenas lê SKUs. `net` não é lucro sem custos; desconhecido deve ser `null/partial/stale`, nunca zero. APIs readonly não publicam código.

Interfaces retiradas preservam `client/src/pages/Reputacao.tsx`, `PosVenda.tsx` e `client/src/components/account/ActiveListingsCard.tsx`; páginas não registradas como módulos próprios. CSV permanece nos helpers; PDF é atual. Publicação automática de ficha: ideia futura, não implementada.

Reproduzir em cópia isolada: Node compatível, `package.json`, `pnpm-lock.yaml` e patch referenciado. `vitest.config.ts`: Node/aliases. Mockar fetch, OAuth, DB, finance/Ads, relógio BRT e clipboard; limpar caches. Testes existentes: `server/accountDashboard.test.ts`, `server/ml/accountProvider.test.ts`, `server/ml/accountCache.test.ts`, `server/visitsChartAvailability.test.ts`, `server/technicalSpecsAvailability.test.ts`. Acrescentar truncamento, troca de seller e falhas financeiras. Não executar `db:push`, usar credenciais reais ou presumir testes aprovados.


---

# 02 — Vendas e Margem

## Estado inspecionado

Leitura estática em 18/11/2026 de `/home/ubuntu/ml-market-analyzer`, sem navegador, execução, testes, backup, banco, APIs, segredos ou alterações comerciais. Caminhos abaixo são relativos ao projeto; descrevem fontes presentes, não comprovam estado da produção.

## Interface e fluxo implementados

`client/src/pages/Vendas.tsx`, montado em `/vendas` por `client/src/App.tsx`, apresenta período unificado, faturamento, ticket, unidades, cancelamentos, gráfico diário, detalhamento por dia e ranking pesquisável. Ranking recebe `topLimit: 0`, mas mostra inicialmente dez produtos; detalhe diário, oito.

Visão geral: UI → `account.connection/storeLifetime/salesRange/productsByDay` → `server/routers/account.ts` → cache em memória e `server/ml/accountProvider.ts` → Mercado Livre → KPIs/série/produtos. Faturamento prefere pagamentos approved/accredited, com fallback para `total_amount`; produtos usam preço unitário × quantidade. Datas e cancelamentos são agrupados pela criação do pedido em Brasília, não pela data do cancelamento. Coleta limita cada status aos 1.000 pedidos mais recentes, filtrando período depois; ranking “completo” não garante histórico completo. Enriquecimento visual alcança oitenta produtos. A visão geral ainda usa `?? 0`, sem as garantias financeiras da margem.

A aba `client/src/components/sales/MargemVendas.tsx` chama `salesMargin.dashboard/refresh`, em `server/routers/salesMargin.ts`. Fluxo: procedimento autenticado → `server/salesMargin/provider.ts` → resolução do proprietário compartilhado, credenciais/OAuth e validação `/users/me` → `/orders/search` ML e `/v1/payments/{id}` MP → leitura fresca de relatórios/custos → mesclagem → cálculos de `shared/salesMargin.ts` → `MarginDashboard`, com `asOf/stale/partial/capped`, linhas, totais e subtotais.

## Fontes, persistência e regras

`net_received_amount` confirmado é autoritativo: descontos = bruto − líquido; tarifas/retenções explicam esse líquido, sem nova subtração. Resultado = líquido − CMV total do pedido − extras totais; exige financeiro confirmado, todos os SKUs presentes e ambos os custos conhecidos. Não é lucro líquido contábil. Pagamento parcial, estorno ou fonte insuficiente permanecem pendentes. Valores desconhecidos são `null`/“—”; coleta parcial invalida totais, enquanto fotografia antiga é sinalizada `stale`. Publicidade/armazenamento Full posteriores podem faltar.

Importação: arquivo em memória → `previewReport` → confirmação deliberada da loja → `importReport`. `server/salesMargin/reportParser.ts` aceita CSV UTF-8 ou XLSX estático, ML “Por venda” e MP account-money com referência inequívoca do pedido; rejeita “Por liberação”, fórmulas nos campos utilizados e fluxos MP não classificados. Agrupa eventos assinados, deduplica somente identificação inequívoca; linhas iguais sem ID permanecem com aviso. Prévia não persiste. Importação ainda exige validação online da conta; falha na coleta inicial pode impedir dashboard mesmo havendo relatórios.

`server/salesMargin/db.ts` usa `sales_margin_reports` e `sales_margin_costs`, definidas em `drizzle/schema.ts`; migração existente: `drizzle/0036_broad_forgotten_one.sql`. Índices únicos: proprietário/vendedor/hash e proprietário/vendedor/operação. Guarda projeção financeira, não arquivo bruto/compradores. Último relatório importado substitui a fotografia da operação, não soma uploads; custos permanecem. SKU ausente só recebe complemento de API por operação/itemId exatos e únicos, nunca por título. Custos aceitam `null` ou zero explícito; confirmação de zero existe na UI, não no router; `saveCost` não verifica existência da operação.

Invariantes obrigatórias: Toujours, seller `3308178634`; nunca alterar, renumerar, reconstruir SKUs ou reutilizar excluídos automaticamente; duplicação MANUAL deliberada permitida. Este módulo não modifica catálogo; extração aplica trim e limite textual, não recupera zeros perdidos de SKU numérico. APIs read-only não publicam código. Nenhuma migração ou dado comercial foi alterado neste trabalho.

## Legado, limites e reprodução

`/lucratividade` foi retirada/redirecionada por `shared/mercatoNavigation.ts`; `client/src/pages/Lucratividade.tsx`, `server/routers/finance.ts` e `server/finance/*` permanecem, inclusive consumidores no Painel. BaseLinker fornece custos/pedidos; motor fiscal estima Lucro Presumido/TTS/ICMS/DIFAL/FCP. Legado trata CMV ausente e Ads indisponível como zero; não confundir com margem confirmada. Preserva `tax_config`, `tax_config_history`, `profit_snapshots` e handler `server/scheduled/profitSnapshot.ts`.

Provider atual: 300 pedidos até 31 dias, 600 acima; orçamento 80s, timeout 12s, concorrência quatro, cache 120s/64 chaves, fallback 6h. Relatórios: 2MB, 5.000 linhas, 128 colunas, XLSX descompactado 30MB; leitura de 1.000 relatórios. Limite de 31 dias orienta geração, não valida duração do arquivo.

Reprodução isolada requer pnpm/lockfile, `vitest.config.ts`, mocks de autenticação/OAuth/fetch/DB e fixtures sintéticas. Testes existentes: `shared/salesMargin.test.ts`, `server/routers/salesMargin.test.ts`, `server/salesMargin/{provider,reportParser}.test.ts`, `server/salesMarginUi.test.tsx` e `server/finance/*.test.ts`; não executados. MySQL/Drizzle, ML/MP e BaseLinker são dependências; implantação gerenciada, permissões reais e agendamento ativo não foram confirmados. Conciliação integral e saneamento do legado são propostas futuras, não funções entregues.


---

# 03 — Planilha SKU e embalagens

## Escopo e fontes

Estado observado por leitura estática em 18/11/2026 de `/home/ubuntu/ml-market-analyzer`; caminhos abaixo são relativos a essa raiz. Nenhum código, migração ou dado comercial foi alterado. Não foram acessados navegador, banco, APIs, segredos, `.env`, arquivos privados ou outras sessões; testes e backups não foram executados. Contexto obrigatório: loja Toujours, seller `3308178634`. As tabelas deste módulo não possuem segregação por seller/usuário; essa associação comercial não foi comprovada nos fontes inspecionados.

## Interface e fluxo implementado

`client/src/App.tsx`, `shared/mercatoNavigation.ts` e `client/src/pages/pedro/SheetTabs.tsx` expõem `/planilha-sku` e `/planilha-sku/embalagens`, com abas Produtos/Embalagens e redirecionamentos antigos. `client/src/pages/pedro/SkuSheet.tsx` injeta hooks tRPC em `SkuStyleSheet.tsx`: cadastro, filtros, cores, colunas personalizadas, modal e exportação da seleção filtrada. `sheetExport.ts` gera XLSX/PDF localmente, sem exportar código ou histórico completo.

Fluxo: célula/card → `trpc.skuSheet` → validação Zod em `server/routers/skuSheet.ts` → funções de `server/skuSheetDb.ts` → `getDb()`/Drizzle → releitura da linha → resposta/cache React Query. Categorias vêm do arquivo estático `shared/mlCategories.json`; tipos, abreviações e normalizações, de `shared/skuSheet.ts`. Preços e dimensões são texto livre, não cálculo financeiro ou validação física.

Há debounce de 600 ms, cache otimista e filas por linha. Lista/colunas atualizam a cada segundo, inclusive em background; decisão/variações fazem polling enquanto o popover está aberto. Campos em edição preservam rascunhos; erros invalidam consultas. Não é colaboração via websocket.

## Identidade, reservas e concorrência

Criação força `pending`, SKU vazio e números nulos. Preencher produto atribui número permanente; identidade permanece editável até confirmação no `SkuVariationsPopover.tsx`. O card permite reutilizar referência ativa idêntica, gerar pela regra `TIPO-CATEGORIA-NºProduto-NºVariante` ou digitar manualmente. Reutilização exige identidade normalizada, incluindo características. Duplicação MANUAL deliberada é permitida; geração automática mantém unicidade histórica global.

`drizzle/schema.ts` define `sku_sheet_rows`, `sku_sheet_custom_columns`, `sku_variations`, `sku_change_log` e reservas `sku_product_number_reservations`, `sku_variant_number_reservations`, `sku_value_reservations`. Produto usa maior reserva comercial válida + 1, pulando anuladas; não usa AUTO_INCREMENT técnico. Variante reserva sequência por tipo/categoria/produto. Índices únicos e tentativas limitadas tratam colisões; reservas são append-only.

Nunca alterar, renumerar, reconstruir SKUs ou reutilizar excluídos automaticamente. Identidade finalizada é imutável no update comum. Edição manual específica usa transação, auditoria e CAS (`expectedRevision`), preservando números/variações; editar principal não recalcula `skuKit`. Decisão/update/metadados usam CAS; valores personalizados comparam o JSON, com cinco tentativas. Reservas da decisão precedem CAS e podem permanecer após conflito. Criações releem maior id, deixando risco concorrente não validado.

Exclusão de linha/variação é lógica, idempotente e sem exigir revisão; parâmetros opcionais de revisão são ignorados. Tombstones preservam índices/dados. Variações começam com dez placeholders `base-01…10`; adição começa em 11. SKUs persistidos não são reconstruídos ao editar a base.

## Autorizações, embalagens e legado

SKU usa `protectedProcedure`: autenticação, não perfil administrador. Cadeado visual valida `auth.verifyPassword`, sem liberar identidade no servidor. `server/skuProtection.ts` conserva autorização nominal estática e histórico; essa validação não condiciona os lápis atuais. Auditoria manual fixa um autorizador e inclui operador na descrição.

`EmbalagemSheet.tsx` usa `GenericSheet.tsx`, `server/routers/embalagemSheet.ts` e `server/embalagemSheetDb.ts`: CRUD público, exclusão física, sem CAS/polling periódico; tabelas `embalagem_sheet_rows`/`embalagem_sheet_custom_columns`. Kits não têm interface encontrada, mas `server/kitSheetDb.ts`, `server/routers/kitSheet.ts`, tabelas `kit_sheet_*` e `server/migrationDb.ts` permanecem registrados. MOVE preservado cria destino pendente, registra snapshot e remove origem; não executá-lo. `-KITINS` é sufixo, não composição. Reparo automático foi removido; diagnóstico/funções e mensagens antigas persistem. Arrastar posições é apenas ideia futura no schema.

## Reprodução e testes isolados

Preservar `package.json`, `pnpm-lock.yaml`, aliases e dependências React/tRPC/Zod/Drizzle/mysql2; `vitest.config.ts` usa Node. Usar fixtures sintéticas e mocks de DB/autenticação como `server/skuVariations.test.ts`, `skuSheetAccess.test.ts` e `embalagemSheetDb.test.ts`; testar CAS, reservas, tombstones e duplicação manual. Compatibilidade MySQL/TiDB é indicada pelo código; disponibilidade gerenciada não foi verificada. Não chamar serviços reais nem `db:push`. APIs readonly não publicam código. `net` não é lucro sem custos; desconhecido é `null`/partial/stale, nunca zero financeiro inferido.


---

# 04 — Projeto, produtos e documentos

## Escopo e fontes

Estado dos fontes inspecionados em 18/11/2026, por leitura estática. Não houve alteração de código, migração, consulta ao banco, APIs, navegador, testes ou backup. Caminhos relativos a `/home/ubuntu/ml-market-analyzer`. A página verdadeira é `client/src/pages/project/Projeto.tsx`; a persistência é `server/projectDb.ts`, não `dbProject.ts`. Fontes comerciais deste módulo são cadastros manuais e anexos; não se verificou importação automática de anúncios.

## Comportamento implementado

`client/src/App.tsx` monta `/projeto`, `/projeto/timeline`, `/projeto/analise` e `/projeto/produto/:id`. `ProjetoPainel.tsx` permite criar nome/prioridade, pesquisar nome, filtrar prioridade/etapa e alternar cards/lista. `ProjetoProduto.tsx` edita descrição, fornecedor, contato, notas e chegada prevista; mantém tarefas, comentários, anexos e exclusão permanente confirmada. Nome de visitante é uma barreira de interface, não autenticação servidor.

**Divergência real:** Painel e ficha usam `useTimelineApi` em `client/src/lib/projectApi.ts`, direcionado a `trpc.luisTimeline`: etapas dinâmicas ordenadas, progresso `done/note`, atualização periódica de 15 segundos e primeira etapa não concluída como atual. Entretanto, `ProjetoTimeline.tsx` consulta `project.products.timelineOverview`, e `ProjetoAnalise.tsx`, `dashboardOverview`: ambos usam dez etapas clássicas de fornecedor a lançamento, com atualização de 30 segundos. A análise compara progresso com uma hipótese implementada de pipeline de 90 dias, tolerância de dez pontos percentuais. Não existe sincronização automática entre os dois modelos; os indicadores podem divergir. A ficha chama `setDone`, não a variante sequencial preservada.

## Fluxo e persistência

UI → hooks tRPC → `server/routers/project.ts` → helpers `server/projectDb.ts` → `getDb` de `server/db.ts` → Drizzle/MySQL → resposta/refetch. Produtos retornam registros enriquecidos; criação retorna resultado do insert, atualização retorna produto; várias mutações não retornam objeto. Leituras sem DB frequentemente retornam vazio/indefinido; escritas falham.

`drizzle/schema.ts` define `project_products`, `project_timeline_steps`, `project_todos`, `project_documents` e `project_comments`. Vínculos são IDs numéricos; comentários fazem left join com `users`. Essas declarações não possuem foreign keys/cascata, e `drizzle/relations.ts` está vazio. Excluir produto apaga somente sua linha; excluir documento apaga metadados, sem remover binário. `server/routers/luisTimeline.ts` e `server/luisTimelineDb.ts` usam `luis_timeline_stages` e `luis_product_step_progress`, compartilhando `project_products`; overview ignora progresso legado com `supplierId` preenchido. Excluir etapa remove progresso associado e compacta posições — não SKUs.

CRUD de Projeto e cronograma é `publicProcedure`; excluir comentário exige usuário autor ou administrador. Comentários aceitam até 2.000 caracteres. Upload genérico usa FileReader/base64, `storagePut`, grava URL/chave e responde `{url,key}`; não valida assinatura, tamanho ou MIME no router. `server/storage.ts` depende de Forge/S3 gerenciados e `/manus-storage`; o limite HTTP de 50 MB em `server/_core/index.ts` não é validação de arquivo.

PDFs seguem `client/src/pages/CalculadoraFinal.tsx` → `alpha.documents.attachPdf` → `server/alpha/documentsRouter.ts`, `documentContracts.ts`, `documentStore.ts`. Exigem autenticação, PDF até 15 MB, snapshot até 1 MB, hashes/contexto idempotentes e lease de dez minutos. `drizzle/alphaSchema.ts` mantém `alpha_pdf_exports`; finalização transacional anexa `project_documents`. Upload externo não é transacional e pode deixar órfão. Destino é produto existente escolhido, nunca criado automaticamente. `server/alpha/catalogRouter.ts` mantém catálogo separado por usuário, payload/versionamento otimista em `alpha_catalog_products`; SKU é informativo, não vínculo ao Projeto.

## Legado, invariantes e reprodução

`shared/mercatoNavigation.ts` redireciona interfaces Luís/Pedro retiradas; páginas e schemas permanecem. O cronograma clássico continua ativo, não apenas arquivado. Unificar etapas ou limpar órfãos são ideias futuras, não execução autorizada.

Preservar loja Toujours, seller `3308178634`; nunca alterar, renumerar, reconstruir SKUs ou reutilizar excluídos automaticamente; duplicação MANUAL deliberada é permitida. `net` não é lucro sem custos; desconhecido deve ser `null/partial/stale`, não zero — fontes atuais ainda mascaram indisponibilidade com vazios. APIs read-only não publicam código.

Para reprodução isolada, mockar DB/storage/auth/tRPC e relógio, bloquear rede e usar fixtures sintéticas; referências: `server/luisTimelineDb.test.ts`, `server/alpha/documentsRouter.test.ts`, `server/alpha/documentStore.test.ts`, `server/appResponsive-projeto.test.tsx`. Serviços, dados comerciais, integridade histórica e testes não foram verificados; nenhuma credencial deve integrar o pacote.


---

# 05 — Calculadora de precificação Alpha

## Estado implementado — 18/11/2026

Inspeção estática de `/home/ubuntu/ml-market-analyzer`, sem alterar fontes, dados comerciais ou migrações. `client/src/pages/Calculadora.tsx` mantém três modelos; somente `/calculadora/final` monta `CalculadoraFinal.tsx` → `client/src/alpha/AlphaCalculator.tsx`, carregado via lazy/Suspense. A Alpha oferece preço→margem, margem→preço, comparação Clássico/Premium, produtos únicos, kits, histórico, catálogo privado e fluxogramas. “Real”/“Estimado” são classificações da simulação, não comprovação de custos efetivos do vendedor.

O motor local `shared/alpha/pricing.ts`, coordenado por `pricingFlow.ts`, soma aquisição, operação, embalagem, comissão, frete, publicidade, tributos e extras; arredonda componentes em centavos. `solveTarget` procura o menor preço que atinge a meta por segmentos, respeitando saltos tarifários. `kitComposition.ts` calcula quantidade×custo dos componentes. Peso utilizado é o maior entre físico e comprimento×largura×altura/6000; medidas parciais invalidam o pacote. `freeShippingControl.ts` torna frete grátis obrigatório a partir de R$79 no perfil elegível.

## Informações e fluxos

`shared/alpha/tariffs.ts` contém tabelas estáticas e URL oficial, consultada em 26/10/2026, não vigência garantida hoje. `companyProfile.ts` e `destinationTaxes.ts` contêm presets editáveis, não apuração fiscal oficial; DIFAL aplica-se à venda externa. `packagingCatalog.ts` sugere P/G por palavras-chave, sem completar automaticamente todas as dimensões; GG é referência futura indisponível.

Catálogo: `hooks/useProductCatalog.ts` → `trpc.alpha.catalog.list/save/delete` → `server/alpha/router.ts`/`catalogRouter.ts` → Drizzle/MySQL → registro e versão. `shared/alpha/productCatalog.ts` preserva campos desconhecidos e números não finitos; cadastro incompleto recebe `draft`/`resultPrice:null`. Salvamento/exclusão usam CAS com `expectedVersion`. A sessão define owner; cron/sintéticos são recusados. Login compartilhado significa isolamento por conta/loja, não por pessoa.

Sugestões de destino: `components/ProjectProductSuggestions.tsx`/`lib/mercatoPdf.ts` filtram nomes do Projeto localmente; o usuário escolhe o **ID real**. Nome/SKU não vinculam automaticamente registros. Categorias: descrição → `alpha.pricing.suggestCategory` → `server/alpha/categoryService.ts` → descoberta/detalhes oficiais MLB → `llmAdapter.ts` → validação → uma categoria folha habilitada, confiança alta, sem alternativas; ambiguidades falham. Respostas de descrições antigas são descartadas pela UI.

PDF: `components/ProductPdfDialog.tsx` → `shared/alpha/decisionReport.ts` → `lib/productPdf.ts`, `flowPdfPages.ts`/`flowCompactPdfPages.ts` (jsPDF/autoTable) → `CalculadoraFinal.persistPdf` → `documentsRouter.ts`/`documentStore.ts` → `server/storage.ts` (presign Forge→PUT S3) e DB → URL/metadados → download. Destino/owner são congelados; retry conserva exportId/bytes/contexto. Finalização `ready` e anexo são transacionais; nenhum produto é criado.

## Persistência, limites e interface preservada

`drizzle/alphaSchema.ts`: `alpha_catalog_products(ownerId,id,recordPayload,version)` e `alpha_pdf_exports(ownerId,exportId,hashes,status,lease,key,url,snapshot)`; `drizzle/schema.ts`: `project_products` e `project_documents`. Registro principal existe em `server/routers.ts`. Bytes ficam fora do DB. Catálogo/snapshot: 1 MiB; PDF: 15 MiB, base64 canônico e `%PDF-`; lease: 10 minutos. URLs herdam o storage; crash entre upload/checkpoint pode deixar órfão.

IA usa modelo configurado `gpt-6-luna`, reasoning baixo, credenciais gerenciadas existentes: 12/min/IP; cache 5 minutos/100 registros; catálogo de modelos 10 minutos; deadlines taxonomia/request/modelos 8/20/2 segundos; adapter admite quatro retries canceláveis. Não há quota monetária local demonstrada. Status `officialSellerConnected:false` é declarativo.

`storagePrivacy.ts` bloqueia novos históricos locais autenticados e limpa rascunhos; `productCatalogResume.ts` usa sessionStorage temporário. `usePricingCalculationInput.ts`/`pricingCalculationKey.ts` evitam recálculo por metadados sem atrasar valores financeiros. Matrizes cedem execução e usam cache; PDFs/explorador são lazy. `PricingFields.tsx` preserva digitação/foco e gerencia Tab/Escape/restauração modal. PDFs salvos são consultados a cada 10 segundos.

`interfaceInput.ts` retira da UI custo/kg, frete manual, usados, publicidade percentual, ofertas, reserva e desconto categorial, preservando motor/snapshots legados; carregar normaliza somente a cópia editável. Comparações usam Verde/Agência (`alphaProfile.ts`), sem sobrescrever cadastros implicitamente. Importação/backup existem como callbacks opcionais em `ProductLibraryDialog.tsx`, mas não estão conectados na tela atual.

## Invariantes e reprodução

Preservar Toujours/seller **3308178634**; vínculo não confirmado nesta área. Nunca alterar, renumerar, reconstruir SKUs ou reutilizar excluídos automaticamente. “Salvar como novo” permite duplicação **manual deliberada**, gerando ID interno novo; não há tombstone/unicidade/imutabilidade de SKU demonstrados. `netPayout` não é lucro sem custos. Desconhecido deve permanecer null/partial/stale, nunca zero válido: motor inválido possui placeholders zero, protegidos por `valid:false`. APIs Mercado Livre são leitura, não publicação de anúncios/código; CRUD Alpha é persistência interna.

Reproduzir com manifesto/lockfile, Node/pnpm, React/Vite/tRPC/Drizzle/MySQL; substituir auth, DB, storage, taxonomia e LLM por mocks. Suites existem em `shared/alpha/*.test.ts` e `server/alpha/*.test.ts`; `vitest.config.ts` usa Node, sem cobertura browser automática. Não executei testes nem backups; existência das tabelas, credenciais, quotas reais, latência e comportamento visual permanecem não verificados. Nenhuma migração deve ser executada implicitamente.


---

# 06 — Publicidade Mercado Livre

## Estado inspecionado

Leitura estática em 18/11/2026 de `/home/ubuntu/ml-market-analyzer`; caminhos abaixo são relativos à raiz. Não houve alterações no projeto, migrações, execução de testes, backup, navegador, banco ou APIs; nenhum segredo foi consultado.

A página verdadeira é `client/src/pages/Ads.tsx`, montada em `/ads` por `client/src/App.tsx` e presente no menu de `shared/mercatoNavigation.ts`. Mantém seis abas: Resumo, Campanhas, Anúncios, Categorias, Auditoria Mamba e Inteligência. Exibe conexão, ausência de Ads, carregamento, erro/repetição e alerta de limitação. Permite atualização, filtro “só com gasto”, detalhamento de categorias e links externos. Não há controles para editar campanhas. Publicidade não está entre as interfaces retiradas da navegação; retirar uma interface não implica excluir código/dados. Não foi identificada interface Ads removida. Execução futura por robôs, após habilitar escrita e novo consentimento, é intenção descrita, não implementação.

## Fluxo e identidade

`Ads.tsx` → `trpc.ads.*` → `server/routers.ts` → `server/routers/ads.ts` → `server/ml/adsProvider.ts` → resposta tipada por `shared/ads.ts`. Todos os procedimentos Ads são queries autenticadas via `protectedProcedure` (`server/_core/trpc.ts`), sem exigência específica de administrador.

`server/ml/oauthMl.ts` resolve/renova OAuth, inclusive uma tentativa após 401/403. `server/dbMl.ts::resolveMlOwnerUserId` prioriza dono com conexão renovável, depois qualquer conexão renovável, depois solicitante. Tokens são compartilhados pela loja; caches e snapshots Ads usam o usuário solicitante. A identidade requerida é Toujours, seller **3308178634**; o router interno não valida explicitamente esse seller. O provider escolhe advertiser MLB, com fallback ao primeiro advertiser, distinto do seller.

Somente GETs consultam `https://api.mercadolibre.com`: `/advertising/advertisers?product_id=PADS` e `/marketplace/advertising/MLB/advertisers/{advertiser}/product_ads/{campaigns|ads}/search`. `account.storeLifetime` fornece primeira venda ao seletor. Entretanto, Ads recebe apenas `days` (1–1095, padrão 30): o provider ancora a janela no presente, usando datas UTC; intervalos antigos/customizados não preservam o término escolhido.

## Métricas, persistência e limites

Métricas incluem gasto, impressões, cliques, unidades e receitas atribuídas diretas/indiretas. ROAS=receita/gasto; ACOS=gasto/receita×100; CTR=cliques/impressões×100; conversão=unidades/cliques×100. Agregações recalculam taxas. Receita, ROAS e qualquer `net` não são lucro sem produto, impostos, comissão, frete e demais custos. A parcela orgânica é proporção de unidades, não comprovação causal de “halo”.

`server/ml/adsAudit.ts` categoriza títulos deterministicamente e produz heurísticas. `server/ml/adsAuditStore.ts` grava as tabelas de `drizzle/schema.ts`: `ads_campaign_snapshots`, `ads_item_snapshots`, `ads_change_log`, com usuário, dia, identificadores, configuração/métricas JSON e vereditos. Categorias/auditoria são leitura no ML, mas **escrevem no banco interno**. Repetições substituem snapshots do dia; somente a primeira captura compara ao dia anterior disponível. Não há transação nem unicidade garantindo concorrência. Histórico retornado não é filtrado pelo período. Mamba é inferida por `/mamba|fibra/i`, sem integração/verificação de autoria. Capturam-se anúncios ativos; status vazio conta como ativo.

`server/scheduled/adsSnapshot.ts` implementa POST `/api/scheduled/adsSnapshot`, autenticado como cron com `taskUid`; janela de 30 dias. Agenda efetivamente ativa não foi verificada. Campanhas: até 500; anúncios: geralmente 300, captura 400, filtrados depois da coleta. Não há sinal explícito de truncamento Ads.

`server/ml/accountCache.ts`: cache processual por usuário/chave, TTL Ads 15 minutos, deduplicação e fallback até seis horas. Router descarta `stale/asOf`; atualizar UI não invalida cache servidor. Advertiser: 30 minutos por token. `server/ml/mlRateLimiter.ts`: concorrência padrão 1, espaçamento efetivo 350 ms; timeout Ads 12 segundos, quatro retries de 429. Referências a Cloud Run são comentários, não infraestrutura confirmada.

## Terceiros, invariantes e reprodução

`shared/readApi.ts`, `server/readApi/http.ts` e `server/readApi/data.ts` expõem GET `/api/public/v1/ads`: Bearer com `ads:read`, 60/minuto, duas consultas simultâneas/chave, janelas 7/30/90, allowlist, cache cinco minutos e `stale/asOf`; validam `/users/me` antes do cache. APIs readonly não publicam código. Não há integração direta Ads com BaseLinker/Omie/GS1 identificada.

Desconhecido deve ser `null/partial/stale`, nunca zero: lacuna atual, `num()` converte ausências/inválidos em zero e transporte interno oculta falhas não-429 como `null/[]`; transporte público é mais estrito. Nunca alterar/renumerar/reconstruir SKUs nem reutilizar excluídos automaticamente; duplicação MANUAL deliberada permanece permitida. Não houve alteração comercial neste trabalho.

Reproduzir com dependências/lockfile existentes; isolar OAuth, fetch, relógio, cache, cron e DB descartável/mocado, bloqueando rede real. Referências: `server/ml/{adsProvider,adsAudit,adsActiveFilter}.test.ts`, `server/appResponsive-ads.test.tsx`, `server/readApi/data.test.ts`. Cobrir falhas, identidade, datas, truncamento e concorrência; aprovação/runtime permanecem não verificados.


---

# 07 — Login, navegação e app instalável

## Estado e fontes

Inspeção estática em 18/11/2026 de `/home/ubuntu/ml-market-analyzer`; caminhos abaixo são relativos a essa raiz. Nenhum código, migração ou dado comercial foi alterado; nenhum teste, servidor, backup, navegador, banco ou API foi executado/acessado. Configurações secretas e arquivos privados não foram consultados. O retrato descreve fontes, não confirma o deployment ativo.

## Login, sessão e fluxo

`client/src/App.tsx` envolve todas as rotas em `components/DashboardLayout.tsx`, que consulta `_core/hooks/useAuth.ts`: carregamento mostra skeleton; ausência de usuário mostra `AccessGate`. UI → `auth.gateInfo`/`auth.passwordLogin` → `server/routers.ts` → `server/db.ts:getOwnerUser` → SDK → cookie → `{success:true}` → recarga em `/`. O gate depende de configuração; usa senha compartilhada e assume a identidade do dono, não cria usuário individual. A resolução segue dono configurado, primeiro admin, primeiro usuário; sem conta retorna erro. Não há limitação de tentativas implementada nesse handler.

O botão rotulado “administrador (Mercado Livre)” chama `client/src/const.ts:getLoginUrl`, mas efetivamente aponta ao portal OAuth Manus. `server/_core/oauth.ts` troca código, busca perfil, faz upsert, emite sessão e redireciona. A integração ML é registrada separadamente em `server/_core/index.ts`. O `state` é redirect codificado em base64; não foi encontrada validação local por nonce.

`server/_core/sdk.ts` assina/verifica JWT HS256, com expiração de um ano; verifica presença de `openId/appId/name`, não igualdade do appId configurado. Consulta usuário, sincroniza perfil ausente pelo provedor e atualiza `lastSignedIn` até em autenticação de consultas. `drizzle/schema.ts:users` contém id, openId único, nome/email/loginMethod, role `user|admin` e timestamps; não há tabela de sessões nesse fluxo. `server/db.ts` promove dono configurado a admin. `server/_core/cookies.ts` usa HttpOnly, caminho `/`, SameSite=None e Secure conforme HTTPS/proxy: HTTP local pode sofrer rejeição do cookie. Logout limpa cookie e invalida `auth.me`; não há revogação central do JWT. O hook também grava perfil no localStorage.

`server/_core/context.ts` permite HTTP anônimo somente para me, gateInfo, passwordLogin, logout e health; exige autenticação inclusive em procedures legadas públicas. `trpc.ts` distingue protected/admin; menu não filtra por papel. Senha compartilhada herda os poderes da conta resolvida. Verificação de desbloqueio SKU é separada da sessão e não integra a allowlist anônima.

## Navegação e plataformas

`shared/mercatoNavigation.ts` centraliza Painel, Vendas, Anúncios, Projeto, SKU, Calculadora, Publicidade e Configurações; Embalagens é subrota SKU. Diagnóstico continua roteado sem item no menu. Rotas antigas redirecionam; interfaces de lucratividade, pós-venda, reputação, radar e descoberta/monitoramento foram retiradas, mas páginas como `client/src/pages/Lucratividade.tsx`, `Reputacao.tsx` e `Monitoramento.tsx` e routers correspondentes permanecem. Isso não constitui remoção de registros.

Desktop permite recolher/redimensionar sidebar entre 200–460px, salva largura localmente e aceita Ctrl/Cmd+B. Mobile abaixo de 768px usa Sheet, fecha após navegação; mudanças de rota reiniciam scroll. `index.css`, `hooks/useMobile.tsx`, `components/ui/sidebar.tsx` e `lib/mercatoPwa.ts` tratam safe areas, toque e teclado/visualViewport.

`client/public/manifest.webmanifest` define standalone, escopo `/` e ícones Toujours. `client/index.html` inclui metadados Apple. `components/app/InstallAppButton.tsx` captura prompt e confirma por appinstalled/standalone; oferece instruções Safari iOS, Chrome Android e desktop. Não é aplicativo de loja nativa.

## Offline, invariantes e reprodução

`main.tsx` usa tRPC `/api/trpc`, SuperJSON, cookies e timeout 45s; queries têm staleTime 60s/GC 30min. `lib/mercatoOnlineMutations.ts` bloqueia novas mutações antes do otimismo, sem retry/fila/replay, preservando navegação/busca. `NetworkStatus.tsx` alerta desatualização. `mercato-sw.js`, registrado somente em produção segura, guarda apenas `mercato-offline.html`; APIs, escritas e assets passam direto, sem cache comercial nem skipWaiting.

Invariantes contratuais: Toujours, seller `3308178634`; nunca alterar/renumerar/reconstruir SKUs nem reutilizar excluídos automaticamente; duplicação MANUAL deliberada permitida. Net não é lucro sem custos; desconhecido deve ser null/partial/stale, não zero. APIs readonly não publicam código. Esses contratos comerciais não foram auditados neste escopo.

Reprodução exige Node/pnpm 10.4.1, lockfile, Vite/Express, configuração própria e serviços gerenciados OAuth/MySQL/storage. Ícones referenciados não foram encontrados em `client/public`. Testes isolados existentes: `server/auth.passwordLogin.test.ts`, `auth.logout.test.ts`, `mercatoPwa.test.ts`, `mercatoOnlineMutations.test.tsx`, `shared/mercatoNavigation.test.ts`; `vitest.config.ts` usa Node, offline usa jsdom. Mockar DB/provedor/rede e validar allowlist HTTP separadamente. Instalação real/cookies exigem validação futura autorizada; nenhuma melhoria proposta deve ser confundida com implementação.


---

# 08 — API externa e integração Grupo Fox

**Estado inspecionado: 18/11/2026, somente fontes locais.** Raiz dos caminhos citados: `/home/ubuntu/ml-market-analyzer`. Nenhum código, migração ou dado comercial foi alterado; não houve acesso a banco, APIs, navegador, `.env`, arquivos privados ou execução de testes/backup.

## Implementação e fluxo

`client/src/pages/Configuracoes.tsx` monta `client/src/components/settings/ReadApiKeysCard.tsx`. O identificador `configReadApiKeysCard` não foi encontrado. UI → `trpc.readApiKeys` → `server/routers/readApiKeys.ts` → `server/readApi/keys.ts` → tabela `mercato_read_api_keys` (`drizzle/schema.ts`). Apenas administradores gerenciam chaves; o proprietário é resolvido no servidor, não recebido do cliente. A UI exibe o segredo uma vez, limpa a mutation, descarta exposição no logout/troca de conta/revogação e lista metadados de todas as chaves, inclusive antigas.

`server/_core/index.ts` registra `server/readApi/http.ts` antes do tRPC e do fallback estático. Consumidor externo → `/api/public/v1` → autenticação/escopo/validação → `data.ts` → providers Mercado Livre/Mercado Pago ou SELECT Drizzle → projeção explícita → `{data,meta}`. `shared/readApi.ts` define oito escopos: mercado, vendas, vendas-detalhe, ads, projeto, sku, documentos e calculadora, todos `:read`; `shared/publicSales.ts` define pedidos/histórico. Não existe proxy arbitrário nem publicação de código-fonte pela API.

## Segurança e invariantes

Bearer somente no cabeçalho: `mrc_read_` mais 43 caracteres base64url, gerados com 32 bytes aleatórios; persistência SHA-256 e prefixo, nunca plaintext. Cada chamada autenticada reconsulta expiração, revogação, proprietário e escopos no banco. Router aceita validade de 1–365 dias, padrão 30; UI oferece 7/30/90/365. Escopos antigos não são ampliados: gerar/trocar chave deliberadamente antes de revogar.

GET/OPTIONS apenas; OpenAPI público contém schemas, não dados/chaves. CORS `*`, sem autenticação por cookies; respostas `no-store`, erros sanitizados e request ID. Allowlist inclusive aninhada exclui identidade/endereço/contatos de compradores. Documentos, custos e links comerciais exigem escopos opcionais. Loja autorizada: **Toujours, seller 3308178634**. `data.ts` verifica `/users/me` antes do cache; novas vendas, via `server/salesMargin/provider.ts`, também exigem `mlUserId` persistido correto. `server/dbMl.ts` resolve conexão compartilhada, incluindo logins Grupo Fox; renovação OAuth ordinária pode persistir tokens, mas não modifica dados comerciais.

Nunca alterar, renumerar, reconstruir SKUs ou reutilizar excluídos automaticamente; duplicação **manual deliberada** é permitida. `publicSalesSku.ts` lê somente ativos; preserva texto exato, avisa reutilização/ambiguidade e não confunde índice local com `variationId`. Não chama helpers que geram/backfillam variações. Tombstones/índices permanentes estão em `drizzle/schema.ts`.

## Vendas, fontes e limites

`/sales` permanece agregado e compatível: dias 7/30/90, teto 1.000 pedidos/status e ranking 100. `/sales/orders` exige `vendas-detalhe:read`; `/sales/history`, `vendas:read`, com financeiro adicional protegido, limitado a 31 dias. `publicSalesQuery.ts` aceita datas inclusivas até 366 dias, Brasília, sem futuro; histórico hora/dia/semana/mês, segunda-feira inicial, grupos item/sku/nenhum.

`publicSalesProvider.ts` coleta pedidos visíveis/cancelados, pagamentos e fretes: páginas 50, teto 1.000 financeiro/10.000 não financeiro, offset fonte 10.000, orçamento 80s, timeout 12s, concorrência quatro. Cache novo: 2min/64 entradas; legado: 5min; fallback stale até 6h. Limites HTTP por processo: 60/min/chave, duas consultas simultâneas, ingresso 600/min/endereço. Proxy gerenciado e memória local não garantem limites distribuídos nem retenção histórica permanente.

`publicSalesData.ts` lê `sales_margin_reports` via `server/salesMargin/db.ts`: últimos 1.000; `publicSalesReports.ts` prioriza financeiro importado recente, preservando cancelamentos posteriores. Referências não verificadas não entram em pedidos. Histórico não inventa períodos/horários nem rateia financeiro multi-grupo. Impostos vêm de `taxes_amount`/detalhes informados, não estimados. **Net não é lucro**: não subtrair taxas novamente; `sales_margin_costs` não é consultada pela API. Desconhecido permanece null/partial/stale, nunca zero inventado.

Outras leituras: `project_products`, `project_documents`, `sku_sheet_rows`, `sku_variations`, `sku_sheet_custom_columns`, `kit_sheet_rows`, `embalagem_sheet_rows`; `drizzle/alphaSchema.ts`: `alpha_catalog_products`/`alpha_pdf_exports`, filtradas por proprietário; demais projeções são globais, arquitetura monoloja.

## Reprodução e lacunas

`references/api-vendas-grupo-fox-especificacao-2026-11-16.txt` descreve consumidor Node externo, não fornece sua implementação. Pedido histórico de 404 foi superado pelos fontes; aliases `/sales/margin`, `/margin`, `/orders` continuam ausentes. Nenhuma UI removida foi comprovada nesta área. Histórico vitalício/publicação/PDF são desejos da especificação, não garantias verificadas.

Reprodução isolada: ESM/Express, pnpm e lockfile, `package.json`, `vitest.config.ts`; testes `server/readApi/*.test.ts`, `server/readApiKeysRouter.test.ts`, `server/readApiKeysCard.test.ts`. Mockar DB/OAuth/fetch/providers, limpar caches e usar localhost efêmero; não iniciar servidor completo nem `db:push`. Validar segurança, escopos, privacidade, cobertura, impostos, SKUs e limites. Deploy, segredos, dados reais e servidor Fox não foram verificados; OpenAPI tem URL padrão fixa em `openapi.ts`, distinta da origem dinâmica da UI.

