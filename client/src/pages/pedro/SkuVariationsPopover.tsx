import { useState, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import {
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
} from "@/components/ui/hover-card";
import { Loader2 } from "lucide-react";

type SkuVariationsPopoverProps = {
  skuRowId: number;
  baseSku: string;
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
 * Popover que aparece ao passar o mouse sobre uma célula SKU.
 * Mostra uma tabela com 10 sub-variações (SKU derivado, EAN, MLB, OK).
 * Os dados são carregados sob demanda e salvos com debounce no blur.
 */
export default function SkuVariationsPopover({
  skuRowId,
  baseSku,
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
    <HoverCard openDelay={400} closeDelay={200} open={open} onOpenChange={handleOpenChange}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent
        side="bottom"
        align="start"
        className="w-auto min-w-[520px] max-w-[620px] p-3"
      >
        <p className="text-xs font-semibold text-muted-foreground mb-2">
          Variações SKU
        </p>
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <VariationsTable
            variations={variations ?? []}
            skuRowId={skuRowId}
            baseSku={baseSku}
          />
        )}
      </HoverCardContent>
    </HoverCard>
  );
}

// ─── Tabela interna de variações ─────────────────────────────────────────────

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
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th className="text-left py-1.5 px-1.5 font-semibold whitespace-nowrap">
              Variações SKU
            </th>
            <th className="text-left py-1.5 px-1.5 font-semibold">EAN</th>
            <th className="text-left py-1.5 px-1.5 font-semibold">MLB</th>
            <th className="text-center py-1.5 px-1.5 font-semibold">✓</th>
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
    <tr className="border-b border-border/40 hover:bg-muted/30 transition-colors">
      <td className="py-1.5 px-1.5 font-mono text-[11px] text-muted-foreground whitespace-nowrap select-all">
        {variation.variationSku}
      </td>
      <td className="py-1 px-1">
        <input
          value={ean}
          onChange={(e) => {
            setEan(e.target.value);
            debouncedSave({ ean: e.target.value });
          }}
          onBlur={handleEanBlur}
          placeholder="—"
          className="w-full min-w-[100px] bg-transparent px-1.5 py-1 rounded outline-none focus:bg-background focus:ring-1 focus:ring-primary/40 text-xs font-mono"
        />
      </td>
      <td className="py-1 px-1">
        <input
          value={mlb}
          onChange={(e) => {
            setMlb(e.target.value);
            debouncedSave({ mlb: e.target.value });
          }}
          onBlur={handleMlbBlur}
          placeholder="—"
          className="w-full min-w-[100px] bg-transparent px-1.5 py-1 rounded outline-none focus:bg-background focus:ring-1 focus:ring-primary/40 text-xs font-mono"
        />
      </td>
      <td className="py-1 px-1 text-center">
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
