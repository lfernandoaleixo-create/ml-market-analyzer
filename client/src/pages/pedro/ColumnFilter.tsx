import { useMemo, useState } from "react";
import { Filter, Check, X, Search } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";

export type ColumnFilterOption = { value: string; label: string };

type ColumnFilterProps = {
  /** Rótulo da coluna (exibido no cabeçalho). */
  label: string;
  /** Opções disponíveis (todos os valores presentes naquela coluna). */
  options: ColumnFilterOption[];
  /** Valores atualmente marcados. */
  selected: string[];
  /** Marca/desmarca um valor. */
  onToggle: (value: string) => void;
  /** Limpa o filtro desta coluna. */
  onClear: () => void;
  /** Exibe um campo de busca dentro do popover (útil p/ listas longas, ex.: Produto). */
  searchable?: boolean;
};

/**
 * Cabeçalho de coluna com filtro multi-seleção. Mostra o nome da coluna e um
 * ícone de funil que abre um popover com checkboxes de todos os valores
 * existentes na coluna. Vários valores podem ser marcados ao mesmo tempo.
 */
export default function ColumnFilter({
  label,
  options,
  selected,
  onToggle,
  onClear,
  searchable,
}: ColumnFilterProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const active = selected.length > 0;

  const visible = useMemo(() => {
    if (!searchable || !query.trim()) return options;
    const q = query.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query, searchable]);

  return (
    <div className="flex items-center gap-1.5">
      <span>{label}</span>
      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setQuery("");
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`Filtrar ${label}`}
            className={`relative inline-flex h-6 w-6 items-center justify-center rounded-md transition-colors ${
              active
                ? "bg-white/25 text-white"
                : "text-white/60 hover:bg-white/15 hover:text-white"
            }`}
          >
            <Filter className="h-3.5 w-3.5" />
            {active && (
              <span className="absolute -top-1 -right-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold leading-none text-primary-foreground">
                {selected.length}
              </span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-60 p-0 text-foreground"
          onOpenAutoFocus={(e) => {
            if (!searchable) e.preventDefault();
          }}
        >
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {label}
            </span>
            {active && (
              <button
                type="button"
                onClick={onClear}
                className="inline-flex items-center gap-1 rounded text-xs font-medium text-primary hover:underline"
              >
                <X className="h-3 w-3" />
                Limpar
              </button>
            )}
          </div>

          {searchable && (
            <div className="border-b border-border p-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar…"
                  className="h-8 pl-7 text-sm"
                />
              </div>
            </div>
          )}

          <div className="max-h-64 overflow-y-auto py-1">
            {visible.length === 0 && (
              <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                Nenhuma opção.
              </p>
            )}
            {visible.map((opt) => {
              const checked = selected.includes(opt.value);
              return (
                <button
                  key={opt.value || "__empty__"}
                  type="button"
                  onClick={() => onToggle(opt.value)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                      checked
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-input bg-transparent"
                    }`}
                  >
                    {checked && <Check className="h-3 w-3" />}
                  </span>
                  <span className="truncate">{opt.label}</span>
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
