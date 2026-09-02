import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Check, Copy, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

type SkuVariationsPopoverProps = {
  skuRowId: number;
  baseSku: string;
  eanGtin?: string;
  mainMlb?: string;
  mainDone?: boolean;
  onMainFieldChange?: (field: string, value: string | boolean) => void;
  children: React.ReactNode;
};

type VariationRow = {
  variationIndex: number;
  variationSku: string;
  ean: string;
  mlb: string;
  done: boolean;
};

/**
 * Gestão manual das variações do SKU. As variações podem ser adicionadas,
 * editadas e excluídas sem senha. A exclusão sempre exige confirmação e é
 * lógica no servidor, preservando o índice/SKU para nunca ser reutilizado.
 */
export default function SkuVariationsPopover({
  skuRowId,
  baseSku,
  eanGtin,
  mainMlb,
  mainDone,
  onMainFieldChange,
  children,
}: SkuVariationsPopoverProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [variationToDelete, setVariationToDelete] = useState<VariationRow | null>(null);
  const utils = trpc.useUtils();

  const { data: variations, isLoading, refetch } = trpc.skuSheet.getVariations.useQuery(
    { skuRowId, baseSku },
    { enabled: open, staleTime: 30_000 },
  );

  const addMut = trpc.skuSheet.addVariation.useMutation({
    onSuccess: async (created) => {
      await utils.skuSheet.getVariations.invalidate({ skuRowId, baseSku });
      toast.success(`Variação ${created.variationSku} adicionada.`);
    },
    onError: (error) => toast.error(error.message || "Não foi possível adicionar a variação."),
  });

  const deleteMut = trpc.skuSheet.deleteVariation.useMutation({
    onSuccess: async () => {
      await utils.skuSheet.getVariations.invalidate({ skuRowId, baseSku });
      setVariationToDelete(null);
      toast.success("Variação excluída. O número dela não será reutilizado.");
    },
    onError: (error) => toast.error(error.message || "Não foi possível excluir a variação."),
  });

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) refetch();
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <>
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>{children}</PopoverTrigger>
        <PopoverContent
          side="bottom"
          align="start"
          sideOffset={6}
          className="w-[min(860px,calc(100vw-24px))] p-0 overflow-hidden"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="flex flex-col">
              <div className="grid grid-cols-[minmax(190px,1fr)_130px_130px_40px_32px] gap-2 border-b border-border/60 bg-muted/30 px-4 py-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">SKU</span>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">EAN</span>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">MLB</span>
                <span className="text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">OK</span>
                <span className="sr-only">Ações</span>
              </div>

              <MainSkuRow
                baseSku={baseSku}
                eanGtin={eanGtin ?? ""}
                mainMlb={mainMlb ?? ""}
                mainDone={mainDone ?? false}
                onCopy={copyToClipboard}
                copied={copied}
                onFieldChange={onMainFieldChange}
              />

              <div className="border-t border-border/30 px-2 py-2">
                <div className="mb-1 flex items-center justify-between gap-2 px-2 pb-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Variações ({variations?.length ?? 0})
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1.5 px-2.5 text-xs"
                    disabled={!baseSku || addMut.isPending}
                    onClick={() => addMut.mutate({ skuRowId, baseSku })}
                    title={baseSku ? "Adicionar nova variação" : "Preencha o SKU principal primeiro"}
                  >
                    {addMut.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Plus className="h-3.5 w-3.5" />
                    )}
                    Adicionar
                  </Button>
                </div>

                <div className="max-h-[320px] overflow-y-auto flex flex-col gap-0.5">
                  {(variations ?? []).map((variation) => (
                    <VariationRowEditor
                      key={variation.variationIndex}
                      variation={variation}
                      skuRowId={skuRowId}
                      baseSku={baseSku}
                      onRequestDelete={() => setVariationToDelete(variation)}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </PopoverContent>
      </Popover>

      <AlertDialog
        open={variationToDelete !== null}
        onOpenChange={(dialogOpen) => {
          if (!dialogOpen && !deleteMut.isPending) setVariationToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir variação de SKU?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a variação
              {variationToDelete?.variationSku ? (
                <strong className="ml-1 font-mono text-foreground">
                  {variationToDelete.variationSku}
                </strong>
              ) : null}
              ? O número desta variação será preservado e não será usado novamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteMut.isPending || !variationToDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                if (!variationToDelete) return;
                deleteMut.mutate({
                  skuRowId,
                  variationIndex: variationToDelete.variationIndex,
                  baseSku,
                });
              }}
            >
              {deleteMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Sim, excluir variação
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function MainSkuRow({
  baseSku,
  eanGtin,
  mainMlb,
  mainDone,
  onCopy,
  copied,
  onFieldChange,
}: {
  baseSku: string;
  eanGtin: string;
  mainMlb: string;
  mainDone: boolean;
  onCopy: (text: string) => void;
  copied: boolean;
  onFieldChange?: (field: string, value: string | boolean) => void;
}) {
  const [localEan, setLocalEan] = useState(eanGtin);
  const [localMlb, setLocalMlb] = useState(mainMlb);
  const [localDone, setLocalDone] = useState(mainDone);

  useEffect(() => setLocalEan(eanGtin), [eanGtin]);
  useEffect(() => setLocalMlb(mainMlb), [mainMlb]);
  useEffect(() => setLocalDone(mainDone), [mainDone]);

  return (
    <div className="border-b border-primary/20 bg-primary/5 px-4 py-2.5">
      <div className="grid grid-cols-[minmax(190px,1fr)_130px_130px_40px_32px] items-center gap-2">
        <div className="flex items-center gap-2">
          <span className="select-all font-mono text-xs font-bold text-primary">{baseSku}</span>
          <button
            type="button"
            onClick={() => onCopy(baseSku)}
            className="flex-shrink-0 rounded p-0.5 transition-colors hover:bg-primary/10"
            title="Copiar SKU"
          >
            {copied ? (
              <Check className="h-3 w-3 text-emerald-600" />
            ) : (
              <Copy className="h-3 w-3 text-primary/60" />
            )}
          </button>
        </div>

        <input
          value={localEan}
          onChange={(event) => setLocalEan(event.target.value)}
          onBlur={() => {
            if (localEan !== eanGtin) onFieldChange?.("eanGtin", localEan);
          }}
          placeholder="—"
          className="w-full rounded border border-primary/20 bg-white/60 px-2 py-1 font-mono text-[11px] outline-none focus:ring-1 focus:ring-primary/40 dark:bg-white/5"
        />

        <input
          value={localMlb}
          onChange={(event) => setLocalMlb(event.target.value)}
          onBlur={() => {
            if (localMlb !== mainMlb) onFieldChange?.("mainMlb", localMlb);
          }}
          placeholder="—"
          className="w-full rounded border border-primary/20 bg-white/60 px-2 py-1 font-mono text-[11px] outline-none focus:ring-1 focus:ring-primary/40 dark:bg-white/5"
        />

        <div className="flex justify-center">
          <input
            type="checkbox"
            checked={localDone}
            onChange={(event) => {
              setLocalDone(event.target.checked);
              onFieldChange?.("mainDone", event.target.checked);
            }}
            className="h-4 w-4 cursor-pointer accent-emerald-600"
          />
        </div>
        <div />
      </div>
    </div>
  );
}

function VariationRowEditor({
  variation,
  skuRowId,
  baseSku,
  onRequestDelete,
}: {
  variation: VariationRow;
  skuRowId: number;
  baseSku: string;
  onRequestDelete: () => void;
}) {
  const utils = trpc.useUtils();
  const upsertMut = trpc.skuSheet.upsertVariation.useMutation({
    onSuccess: () => utils.skuSheet.getVariations.invalidate({ skuRowId, baseSku }),
    onError: (error) => {
      utils.skuSheet.getVariations.invalidate({ skuRowId, baseSku });
      toast.error(error.message || "Não foi possível salvar a variação.");
    },
  });

  const [variationSku, setVariationSku] = useState(variation.variationSku);
  const [ean, setEan] = useState(variation.ean);
  const [mlb, setMlb] = useState(variation.mlb);
  const [done, setDone] = useState(variation.done);

  useEffect(() => setVariationSku(variation.variationSku), [variation.variationSku]);
  useEffect(() => setEan(variation.ean), [variation.ean]);
  useEffect(() => setMlb(variation.mlb), [variation.mlb]);
  useEffect(() => setDone(variation.done), [variation.done]);

  const saveField = (data: {
    variationSku?: string;
    ean?: string;
    mlb?: string;
    done?: boolean;
  }) => {
    upsertMut.mutate({
      skuRowId,
      variationIndex: variation.variationIndex,
      baseSku,
      ...data,
    });
  };

  return (
    <div className="ml-4 rounded-md border border-border/40 bg-card px-3 py-1.5 transition-colors hover:bg-muted/20">
      <div className="grid grid-cols-[minmax(190px,1fr)_130px_130px_40px_32px] items-center gap-2">
        <input
          value={variationSku}
          onChange={(event) => setVariationSku(event.target.value)}
          onBlur={() => {
            const nextSku = variationSku.trim();
            if (!nextSku) {
              setVariationSku(variation.variationSku);
              toast.error("O SKU da variação não pode ficar vazio.");
            } else if (nextSku !== variation.variationSku) {
              saveField({ variationSku: nextSku });
            }
          }}
          aria-label={`SKU da variação ${variation.variationIndex}`}
          className="w-full rounded bg-transparent px-2 py-0.5 font-mono text-[11px] text-muted-foreground outline-none focus:bg-background focus:ring-1 focus:ring-primary/40"
        />

        <input
          value={ean}
          onChange={(event) => setEan(event.target.value)}
          onBlur={() => {
            if (ean !== variation.ean) saveField({ ean });
          }}
          aria-label={`EAN da variação ${variation.variationIndex}`}
          placeholder="—"
          className="w-full rounded bg-transparent px-2 py-0.5 font-mono text-[11px] outline-none focus:bg-background focus:ring-1 focus:ring-primary/40"
        />

        <input
          value={mlb}
          onChange={(event) => setMlb(event.target.value)}
          onBlur={() => {
            if (mlb !== variation.mlb) saveField({ mlb });
          }}
          aria-label={`MLB da variação ${variation.variationIndex}`}
          placeholder="—"
          className="w-full rounded bg-transparent px-2 py-0.5 font-mono text-[11px] outline-none focus:bg-background focus:ring-1 focus:ring-primary/40"
        />

        <div className="flex justify-center">
          <input
            type="checkbox"
            checked={done}
            onChange={(event) => {
              setDone(event.target.checked);
              saveField({ done: event.target.checked });
            }}
            aria-label={`Marcar variação ${variation.variationIndex} como concluída`}
            className="h-3.5 w-3.5 cursor-pointer accent-emerald-600"
          />
        </div>

        <button
          type="button"
          onClick={onRequestDelete}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40"
          title={`Excluir ${variation.variationSku}`}
          aria-label={`Excluir variação ${variation.variationSku}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
