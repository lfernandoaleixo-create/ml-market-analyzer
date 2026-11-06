import {
  money,
  parseLocalized,
  type KitItem,
  type PricingInput,
} from "./pricing";

export type { KitItem } from "./pricing";

export type KitItemWithSubtotal = KitItem & { subtotal: number };

export interface AcquisitionResult {
  quantity: number;
  total: number;
  items: KitItemWithSubtotal[];
  errors: string[];
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : Number.NaN;
  }
  if (typeof value === "string" && value.trim() !== "") {
    return parseLocalized(value);
  }
  return Number.NaN;
}

function generatedKitItemId(): string {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }
  return `kit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Cria uma linha editável sem impor uma estratégia de IDs à interface. */
export function createKitItem(overrides: Partial<KitItem> = {}): KitItem {
  return {
    id: stringValue(overrides.id) || generatedKitItemId(),
    description: stringValue(overrides.description),
    sku: stringValue(overrides.sku),
    quantity: overrides.quantity ?? 1,
    unitCost: overrides.unitCost ?? 0,
  };
}

function singleAcquisition(input: PricingInput): AcquisitionResult {
  const quantity = input.itemQuantity ?? 1;
  const errors: string[] = [];

  if (!Number.isInteger(quantity) || quantity <= 0) {
    errors.push(
      "Quantidade de itens inválida: informe um número inteiro maior que zero."
    );
  }
  if (!isFiniteNumber(input.cost) || input.cost < 0) {
    errors.push("Custo inválido.");
  }
  if (
    input.costMode === "kg" &&
    (!isFiniteNumber(input.productKg) || input.productKg < 0)
  ) {
    errors.push("Produto em kg inválido.");
  }
  if (input.costMode === "kg" && input.productKg <= 0) {
    errors.push(
      "Peso do produto inválido para custo por kg: informe quantos kg de mercadoria há em cada item no custo de aquisição."
    );
  }

  const unitCost =
    input.costMode === "kg" ? input.cost * input.productKg : input.cost;
  const total =
    isFiniteNumber(unitCost) && isFiniteNumber(quantity)
      ? money(unitCost * quantity)
      : 0;

  return { quantity, total, items: [], errors };
}

/**
 * Calcula a aquisição de uma entrada single ou KIT sem alterar suas linhas.
 * Para KIT, cada subtotal é arredondado antes da soma para que o total seja
 * exatamente a soma dos subtotais que a interface apresenta.
 */
export function getAcquisition(input: PricingInput): AcquisitionResult {
  if (input?.productType !== "kit") return singleAcquisition(input);

  const rawItems = Array.isArray(input.kitItems) ? input.kitItems : [];
  const errors: string[] = [];
  if (rawItems.length === 0) {
    errors.push("KIT precisa de pelo menos um item.");
  }

  const items = rawItems.map((rawItem, index): KitItemWithSubtotal => {
    const row =
      rawItem !== null && typeof rawItem === "object"
        ? (rawItem as Partial<KitItem>)
        : {};
    const item: KitItem = {
      id: stringValue(row.id),
      description: stringValue(row.description),
      sku: stringValue(row.sku),
      quantity: row.quantity ?? Number.NaN,
      unitCost: row.unitCost ?? Number.NaN,
    };
    const quantity = item.quantity;
    const unitCost = item.unitCost;
    const subtotal =
      isFiniteNumber(quantity) && isFiniteNumber(unitCost)
        ? money(quantity * unitCost)
        : 0;

    if (
      typeof item.description !== "string" ||
      item.description.trim() === ""
    ) {
      errors.push(`Item ${index + 1}: informe a descrição.`);
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      errors.push(
        `Item ${index + 1}: a quantidade deve ser um inteiro maior que zero.`
      );
    }
    if (!isFiniteNumber(unitCost) || unitCost < 0) {
      errors.push(
        `Item ${index + 1}: o custo unitário deve ser um número maior ou igual a zero.`
      );
    }

    return { ...item, subtotal };
  });

  const quantity = items.reduce(
    (sum, item) => sum + (isFiniteNumber(item.quantity) ? item.quantity : 0),
    0
  );
  const total = money(items.reduce((sum, item) => sum + item.subtotal, 0));

  return { quantity, total, items, errors };
}

function parseStoredItem(rawItem: unknown, index: number): KitItem {
  const row =
    rawItem !== null && typeof rawItem === "object"
      ? (rawItem as Record<string, unknown>)
      : {};
  const id = stringValue(row.id).trim();

  return {
    id: id || `restored-${index + 1}`,
    description: stringValue(row.description),
    sku: stringValue(row.sku),
    quantity: numberValue(row.quantity),
    unitCost: numberValue(row.unitCost),
  };
}

function legacyKitItem(input: PricingInput): KitItem {
  const unitCost =
    input.costMode === "kg" ? input.cost * input.productKg : input.cost;

  return {
    id: "restored-1",
    description: input.description || "Item do KIT",
    sku: "",
    quantity: input.itemQuantity ?? 1,
    unitCost,
  };
}

/**
 * Restaura linhas persistidas sem descartar dados inválidos. Ausência de
 * kitItems em um KIT legado vira uma única linha baseada no custo antigo;
 * um array vazio explícito permanece vazio para que o KIT continue bloqueado.
 */
export function hydrateKitComposition(
  input: PricingInput,
  storedRows?: unknown
): PricingInput {
  if (arguments.length < 2) storedRows = input.kitItems;
  const isKit = input.productType === "kit";
  const normalizedInput = {
    ...input,
    productSku: stringValue(input.productSku),
    kitSku: stringValue(input.kitSku),
  };

  if (!isKit) {
    const rows = Array.isArray(storedRows)
      ? storedRows.map(parseStoredItem)
      : storedRows === undefined || storedRows === null
        ? []
        : [parseStoredItem(storedRows, 0)];
    return { ...normalizedInput, kitItems: rows };
  }

  const rows =
    storedRows === undefined || storedRows === null
      ? [legacyKitItem(input)]
      : Array.isArray(storedRows)
        ? storedRows.map(parseStoredItem)
        : [parseStoredItem(storedRows, 0)];

  return { ...normalizedInput, kitItems: rows };
}

/**
 * Materializa a primeira linha somente na troca intencional para KIT. A
 * edição/restauração de uma composição vazia não deve repopulá-la sozinha.
 */
export function ensureKitItems(input: PricingInput): PricingInput {
  if (input.productType !== "kit") return input;
  if (Array.isArray(input.kitItems) && input.kitItems.length > 0) return input;

  const unitCost =
    input.costMode === "kg" ? input.cost * input.productKg : input.cost;
  const item = createKitItem({
    description: stringValue(input.description),
    sku: stringValue(input.productSku),
    quantity: input.itemQuantity ?? 1,
    unitCost,
  });

  return { ...input, kitItems: [item] };
}
