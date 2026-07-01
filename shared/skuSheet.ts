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

// ---------------------------------------------------------------------------
// Numeração automática do PRODUTO pelo nome
// Regra: ao digitar o nome do produto, se já existir outra linha com o mesmo
// nome (ignorando maiúsculas/minúsculas e espaços), reaproveita o mesmo Nº.
// Caso contrário, recebe o próximo número da sequência (maior Nº existente + 1).
// A numeração da VARIANTE não é afetada por esta regra.
// ---------------------------------------------------------------------------

/** Normaliza o nome do produto para comparação (trim + minúsculas + espaços colapsados). */
export function normalizeProductName(name: string | null | undefined): string {
  return (name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Linha mínima usada para resolver o Nº do produto. */
export interface ProductNumberRow {
  id: number;
  produto: string | null;
  productNumber: number | null;
}

/**
 * Resolve o Nº do produto para uma linha com base no nome digitado.
 * - `rows`: todas as linhas atuais da planilha.
 * - `currentRowId`: id da linha que está sendo editada (ignorada na busca por nome).
 * - `productName`: nome digitado.
 *
 * Retorna:
 * - o Nº já usado por outra linha com o mesmo nome (reaproveitamento), ou
 * - o próximo Nº da sequência (max + 1) quando o nome é novo, ou
 * - null quando o nome está vazio.
 */
export function resolveProductNumber(
  rows: ProductNumberRow[],
  currentRowId: number,
  productName: string,
): number | null {
  const key = normalizeProductName(productName);
  if (!key) return null;

  // 1) Procura outra linha (diferente da atual) com o mesmo nome e Nº já definido.
  for (const r of rows) {
    if (r.id === currentRowId) continue;
    if (r.productNumber == null) continue;
    if (normalizeProductName(r.produto) === key) {
      return r.productNumber;
    }
  }

  // 2) Nome novo: próximo número da sequência (considera todas as linhas).
  let max = 0;
  for (const r of rows) {
    if (r.productNumber != null && r.productNumber > max) max = r.productNumber;
  }
  return max + 1;
}

// ---------------------------------------------------------------------------
// Numeração automática da VARIANTE (garante unicidade do SKU)
// Regra: o SKU final é TIPO-CATEGORIA-NºProduto-NºVariante. Duas linhas com o
// mesmo tipo+categoria+Nº produto DEVEM ter Nº de variante diferente, senão o
// SKU se repete. Esta função encontra o próximo Nº de variante livre dentro do
// mesmo "grupo" (mesmo tipo+categoria+Nº produto), ignorando a linha atual.
// ---------------------------------------------------------------------------

/** Linha mínima usada para resolver o Nº da variante / unicidade do SKU. */
export interface VariantNumberRow {
  id: number;
  tipoSku: string;
  categoryName: string | null;
  productNumber: number | null;
  variantNumber: number | null;
}

/** Chave do grupo que compartilha o mesmo prefixo de SKU (tipo+categoria+Nº produto). */
function skuGroupKey(row: {
  tipoSku: string;
  categoryName: string | null;
  productNumber: number | null;
}): string {
  const tipo = (row.tipoSku ?? "").trim();
  const cat = categoryAbbreviation(row.categoryName);
  const prod = row.productNumber;
  return `${tipo}|${cat}|${prod ?? ""}`;
}

/**
 * Resolve o Nº da variante para uma linha, garantindo que o SKU não se repita.
 * - Considera apenas linhas do MESMO grupo (mesmo tipo+categoria+Nº produto).
 * - Ignora a própria linha (`currentRowId`).
 * - Se a variante atual (`desiredVariant`) ainda não estiver em uso no grupo,
 *   ela é mantida; caso contrário, retorna o menor Nº de variante livre (>=1).
 * - Retorna null quando não há dados suficientes para formar um grupo válido
 *   (tipo/categoria/Nº produto ausentes), deixando a variante como está.
 */
export function resolveVariantNumber(
  rows: VariantNumberRow[],
  currentRowId: number,
  current: {
    tipoSku: string;
    categoryName: string | null;
    productNumber: number | null;
    variantNumber: number | null;
  },
): number | null {
  const tipo = (current.tipoSku ?? "").trim();
  const cat = categoryAbbreviation(current.categoryName);
  const prod = current.productNumber;
  // Sem grupo válido: não há como garantir unicidade; preserva o valor atual.
  if (!tipo || !cat || prod == null) return current.variantNumber ?? 1;

  const groupKey = skuGroupKey(current);

  // Coleta as variantes já ocupadas por OUTRAS linhas do mesmo grupo.
  // IMPORTANTE: usamos ordem determinística (id crescente) para desempate,
  // de forma que "quem chegou primeiro" (menor id) mantém sua variante e a
  // linha atual cede quando há colisão — assim o resultado é estável e não
  // depende do instante em que o cálculo é disparado.
  const used = new Set<number>();
  for (const r of rows) {
    if (r.id === currentRowId) continue;
    if (r.variantNumber == null) continue;
    if (skuGroupKey(r) !== groupKey) continue;
    used.add(r.variantNumber);
  }

  const desired = current.variantNumber;
  // Só mantém a variante desejada se ela NÃO colidir com outra linha do grupo.
  if (desired != null && desired >= 1 && !used.has(desired)) return desired;

  // Caso contrário, atribui o menor Nº de variante livre (>= 1).
  let next = 1;
  while (used.has(next)) next += 1;
  return next;
}

// ---------------------------------------------------------------------------
// Normalização em massa das variantes (reparo de duplicatas)
// Reprocessa TODAS as linhas garantindo que, dentro de cada grupo
// (tipo+categoria+Nº produto), as variantes sejam únicas. A ordem de
// prioridade é determinística: menor `variantNumber` primeiro e, em empate,
// menor `id` (a linha mais antiga mantém seu número; as seguintes recebem o
// próximo livre). Linhas sem grupo válido são preservadas sem alteração.
// ---------------------------------------------------------------------------

/** Resultado de uma alteração de variante sugerida pela normalização. */
export interface VariantFix {
  id: number;
  from: number | null;
  to: number;
}

/**
 * Calcula as correções de variante necessárias para eliminar SKUs duplicados.
 * Não muta a entrada; retorna apenas a lista de linhas que precisam mudar
 * (para exibir antes/depois e aplicar de forma controlada).
 */
export function normalizeVariantNumbers(rows: VariantNumberRow[]): VariantFix[] {
  // Agrupa por prefixo de SKU (tipo+categoria+Nº produto).
  const groups = new Map<string, VariantNumberRow[]>();
  for (const r of rows) {
    const tipo = (r.tipoSku ?? "").trim();
    const cat = categoryAbbreviation(r.categoryName);
    const prod = r.productNumber;
    if (!tipo || !cat || prod == null) continue; // grupo inválido: ignora
    const key = skuGroupKey(r);
    const bucket = groups.get(key);
    if (bucket) bucket.push(r);
    else groups.set(key, [r]);
  }

  const fixes: VariantFix[] = [];
  for (const bucket of Array.from(groups.values())) {
    // Ordem estável por id (linha mais antiga tem prioridade em empates).
    const ordered = [...bucket].sort((a, b) => a.id - b.id);

    // Passada 1 — PRESERVAR: a PRIMEIRA linha (menor id) que reivindica um
    // número de variante válido e ainda livre mantém esse número. Assim, apenas
    // as linhas realmente duplicadas são alteradas (mudança mínima).
    const finalUsed = new Set<number>();
    const keepById = new Map<number, number>();
    for (const r of ordered) {
      const current = r.variantNumber;
      if (current != null && current >= 1 && !finalUsed.has(current)) {
        finalUsed.add(current);
        keepById.set(r.id, current);
      }
    }
    // Passada 2 — REALOCAR: as demais linhas recebem o menor Nº livre (>= 1).
    for (const r of ordered) {
      const current = r.variantNumber;
      let assigned: number;
      if (keepById.has(r.id)) {
        assigned = keepById.get(r.id)!;
      } else {
        let next = 1;
        while (finalUsed.has(next)) next += 1;
        assigned = next;
        finalUsed.add(next);
      }
      if (assigned !== current) {
        fixes.push({ id: r.id, from: current ?? null, to: assigned });
      }
    }
  }

  return fixes;
}

/**
 * Verifica se um SKU já existe em outra linha (colisão de unicidade).
 * SKUs vazios ("") nunca colidem.
 */
export function isSkuDuplicate(
  rows: { id: number; sku: string }[],
  currentRowId: number,
  sku: string,
): boolean {
  const target = (sku ?? "").trim();
  if (!target) return false;
  return rows.some((r) => r.id !== currentRowId && (r.sku ?? "").trim() === target);
}

// ---------------------------------------------------------------------------
// Análise de duplicidade em DOIS tipos distintos
//   1) LINHA IDÊNTICA (erro de preenchimento do usuário): duas ou mais linhas
//      com a MESMA identidade de conteúdo — mesmo tipo + categoria + nome do
//      produto + texto da variante. Isso é conteúdo repetido de verdade e NÃO
//      deve ser "corrigido" renumerando (seria mascarar um cadastro duplicado).
//   2) COLISÃO DE SKU (falha de geração): linhas legitimamente DIFERENTES (a
//      variante textual difere) que, por um erro de numeração, acabaram com o
//      MESMO SKU. Esse caso é corrigível automaticamente (renumerar a variante).
// ---------------------------------------------------------------------------

/** Linha mínima para a análise de duplicidade (identidade + SKU atual). */
export interface DuplicateAnalysisRow {
  id: number;
  position: number;
  tipoSku: string;
  categoryName: string | null;
  produto: string | null;
  variante: string | null;
  productNumber: number | null;
  variantNumber: number | null;
  sku: string | null;
}

/** Grupo de linhas com a MESMA identidade de conteúdo (linha idêntica). */
export interface IdenticalGroup {
  /** Chave normalizada da identidade (para debug/testes). */
  key: string;
  /** Ids das linhas envolvidas, em ordem crescente. */
  ids: number[];
  /** Posições (número visível na planilha) das linhas envolvidas. */
  positions: number[];
  /** Nome do produto (para a mensagem). */
  produto: string;
}

/** Grupo de linhas com o MESMO SKU gerado, mas variações diferentes. */
export interface SkuCollisionGroup {
  sku: string;
  ids: number[];
  positions: number[];
}

export interface DuplicateAnalysis {
  identicalGroups: IdenticalGroup[];
  skuCollisions: SkuCollisionGroup[];
}

/** Normaliza o texto da variante para comparação (trim + minúsculas + espaços). */
export function normalizeVariantText(v: string | null | undefined): string {
  return (v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Chave de identidade de CONTEÚDO de uma linha: mesmo tipo + categoria + nome do
 * produto + texto da variante. Duas linhas com a mesma chave são "idênticas".
 * Só é considerada válida quando há produto (senão não faz sentido comparar).
 */
function identityKey(r: DuplicateAnalysisRow): string | null {
  const produto = normalizeProductName(r.produto);
  if (!produto) return null;
  const tipo = (r.tipoSku ?? "").trim();
  const cat = normalizeProductName(r.categoryName);
  const variante = normalizeVariantText(r.variante);
  return [tipo, cat, produto, variante].join("||");
}

/**
 * Classifica as duplicidades da planilha nos dois tipos descritos acima.
 * - `identicalGroups`: 2+ linhas com a mesma identidade de conteúdo.
 * - `skuCollisions`: 2+ linhas com o mesmo SKU que NÃO são idênticas entre si
 *   (i.e., a colisão não é explicada por conteúdo repetido — é erro de geração).
 */
export function analyzeDuplicates(rows: DuplicateAnalysisRow[]): DuplicateAnalysis {
  // --- Tipo 1: linhas idênticas por conteúdo ---
  const byIdentity = new Map<string, DuplicateAnalysisRow[]>();
  for (const r of rows) {
    const key = identityKey(r);
    if (!key) continue;
    const bucket = byIdentity.get(key);
    if (bucket) bucket.push(r);
    else byIdentity.set(key, [r]);
  }
  const identicalGroups: IdenticalGroup[] = [];
  for (const [key, bucket] of Array.from(byIdentity.entries())) {
    if (bucket.length < 2) continue;
    const ordered = [...bucket].sort((a, b) => a.id - b.id);
    identicalGroups.push({
      key,
      ids: ordered.map((r) => r.id),
      positions: ordered.map((r) => r.position),
      produto: (ordered[0].produto ?? "").trim(),
    });
  }

  // Conjunto de ids que já estão em um grupo idêntico (para não duplicar o
  // alerta: se a colisão de SKU é por conteúdo repetido, ela vira Tipo 1).
  const identicalIds = new Set<number>();
  for (const g of identicalGroups) for (const id of g.ids) identicalIds.add(id);

  // --- Tipo 2: colisão de SKU entre linhas NÃO idênticas ---
  const bySku = new Map<string, DuplicateAnalysisRow[]>();
  for (const r of rows) {
    const s = (r.sku ?? "").trim();
    if (!s) continue;
    const bucket = bySku.get(s);
    if (bucket) bucket.push(r);
    else bySku.set(s, [r]);
  }
  const skuCollisions: SkuCollisionGroup[] = [];
  for (const [sku, bucket] of Array.from(bySku.entries())) {
    if (bucket.length < 2) continue;
    // Remove as linhas cuja colisão é explicada por conteúdo idêntico:
    // se TODAS as linhas do SKU são idênticas entre si, é Tipo 1, não Tipo 2.
    const distinctIdentities = new Set(
      bucket.map((r) => identityKey(r) ?? `__noident_${r.id}`),
    );
    // Se há mais de uma identidade distinta, então são variações diferentes
    // com o mesmo SKU → colisão de geração (Tipo 2).
    if (distinctIdentities.size <= 1) continue;
    const ordered = [...bucket].sort((a, b) => a.id - b.id);
    skuCollisions.push({
      sku,
      ids: ordered.map((r) => r.id),
      positions: ordered.map((r) => r.position),
    });
  }

  return { identicalGroups, skuCollisions };
}
