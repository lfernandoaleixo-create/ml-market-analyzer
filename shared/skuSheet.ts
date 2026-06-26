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

// ---------------------------------------------------------------------------
// Geração automática de SKU
// Regra: [Nº TIPO] - [CATEGORIA abreviada] - [Nº produto] - [Nº variante]
// SKU KIT (quando gerarSkuKit = true): SKU + "-KITINS"
// ---------------------------------------------------------------------------

// Abreviações aprovadas pelo usuário para as 32 categorias raiz do Mercado Livre.
// Chave = nome exato da categoria raiz (shared/mlCategories.json).
export const CATEGORY_ABBREVIATIONS: Record<string, string> = {
  "Acessórios para Veículos": "VEICULOS",
  "Agro": "AGRO",
  "Alimentos e Bebidas": "ALIMENTOS",
  "Animais": "ANIMAIS",
  "Antiguidades e Coleções": "COLECOES",
  "Arte, Papelaria e Armarinho": "PAPELARIA",
  "Bebês": "BEBES",
  "Beleza e Cuidado Pessoal": "BELEZA",
  "Brinquedos e Hobbies": "BRINQUEDOS",
  "Calçados, Roupas e Bolsas": "MODA",
  "Câmeras e Acessórios": "CAMERAS",
  "Carros, Motos e Outros": "CARROS",
  "Casa, Móveis e Decoração": "CASA",
  "Celulares e Telefones": "CELULARES",
  "Construção": "CONSTRUCAO",
  "Eletrodomésticos": "ELETRODOM",
  "Eletrônicos, Áudio e Vídeo": "ELETRONICOS",
  "Esportes e Fitness": "ESPORTES",
  "Ferramentas": "FERRAMENTAS",
  "Festas e Lembrancinhas": "FESTAS",
  "Games": "GAMES",
  "Imóveis": "IMOVEIS",
  "Indústria e Comércio": "INDUSTRIA",
  "Informática": "INFORMATICA",
  "Ingressos": "INGRESSOS",
  "Instrumentos Musicais": "INSTRUMENTOS",
  "Joias e Relógios": "JOIAS",
  "Livros, Revistas e Comics": "LIVROS",
  "Música, Filmes e Seriados": "MIDIA",
  "Saúde": "SAUDE",
  "Serviços": "SERVICOS",
  "Mais Categorias": "OUTROS",
};

// Sufixo do SKU KIT (kit insumo).
export const SKU_KIT_SUFFIX = "KITINS";

export function categoryAbbreviation(categoryName: string | null | undefined): string {
  if (!categoryName) return "";
  return CATEGORY_ABBREVIATIONS[categoryName] ?? "";
}

// Campos mínimos necessários para montar o SKU.
export interface SkuParts {
  tipoSku: string;
  categoryName: string | null;
  productNumber: number | null;
  variantNumber: number | null;
}

/**
 * Monta o SKU base no formato [TIPO]-[CATEGORIA]-[Nº produto]-[Nº variante].
 * Retorna "" enquanto algum componente essencial estiver ausente, para não
 * gerar SKUs incompletos do tipo "2--3-".
 */
export function buildSku(parts: SkuParts): string {
  const tipo = (parts.tipoSku ?? "").trim();
  const cat = categoryAbbreviation(parts.categoryName);
  const prod = parts.productNumber;
  const variant = parts.variantNumber;

  // Todos os 4 componentes são obrigatórios para um SKU válido.
  if (!tipo || !cat || prod == null || variant == null) return "";

  return [tipo, cat, prod, variant].join("-");
}

/**
 * Monta o SKU KIT a partir do SKU base. Só retorna valor quando o kit está
 * habilitado e o SKU base é válido.
 */
export function buildSkuKit(baseSku: string, gerarSkuKit: boolean): string {
  if (!gerarSkuKit) return "";
  if (!baseSku) return "";
  return `${baseSku}-${SKU_KIT_SUFFIX}`;
}
