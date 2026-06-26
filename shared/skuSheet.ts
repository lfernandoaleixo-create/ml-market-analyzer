// Constantes compartilhadas da Planilha SKU (Cronograma do Pedro).
// Reutilizadas por frontend (seletores) e backend (validação).

export const TIPO_SKU_OPTIONS = [
  { value: "1", label: "1 (INSUMO)" },
  { value: "2", label: "2 (PRODUTO)" },
  { value: "3", label: "3 (KIT)" },
  { value: "4", label: "4 (CATÁLOGO)" },
] as const;

export type TipoSkuValue = "" | "1" | "2" | "3" | "4";

export const CADASTRADO_ML_OPTIONS = [
  { value: "ATIVO", label: "ATIVO", color: "emerald" },
  { value: "PENDENTE", label: "PENDENTE", color: "amber" },
  { value: "PAUSADO", label: "PAUSADO", color: "sky" },
  { value: "EXCLUIDO", label: "EXCLUÍDO", color: "rose" },
] as const;

export type CadastradoMlValue = "" | "ATIVO" | "PENDENTE" | "PAUSADO" | "EXCLUIDO";

export function tipoSkuLabel(value: string): string {
  return TIPO_SKU_OPTIONS.find((o) => o.value === value)?.label ?? "";
}

export function cadastradoMlLabel(value: string): string {
  return CADASTRADO_ML_OPTIONS.find((o) => o.value === value)?.label ?? "";
}

// Tipos da árvore de categorias do Mercado Livre (shared/mlCategories.json).
export interface MlCategoryNode {
  id: string;
  name: string;
}
export interface MlRootCategory {
  id: string;
  name: string;
  children: MlCategoryNode[];
}
export interface MlCategoryTree {
  site: string;
  categories: MlRootCategory[];
}

// Campos editáveis de uma linha (sem metadados de id/datas).
export interface SkuRowEditable {
  position: number;
  productNumber: number | null;
  variantNumber: number | null;
  cadastradoMl: string;
  tipoSku: string;
  categoryId: string | null;
  categoryName: string | null;
  subCategoryId: string | null;
  subCategoryName: string | null;
  produto: string;
  variante: string;
  sku: string;
  gerarSkuKit: boolean;
  skuKit: string;
  eanGtin: string;
  ncm: string;
  gpc: string;
  cest: string;
  precoClassico: string;
  precoPremium: string;
  precoAtacado: string;
  embProfundidade: string;
  embLargura: string;
  embAltura: string;
  embPeso: string;
  caracteristicas: string | null;
}
