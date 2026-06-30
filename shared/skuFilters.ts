// Lógica pura de filtragem por coluna da Planilha SKU (Linha do Tempo Pedro).
// Mantida fora do componente React para ser testável com vitest e reutilizável.

import { TIPO_SKU_OPTIONS, CADASTRADO_ML_OPTIONS } from "./skuSheet";

// Colunas que podem ser filtradas (o "Nº" foi intencionalmente deixado de fora).
export type FilterableColumn =
  | "cadastradoMl"
  | "tipoSku"
  | "categoryName"
  | "subCategoryName"
  | "produto";

export const FILTERABLE_COLUMNS: FilterableColumn[] = [
  "cadastradoMl",
  "tipoSku",
  "categoryName",
  "subCategoryName",
  "produto",
];

// Estado dos filtros ativos: para cada coluna, o conjunto de valores marcados.
// Um array vazio (ou ausência da chave) significa "sem filtro" (mostra tudo).
export type ColumnFilters = Partial<Record<FilterableColumn, string[]>>;

// Forma mínima de uma linha necessária para filtragem.
export interface FilterableRow {
  cadastradoMl: string;
  tipoSku: string;
  categoryName: string | null;
  subCategoryName: string | null;
  produto: string;
}

// Rótulo amigável para um valor bruto de uma coluna (usado nas opções do filtro).
export function valueLabel(column: FilterableColumn, raw: string): string {
  if (raw === "") return "(vazio)";
  if (column === "cadastradoMl") {
    return CADASTRADO_ML_OPTIONS.find((o) => o.value === raw)?.label ?? raw;
  }
  if (column === "tipoSku") {
    return TIPO_SKU_OPTIONS.find((o) => o.value === raw)?.label ?? raw;
  }
  return raw;
}

// Valor bruto (chave) de uma coluna em uma linha. Normaliza null/undefined em "".
export function rawValue(row: FilterableRow, column: FilterableColumn): string {
  const v = row[column];
  return v == null ? "" : String(v);
}

/**
 * Monta as opções disponíveis para uma coluna a partir das linhas atuais.
 * - Para Cadastrado ML e Tipo SKU usamos a ordem das listas fixas, incluindo
 *   apenas os valores que realmente aparecem nas linhas (mais um "(vazio)" se
 *   houver linhas sem valor).
 * - Para as demais (Categoria, Subcategoria, Produto), ordenamos alfabeticamente
 *   os valores presentes; "(vazio)" sempre por último, quando existir.
 */
export function buildOptions(
  rows: FilterableRow[],
  column: FilterableColumn,
): { value: string; label: string }[] {
  const present = new Set<string>();
  for (const r of rows) present.add(rawValue(r, column));

  const hasEmpty = present.has("");

  if (column === "cadastradoMl" || column === "tipoSku") {
    const ordered =
      column === "cadastradoMl"
        ? CADASTRADO_ML_OPTIONS.map((o) => o.value as string)
        : TIPO_SKU_OPTIONS.map((o) => o.value as string);
    const out = ordered
      .filter((v) => present.has(v))
      .map((v) => ({ value: v, label: valueLabel(column, v) }));
    if (hasEmpty) out.push({ value: "", label: "(vazio)" });
    return out;
  }

  const values = Array.from(present).filter((v) => v !== "");
  values.sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));
  const out = values.map((v) => ({ value: v, label: valueLabel(column, v) }));
  if (hasEmpty) out.push({ value: "", label: "(vazio)" });
  return out;
}

/** Indica se a coluna tem algum filtro ativo (ao menos um valor marcado). */
export function isColumnActive(filters: ColumnFilters, column: FilterableColumn): boolean {
  const sel = filters[column];
  return Array.isArray(sel) && sel.length > 0;
}

/** Conta quantas colunas têm filtro ativo. */
export function countActiveFilters(filters: ColumnFilters): number {
  return FILTERABLE_COLUMNS.reduce(
    (n, c) => (isColumnActive(filters, c) ? n + 1 : n),
    0,
  );
}

/**
 * Aplica os filtros de coluna a uma lista de linhas. Filtros de colunas
 * diferentes são combinados com E (todas precisam passar); dentro de uma mesma
 * coluna, os valores marcados são combinados com OU (qualquer um serve).
 */
export function applyColumnFilters<T extends FilterableRow>(
  rows: T[],
  filters: ColumnFilters,
): T[] {
  const active = FILTERABLE_COLUMNS.filter((c) => isColumnActive(filters, c));
  if (active.length === 0) return rows;
  return rows.filter((row) =>
    active.every((column) => {
      const selected = filters[column] as string[];
      return selected.includes(rawValue(row, column));
    }),
  );
}

/** Alterna (marca/desmarca) um valor no filtro de uma coluna, retornando novo estado. */
export function toggleFilterValue(
  filters: ColumnFilters,
  column: FilterableColumn,
  value: string,
): ColumnFilters {
  const current = filters[column] ?? [];
  const next = current.includes(value)
    ? current.filter((v) => v !== value)
    : [...current, value];
  return { ...filters, [column]: next };
}

/** Limpa o filtro de uma única coluna. */
export function clearColumnFilter(
  filters: ColumnFilters,
  column: FilterableColumn,
): ColumnFilters {
  const next = { ...filters };
  delete next[column];
  return next;
}

/** Limpa todos os filtros de coluna. */
export function clearAllFilters(): ColumnFilters {
  return {};
}
