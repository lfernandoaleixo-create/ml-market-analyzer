// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  defaultInput,
  solveTarget,
  type PricingInput,
} from "../shared/alpha/pricing";
import AlphaCalculator from "../client/src/alpha/AlphaCalculator";
import {
  AlphaIntegrationContext,
  type AlphaIntegration,
} from "../client/src/alpha/AlphaIntegrationContext";
import type { ProductReportRecord } from "../shared/alpha/decisionReport";

const testState = vi.hoisted(() => ({
  latestInput: null as PricingInput | null,
  pdfRecord: null as ProductReportRecord | null,
  save: vi.fn(async () => true),
  suggest: vi.fn(),
}));
vi.mock("../shared/alpha/pricing", async importOriginal => {
  const actual =
    await importOriginal<typeof import("../shared/alpha/pricing")>();
  return { ...actual, solveTarget: vi.fn(actual.solveTarget) };
});
vi.mock("../client/src/lib/trpc", () => ({
  trpc: {
    alpha: {
      pricing: {
        suggestCategory: {
          useMutation: () => ({
            isPending: false,
            mutate: testState.suggest,
          }),
        },
      },
    },
  },
}));
vi.mock("../client/src/alpha/hooks/useProductCatalog", () => ({
  useProductCatalog: (options: { input: PricingInput }) => {
    testState.latestInput = options.input;
    return {
      records: [],
      active: null,
      privateOwner: null,
      isAuthenticated: false,
      authLoading: false,
      loading: false,
      busy: false,
      error: "",
      save: testState.save,
      open: vi.fn(),
      remove: vi.fn(),
      signIn: vi.fn(),
      clearActive: vi.fn(),
      refresh: vi.fn(),
    };
  },
}));
vi.mock("../client/src/alpha/components/ProductPdfDialog", () => ({
  ProductPdfDialog: ({ record }: { record: ProductReportRecord }) => {
    testState.pdfRecord = record;
    return null;
  },
}));
vi.mock("sonner", () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

let root: Root;
let container: HTMLDivElement;
const integration: AlphaIntegration = {
  projects: [{ id: 91, name: "Colar" }],
  selectedProjectProductId: null,
  selectProjectProduct: vi.fn(),
  freezeDestination: vi.fn(() => ({
    ownerId: 91,
    projectProductId: null,
    label: "Teste",
  })),
  persistPdf: vi.fn(async () => ({
    url: "/teste.pdf",
    documentId: null,
    alreadyExists: false,
  })),
};
const field = (selector: string) => {
  const element = container.querySelector<HTMLInputElement>(selector);
  expect(element).not.toBeNull();
  return element!;
};
async function enter(element: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function mount(
  input: PricingInput = {
    ...defaultInput,
    cost: 25,
    description: "Produto inicial",
  }
) {
  localStorage.setItem("mercato-alpha-draft-v1", JSON.stringify(input));
  await act(async () =>
    root.render(
      <AlphaIntegrationContext.Provider value={integration}>
        <AlphaCalculator />
      </AlphaIntegrationContext.Provider>
    )
  );
  vi.mocked(solveTarget).mockClear();
}

beforeEach(() => {
  (globalThis as { React?: typeof React }).React = React;
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
  testState.pdfRecord = null;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  localStorage.clear();
  sessionStorage.clear();
});

describe("Digitação da Calculadora Final sem refazer cenários financeiros", () => {
  it("mantém nó, foco, texto atual e preço ao digitar descrição, sem solver por letra", async () => {
    await mount();
    const description = field(
      'input[placeholder="Ex.: Kit de 3 potes organizadores de cozinha"]'
    );
    const initialPrice = field(".result-price input").value;
    description.focus();
    for (const text of ["C", "Co", "Col", "Cola", "Colar prata"]) {
      await enter(description, text);
      expect(
        field(
          'input[placeholder="Ex.: Kit de 3 potes organizadores de cozinha"]'
        )
      ).toBe(description);
      expect(document.activeElement).toBe(description);
      expect(description.value).toBe(text);
    }
    expect(solveTarget).not.toHaveBeenCalled();
    expect(field(".result-price input").value).toBe(initialPrice);
    expect(
      container.querySelector(".result-description")!.textContent
    ).toContain("Colar prata");
    expect(testState.latestInput?.description).toBe("Colar prata");
    expect(testState.suggest).not.toHaveBeenCalled();
    expect(testState.save).not.toHaveBeenCalled();
    const saveButton = Array.from(container.querySelectorAll("button")).find(
      b => b.textContent?.trim() === "Salvar produto"
    )!;
    await act(async () => saveButton.click());
    expect(testState.save).toHaveBeenCalledTimes(1);
    expect(testState.latestInput?.description).toBe("Colar prata");
  });

  it("SKU e categoria manuais não refazem preços, mas continuam atuais no cadastro", async () => {
    await mount();
    const sku = field('input[placeholder="Ex.: PROD-001"]');
    sku.focus();
    for (const value of ["2", "2-J", "2-JOIAS-15-03"]) await enter(sku, value);
    const category = field('input[aria-label="Categoria final"]');
    category.focus();
    for (const value of ["J", "Jo", "Joias"]) await enter(category, value);
    expect(solveTarget).not.toHaveBeenCalled();
    expect(testState.latestInput?.productSku).toBe("2-JOIAS-15-03");
    expect(testState.latestInput?.category).toBe("Joias");
    expect(testState.suggest).not.toHaveBeenCalled();
    expect(testState.save).not.toHaveBeenCalled();
  });

  it("alterar custo ainda recalcula e atualiza o preço", async () => {
    await mount();
    const before = field(".result-price input").value;
    const input = Array.from(
      container.querySelectorAll<HTMLInputElement>("input")
    ).find(
      i =>
        i
          .closest("label")
          ?.querySelector(".field-label")
          ?.textContent?.includes("Custo") && i.inputMode === "decimal"
    )!;
    expect(input).toBeDefined();
    input.focus();
    await enter(input, "80");
    expect(solveTarget).toHaveBeenCalled();
    expect(field(".result-price input").value).not.toBe(before);
  });

  it("alterar dimensões ainda recalcula imediatamente", async () => {
    await mount();
    await enter(field('input[aria-label="Comprimento"]'), "100");
    expect(testState.latestInput?.length).toBe(100);
    expect(solveTarget).toHaveBeenCalled();
  });

  it("meta de margem ainda recalcula mesmo sem mudar parâmetros da entrada", async () => {
    await mount();
    const before = field(".result-price input").value;
    await enter(
      field('input[aria-label="Margem de lucro que você quer ter"]'),
      "30"
    );
    expect(solveTarget).toHaveBeenCalled();
    expect(field(".result-price input").value).not.toBe(before);
  });

  it("digitação no item do kit é contínua, mas descrição em branco bloqueia o cálculo", async () => {
    await mount({
      ...defaultInput,
      productType: "kit",
      kitItems: [
        {
          id: "item-estavel",
          description: "Colar",
          sku: "COL-1",
          quantity: 2,
          unitCost: 12.5,
        },
      ],
    });
    const description = field('input[aria-label="Descrição do item"]');
    description.focus();
    for (const value of ["C", "Co", "Colar coração"])
      await enter(description, value);
    const sku = field('input[aria-label="SKU do item (opcional)"]');
    sku.focus();
    for (const value of ["2", "2-J", "2-JOIAS-15-03"]) await enter(sku, value);
    expect(solveTarget).not.toHaveBeenCalled();
    expect(testState.latestInput?.kitItems[0].description).toBe(
      "Colar coração"
    );
    expect(testState.latestInput?.kitItems[0].sku).toBe("2-JOIAS-15-03");
    expect(document.activeElement).toBe(sku);
    const previousPrice = field(".result-price input").value;
    description.focus();
    await enter(description, " ");
    expect(field(".result-price input").value).toBe("");
    expect(solveTarget).toHaveBeenCalled();
    expect(document.activeElement).toBe(description);
    await enter(description, "Colar");
    expect(field(".result-price input").value).toBe(previousPrice);
    expect(field('input[aria-label="Descrição do item"]')).toBe(description);
  });

  it("PDF recebe o nome/SKU atuais imediatamente após digitar, não os metadados do cache", async () => {
    await mount();
    await enter(
      field(
        'input[placeholder="Ex.: Kit de 3 potes organizadores de cozinha"]'
      ),
      "Produto final prata"
    );
    await enter(field('input[placeholder="Ex.: PROD-001"]'), "2-JOIAS-15-03");
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Gerar ficha PDF"]'
        )!
        .click()
    );
    expect(testState.pdfRecord?.input.description).toBe("Produto final prata");
    expect(testState.pdfRecord?.input.productSku).toBe("2-JOIAS-15-03");
    expect(testState.save).not.toHaveBeenCalled();
    expect(integration.persistPdf).not.toHaveBeenCalled();
  });
});
