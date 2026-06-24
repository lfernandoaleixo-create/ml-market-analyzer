# Linha do Tempo Luís — TODO

## Backend
- [x] Tabela `luis_timeline_stages` (modelo único de etapas: id, label, position)
- [x] Tabela `luis_product_step_progress` (productId + stageId + done + note)
- [x] Migração SQL aplicada via webdev_execute_sql + seed das 4 etapas iniciais
- [x] db helpers em `server/luisTimelineDb.ts` (CRUD etapas, listar overview, set progress/note)
- [x] router `server/routers/luisTimeline.ts` (stages.list/create/rename/reorder/delete; progress.byProduct; progress.setDone; progress.setNote)
- [x] registrar router no appRouter
- [x] testes vitest (9 passando)

## Frontend
- [ ] item de menu "Linha do Tempo Luís" no sidebar (DashboardLayout)
- [ ] rotas /luis-timeline (+ subrotas painel/cronograma/análise/produto) no App.tsx
- [ ] página container LuisTimeline.tsx com sub-abas (Painel, Cronograma, Análise)
- [ ] Cronograma do Luís: bolinhas dinâmicas com as etapas-modelo
- [ ] editor de etapas (adicionar / renomear / reordenar / remover)
- [ ] por produto: ticar etapa concluída + observação livre editável
- [ ] reutilizar Painel/Análise/Produto do Projeto (mesmos itens)

## Validação
- [ ] tsc limpo + vitest verde
- [ ] preview validado
- [ ] checkpoint
