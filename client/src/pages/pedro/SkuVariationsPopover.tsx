import { useEffect, useRef, useState } from "react";
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
import { Check, Copy, Link2, Loader2, Pencil, Plus, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";

type SkuVariationsPopoverProps = {
  skuRowId: number;
  baseSku: string;
  eanGtin?: string;
  mainMlb?: string;
  mainDone?: boolean;
  enableSkuDecision?: boolean;
  onMainFieldChange?: (field: string, value: string | boolean) => void;
  onMainSkuSaved?: (updated: {
    sku: string;
    skuKit: string;
    skuMode: string;
    skuSourceRowId: number | null;
    skuDecisionAt: number | null;
    revision: number;
  }) => void;
  children: React.ReactNode;
};

type VariationRow = {
  variationIndex: number;
  variationSku: string;
  ean: string;
  mlb: string;
  done: boolean;
  revision: number;
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
  enableSkuDecision = false,
  onMainFieldChange,
  onMainSkuSaved,
  children,
}: SkuVariationsPopoverProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [variationToDelete, setVariationToDelete] = useState<VariationRow | null>(null);
  const [sourceRowId, setSourceRowId] = useState<number | null>(null);
  const [manualSku, setManualSku] = useState("");
  const utils = trpc.useUtils();

  const { data: variations, isLoading, refetch } = trpc.skuSheet.getVariations.useQuery(
    { skuRowId, baseSku },
    {
      enabled: open && Boolean(baseSku),
      staleTime: 0,
      refetchInterval: open ? 1_000 : false,
      refetchIntervalInBackground: true,
      refetchOnWindowFocus: true,
    },
  );
  const decision = trpc.skuSheet.getSkuDecision.useQuery(
    { skuRowId },
    {
      enabled: open && enableSkuDecision,
      staleTime: 0,
      refetchInterval: open ? 1_000 : false,
      refetchIntervalInBackground: true,
      refetchOnWindowFocus: true,
    },
  );
  const activeMatches = (decision.data?.matches ?? []).filter((match) => !match.isDeleted);

  useEffect(() => {
    if (sourceRowId == null && activeMatches[0]) setSourceRowId(activeMatches[0].id);
  }, [activeMatches, sourceRowId]);

  const decisionMut = trpc.skuSheet.setSkuDecision.useMutation({
    onSuccess: async (updated) => {
      await Promise.all([
        utils.skuSheet.list.invalidate(),
        utils.skuSheet.getSkuDecision.invalidate({ skuRowId }),
      ]);
      setOpen(false);
      setManualSku("");
      toast.success(`SKU definido como ${updated.sku}.`);
    },
    onError: async (error) => {
      await Promise.all([
        utils.skuSheet.list.invalidate(),
        utils.skuSheet.getSkuDecision.invalidate({ skuRowId }),
      ]);
      toast.error(error.message || "Não foi possível definir o SKU.");
    },
  });

  const editMainSkuMut = trpc.skuSheet.editMainSku.useMutation({
    onSuccess: async (updated) => {
      onMainSkuSaved?.(updated);
      await Promise.all([
        utils.skuSheet.list.invalidate(),
        utils.skuSheet.getSkuDecision.invalidate({ skuRowId }),
        utils.skuSheet.getVariations.invalidate(),
      ]);
      toast.success(`SKU principal alterado para ${updated.sku}.`);
    },
    onError: async (error) => {
      await Promise.all([
        utils.skuSheet.list.invalidate(),
        utils.skuSheet.getSkuDecision.invalidate({ skuRowId }),
      ]);
      toast.error(error.message || "Não foi possível alterar o SKU principal.");
    },
  });

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
    onError: async (error) => {
      await utils.skuSheet.getVariations.invalidate({ skuRowId, baseSku });
      setVariationToDelete(null);
      toast.error(error.message || "Não foi possível excluir a variação.");
    },
  });

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen && baseSku) refetch();
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
          {(isLoading && Boolean(baseSku)) || (enableSkuDecision && decision.isLoading) ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="flex flex-col">
              {enableSkuDecision && decision.data ? (
                <SkuDecisionPanel
                  context={decision.data}
                  activeMatches={activeMatches}
                  sourceRowId={sourceRowId}
                  onSourceRowIdChange={setSourceRowId}
                  manualSku={manualSku}
                  onManualSkuChange={setManualSku}
                  pending={decisionMut.isPending}
                  onReuse={() =>
                    decisionMut.mutate({
                      skuRowId,
                      mode: "reuse",
                      sourceRowId: sourceRowId ?? undefined,
                      expectedRevision: decision.data.revision,
                    })
                  }
                  onAuto={() =>
                    decisionMut.mutate({
                      skuRowId,
                      mode: "auto",
                      expectedRevision: decision.data.revision,
                    })
                  }
                  onManual={() =>
                    decisionMut.mutate({
                      skuRowId,
                      mode: "manual",
                      manualSku: manualSku.trim(),
                      expectedRevision: decision.data.revision,
                    })
                  }
                />
              ) : null}

              {baseSku ? (
                <>
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
                revision={decision.data?.revision ?? null}
                onSaveSku={
                  enableSkuDecision
                    ? async (newSku, expectedRevision) => {
                        await editMainSkuMut.mutateAsync({
                          skuRowId,
                          newSku,
                          expectedRevision,
                        });
                      }
                    : undefined
                }
                isSavingSku={editMainSkuMut.isPending}
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
                </>
              ) : !decision.data?.requiresDecision ? (
                <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                  Preencha tipo, categoria, produto e variante para gerar ou escolher o SKU.
                </div>
              ) : null}
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

type SkuDecisionMatch = {
  id: number;
  position: number;
  produto: string;
  variante: string;
  sku: string;
  isDeleted: boolean;
};

function SkuDecisionPanel({
  context,
  activeMatches,
  sourceRowId,
  onSourceRowIdChange,
  manualSku,
  onManualSkuChange,
  pending,
  onReuse,
  onAuto,
  onManual,
}: {
  context: {
    mode: string;
    requiresDecision: boolean;
    matches: SkuDecisionMatch[];
  };
  activeMatches: SkuDecisionMatch[];
  sourceRowId: number | null;
  onSourceRowIdChange: (value: number) => void;
  manualSku: string;
  onManualSkuChange: (value: string) => void;
  pending: boolean;
  onReuse: () => void;
  onAuto: () => void;
  onManual: () => void;
}) {
  if (!context.requiresDecision) return null;

  return (
    <div className="space-y-3 border-b border-amber-300/60 bg-amber-50 p-4 text-amber-950 dark:border-amber-700/50 dark:bg-amber-950/30 dark:text-amber-100">
      <div>
        <p className="text-sm font-semibold">Este produto já existe. Quer que eu mantenha o mesmo SKU?</p>
        <p className="mt-1 text-xs leading-relaxed opacity-80">
          Nada será alterado nas linhas existentes. A escolha afeta somente esta nova linha.
        </p>
      </div>

      <div className="rounded-md border border-amber-300/60 bg-background/80 p-2.5 text-foreground">
        <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Produto de referência
        </label>
        {activeMatches.length > 0 ? (
          <select
            value={sourceRowId ?? ""}
            onChange={(event) => onSourceRowIdChange(Number(event.target.value))}
            className="w-full rounded-md border border-border bg-background px-2.5 py-2 font-mono text-xs"
          >
            {activeMatches.map((match) => (
              <option key={match.id} value={match.id}>
                Linha {match.position} · {match.sku}
              </option>
            ))}
          </select>
        ) : (
          <p className="text-xs leading-relaxed text-muted-foreground">
            O produto correspondente está excluído. O SKU histórico continua reservado e não pode ser reutilizado.
          </p>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Button
          type="button"
          className="h-auto min-h-10 justify-start gap-2 whitespace-normal py-2 text-left"
          disabled={!sourceRowId || pending}
          onClick={onReuse}
        >
          <Link2 className="h-4 w-4 shrink-0" />
          Manter o mesmo SKU
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-auto min-h-10 justify-start gap-2 bg-background py-2 text-left"
          disabled={pending}
          onClick={onAuto}
        >
          <Sparkles className="h-4 w-4 shrink-0" />
          Gerar novo SKU / variante
        </Button>
      </div>

      <div className="flex flex-col gap-2 rounded-md border border-border bg-background/90 p-2.5 text-foreground sm:flex-row">
        <div className="relative flex-1">
          <Pencil className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={manualSku}
            onChange={(event) => onManualSkuChange(event.target.value)}
            placeholder="Digite o SKU manual"
            className="h-9 w-full rounded-md border border-border bg-background pl-8 pr-2 font-mono text-xs outline-none focus:ring-1 focus:ring-primary/40"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-9 bg-background"
          disabled={!manualSku.trim() || pending}
          onClick={onManual}
        >
          Editar manualmente
        </Button>
      </div>
    </div>
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
  revision,
  onSaveSku,
  isSavingSku,
}: {
  baseSku: string;
  eanGtin: string;
  mainMlb: string;
  mainDone: boolean;
  onCopy: (text: string) => void;
  copied: boolean;
  onFieldChange?: (field: string, value: string | boolean) => void;
  revision: number | null;
  onSaveSku?: (newSku: string, expectedRevision: number) => Promise<void>;
  isSavingSku: boolean;
}) {
  const [editingSku, setEditingSku] = useState(false);
  const [localSku, setLocalSku] = useState(baseSku);
  const [localEan, setLocalEan] = useState(eanGtin);
  const [localMlb, setLocalMlb] = useState(mainMlb);
  const [localDone, setLocalDone] = useState(mainDone);
  const eanInputRef = useRef<HTMLInputElement>(null);
  const mlbInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editingSku) setLocalSku(baseSku);
  }, [baseSku, editingSku]);
  useEffect(() => {
    if (document.activeElement !== eanInputRef.current) setLocalEan(eanGtin);
  }, [eanGtin]);
  useEffect(() => {
    if (document.activeElement !== mlbInputRef.current) setLocalMlb(mainMlb);
  }, [mainMlb]);
  useEffect(() => setLocalDone(mainDone), [mainDone]);

  return (
    <div className="border-b border-primary/20 bg-primary/5 px-4 py-2.5">
      <div className="grid grid-cols-[minmax(190px,1fr)_130px_130px_40px_32px] items-center gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          {editingSku ? (
            <>
              <input
                autoFocus
                value={localSku}
                onChange={(event) => setLocalSku(event.target.value)}
                onKeyDown={async (event) => {
                  if (event.key === "Escape") {
                    setLocalSku(baseSku);
                    setEditingSku(false);
                  }
                  if (event.key === "Enter" && localSku.trim() && revision != null && onSaveSku) {
                    event.preventDefault();
                    if (localSku.trim() === baseSku) {
                      setEditingSku(false);
                      return;
                    }
                    try {
                      await onSaveSku(localSku.trim(), revision);
                      setEditingSku(false);
                    } catch {
                      // O toast da mutação mantém o usuário no campo para corrigir.
                    }
                  }
                }}
                aria-label="Editar SKU principal"
                className="h-8 min-w-0 flex-1 rounded border border-primary/30 bg-background px-2 font-mono text-xs font-semibold text-primary outline-none focus:ring-1 focus:ring-primary/50"
              />
              <button
                type="button"
                disabled={isSavingSku || !localSku.trim() || revision == null}
                onClick={async () => {
                  if (!onSaveSku || revision == null) return;
                  if (localSku.trim() === baseSku) {
                    setEditingSku(false);
                    return;
                  }
                  try {
                    await onSaveSku(localSku.trim(), revision);
                    setEditingSku(false);
                  } catch {
                    // O toast da mutação mantém o usuário no campo para corrigir.
                  }
                }}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-40 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
                title="Salvar SKU principal"
                aria-label="Salvar SKU principal"
              >
                {isSavingSku ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              </button>
              <button
                type="button"
                disabled={isSavingSku}
                onClick={() => {
                  setLocalSku(baseSku);
                  setEditingSku(false);
                }}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted"
                title="Cancelar edição"
                aria-label="Cancelar edição do SKU principal"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </>
          ) : (
            <>
              <span className="min-w-0 select-all truncate font-mono text-xs font-bold text-primary">{baseSku}</span>
              <button
                type="button"
                onClick={() => onCopy(baseSku)}
                className="shrink-0 rounded p-0.5 transition-colors hover:bg-primary/10"
                title="Copiar SKU"
              >
                {copied ? (
                  <Check className="h-3 w-3 text-emerald-600" />
                ) : (
                  <Copy className="h-3 w-3 text-primary/60" />
                )}
              </button>
              {onSaveSku ? (
                <button
                  type="button"
                  onClick={() => {
                    setLocalSku(baseSku);
                    setEditingSku(true);
                  }}
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-primary/70 transition-colors hover:bg-primary/10 hover:text-primary"
                  title="Editar SKU principal manualmente"
                  aria-label="Editar SKU principal manualmente"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </>
          )}
        </div>

        <input
          ref={eanInputRef}
          value={localEan}
          onChange={(event) => setLocalEan(event.target.value)}
          onBlur={() => {
            if (localEan !== eanGtin) onFieldChange?.("eanGtin", localEan);
          }}
          placeholder="—"
          className="w-full rounded border border-primary/20 bg-white/60 px-2 py-1 font-mono text-[11px] outline-none focus:ring-1 focus:ring-primary/40 dark:bg-white/5"
        />

        <input
          ref={mlbInputRef}
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
  const editSkuMut = trpc.skuSheet.editVariationSku.useMutation({
    onSuccess: async (updated) => {
      revisionRef.current = updated.revision;
      setVariationSku(updated.variationSku);
      setEditingSku(false);
      await utils.skuSheet.getVariations.invalidate({ skuRowId, baseSku });
      toast.success(`SKU da variação alterado para ${updated.variationSku}.`);
    },
    onError: async (error) => {
      await utils.skuSheet.getVariations.invalidate({ skuRowId, baseSku });
      toast.error(error.message || "Não foi possível alterar o SKU da variação.");
    },
  });

  const [editingSku, setEditingSku] = useState(false);
  const [variationSku, setVariationSku] = useState(variation.variationSku);
  const [ean, setEan] = useState(variation.ean);
  const [mlb, setMlb] = useState(variation.mlb);
  const [done, setDone] = useState(variation.done);
  const revisionRef = useRef(variation.revision);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const eanInputRef = useRef<HTMLInputElement>(null);
  const mlbInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editingSku) setVariationSku(variation.variationSku);
  }, [editingSku, variation.variationSku]);
  useEffect(() => {
    if (document.activeElement !== eanInputRef.current) setEan(variation.ean);
  }, [variation.ean]);
  useEffect(() => {
    if (document.activeElement !== mlbInputRef.current) setMlb(variation.mlb);
  }, [variation.mlb]);
  useEffect(() => setDone(variation.done), [variation.done]);
  useEffect(() => {
    revisionRef.current = variation.revision;
  }, [variation.revision]);

  const saveField = (data: {
    ean?: string;
    mlb?: string;
    done?: boolean;
  }) => {
    saveQueue.current = saveQueue.current
      .then(async () => {
        const updated = await upsertMut.mutateAsync({
          skuRowId,
          variationIndex: variation.variationIndex,
          baseSku,
          expectedRevision: revisionRef.current,
          ...data,
        });
        revisionRef.current = updated.revision;
      })
      .catch(() => undefined);
  };

  const saveVariationSku = async () => {
    const newSku = variationSku.trim();
    if (!newSku) {
      toast.error("O SKU da variação não pode ficar vazio.");
      return;
    }
    if (newSku === variation.variationSku) {
      setEditingSku(false);
      return;
    }
    await editSkuMut.mutateAsync({
      skuRowId,
      variationIndex: variation.variationIndex,
      baseSku,
      newSku,
      expectedRevision: revisionRef.current,
    });
  };

  return (
    <div className="ml-4 rounded-md border border-border/40 bg-card px-3 py-1.5 transition-colors hover:bg-muted/20">
      <div className="grid grid-cols-[minmax(190px,1fr)_130px_130px_40px_32px] items-center gap-2">
        <div className="flex min-w-0 items-center gap-1">
          {editingSku ? (
            <>
              <input
                autoFocus
                value={variationSku}
                onChange={(event) => setVariationSku(event.target.value)}
                onKeyDown={async (event) => {
                  if (event.key === "Escape") {
                    setVariationSku(variation.variationSku);
                    setEditingSku(false);
                  }
                  if (event.key === "Enter" && variationSku.trim()) {
                    event.preventDefault();
                    try {
                      await saveVariationSku();
                    } catch {
                      // O toast da mutação mantém o campo aberto para correção.
                    }
                  }
                }}
                aria-label={`Editar SKU da variação ${variation.variationIndex}`}
                className="h-7 min-w-0 flex-1 rounded border border-primary/30 bg-background px-2 font-mono text-[11px] outline-none focus:ring-1 focus:ring-primary/40"
              />
              <button
                type="button"
                disabled={editSkuMut.isPending || !variationSku.trim()}
                onClick={() => void saveVariationSku().catch(() => undefined)}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-emerald-700 hover:bg-emerald-100 disabled:opacity-40 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
                title="Salvar SKU da variação"
                aria-label={`Salvar SKU da variação ${variation.variationIndex}`}
              >
                {editSkuMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              </button>
              <button
                type="button"
                disabled={editSkuMut.isPending}
                onClick={() => {
                  setVariationSku(variation.variationSku);
                  setEditingSku(false);
                }}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted"
                title="Cancelar edição"
                aria-label={`Cancelar edição da variação ${variation.variationIndex}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </>
          ) : (
            <>
              <span className="min-w-0 flex-1 truncate px-2 font-mono text-[11px] text-muted-foreground">
                {variationSku}
              </span>
              <button
                type="button"
                onClick={() => {
                  setVariationSku(variation.variationSku);
                  setEditingSku(true);
                }}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-primary/70 hover:bg-primary/10 hover:text-primary"
                title={`Editar ${variation.variationSku}`}
                aria-label={`Editar SKU da variação ${variation.variationIndex}`}
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>

        <input
          ref={eanInputRef}
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
          ref={mlbInputRef}
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
