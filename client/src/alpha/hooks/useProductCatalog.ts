import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/alpha/const";
import { trpc } from "@/lib/trpc";
import { writeProductLoginDraft } from "@/alpha/lib/productCatalogResume";
import {
  createCatalogProduct,
  updateCatalogProduct,
  serializeCatalogProducts,
  type CatalogProductState,
  type ProductCatalogRecord,
} from "@shared/alpha/productCatalog";

type ActiveProduct = {
  record: ProductCatalogRecord;
  version: number;
  ownerId: number;
};
type CloudEntry = { record: ProductCatalogRecord; version: number };

type Options = CatalogProductState & {
  onOpen: (record: ProductCatalogRecord) => void;
  onRequestLogin: () => void;
  onPrivateClear: () => void;
};

function errorMessage(error: unknown): string {
  if (error instanceof TRPCClientError) {
    const code = error.data?.code;
    if (code === "UNAUTHORIZED" || code === "FORBIDDEN")
      return "Entre na sua conta para acessar seus produtos privados.";
    if (code === "CONFLICT")
      return "Este produto foi atualizado em outro lugar. Abra a versão mais recente antes de salvar ou excluir.";
    if (code === "NOT_FOUND")
      return "Este produto não está mais disponível nesta conta. Atualize a lista.";
    if (code === "PRECONDITION_FAILED")
      return "O armazenamento na nuvem está indisponível. Tente novamente sem fechar o cadastro.";
  }
  return "Não foi possível concluir a operação na nuvem. Seus campos continuam na tela; tente novamente.";
}

export function useProductCatalog(options: Options) {
  const auth = useAuth();
  const utils = trpc.useUtils();
  const queryClient = useQueryClient();
  const ownerId = auth.user?.id ?? null;
  const [active, setActive] = useState<ActiveProduct | null>(null);
  const [privateOwner, setPrivateOwner] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [operationError, setOperationError] = useState("");
  const previousOwner = useRef<number | null>(null);
  const currentOwner = useRef<number | null>(ownerId);
  currentOwner.current = ownerId;
  const query = useQuery({
    queryKey: ["mercato-alpha-product-catalog", ownerId],
    enabled: ownerId !== null,
    queryFn: ({ signal }) =>
      utils.client.alpha.catalog.list.query(undefined, { signal }),
    retry: false,
  });
  const saveMutation = trpc.alpha.catalog.save.useMutation();
  const deleteMutation = trpc.alpha.catalog.delete.useMutation();
  const entries: CloudEntry[] = ownerId !== null ? (query.data ?? []) : [];
  const records = entries.map(entry => entry.record);

  useEffect(() => {
    if (auth.loading) return;
    if (previousOwner.current !== null && previousOwner.current !== ownerId) {
      queryClient.removeQueries({
        queryKey: ["mercato-alpha-product-catalog", previousOwner.current],
      });
    }
    previousOwner.current = ownerId;
    if (privateOwner !== null && privateOwner !== ownerId) {
      setPrivateOwner(ownerId);
      setActive(null);
      options.onPrivateClear();
    } else if (ownerId !== null && privateOwner === null) {
      // Even a new, unsaved form belongs to the authenticated session.
      setPrivateOwner(ownerId);
    }
  }, [
    ownerId,
    auth.loading,
    privateOwner,
    options.onPrivateClear,
    queryClient,
  ]);

  function hasIdentity(): boolean {
    const sku =
      options.input.productType === "kit"
        ? options.input.kitSku
        : options.input.productSku;
    return Boolean(options.input.description?.trim() || sku?.trim());
  }

  async function save(asNew = false): Promise<boolean> {
    if (!hasIdentity()) {
      toast.error(
        "Informe o nome/descrição ou SKU para identificar o produto."
      );
      return false;
    }
    if (auth.loading) {
      toast.info("Verificando sua conta. Tente salvar em instantes.");
      return false;
    }
    if (ownerId === null) {
      options.onRequestLogin();
      return false;
    }
    if (busy) return false;
    setBusy(true);
    setOperationError("");
    try {
      await queryClient.cancelQueries({
        queryKey: ["mercato-alpha-product-catalog", ownerId],
        exact: true,
      });
      const current = !asNew && active?.ownerId === ownerId ? active : null;
      const record = current
        ? updateCatalogProduct(current.record, options)
        : createCatalogProduct(options);
      const saved = await saveMutation.mutateAsync({
        payload: serializeCatalogProducts([record]),
        expectedVersion: current?.version ?? null,
      });
      if (currentOwner.current !== ownerId) {
        queryClient.removeQueries({
          queryKey: ["mercato-alpha-product-catalog", ownerId],
          exact: true,
        });
        return true;
      }
      setActive({ ...saved, ownerId });
      setPrivateOwner(ownerId);
      queryClient.setQueryData<CloudEntry[]>(
        ["mercato-alpha-product-catalog", ownerId],
        previous => [
          saved,
          ...(previous ?? []).filter(
            entry => entry.record.id !== saved.record.id
          ),
        ]
      );
      await queryClient.invalidateQueries({
        queryKey: ["mercato-alpha-product-catalog", ownerId],
        exact: true,
      });
      toast.success(
        saved.record.status === "draft"
          ? "Produto salvo na nuvem. Você pode completar o cadastro depois."
          : "Produto salvo na nuvem."
      );
      return true;
    } catch (error) {
      if (currentOwner.current !== ownerId) return false;
      await queryClient.invalidateQueries({
        queryKey: ["mercato-alpha-product-catalog", ownerId],
        exact: true,
      });
      const message = errorMessage(error);
      setOperationError(message);
      toast.error(message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  function open(record: ProductCatalogRecord): void {
    const entry = entries.find(candidate => candidate.record.id === record.id);
    if (!entry || ownerId === null) {
      toast.error("Atualize a lista e entre na conta para abrir este produto.");
      return;
    }
    setActive({ ...entry, ownerId });
    setPrivateOwner(ownerId);
    setOperationError("");
    options.onOpen(entry.record);
  }

  async function remove(record: ProductCatalogRecord): Promise<void> {
    const entry = entries.find(candidate => candidate.record.id === record.id);
    if (!entry || ownerId === null)
      throw new Error("O produto não está mais disponível nesta conta.");
    try {
      await queryClient.cancelQueries({
        queryKey: ["mercato-alpha-product-catalog", ownerId],
        exact: true,
      });
      await deleteMutation.mutateAsync({
        id: record.id,
        expectedVersion: entry.version,
      });
      if (currentOwner.current !== ownerId) {
        queryClient.removeQueries({
          queryKey: ["mercato-alpha-product-catalog", ownerId],
          exact: true,
        });
        return;
      }
      queryClient.setQueryData<CloudEntry[]>(
        ["mercato-alpha-product-catalog", ownerId],
        previous =>
          (previous ?? []).filter(
            candidate => candidate.record.id !== record.id
          )
      );
      if (active?.record.id === record.id) setActive(null);
      await queryClient.invalidateQueries({
        queryKey: ["mercato-alpha-product-catalog", ownerId],
        exact: true,
      });
      toast.success(
        "Produto removido do catálogo. O histórico de simulações foi mantido."
      );
    } catch (error) {
      if (currentOwner.current !== ownerId) return;
      await queryClient.invalidateQueries({
        queryKey: ["mercato-alpha-product-catalog", ownerId],
        exact: true,
      });
      const message = errorMessage(error);
      setOperationError(message);
      toast.error(message);
      throw new Error(message);
    }
  }

  function signIn(): void {
    try {
      if (hasIdentity()) writeProductLoginDraft(createCatalogProduct(options));
      startLogin();
    } catch {
      toast.error(
        "Não foi possível iniciar o login sem guardar o cadastro. Seus dados continuam na tela."
      );
    }
  }

  return {
    records,
    active,
    privateOwner,
    isAuthenticated: ownerId !== null,
    authLoading: auth.loading,
    loading: auth.loading || (ownerId !== null && query.isPending),
    busy,
    error: operationError || (query.error ? errorMessage(query.error) : ""),
    save,
    open,
    remove,
    signIn,
    clearActive: () => {
      setActive(null);
      setPrivateOwner(ownerId);
    },
    refresh: () => {
      setOperationError("");
      void auth.refresh();
      if (ownerId !== null) void query.refetch();
    },
  };
}
