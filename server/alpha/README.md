# Backend Alpha isolado no Mercato

`alphaRouter` em `server/alpha/router.ts` compõe `catalog`, `pricing` e `documents`. Usa `protectedProcedure` e a sessão existente do Mercato. O login por senha emite sessão do owner compartilhado da loja: ownerId é escopo de conta/loja, não isolamento individual entre pessoas que usam a mesma senha. Actors cron/sintéticos são recusados. Nenhuma autenticação nova foi criada.

## API documents — contrato do frontend principal

```ts
alpha.documents.list(undefined): Promise<Array<{
  exportId: string;
  reportId: string;
  filename: string;
  url: string;
  key: string;
  sha256: string;
  byteSize: number;
  projectProductId: number | null;
  documentId: number | null;
  description: string;
  sku: string;
  createdAt: number; // UTC Unix ms
}>>;

alpha.documents.attachPdf({
  exportId: string, // UUID
  reportId: string,
  filename: string,
  base64: string, // canonical padded RFC4648, pure base64, no data: URL
  projectProductId?: number | null,
  description: string,
  sku: string,
  options: {
    scope: 'selected' | 'compact' | 'complete',
    printMode: 'duplex' | 'twoSheets',
    includeProductSheet: boolean,
    compactMargins?: number[],
  },
  snapshotPayload?: string,
}): Promise<{
  exportId: string;
  reportId: string;
  filename: string;
  url: string;
  key: string;
  sha256: string;
  byteSize: number;
  projectProductId: number | null;
  documentId: number | null;
  description: string;
  sku: string;
  createdAt: number; // UTC Unix ms
  alreadyExists: boolean;
}>;
```

`list` devolve somente exports `ready` do owner da sessão, mais recente primeiro (`createdAt` decrescente). Não expõe ownerId, lease, snapshot ou opções. `attachPdf` sempre salva na central Alpha. Quando há `projectProductId`, valida `project_products.id` e insere `project_documents` dentro da mesma transação que marca ready, usando o ID real retornado por `$returningId()`. Não cria produtos, não busca IDs por SKU/nome, não conecta reportId a catálogo e não usa `createdBy` como ACL inventada. Os timestamps da tabela existente `project_documents` são SQL timestamp e recebem `Date`; os timestamps comerciais Alpha são UTC ms.

## Validação e idempotência

PDF: limite binário 15 MiB (15 × 1024² bytes), assinatura binária exata `%PDF-`, base64 estrito/canônico; filename seguro `.pdf` (letras latinas, números, espaços, `_().-`, sem caminhos/controles/`..`/nome oculto); snapshot UTF-8 no máximo 1 MiB; descrição até 2000 caracteres; SKU/reportId até 256; compactMargins no máximo 8 números finitos de 0 a 100. Payloads de documentos e opções são estritos: cliente não pode enviar user/ownerId/uploadedBy/createdAt.

A PK de `alpha_pdf_exports` é `(ownerId, exportId)`. Hash do PDF e hash do contexto (reportId, filename, description, SKU, projeto, opções e snapshot) devem coincidir. Retry pronto retorna a mesma linha com `alreadyExists: true`; alteração do arquivo/contexto retorna CONFLICT. Pending com lease válida retorna CONFLICT, inclusive corrida de INSERT/deadlock. Lease de 10 minutos pode ser retomada quando stale. Checkpoint do upload prolonga a lease. Workers antigos são cercados por leaseToken em checkpoint/fail/finalize.

O upload usa somente `storagePut` Mercato; bytes nunca são gravados no DB. O arquivo já staged é reutilizado em retry failed/stale. A finalização documento+ready é transacional; falha reverte ambos e preserva checkpoint. O checkpoint tem uma tentativa de recuperação transitória com a chave retornada ainda em memória. Limite inevitável: crash/falha persistente entre upload externo e checkpoint pode deixar objeto órfão ou produzir novo upload no retry, pois `storagePut` adiciona sufixo aleatório e não oferece transação distribuída ou DELETE. Não há promessa de exactly-once externo nem de privacidade estrita de URL; a URL herda a política padrão do storage Mercato.

## Catálogo e categorias

`catalog.list/save/delete` preserva payload Alpha, ownerId, version e CAS (`expectedVersion`). PK `alpha_catalog_products(ownerId,id)`, payload em mediumtext e timestamps DB em UTC ms; timestamps ISO no payload original permanecem intactos.

`pricing.suggestCategory({ description })` e `pricing.status()` são protegidos. categoryService e categoryAmbiguity preservam retorno/status Alpha, gpt-6-luna, limite 12/min por IP real do request (não confia diretamente em x-forwarded-for), cache em memória e taxonomia oficial obrigatória: ID MLB, caminho coerente, folha, listing_allowed e status enabled. Adapter LLM isolado usa ENV existente e suporta cancelamento real do fetch e do backoff. Deadlines: taxonomia 8s, request 20s, catálogo de modelos 2s. O status declarativo é o original, não simula OAuth do vendedor.

## Verificação e escopo

Suites `server/alpha/*.test.ts` usam stores/query builders/fetch mocks e nunca executam upload, LLM ou SQL reais. Executar apenas `pnpm exec vitest run server/alpha`. Schema TypeScript foi criada; nenhuma migration ou SQL foi executada. As tabelas precisam existir no ambiente de execução para operações persistentes — habilitação/migração continua dependência externa a este trabalho.

Arquivos alterados/criados neste trabalho estão exclusivamente em `server/alpha/**` e `drizzle/alphaSchema.ts`; registro no router/schema principal é responsabilidade do parent. `pnpm check` pode sinalizar erros em frontend/shared oriundos do target ES5 do projeto; não alterar package/lock/core/configuração para resolvê-los neste escopo.
