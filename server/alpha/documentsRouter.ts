import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { storagePut } from "../storage";
import { alphaOwnerId } from "./actor";
import { attachPdfInputSchema, preparePdf, toPdfDocument } from "./documentContracts";
import { defaultPdfExportStore, type PdfExportStore } from "./documentStore";

export type DocumentsRouterDependencies = {
  getStore?: () => Promise<PdfExportStore>;
  put?: typeof storagePut;
  now?: () => number;
  token?: () => string;
};

export function createDocumentsRouter(dependencies: DocumentsRouterDependencies = {}) {
  const getStore = dependencies.getStore ?? defaultPdfExportStore;
  const put = dependencies.put ?? storagePut;
  const now = dependencies.now ?? Date.now;
  const token = dependencies.token ?? randomUUID;
  return router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const ownerId = alphaOwnerId(ctx.user);
      const store = await getStore();
      return (await store.list(ownerId)).map(toPdfDocument);
    }),
    attachPdf: protectedProcedure.input(attachPdfInputSchema).mutation(async ({ ctx, input }) => {
      const ownerId = alphaOwnerId(ctx.user);
      const { bytes, metadata } = preparePdf(input);
      const store = await getStore();
      const leaseToken = token();
      const reserved = await store.reserve(ownerId, metadata, leaseToken, now());
      if (reserved.alreadyExists) return { ...toPdfDocument(reserved.row), alreadyExists: true };
      try {
        if (!reserved.row.key || !reserved.row.url) {
          // URL/access policy are inherited unchanged from Mercato storagePut.
          const upload = await put(`alpha/${ownerId}/pdf/${metadata.exportId}/${metadata.filename}`,
            bytes, "application/pdf");
          if (!upload.key || !upload.url) throw new Error("Empty storage upload metadata");
          // External upload is NOT a database transaction. Persist the checkpoint
          // before finalization, so a DB failure can retry without uploading again.
          try {
            await store.checkpoint(ownerId, metadata.exportId, leaseToken, upload, now());
          } catch (checkpointError) {
            if (checkpointError instanceof TRPCError) throw checkpointError;
            // One bounded recovery attempt while the returned key is still known.
            // Persistent failure/crash here can orphan an external upload: storagePut
            // randomizes keys, so true cross-system exactly-once is not possible.
            await store.checkpoint(ownerId, metadata.exportId, leaseToken, upload, now());
          }
        }
        const row = await store.finalize(ownerId, metadata.exportId, leaseToken, now());
        return { ...toPdfDocument(row), alreadyExists: false };
      } catch (error) {
        try { await store.fail(ownerId, metadata.exportId, leaseToken, now()); } catch {
          // Leave the reservation fenced until lease expiry if the database is down.
        }
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR",
          message: "Não foi possível concluir a exportação PDF. Tente novamente com o mesmo exportId e conteúdo." });
      }
    }),
  });
}

export const documentsRouter = createDocumentsRouter();
