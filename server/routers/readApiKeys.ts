import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { adminProcedure, router } from "../_core/trpc";
import { getOwnerUser } from "../db";
import { READ_API_SCOPES } from "../../shared/readApi";
import { createReadApiKey, listReadApiKeys, revokeReadApiKey } from "../readApi/keys";
async function ownerId() {
  const owner = await getOwnerUser();
  if (!owner) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "A conta principal do Mercato não está disponível." });
  return owner.id;
}
async function safe<T>(work: () => Promise<T>): Promise<T> {
  try { return await work(); }
  catch (error) { if (error instanceof TRPCError) throw error; throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível concluir a gestão das chaves. Tente novamente." }); }
}
export const readApiKeysRouter = router({
  list: adminProcedure.query(() => safe(async () => listReadApiKeys(await ownerId()))),
  create: adminProcedure.input(z.object({
    name: z.string().trim().min(1).max(100),
    scopes: z.array(z.enum(READ_API_SCOPES)).min(1).max(READ_API_SCOPES.length).transform(values => [...new Set(values)]),
    expiresDays: z.number().int().min(1).max(365).default(30),
  }).strict()).mutation(({ ctx, input }) => safe(async () => createReadApiKey(await ownerId(), ctx.user.id, input))),
  revoke: adminProcedure.input(z.object({ id: z.number().int().positive() }).strict()).mutation(({ input }) => safe(async () => {
    if (!await revokeReadApiKey(await ownerId(), input.id)) throw new TRPCError({ code: "NOT_FOUND", message: "Chave não encontrada." });
    return { success: true as const };
  })),
});
