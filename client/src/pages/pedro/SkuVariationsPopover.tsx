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
 * Popover que aparece ao CLICAR sobre o ícone SKU.
 * Exibe uma tabela com colunas: SKU | EAN | MLB | OK
 * A primeira linha é o SKU principal (em destaque, fundo diferenciado).
 * As linhas seguintes são as variações.
 */
export default function SkuVariationsPopover({
  skuRowId,
  baseSku,
  mainEan,
  onMainEanChange,
  children,
}: SkuVariationsPopoverProps) {
  const [open, setOpen] = useState(false);

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
        className="w-auto min-w-[580px] max-w-[700px] p-0 overflow-hidden"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <VariationsTable
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

// ─── Tabela unificada: SKU principal (1ª linha) + variações ──────────────────

function VariationsTable({
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
    <div className="max-h-[400px] overflow-y-auto">
      <table className="w-full text-xs border-collapse">
        <thead className="sticky top-0 z-10">
          <tr className="border-b border-border text-muted-foreground bg-muted/50">
            <th className="text-left py-2 px-3 font-semibold whitespace-nowrap">SKU</th>
            <th className="text-left py-2 px-3 font-semibold">EAN</th>
            <th className="text-left py-2 px-3 font-semibold">MLB</th>
            <th className="text-center py-2 px-2 font-semibold w-12">OK</th>
          </tr>
        </thead>
        <tbody>
          {/* ─── SKU PRINCIPAL (primeira linha, em destaque) ─── */}
          <MainSkuRowInline
            baseSku={baseSku}
            mainEan={mainEan}
            onMainEanChange={onMainEanChange}
          />

          {/* ─── VARIAÇÕES ─── */}
          {variations.map((v) => (
            <VariationRowEditor
              key={v.variationIndex}
              variation={v}
              onSave={(idx, data) =>
                upsertMut.mutate({ skuRowId, variationIndex: idx, baseSku, ...data })
              }
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── SKU Principal como primeira linha da tabela (em destaque) ────────────────

function MainSkuRowInline({
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
    <tr className="bg-primary/6 border-b-2 border-primary/25 font-semibold">
      {/* SKU principal — sem campo de variação, é o produto base */}
      <td className="py-2 px-3">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
          <span className="font-mono text-[12px] font-bold text-foreground select-all">
            {baseSku}
          </span>
        </div>
      </td>
      {/* EAN editável — vinculado ao eanGtin da linha */}
      <td className="py-1.5 px-2">
        <input
          value={ean}
          onChange={(e) => handleEanChange(e.target.value)}
          onBlur={handleEanBlur}
          placeholder="—"
          className="w-full min-w-[120px] bg-background/80 border border-border/50 px-2 py-1 rounded text-xs font-mono outline-none focus:ring-1 focus:ring-primary/40"
        />
      </td>
      {/* MLB — não existe para o SKU principal (campo vazio/desabilitado) */}
      <td className="py-1.5 px-2">
        <span className="text-muted-foreground/40 text-xs px-2">—</span>
      </td>
      {/* OK — não existe para o SKU principal */}
      <td className="py-1.5 px-2 text-center">
        <span className="text-muted-foreground/40 text-xs">—</span>
      </td>
    </tr>
  );
}

// ─── Linha individual de variação ────────────────────────────────────────────

function VariationRowEditor({
  variation,
  onSave,
}: {
  variation: VariationRow;
  onSave: (index: number, data: { ean?: string; mlb?: string; done?: boolean }) => void;
}) {
  const [ean, setEan] = useState(variation.ean);
  const [mlb, setMlb] = useState(variation.mlb);
  const [done, setDone] = useState(variation.done);

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
    <tr className="border-b border-border/30 hover:bg-muted/20 transition-colors">
      {/* SKU da variação */}
      <td className="py-1.5 px-3 pl-6">
        <span className="font-mono text-[11px] text-muted-foreground whitespace-nowrap select-all">
          {variation.variationSku}
        </span>
      </td>
      {/* EAN */}
      <td className="py-1 px-2">
        <input
          value={ean}
          onChange={(e) => {
            setEan(e.target.value);
            debouncedSave({ ean: e.target.value });
          }}
          onBlur={handleEanBlur}
          placeholder="—"
          className="w-full min-w-[120px] bg-transparent px-2 py-1 rounded outline-none focus:bg-background focus:ring-1 focus:ring-primary/40 text-xs font-mono"
        />
      </td>
      {/* MLB */}
      <td className="py-1 px-2">
        <input
          value={mlb}
          onChange={(e) => {
            setMlb(e.target.value);
            debouncedSave({ mlb: e.target.value });
          }}
          onBlur={handleMlbBlur}
          placeholder="—"
          className="w-full min-w-[120px] bg-transparent px-2 py-1 rounded outline-none focus:bg-background focus:ring-1 focus:ring-primary/40 text-xs font-mono"
        />
      </td>
      {/* OK */}
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
