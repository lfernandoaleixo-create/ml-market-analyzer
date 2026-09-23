import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import {
  createSkuRow,
  deleteSkuRow,
  listSkuRows,
  updateSkuRow,
  listCustomColumns,
  createCustomColumn,
  renameCustomColumn,
  deleteCustomColumn,
  setCustomValue,
  repairVariantNumbers,
  getVariations,
  upsertVariation,
  addVariation,
  deleteVariation,
  getSkuDecisionContext,
  applySkuDecision,
  editMainSkuManually,
  editVariationSkuManually,
} from "../skuSheetDb";
import { validateSkuPassword, logSkuChange, listSkuChangeLog } from "../skuProtection";
import mlCategoriesJson from "../../shared/mlCategories.json";
import type { MlCategoryTree } from "../../shared/skuSheet";

const categoryTree = mlCategoriesJson as MlCategoryTree;

// Schema dos campos editáveis. Tudo opcional no update; strings aceitam vazio.
const rowFields = z.object({
  position: z.number().int().optional(),
  productNumber: z.number().int().nullable().optional(),
  variantNumber: z.number().int().nullable().optional(),
  cadastradoMl: z.string().max(16).optional(),
  tipoSku: z.string().max(4).optional(),
  categoryId: z.string().max(24).nullable().optional(),
  categoryName: z.string().max(160).nullable().optional(),
  subCategoryId: z.string().max(24).nullable().optional(),
  subCategoryName: z.string().max(160).nullable().optional(),
  produto: z.string().max(300).optional(),
  variante: z.string().max(300).optional(),
  sku: z.string().max(120).optional(),
  gerarSkuKit: z.boolean().optional(),
  skuKit: z.string().max(120).optional(),
  mainMlb: z.string().max(60).optional(),
  mainDone: z.boolean().optional(),
  eanGtin: z.string().max(60).optional(),
  ncm: z.string().max(20).optional(),
  gpc: z.string().max(30).optional(),
  cest: z.string().max(20).optional(),
  precoClassico: z.string().max(40).optional(),
  precoPremium: z.string().max(40).optional(),
  precoAtacado: z.string().max(40).optional(),
  embProfundidade: z.string().max(40).optional(),
  embLargura: z.string().max(40).optional(),
  embAltura: z.string().max(40).optional(),
  embPeso: z.string().max(40).optional(),
  caracteristicas: z.string().nullable().optional(),
  rowColor: z.string().max(20).optional(),
  customValues: z.string().nullable().optional(),
});

export const skuSheetRouter = router({
  /** Lista todas as linhas da planilha. */
  list: protectedProcedure.query(() => listSkuRows()),

  /** Árvore completa de categorias do Mercado Livre (para seletores em cascata). */
  categories: protectedProcedure.query(() => categoryTree.categories),

  /** Cria uma nova linha (em branco por padrão). */
  create: protectedProcedure
    .input(rowFields.optional())
    .mutation(({ input }) => createSkuRow(input ?? {})),

  /** Atualiza uma linha existente. */
  update: protectedProcedure
    .input(z.object({ id: z.number().int(), expectedRevision: z.number().int().min(1) }).and(rowFields))
    .mutation(async ({ input }) => {
      const { id, expectedRevision, ...patch } = input;
      try {
        return await updateSkuRow(id, patch, expectedRevision);
      } catch (e: any) {
        if (e?.message === "SKU_DECISION_STALE") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "A linha foi atualizada em outra aba. Os dados foram recarregados; tente novamente.",
          });
        }
        if (e?.message === "SKU_FINALIZADO_IMUTAVEL") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "A identidade de um SKU finalizado é imutável. Crie uma nova linha para outro produto ou variante.",
          });
        }
        if (e?.message?.includes("DUPLICATA_DETECTADA") || e?.message?.includes("SKU_DECISION_REQUIRED")) {
          throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
        }
        throw e;
      }
    }),

  /** Exclui logicamente uma linha, preservando todos os seus dados e números. */
  delete: protectedProcedure
    .input(z.object({ id: z.number().int(), expectedRevision: z.number().int().min(1) }))
    .mutation(async ({ input, ctx }) => {
      let deleted;
      try {
        deleted = await deleteSkuRow(input.id, input.expectedRevision);
      } catch (error: any) {
        if (error?.message === "SKU_DECISION_STALE") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "A linha mudou depois da confirmação. Atualize a planilha e confirme novamente.",
          });
        }
        throw error;
      }
      if (deleted && !deleted.isDeleted) {
        await logSkuChange({
          action: "logical_delete",
          authorizedBy: ctx.user.name || `Usuário #${ctx.user.id}`,
          description: `Exclusão lógica da linha ${deleted.id}; SKU, números e variações foram preservados.`,
          affectedRowIds: [deleted.id],
          oldValues: {
            sku: deleted.sku,
            productNumber: deleted.productNumber,
            variantNumber: deleted.variantNumber,
          },
          newValues: { isDeleted: true },
          affectedCount: 1,
        });
      }
      return { ok: true };
    }),

  /** Contexto do card para decidir entre reutilizar, gerar ou digitar o SKU. */
  getSkuDecision: protectedProcedure
    .input(z.object({ skuRowId: z.number().int() }))
    .query(async ({ input }) => {
      try {
        return await getSkuDecisionContext(input.skuRowId);
      } catch (error: any) {
        if (error?.message === "LINHA_SKU_NAO_ENCONTRADA") {
          throw new TRPCError({ code: "NOT_FOUND", message: "Linha de SKU não encontrada." });
        }
        throw error;
      }
    }),

  /** Aplica a escolha explícita somente à nova linha indicada. */
  setSkuDecision: protectedProcedure
    .input(
      z.object({
        skuRowId: z.number().int(),
        mode: z.enum(["reuse", "auto", "manual"]),
        sourceRowId: z.number().int().optional(),
        manualSku: z.string().max(120).optional(),
        expectedRevision: z.number().int().min(1),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const updated = await applySkuDecision(input);
        await logSkuChange({
          action: "sku_decision",
          authorizedBy: ctx.user.name || `Usuário #${ctx.user.id}`,
          description: `Escolha explícita no card: ${input.mode}. Somente a linha ${updated.id} foi atualizada.`,
          affectedRowIds: [updated.id],
          newValues: {
            skuMode: updated.skuMode,
            skuSourceRowId: updated.skuSourceRowId,
            sku: updated.sku,
          },
          affectedCount: 1,
        });
        return updated;
      } catch (error: any) {
        const messages: Record<string, string> = {
          LINHA_SKU_NAO_ENCONTRADA: "Linha de SKU não encontrada.",
          IDENTIDADE_SKU_INCOMPLETA: "Preencha produto e variante antes de escolher o SKU.",
          FONTE_SKU_INVALIDA: "O produto de referência não é mais válido. Atualize o card e tente novamente.",
          DADOS_SKU_INCOMPLETOS: "Preencha tipo, categoria, produto e variante para gerar o SKU.",
          SKU_MANUAL_OBRIGATORIO: "Digite o SKU manual antes de confirmar.",
          SKU_MANUAL_DUPLICADO: "Este SKU já existe. Para repeti-lo, escolha “Manter o mesmo SKU”.",
          SKU_DECISION_STALE: "A linha mudou enquanto o card estava aberto. Atualize as opções e confirme novamente.",
          SKU_DECISION_NOT_ALLOWED: "Este SKU já foi finalizado e não pode ser redefinido.",
          SKU_VALUE_ALREADY_RESERVED: "Este SKU acabou de ser reservado em outra linha. Atualize o card e tente novamente.",
        };
        const friendly = messages[error?.message];
        if (friendly) throw new TRPCError({ code: "BAD_REQUEST", message: friendly });
        throw error;
      }
    }),

  /** Edita manualmente o SKU principal, sem senha e sem tocar nos números/variações. */
  editMainSku: protectedProcedure
    .input(
      z.object({
        skuRowId: z.number().int(),
        newSku: z.string().max(120),
        expectedRevision: z.number().int().min(1),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const result = await editMainSkuManually({
          ...input,
          actor: ctx.user.name || `Usuário #${ctx.user.id}`,
        });
        return result.updated;
      } catch (error: any) {
        const messages: Record<string, string> = {
          LINHA_SKU_NAO_ENCONTRADA: "Linha de SKU não encontrada.",
          SKU_MANUAL_OBRIGATORIO: "O SKU principal não pode ficar vazio.",
          SKU_MANUAL_DUPLICADO: "Este SKU já pertence a outro produto ou variação.",
          SKU_VALUE_ALREADY_RESERVED: "Este SKU está reservado e não pode ser reutilizado aqui.",
          SKU_DECISION_STALE: "A linha mudou em outra aba. Os dados foram recarregados; tente novamente.",
        };
        const friendly = messages[error?.message];
        if (friendly) {
          throw new TRPCError({
            code: error?.message === "SKU_DECISION_STALE" ? "CONFLICT" : "BAD_REQUEST",
            message: friendly,
          });
        }
        throw error;
      }
    }),

  // --- Colunas personalizadas ---

  /** Lista as colunas personalizadas. */
  listCustomColumns: protectedProcedure.query(() => listCustomColumns()),

  /** Cria uma coluna personalizada. */
  createCustomColumn: protectedProcedure
    .input(z.object({ name: z.string().max(120).optional() }))
    .mutation(({ input }) => createCustomColumn(input.name ?? "")),

  /** Renomeia uma coluna personalizada. */
  renameCustomColumn: protectedProcedure
    .input(z.object({ id: z.number().int(), name: z.string().max(120) }))
    .mutation(({ input }) => renameCustomColumn(input.id, input.name)),

  /** Exclui uma coluna personalizada (e limpa seus valores). */
  deleteCustomColumn: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      await deleteCustomColumn(input.id);
      return { ok: true };
    }),

  /** Define o valor de uma coluna personalizada em uma linha. */
  setCustomValue: protectedProcedure
    .input(
      z.object({
        rowId: z.number().int(),
        columnId: z.number().int(),
        value: z.string().max(2000),
      }),
    )
    .mutation(({ input }) => setCustomValue(input.rowId, input.columnId, input.value)),

  /** Diagnóstico somente leitura; aplicação automática foi removida. */
  repairVariants: protectedProcedure
    .input(z.object({ apply: z.boolean().optional() }).optional())
    .mutation(({ input }) => {
      if (input?.apply) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Reparo automático desativado: SKUs existentes não podem ser alterados em massa.",
        });
      }
      return repairVariantNumbers();
    }),

  // --- Variações SKU (gestão manual, sem senha) ---

  /** Retorna as variações ativas de uma linha SKU. */
  getVariations: protectedProcedure
    .input(z.object({ skuRowId: z.number().int(), baseSku: z.string() }))
    .query(({ input }) => getVariations(input.skuRowId, input.baseSku)),

  /** Insere ou atualiza uma variação específica. */
  upsertVariation: protectedProcedure
    .input(
      z.object({
        skuRowId: z.number().int(),
        variationIndex: z.number().int().min(1),
        baseSku: z.string(),
        ean: z.string().max(60).optional(),
        mlb: z.string().max(60).optional(),
        done: z.boolean().optional(),
        expectedRevision: z.number().int().min(0),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        return await upsertVariation(input.skuRowId, input.variationIndex, input.baseSku, {
          ean: input.ean,
          mlb: input.mlb,
          done: input.done,
          expectedRevision: input.expectedRevision,
        });
      } catch (e: any) {
        if (e?.message === "SKU_VARIACAO_DUPLICADO") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Este SKU já está sendo usado por outro produto ou variação.",
          });
        }
        if (e?.message === "SKU_VARIACAO_OBRIGATORIO") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "O SKU da variação não pode ficar vazio." });
        }
        if (e?.message === "VARIACAO_EXCLUIDA_PERMANENTE") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Esta variação foi excluída e seu índice não pode ser reutilizado.",
          });
        }
        if (e?.message === "VARIACAO_CONCORRENTE") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Esta variação mudou em outra aba. Os dados foram recarregados; tente novamente.",
          });
        }
        throw e;
      }
    }),

  /** Edita somente o SKU da variação, sem senha, com histórico e CAS. */
  editVariationSku: protectedProcedure
    .input(
      z.object({
        skuRowId: z.number().int(),
        variationIndex: z.number().int().min(1),
        baseSku: z.string(),
        newSku: z.string().max(140),
        expectedRevision: z.number().int().min(0),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const result = await editVariationSkuManually({
          ...input,
          actor: ctx.user.name || `Usuário #${ctx.user.id}`,
        });
        return result.updated;
      } catch (error: any) {
        const messages: Record<string, string> = {
          SKU_VARIACAO_DUPLICADO: "Este SKU já está sendo usado por outro produto ou variação.",
          SKU_VARIACAO_OBRIGATORIO: "O SKU da variação não pode ficar vazio.",
          VARIACAO_EXCLUIDA_PERMANENTE: "Esta variação foi excluída e não pode ser editada.",
          VARIACAO_CONCORRENTE: "Esta variação mudou em outra aba. Os dados foram recarregados; tente novamente.",
        };
        const friendly = messages[error?.message];
        if (friendly) {
          throw new TRPCError({
            code: error?.message === "VARIACAO_CONCORRENTE" ? "CONFLICT" : "BAD_REQUEST",
            message: friendly,
          });
        }
        throw error;
      }
    }),

  /** Adiciona uma nova variação no próximo índice permanente disponível. */
  addVariation: protectedProcedure
    .input(z.object({ skuRowId: z.number().int(), baseSku: z.string().min(1) }))
    .mutation(({ input }) => addVariation(input.skuRowId, input.baseSku)),

  /** Exclui logicamente uma variação, sem renumerar ou reutilizar seu SKU. */
  deleteVariation: protectedProcedure
    .input(
      z.object({
        skuRowId: z.number().int(),
        variationIndex: z.number().int().min(1),
        baseSku: z.string(),
        expectedRevision: z.number().int().min(0),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        return await deleteVariation(
          input.skuRowId,
          input.variationIndex,
          input.baseSku,
          input.expectedRevision,
        );
      } catch (error: any) {
        if (error?.message === "VARIACAO_CONCORRENTE") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Esta variação mudou em outra aba. Atualize e confirme novamente.",
          });
        }
        throw error;
      }
    }),

  // --- Proteção de SKU (senha + histórico) ---

  /** Valida a senha de autorização para alterações em SKU. */
  validateSkuAuth: protectedProcedure
    .input(z.object({ password: z.string().min(1) }))
    .mutation(({ input }) => {
      const authorizer = validateSkuPassword(input.password);
      if (!authorizer) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Senha incorreta. Use o nome de um dos autorizadores." });
      }
      return { valid: true, authorizer } as const;
    }),

  /** Lista o histórico de alterações de SKU. */
  skuChangeHistory: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(200).optional() }).optional())
    .query(({ input }) => listSkuChangeLog(input?.limit ?? 50)),
});
