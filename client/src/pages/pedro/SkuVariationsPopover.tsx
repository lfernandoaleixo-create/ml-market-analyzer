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
 * Popover que aparece ao CLICAR sobre o ícone SKU.
 * Mostra:
 * 1. Header com título das colunas (SKU, EAN, MLB, OK)
 * 2. SKU principal como primeiro item editável em destaque
 * 3. Variações abaixo com indentação (cascata)
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
        className="w-auto min-w-[560px] max-w-[700px] p-0 overflow-hidden"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex flex-col">
            {/* ─── Header das colunas ─────────────────────────────── */}
            <div className="grid grid-cols-[1fr_130px_130px_40px] gap-2 px-4 py-2 border-b border-border/60 bg-muted/30">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">SKU</span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">EAN</span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">MLB</span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-center">OK</span>
            </div>

            {/* ─── SKU Principal (item em destaque) ───────────────── */}
            <MainSkuRow
              baseSku={baseSku}
              eanGtin={eanGtin ?? ""}
              mainMlb={mainMlb ?? ""}
              mainDone={mainDone ?? false}
              onCopy={copyToClipboard}
              copied={copied}
              onFieldChange={onMainFieldChange}
            />

            {/* ─── Variações (indentadas) ─────────────────────────── */}
            <div className="px-2 py-2 border-t border-border/30">
              <div className="flex items-center gap-1 px-2 pb-1.5 mb-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Variações ({variations?.length ?? 0})
                </span>
              </div>
              <div className="max-h-[280px] overflow-y-auto flex flex-col gap-0.5">
                {(variations ?? []).map((v, i) => (
                  <VariationRowEditor
                    key={v.variationIndex}
                    variation={v}
                    skuRowId={skuRowId}
                    baseSku={baseSku}
                    index={i}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ─── SKU Principal (item editável em destaque) ───────────────────────────────

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

  const prevRef = useRef({ eanGtin, mainMlb, mainDone });
  if (prevRef.current.eanGtin !== eanGtin || prevRef.current.mainMlb !== mainMlb || prevRef.current.mainDone !== mainDone) {
    prevRef.current = { eanGtin, mainMlb, mainDone };
    setLocalEan(eanGtin);
    setLocalMlb(mainMlb);
    setLocalDone(mainDone);
  }

  const handleEanBlur = () => {
    if (localEan !== eanGtin && onFieldChange) {
      onFieldChange("eanGtin", localEan);
    }
  };

  const handleMlbBlur = () => {
    if (localMlb !== mainMlb && onFieldChange) {
      onFieldChange("mainMlb", localMlb);
    }
  };

  const handleDoneChange = (checked: boolean) => {
    setLocalDone(checked);
    if (onFieldChange) onFieldChange("mainDone", checked);
  };

  return (
    <div className="bg-primary/5 border-b border-primary/20 px-4 py-2.5">
      <div className="grid grid-cols-[1fr_130px_130px_40px] gap-2 items-center">
        {/* SKU principal com botão de copiar */}
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-bold text-primary select-all">{baseSku}</span>
          <button
            type="button"
            onClick={() => onCopy(baseSku)}
            className="p-0.5 rounded hover:bg-primary/10 transition-colors flex-shrink-0"
            title="Copiar SKU"
          >
            {copied ? (
              <Check className="h-3 w-3 text-emerald-600" />
            ) : (
              <Copy className="h-3 w-3 text-primary/60" />
            )}
          </button>
        </div>

        {/* EAN editável */}
        <input
          value={localEan}
          onChange={(e) => setLocalEan(e.target.value)}
          onBlur={handleEanBlur}
          placeholder="—"
          className="w-full bg-white/60 dark:bg-white/5 px-2 py-1 rounded border border-primary/20 outline-none focus:ring-1 focus:ring-primary/40 text-[11px] font-mono"
        />

        {/* MLB editável */}
        <input
          value={localMlb}
          onChange={(e) => setLocalMlb(e.target.value)}
          onBlur={handleMlbBlur}
          placeholder="—"
          className="w-full bg-white/60 dark:bg-white/5 px-2 py-1 rounded border border-primary/20 outline-none focus:ring-1 focus:ring-primary/40 text-[11px] font-mono"
        />

        {/* OK checkbox */}
        <div className="flex justify-center">
          <input
            type="checkbox"
            checked={localDone}
            onChange={(e) => handleDoneChange(e.target.checked)}
            className="w-4 h-4 accent-emerald-600 cursor-pointer"
          />
        </div>
      </div>
    </div>
  );
}

// ─── Linha individual de variação (indentada) ────────────────────────────────

function VariationRowEditor({
  variation,
  skuRowId,
  baseSku,
  index,
}: {
  variation: VariationRow;
  skuRowId: number;
  baseSku: string;
  index: number;
}) {
  const utils = trpc.useUtils();
  const upsertMut = trpc.skuSheet.upsertVariation.useMutation({
    onSuccess: () => {
      utils.skuSheet.getVariations.invalidate({ skuRowId, baseSku });
    },
  });

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
        upsertMut.mutate({ skuRowId, variationIndex: variation.variationIndex, baseSku, ...data });
      }, 500);
    },
    [upsertMut, skuRowId, baseSku, variation.variationIndex],
  );

  const handleEanBlur = () => {
    if (ean !== variation.ean) {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      upsertMut.mutate({ skuRowId, variationIndex: variation.variationIndex, baseSku, ean });
    }
  };

  const handleMlbBlur = () => {
    if (mlb !== variation.mlb) {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      upsertMut.mutate({ skuRowId, variationIndex: variation.variationIndex, baseSku, mlb });
    }
  };

  const handleDoneChange = (checked: boolean) => {
    setDone(checked);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    upsertMut.mutate({ skuRowId, variationIndex: variation.variationIndex, baseSku, done: checked });
  };

  return (
    <div
      className="rounded-md border border-border/40 bg-card hover:bg-muted/20 transition-colors px-3 py-1.5"
      style={{ marginLeft: `${16}px` }}
    >
      <div className="grid grid-cols-[1fr_130px_130px_40px] gap-2 items-center">
        {/* SKU da variação */}
        <span className="font-mono text-[11px] text-muted-foreground select-all truncate">
          {variation.variationSku}
        </span>

        {/* EAN */}
        <input
          value={ean}
          onChange={(e) => {
            setEan(e.target.value);
            debouncedSave({ ean: e.target.value });
          }}
          onBlur={handleEanBlur}
          placeholder="—"
          className="w-full bg-transparent px-2 py-0.5 rounded outline-none focus:bg-background focus:ring-1 focus:ring-primary/40 text-[11px] font-mono"
        />

        {/* MLB */}
        <input
          value={mlb}
          onChange={(e) => {
            setMlb(e.target.value);
            debouncedSave({ mlb: e.target.value });
          }}
          onBlur={handleMlbBlur}
          placeholder="—"
          className="w-full bg-transparent px-2 py-0.5 rounded outline-none focus:bg-background focus:ring-1 focus:ring-primary/40 text-[11px] font-mono"
        />

        {/* OK */}
        <div className="flex justify-center">
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
