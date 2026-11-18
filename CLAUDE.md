# Mercato — instruções para Claude Code

Trabalhe em português brasileiro e trate o responsável como Fernando. Este é o Mercato da Toujours/Grupo Fox. Este arquivo orienta o agente; não substitui permissões, isolamento de ambiente ou revisão humana.

## Identidade e arquitetura

- Repositório: https://github.com/lfernandoaleixo-create/ml-market-analyzer
- Site existente: https://mlmarketanl-kcmkt5tl.manus.space
- Tarefa Manus de referência: `8RcKsVxCkpJua1uLyK4kEL`. Confirme sua associação ao site antes de enviar instruções ou publicar.
- React 19, TypeScript, Vite, Tailwind, Express, tRPC, Drizzle/MySQL/TiDB; PWA instalável com ícone Toujours.
- Navegação: `client/src/App.tsx` e `client/src/components/DashboardLayout.tsx`.
- Interface: `client/src/pages/`; contratos tRPC: `server/routers.ts` e `server/routers/`; tipos compartilhados: `shared/`.
- API externa em `server/readApi/`, contratos em `shared/readApi.ts` e `shared/publicSales.ts`; documentação: `references/api-leitura-mercato.md`.
- Calculadora integrada: `client/src/alpha/AlphaCalculator.tsx`; motor: `shared/alpha/pricing.ts`, `pricingFlow.ts`, `tariffs.ts`.
- SKU: `server/skuProtection.ts`, `server/skuSheetDb.ts`, `server/routers/skuSheet.ts`, `shared/skuSheet.ts`, `client/src/pages/pedro/`.
- Backup: `server/backup/sheetsXlsx.ts`; auditor: `scripts/audit-mercato-preservation-readonly.ts`.

## Limites obrigatórios

Modifique código para atender ao pedido atual, não os registros comerciais reais. Não renumere SKUs/produtos/variantes, não reconstrua códigos antigos, não recicle números excluídos automaticamente e não altere variações/kits existentes. Preserve exclusão lógica, reservas históricas, revisões, concorrência e decisões explícitas. Repetição manual deliberada continua permitida; não reintroduza bloqueio global de duplicidade.

Uma mudança real em SKU não é autorizada por um pedido de programação. Exige explicar os campos exatos, perguntar “Tem certeza?” e obter autorização explícita de Luis, Guilherme, Fernando ou Bruno. Não transforme autorizações históricas em novas aprovações. Fora de um pedido específico de dados, mantenha o trabalho restrito ao código.

Não reative backfills/reparos, rode scripts operacionais ou aplique migrations em produção. `pnpm db:push` gera E APLICA migrations; não o execute automaticamente. Alterações necessárias no schema devem ser propostas com SQL aditivo e plano de preservação, sem execução até aprovação específica.

Não copie, leia ou imprima segredos de produção para desenvolver. Não abra `.project-config.json`: pode conter credenciais internas do ambiente, não apenas metadados. Não coloque chaves, tokens, cookies, `.env`, dados de compradores ou dumps em prompts, Git/PR, PDFs ou logs. GitHub, Manus e a API de leitura Mercato usam credenciais distintas. A chave `mrc_read_...` não permite editar código, autenticar na plataforma Manus ou publicar. Se receber o pacote de reprodução, leia primeiro seu manual e inventário sem valores; não abra o cofre/raw database nem conecte uma réplica à produção automaticamente.

Não altere OAuth, contas ML, anúncios ou campanhas. A loja de referência é Toujours, seller `3308178634`; confira a identidade ao ler dados. Não substitua pela conta pessoal de um colaborador.

Preserve o motor financeiro Alpha salvo se o pedido exigir mudança específica e testada. `net` não é lucro sem custos; não descontar novamente taxas já refletidas no líquido. Preserve `null`, `partial`, `stale`, `capped`, `asOf` e cobertura. Não invente zeros, tributos, rateios ou histórico completo. Não quebrar `/sales`, `/sales/orders`, `/sales/history` nem os escopos existentes.

Não crie endpoints de shell, execução arbitrária, escrita no código ou publicação dentro da API comercial. Não desative autenticação para facilitar testes. Mantenha todas as funcionalidades acessíveis em celular/tablet/desktop e a política de não gravar offline.

## Fluxo de edição e testes

1. Verifique acesso ao repositório, branch, HEAD e alterações locais. Se houver trabalho de outro usuário, não sobrescreva. Nunca use reset destrutivo, clean destrutivo ou force push.
2. Leia os arquivos relevantes e apresente um plano curto. Trabalhe em branch `claude/mercato-<tema>`, com alterações pequenas e revisão por PR; nunca faça push direto em main.
3. Use Node 22 e o pnpm do `packageManager`, preservando o lockfile. Instale com `pnpm install --frozen-lockfile` em clone de desenvolvimento, sem credenciais de produção. Não atualize dependências para contornar problemas sem justificativa.
4. Escreva regressões do problema e rode `pnpm check`, testes focados, `pnpm exec vitest run --exclude '**/*.live.test.ts'` e `pnpm build` em ambiente isolado. Nunca rode `.live.test.ts` automaticamente. Se uma ferramenta exigir credencial, pare e informe; use dados sintéticos, não banco real. Excluir live não torna seguro um ambiente que ainda tem segredos de produção.
5. Rode `git diff --check`, revise o diff e faça scan de segredos antes do commit/PR. Não rode `pnpm format` global; formate somente os arquivos alterados. Informe falhas e testes não executados, sem declarar validação inexistente.

## Publicação solicitada por Fernando

Se o comando não incluir publicação, entregue a branch/PR sem merge/deploy. Quando o pedido incluir publicação, revise o diff e os testes da mudança pedida e só então faça merge normal da PR aprovada para main, sem ignorar branch protection ou conflitos. Pare para decisão se houver risco novo, SQL/dados reais ou mudanças de terceiros.

GitHub main sincronizado não significa site publicado. No projeto Manus existente, faça pull pelo GitHub e confirme os arquivos, valide a integração e salve um NOVO checkpoint com a mudança antes de publicar. Não publique um checkpoint antigo ou não identificado; não inicie outro Mercato, banco ou domínio.

Prefira o navegador Manus autenticado do usuário, via Claude Code com Chrome autorizado. Use a UI do projeto para sincronizar, solicitar validação/checkpoint e publicar. Se não houver acesso, peça ao usuário configurar a integração ou fazer o login manual; não peça senha no chat.

Alternativa: API oficial Manus v2, com credencial Manus própria e autorizada, conforme https://open.manus.ai/docs/v2/website. Confira `website.status` e `website.listCheckpoints` para a tarefa/site correto. A API publica SOMENTE o checkpoint mais recente, não faz pull do GitHub nem gera checkpoint. Preserve explicitamente a visibilidade atual; não omita `visibility`. Se um agente Manus estiver sincronizando, aguarde conclusão e ausência confirmada de trabalhos de fundo, sem aprovar automaticamente eventos de autorização desconhecidos. Não exponha a credencial nem reutilize token temporário limitado de outro ambiente.

Após publicar, espere a conclusão, confira versão/domínio e faça health/validação da funcionalidade em produção sem gravar dados. HTTP200 da página inicial, push e checkpoint não bastam para provar a mudança. Se qualquer etapa estiver bloqueada, informe a etapa e a ação necessária; nunca diga “publicado” sem evidência. Registre o resultado e a versão, sem segredos.
