import { useState, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { Loader2, Copy, Check } from "lucide-react";

type SkuVariationsPopoverProps = {
  skuRowId: number;
  baseSku: string;
  eanGtin?: string;
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
 * Popover que aparece ao CLICAR sobre o ícone SKU.
 * Mostra:
 * 1. SKU principal em destaque (com EAN do produto)
 * 2. Variações em cascata (estilo pastas Windows) com SKU, EAN, MLB e OK
 */
export default function SkuVariationsPopover({
  skuRowId,
  baseSku,
  eanGtin,
  children,
}: SkuVariationsPopoverProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // Fetch variations only when popover opens
  const { data: variations, isLoading, refetch } = trpc.skuSheet.getVariations.useQuery(
    { skuRowId, baseSku },
    { enabled: open, staleTime: 30_000 },
  );

  const handleOpenChange = (o: boolean) => {
    setOpen(o);
    if (o) refetch();
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={6}
        className="w-auto min-w-[520px] max-w-[660px] p-0 overflow-hidden"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex flex-col">
            {/* ─── SKU Principal em destaque ─────────────────────────── */}
            <div className="bg-primary/5 border-b border-primary/20 px-4 py-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-primary/70">SKU Principal</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold text-primary select-all">{baseSku}</span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(baseSku)}
                  className="p-1 rounded hover:bg-primary/10 transition-colors"
                  title="Copiar SKU"
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="h-3.5 w-3.5 text-primary/60" />
                  )}
                </button>
              </div>
              {eanGtin && (
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="text-[10px] font-medium text-muted-foreground uppercase">EAN:</span>
                  <span className="font-mono text-xs text-foreground/80 select-all">{eanGtin}</span>
                </div>
              )}
            </div>

            {/* ─── Variações em cascata ─────────────────────────────── */}
            <div className="px-2 py-2">
              <VariationsTable
                variations={variations ?? []}
                skuRowId={skuRowId}
                baseSku={baseSku}
              />
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ─── Tabela interna de variações (estilo cascata) ────────────────────────────

function VariationsTable({
  variations,
  skuRowId,
  baseSku,
}: {
  variations: VariationRow[];
  skuRowId: number;
  baseSku: string;
}) {
  const utils = trpc.useUtils();
  const upsertMut = trpc.skuSheet.upsertVariation.useMutation({
    onSuccess: () => {
      utils.skuSheet.getVariations.invalidate({ skuRowId, baseSku });
    },
  });

  return (
    <div className="max-h-[320px] overflow-y-auto">
      {/* Header das variações */}
      <div className="flex items-center gap-1 px-2 pb-1.5 mb-1 border-b border-border/50">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Variações ({variations.length})
        </span>
      </div>
      {/* Lista em cascata */}
      <div className="flex flex-col gap-0.5">
        {variations.map((v, i) => (
          <VariationRowEditor
            key={v.variationIndex}
            variation={v}
            skuRowId={skuRowId}
            baseSku={baseSku}
            index={i}
            onSave={(idx, data) => upsertMut.mutate({ skuRowId, variationIndex: idx, baseSku, ...data })}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Linha individual (estilo pasta em cascata) ──────────────────────────────

function VariationRowEditor({
  variation,
  skuRowId,
  baseSku,
  index,
  onSave,
}: {
  variation: VariationRow;
  skuRowId: number;
  baseSku: string;
  index: number;
  onSave: (index: number, data: { ean?: string; mlb?: string; done?: boolean }) => void;
}) {
  const [ean, setEan] = useState(variation.ean);
  const [mlb, setMlb] = useState(variation.mlb);
  const [done, setDone] = useState(variation.done);

  // Keep local state in sync if server data changes
  const prevRef = useRef(variation);
  if (
    prevRef.current.ean !== variation.ean ||
    prevRef.current.mlb !== variation.mlb ||
    prevRef.current.done !== variation.done
  ) {
    prevRef.current = variation;
    setEan(variation.ean);
    setMlb(variation.mlb);
    setDone(variation.done);
  }

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const debouncedSave = useCallback(
    (data: { ean?: string; mlb?: string; done?: boolean }) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        onSave(variation.variationIndex, data);
      }, 500);
    },
    [onSave, variation.variationIndex],
  );

  const handleEanBlur = () => {
    if (ean !== variation.ean) {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      onSave(variation.variationIndex, { ean });
    }
  };

  const handleMlbBlur = () => {
    if (mlb !== variation.mlb) {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      onSave(variation.variationIndex, { mlb });
    }
  };

  const handleDoneChange = (checked: boolean) => {
    setDone(checked);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    onSave(variation.variationIndex, { done: checked });
  };

  return (
    <div
      className="relative rounded-md border border-border/50 bg-card hover:bg-muted/30 transition-colors px-3 py-2"
      style={{ marginLeft: `${12 + index * 2}px` }}
    >
      {/* Linha de conexão visual (cascata) */}
      <div
        className="absolute left-0 top-1/2 -translate-x-full w-3 border-t border-border/50"
        style={{ left: "0px" }}
      />

      <div className="flex items-center gap-3">
        {/* SKU da variação */}
        <div className="flex-shrink-0 min-w-[140px]">
          <span className="font-mono text-[11px] text-muted-foreground select-all">
            {variation.variationSku}
          </span>
        </div>

        {/* EAN */}
        <div className="flex items-center gap-1 min-w-[130px]">
          <span className="text-[9px] font-medium text-muted-foreground/70 uppercase">EAN</span>
          <input
            value={ean}
            onChange={(e) => {
              setEan(e.target.value);
              debouncedSave({ ean: e.target.value });
            }}
            onBlur={handleEanBlur}
            placeholder="—"
            className="w-full bg-transparent px-1.5 py-0.5 rounded outline-none focus:bg-background focus:ring-1 focus:ring-primary/40 text-[11px] font-mono"
          />
        </div>

        {/* MLB */}
        <div className="flex items-center gap-1 min-w-[130px]">
          <span className="text-[9px] font-medium text-muted-foreground/70 uppercase">MLB</span>
          <input
            value={mlb}
            onChange={(e) => {
              setMlb(e.target.value);
              debouncedSave({ mlb: e.target.value });
            }}
            onBlur={handleMlbBlur}
            placeholder="—"
            className="w-full bg-transparent px-1.5 py-0.5 rounded outline-none focus:bg-background focus:ring-1 focus:ring-primary/40 text-[11px] font-mono"
          />
        </div>

        {/* OK */}
        <div className="flex items-center gap-1">
          <span className="text-[9px] font-medium text-muted-foreground/70 uppercase">OK</span>
          <input
            type="checkbox"
            checked={done}
            onChange={(e) => handleDoneChange(e.target.checked)}
            className="w-3.5 h-3.5 accent-emerald-600 cursor-pointer"
          />
        </div>
      </div>
    </div>
  );
}
