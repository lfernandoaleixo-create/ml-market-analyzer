import { useState, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { Loader2 } from "lucide-react";

type SkuVariationsPopoverProps = {
  skuRowId: number;
  baseSku: string;
  /** EAN/GTIN do SKU principal (campo eanGtin da linha da planilha). */
  mainEan: string;
  /** Callback para salvar alterações no EAN do SKU principal. */
  onMainEanChange?: (ean: string) => void;
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
 * Popover que aparece ao CLICAR sobre o botão SKU.
 * Exibe o SKU principal em destaque no topo (com EAN, MLB e OK),
 * seguido das 10 sub-variações indentadas em cascata (estilo pastas Windows).
 */
export default function SkuVariationsPopover({
  skuRowId,
  baseSku,
  mainEan,
  onMainEanChange,
  children,
}: SkuVariationsPopoverProps) {
  const [open, setOpen] = useState(false);

  // Fetch variations only when popover opens
  const { data: variations, isLoading, refetch } = trpc.skuSheet.getVariations.useQuery(
    { skuRowId, baseSku },
    { enabled: open, staleTime: 30_000 },
  );

  const handleOpenChange = (o: boolean) => {
    setOpen(o);
    if (o) refetch();
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={6}
        className="w-auto min-w-[620px] max-w-[720px] p-0 overflow-hidden"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <VariationsPanel
            variations={variations ?? []}
            skuRowId={skuRowId}
            baseSku={baseSku}
            mainEan={mainEan}
            onMainEanChange={onMainEanChange}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}

// ─── Painel interno com SKU principal + variações em cascata ─────────────────

function VariationsPanel({
  variations,
  skuRowId,
  baseSku,
  mainEan,
  onMainEanChange,
}: {
  variations: VariationRow[];
  skuRowId: number;
  baseSku: string;
  mainEan: string;
  onMainEanChange?: (ean: string) => void;
}) {
  const utils = trpc.useUtils();
  const upsertMut = trpc.skuSheet.upsertVariation.useMutation({
    onSuccess: () => {
      utils.skuSheet.getVariations.invalidate({ skuRowId, baseSku });
    },
  });

  return (
    <div className="flex flex-col">
      {/* ─── SKU PRINCIPAL (destaque) ─── */}
      <MainSkuRow
        baseSku={baseSku}
        mainEan={mainEan}
        onMainEanChange={onMainEanChange}
      />

      {/* ─── VARIAÇÕES (indentadas em cascata) ─── */}
      <div className="relative">
        {/* Linha vertical de conexão (estilo árvore/cascata) */}
        <div className="absolute left-5 top-0 bottom-3 w-px bg-border" />

        <div className="max-h-[320px] overflow-y-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-border text-muted-foreground bg-muted/30">
                <th className="text-left py-1.5 pl-10 pr-4 font-semibold whitespace-nowrap">
                  Variações SKU
                </th>
                <th className="text-left py-1.5 px-3 font-semibold">EAN</th>
                <th className="text-left py-1.5 px-3 font-semibold">MLB</th>
                <th className="text-center py-1.5 px-2 font-semibold">OK</th>
              </tr>
            </thead>
            <tbody>
              {variations.map((v) => (
                <VariationRowEditor
                  key={v.variationIndex}
                  variation={v}
                  skuRowId={skuRowId}
                  baseSku={baseSku}
                  onSave={(idx, data) => upsertMut.mutate({ skuRowId, variationIndex: idx, baseSku, ...data })}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── SKU Principal em destaque ───────────────────────────────────────────────

function MainSkuRow({
  baseSku,
  mainEan,
  onMainEanChange,
}: {
  baseSku: string;
  mainEan: string;
  onMainEanChange?: (ean: string) => void;
}) {
  const [ean, setEan] = useState(mainEan);
  const prevEanRef = useRef(mainEan);
  if (prevEanRef.current !== mainEan) {
    prevEanRef.current = mainEan;
    setEan(mainEan);
  }

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleEanBlur = () => {
    if (ean !== mainEan && onMainEanChange) {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      onMainEanChange(ean);
    }
  };

  const handleEanChange = (value: string) => {
    setEan(value);
    if (onMainEanChange) {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        onMainEanChange(value);
      }, 600);
    }
  };

  return (
    <div className="bg-gradient-to-r from-primary/8 to-primary/4 border-b-2 border-primary/30 px-4 py-3">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-2 h-2 rounded-full bg-primary shrink-0" />
        <span className="text-[10px] uppercase tracking-wider font-bold text-primary/80">
          SKU Principal
        </span>
      </div>
      <div className="grid grid-cols-[1fr_140px] gap-3 items-center">
        <div className="font-mono text-sm font-bold text-foreground select-all tracking-wide">
          {baseSku}
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] text-muted-foreground font-medium">EAN/GTIN</span>
          <input
            value={ean}
            onChange={(e) => handleEanChange(e.target.value)}
            onBlur={handleEanBlur}
            placeholder="—"
            className="w-full bg-background/80 border border-border/60 px-2 py-1 rounded text-xs font-mono outline-none focus:ring-1 focus:ring-primary/40"
          />
        </div>
      </div>
    </div>
  );
}

// ─── Linha individual da tabela de variações ─────────────────────────────────

function VariationRowEditor({
  variation,
  skuRowId,
  baseSku,
  onSave,
}: {
  variation: VariationRow;
  skuRowId: number;
  baseSku: string;
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
    <tr className="border-b border-border/30 hover:bg-muted/30 transition-colors group">
      {/* SKU da variação com conector visual */}
      <td className="py-1.5 pl-10 pr-4 relative">
        {/* Conector horizontal (branch) */}
        <div className="absolute left-5 top-1/2 w-4 h-px bg-border" />
        <span className="font-mono text-[11px] text-muted-foreground whitespace-nowrap select-all">
          {variation.variationSku}
        </span>
      </td>
      <td className="py-1 px-2">
        <input
          value={ean}
          onChange={(e) => {
            setEan(e.target.value);
            debouncedSave({ ean: e.target.value });
          }}
          onBlur={handleEanBlur}
          placeholder="—"
          className="w-full min-w-[110px] bg-transparent px-2 py-1 rounded outline-none focus:bg-background focus:ring-1 focus:ring-primary/40 text-xs font-mono"
        />
      </td>
      <td className="py-1 px-2">
        <input
          value={mlb}
          onChange={(e) => {
            setMlb(e.target.value);
            debouncedSave({ mlb: e.target.value });
          }}
          onBlur={handleMlbBlur}
          placeholder="—"
          className="w-full min-w-[110px] bg-transparent px-2 py-1 rounded outline-none focus:bg-background focus:ring-1 focus:ring-primary/40 text-xs font-mono"
        />
      </td>
      <td className="py-1 px-2 text-center">
        <input
          type="checkbox"
          checked={done}
          onChange={(e) => handleDoneChange(e.target.checked)}
          className="w-3.5 h-3.5 accent-emerald-600 cursor-pointer"
        />
      </td>
    </tr>
  );
}
