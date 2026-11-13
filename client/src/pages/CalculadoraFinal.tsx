import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearch } from "wouter";
import { FileText, FolderOpen, Loader2, RefreshCw, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/account/AccountUI";
import { AlphaIntegrationContext, type GeneratedAlphaPdf } from "@/alpha/AlphaIntegrationContext";
import { alphaPdfBase64, encodeAlphaReportSnapshot, projectIdFromSearch } from "@/alpha/lib/mercatoPdf";
import "@/alpha/alpha.css";

const AlphaCalculator = lazy(() => import("@/alpha/AlphaCalculator"));

export default function CalculadoraFinal() {
  const auth = useAuth();
  const utils = trpc.useUtils();
  const search = useSearch();
  const [selectedProductId, setSelectedProductId] = useState<number | null>(() => projectIdFromSearch(search));
  const [showDocuments, setShowDocuments] = useState(false);
  const projects = trpc.project.products.list.useQuery(undefined, { refetchOnWindowFocus: true });
  const documents = trpc.alpha.documents.list.useQuery(undefined, {
    enabled: !!auth.user,
    refetchOnWindowFocus: true,
    refetchInterval: 10_000,
  });
  const attachPdf = trpc.alpha.documents.attachPdf.useMutation();
  const currentOwner = useRef<number | null>(null);
  currentOwner.current = auth.user?.id ?? null;
  useEffect(() => {
    currentOwner.current = auth.user?.id ?? null;
    return () => { currentOwner.current = null; };
  }, [auth.user?.id]);

  useEffect(() => { setSelectedProductId(projectIdFromSearch(search)); }, [search]);
  const selectedProduct = projects.data?.find((product) => product.id === selectedProductId);
  const invalidSelection = selectedProductId !== null && !projects.isLoading && !selectedProduct;

  const freezeDestination = useCallback(() => {
    if (!auth.user) throw new Error("Entre no Mercato antes de gerar o PDF.");
    if (selectedProductId !== null && !selectedProduct) {
      throw new Error("O produto escolhido não está disponível. Aguarde o carregamento ou selecione outro destino.");
    }
    return {
      ownerId: auth.user.id,
      projectProductId: selectedProductId,
      label: selectedProduct?.name ?? "Central de PDFs da Calculadora Final",
    };
  }, [auth.user, selectedProductId, selectedProduct]);

  const persistPdf = useCallback(async (input: GeneratedAlphaPdf) => {
    if (currentOwner.current !== input.destination.ownerId) {
      throw new Error("A conta mudou durante a geração. Abra novamente a calculadora antes de salvar o PDF.");
    }
    const saved = await attachPdf.mutateAsync({
      exportId: input.exportId,
      reportId: input.record.id,
      filename: input.filename,
      base64: alphaPdfBase64(input.bytes),
      projectProductId: input.destination.projectProductId,
      description: input.record.input.description || "Produto da Calculadora Final",
      sku: input.record.input.productType === "kit" ? (input.record.input.kitSku || "") : (input.record.input.productSku || ""),
      options: input.options,
      snapshotPayload: encodeAlphaReportSnapshot(input.record),
    });
    if (currentOwner.current !== input.destination.ownerId) {
      throw new Error("O arquivo foi processado na conta original. A conta mudou; abra novamente a central para conferir o resultado.");
    }
    // A successful upload must not be reported as failed merely because a list refresh failed.
    void utils.alpha.documents.list.invalidate();
    if (saved.projectProductId !== null) {
      void utils.project.documents.byProduct.invalidate({ productId: saved.projectProductId });
    }
    toast.success(saved.projectProductId !== null
      ? `PDF salvo no Mercato e em Documentos & Fotos de ${input.destination.label}.`
      : "PDF salvo na central da Calculadora Final no Mercato.");
    return { url: saved.url, documentId: saved.documentId, alreadyExists: saved.alreadyExists };
  }, [attachPdf, utils]);

  const integration = useMemo(() => ({
    freezeDestination, persistPdf,
    projects: projects.data ?? [],
    selectedProjectProductId: selectedProductId,
    selectProjectProduct: setSelectedProductId,
  }), [freezeDestination, persistPdf, projects.data, selectedProductId]);

  return (
    <div className="min-w-0 space-y-5">
      <SectionCard title="PDFs de preço por produto" description="Todo PDF gerado aqui é salvo no Mercato. Escolha um produto do Projeto para recebê-lo também em Documentos & Fotos.">
        <div className="grid min-w-0 gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <div className="min-w-0">
            <label htmlFor="alpha-project-destination" className="mb-2 block text-sm font-medium">Salvar também no produto do Projeto</label>
            <select
              id="alpha-project-destination"
              className="h-11 w-full min-w-0 max-w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
              value={selectedProductId ?? ""}
              onChange={(event) => setSelectedProductId(event.target.value ? Number(event.target.value) : null)}
              disabled={projects.isLoading}
            >
              <option value="">Somente na central da Calculadora Final</option>
              {invalidSelection && <option value={selectedProductId!}>Produto indisponível — escolha outro destino</option>}
              {projects.data?.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
            </select>
            <p className={`mt-2 break-words text-xs ${invalidSelection ? "text-destructive" : "text-muted-foreground"}`}>
              {invalidSelection ? "Não será anexado a outro produto automaticamente." : selectedProduct
                ? `Destino confirmado: ${selectedProduct.name}. Os próximos PDFs desta tela serão anexados a esse produto.`
                : "Nenhum produto será criado ou alterado automaticamente. Os PDFs continuam disponíveis na central abaixo."}
            </p>
            {projects.error && <p className="mt-2 text-xs text-destructive">Não foi possível carregar o Projeto. Atualize a tela ou salve somente na central.</p>}
          </div>
          {selectedProduct && <Button variant="outline" className="h-auto min-h-11 whitespace-normal bg-card" asChild><Link href={`/projeto/produto/${selectedProduct.id}`}><FolderOpen className="h-4 w-4" /> Abrir produto</Link></Button>}
        </div>
        <div className="mt-5 border-t pt-4">
          <div className="flex min-w-0 flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <Button variant="ghost" className="h-auto min-h-11 justify-start whitespace-normal px-0 text-left" onClick={() => setShowDocuments(!showDocuments)}>
              <FileText className="h-4 w-4" /> {showDocuments ? "Ocultar PDFs salvos" : "Ver PDFs salvos"} ({documents.data?.length ?? 0})
            </Button>
            <Button variant="outline" size="sm" className="h-auto min-h-11 whitespace-normal bg-card" onClick={() => documents.refetch()} disabled={documents.isFetching}>
              <RefreshCw className={`h-3.5 w-3.5 ${documents.isFetching ? "animate-spin" : ""}`} /> Atualizar arquivos
            </Button>
          </div>
          {showDocuments && (
            <div className="mt-3 max-h-80 min-w-0 space-y-2 overflow-y-auto overscroll-contain">
              {documents.isLoading && <p className="text-sm text-muted-foreground">Carregando PDFs…</p>}
              {documents.error && <p className="text-sm text-destructive">Não foi possível carregar os PDFs. Clique em Atualizar arquivos.</p>}
              {!documents.isLoading && !documents.error && !documents.data?.length && <p className="text-sm text-muted-foreground">Os PDFs aparecerão aqui depois da primeira geração concluída.</p>}
              {documents.data?.map((document) => (
                <div key={document.exportId} className="flex min-w-0 flex-col items-stretch gap-3 rounded-lg border p-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                  <div className="min-w-0 sm:flex-1">
                    <a href={document.url} target="_blank" rel="noopener noreferrer" className="block break-all text-sm font-medium text-primary hover:underline">{document.filename}</a>
                    <p className="mt-1 break-words text-xs text-muted-foreground">{document.description}{document.sku ? ` · ${document.sku}` : ""} · {new Date(document.createdAt).toLocaleString("pt-BR")}</p>
                    {document.projectProductId !== null && <Link href={`/projeto/produto/${document.projectProductId}`} className="text-xs text-primary hover:underline">Documentos & Fotos do produto</Link>}
                  </div>
                  <Button asChild variant="ghost" size="sm" className="min-h-11"><a href={document.url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" /> Abrir PDF</a></Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </SectionCard>
      <AlphaIntegrationContext.Provider value={integration}>
        <div className="alpha-calculator min-w-0 rounded-2xl border border-border">
          <Suspense fallback={<div className="flex min-h-72 flex-wrap items-center justify-center gap-3 p-4 text-center sm:p-8"><Loader2 className="h-5 w-5 animate-spin" /> Carregando Calculadora Final…</div>}>
            <AlphaCalculator />
          </Suspense>
        </div>
      </AlphaIntegrationContext.Provider>
    </div>
  );
}
