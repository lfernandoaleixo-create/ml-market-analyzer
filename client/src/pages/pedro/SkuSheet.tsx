import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useRef } from "react";
import SkuStyleSheet, { type SkuStyleBinding } from "./SkuStyleSheet";

/**
 * Planilha SKU: cadastro central de SKUs. Usa o componente visual compartilhado
 * SkuStyleSheet, ligado ao router tRPC `skuSheet`.
 *
 * PERFORMANCE: edições de célula (update / setCustomValue) aplicam a alteração
 * DIRETAMENTE no cache do React Query (update otimista), SEM refetch da lista
 * inteira. Isso mantém a digitação instantânea mesmo com muitas linhas. Apenas
 * operações que mudam a composição da lista (create/delete/colunas) invalidam.
 *
 * IMUTABILIDADE DE SKU: linhas finalizadas não têm identidade/SKU reescritos.
 * Linhas novas usam reservas monotônicas e, quando idênticas, aguardam a escolha
 * explícita no card. Updates por linha são serializados e validados por revisão.
 */
type SkuRowCache = {
  id: number;
  sku?: string | null;
  skuKit?: string | null;
  variantNumber?: number | null;
  revision?: number;
  customValues?: string | null;
  [key: string]: unknown;
};

export default function SkuSheet() {
  const utils = trpc.useUtils();
  const updateQueues = useRef<Map<number, Promise<void>>>(new Map());
  const { data: rows, isLoading } = trpc.skuSheet.list.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const { data: categories } = trpc.skuSheet.categories.useQuery();
  const { data: customColumns } = trpc.skuSheet.listCustomColumns.useQuery();

  // Aplica um patch em uma linha diretamente no cache (sem refetch).
  const patchRowInCache = (id: number, patch: Record<string, unknown>) => {
    utils.skuSheet.list.setData(undefined, (prev) => {
      if (!prev) return prev;
      return (prev as SkuRowCache[]).map((r) =>
        r.id === id ? { ...r, ...patch } : r,
      ) as never;
    });
  };

  const updateMut = trpc.skuSheet.update.useMutation({
    // Sincroniza o cache com a linha final decidida pelo servidor.
    onSuccess: (server, variables) => {
      if (!server) return;
      patchRowInCache(server.id, server as unknown as Record<string, unknown>);
      const sentSku = (variables as { sku?: string }).sku;
      // Se o usuário/edição levaria a um SKU e o servidor devolveu outro
      // (por causa da trava anti-duplicidade), informamos a correção.
      if (
        typeof sentSku === "string" &&
        sentSku.length > 0 &&
        server.sku &&
        server.sku !== sentSku
      ) {
        toast.info(`SKU ajustado automaticamente para ${server.sku} (evita duplicidade).`);
      }
    },
    onError: async (err) => {
      const msg = err?.message ?? "";
      if (msg.includes("DUPLICATA_DETECTADA")) {
        const desc = msg.split("|")[1] ?? "Linha idêntica já existe. Ajuste a variante ou remova a duplicata.";
        toast.error(desc, { duration: 6000 });
      } else if (msg.includes("SKU_DECISION_REQUIRED")) {
        const desc = msg.split("|")[1] ?? "Abra o card do SKU e escolha como deseja defini-lo.";
        toast.info(desc, { duration: 7000 });
      } else if (msg.includes("imutável") || msg.includes("outra aba")) {
        toast.error(msg, { duration: 7000 });
      } else {
        toast.error("Não foi possível salvar a alteração");
      }
      await utils.skuSheet.list.invalidate();
    },
  });
  const createMut = trpc.skuSheet.create.useMutation({
    onSuccess: () => {
      utils.skuSheet.list.invalidate();
      toast.success("Linha adicionada");
    },
    onError: () => toast.error("Não foi possível adicionar a linha"),
  });
  const deleteMut = trpc.skuSheet.delete.useMutation({
    onSuccess: () => {
      utils.skuSheet.list.invalidate();
      toast.success("Linha excluída");
    },
    onError: (error) => {
      toast.error(error.message || "Não foi possível excluir");
      utils.skuSheet.list.invalidate();
    },
  });
  const createColMut = trpc.skuSheet.createCustomColumn.useMutation({
    onSuccess: () => {
      utils.skuSheet.listCustomColumns.invalidate();
      toast.success("Coluna criada");
    },
    onError: () => toast.error("Não foi possível criar a coluna"),
  });
  const renameColMut = trpc.skuSheet.renameCustomColumn.useMutation({
    onSuccess: () => utils.skuSheet.listCustomColumns.invalidate(),
    onError: () => toast.error("Não foi possível renomear a coluna"),
  });
  const deleteColMut = trpc.skuSheet.deleteCustomColumn.useMutation({
    onSuccess: () => {
      utils.skuSheet.listCustomColumns.invalidate();
      utils.skuSheet.list.invalidate();
      toast.success("Coluna excluída");
    },
    onError: () => toast.error("Não foi possível excluir a coluna"),
  });
  const setCustomValueMut = trpc.skuSheet.setCustomValue.useMutation({
    onError: () => {
      toast.error("Não foi possível salvar o valor");
      utils.skuSheet.list.invalidate();
    },
  });
  const binding: SkuStyleBinding = {
    rows: rows as SkuStyleBinding["rows"],
    isLoading,
    categories: categories as SkuStyleBinding["categories"],
    customColumns,
    update: (input) => {
      const { id, expectedRevision, ...patch } = input as {
        id: number;
        expectedRevision: number;
      } & Record<string, unknown>;
      patchRowInCache(id, patch); // reflete na hora
      const previous = updateQueues.current.get(id) ?? Promise.resolve();
      const operation = previous.catch(() => undefined).then(async () => {
        const cached = utils.skuSheet.list.getData() as SkuRowCache[] | undefined;
        const currentRevision = cached?.find((row) => row.id === id)?.revision ?? expectedRevision;
        await updateMut.mutateAsync({ id, expectedRevision: currentRevision, ...patch } as never);
      });
      const settled = operation.catch(() => undefined);
      updateQueues.current.set(id, settled);
    },
    create: (input) => createMut.mutate(input as never),
    remove: (id, expectedRevision) => deleteMut.mutate({ id, expectedRevision }),
    createColumn: (name) => createColMut.mutate({ name }),
    renameColumn: (id, name) => renameColMut.mutate({ id, name }),
    deleteColumn: (id) => deleteColMut.mutate({ id }),
    setCustomValue: (rowId, columnId, value) => {
      // Atualiza o JSON de customValues no cache antes de persistir.
      utils.skuSheet.list.setData(undefined, (prev) => {
        if (!prev) return prev;
        return (prev as SkuRowCache[]).map((r) => {
          if (r.id !== rowId) return r;
          let parsed: Record<string, string> = {};
          try {
            parsed = r.customValues ? (JSON.parse(r.customValues) as Record<string, string>) : {};
          } catch {
            parsed = {};
          }
          parsed[String(columnId)] = value;
          return { ...r, customValues: JSON.stringify(parsed) };
        }) as never;
      });
      setCustomValueMut.mutate({ rowId, columnId, value });
    },
    createPending: createMut.isPending,
    supportsSkuDecisions: true,
  };

  return (
    <SkuStyleSheet
      binding={binding}
      title="Planilha SKU"
      subtitle="cadastro central de SKUs"
      exportTitle="Planilha SKU"
    />
  );
}
