// @vitest-environment jsdom
// Autoria: Manus e Fernando. Classes/DOM não substituem validação visual real.
import React, { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import EmbalagemSheet from "../client/src/pages/pedro/EmbalagemSheet";
import SkuVariationsPopover from "../client/src/pages/pedro/SkuVariationsPopover";
import ColumnFilter from "../client/src/pages/pedro/ColumnFilter";

const service = vi.hoisted(() => ({
  mutate: vi.fn(),
  invalidate: vi.fn(),
  refetch: vi.fn(),
}));

vi.mock("../client/src/lib/trpc", () => {
  const mutation = { useMutation: () => ({ isPending: false, mutate: service.mutate, mutateAsync: service.mutate }) };
  const query = (data: unknown) => ({ useQuery: () => ({ data, isLoading: false, refetch: service.refetch }) });
  const endpoint = { invalidate: service.invalidate };
  return {
    trpc: {
      useUtils: () => ({
        embalagemSheet: { list: endpoint, listCustomColumns: endpoint },
        skuSheet: { list: endpoint, getVariations: endpoint, getSkuDecision: endpoint },
      }),
      embalagemSheet: {
        list: query([{ id: 1, position: 1, rowColor: "", customValues: '{"8":"Valor simulado"}', produto: "Produto simulado", sku: "SKU-TESTE-SEM-DADOS-REAIS" }]),
        listCustomColumns: query([{ id: 8, position: 1, name: "Coluna simulada muito longa ".repeat(8) }]),
        update: mutation, create: mutation, delete: mutation, createCustomColumn: mutation,
        renameCustomColumn: mutation, deleteCustomColumn: mutation, setCustomValue: mutation,
      },
      skuSheet: {
        getVariations: query([{ variationIndex: 7, variationSku: "VARIACAO-TESTE-".repeat(8), ean: "EAN-TESTE", mlb: "MLB-TESTE", done: false, revision: 1 }]),
        getSkuDecision: query({ revision: 1, mode: "pending", requiresDecision: true, matches: [{ id: 2, position: 2, produto: "Referência simulada", variante: "Teste", sku: "SKU-REFERENCIA-TESTE", isDeleted: false }] }),
        setSkuDecision: mutation, editMainSku: mutation, addVariation: mutation,
        deleteVariation: mutation, upsertVariation: mutation, editVariationSku: mutation,
      },
    },
  };
});
vi.mock("../client/src/pages/pedro/sheetExport", () => ({ exportToExcel: vi.fn(), exportToPdf: vi.fn() }));
vi.mock("wouter", () => ({ useLocation: () => ["/sku/embalagens", vi.fn()] }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  service.mutate.mockClear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
  document.body.removeAttribute("style");
  vi.unstubAllGlobals();
});
function render(node: ReactNode) { act(() => root.render(node)); }
function button(label: string): HTMLButtonElement {
  const match = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(el =>
    el.getAttribute("aria-label") === label || el.textContent?.trim() === label,
  );
  expect(match, `Botão ${label}`).toBeDefined();
  return match!;
}
function click(label: string) { act(() => button(label).click()); }
function popover() { return document.querySelector<HTMLElement>('[data-slot="popover-content"]')!; }
function dialog() { return document.querySelector<HTMLElement>('[data-slot="dialog-content"]')!; }

describe("SKU/embalagens: contratos locais de apresentação responsiva", () => {
  it.each([360, 390, 768, 1024, 1440])("mantém campos e ações de embalagens no DOM em viewport simulada %ipx", width => {
    // jsdom não calcula layout nem aplica breakpoints: verificamos os contratos de classes.
    vi.stubGlobal("innerWidth", width);
    render(<EmbalagemSheet />);
    const region = document.querySelector<HTMLElement>('[role="region"]')!;
    expect(region.classList.contains("overflow-x-auto")).toBe(true);
    expect(region.classList.contains("max-w-full")).toBe(true);
    expect(region.tabIndex).toBe(0);
    expect(container.firstElementChild?.classList.contains("min-w-0")).toBe(true);
    const search = document.querySelector<HTMLInputElement>('input[aria-label="Buscar na planilha"]')!;
    expect(search.classList.contains("w-full")).toBe(true);
    const toolbar = search.parentElement!.parentElement!;
    expect(toolbar.classList.contains("flex-wrap")).toBe(true);
    expect(toolbar.classList.contains("w-full")).toBe(true);
    expect(toolbar.classList.contains("lg:w-auto")).toBe(true);
    for (const label of ["Colunas", "Exportar", "Nova linha", "Editar linha", "Cor da linha", "Excluir linha"]) button(label);
    expect(document.querySelectorAll("thead th")).toHaveLength(18); // 15 fixas + extra + # + ações
    expect(region.textContent).toContain("Preço Clássico");
    expect(region.textContent).toContain("Observação");
    expect(document.querySelector<HTMLInputElement>('input[value="SKU-TESTE-SEM-DADOS-REAIS"]')).not.toBeNull();
    const actions = button("Editar linha").closest("td")!;
    expect(actions.classList.contains("sticky")).toBe(false);
    expect(actions.classList.contains("sm:sticky")).toBe(true);
    expect(service.mutate).not.toHaveBeenCalled();
  });

  it("gerenciamento de colunas empilha criação e limita altura sem ocultar controles", () => {
    render(<EmbalagemSheet />);
    click("Colunas");
    expect(dialog().classList.contains("overflow-y-auto")).toBe(true);
    expect(dialog().classList.contains("max-h-[calc(100dvh-2rem)]")).toBe(true);
    const field = document.querySelector<HTMLInputElement>('input[placeholder="Nome da nova coluna (ex.: Fornecedor)"]')!;
    expect(field.parentElement!.classList.contains("flex-col")).toBe(true);
    expect(field.parentElement!.classList.contains("sm:flex-row")).toBe(true);
    button("Criar"); button("Excluir coluna"); button("Fechar");
    expect(service.mutate).not.toHaveBeenCalled();
  });

  it("edição completa de embalagens mantém todos os campos e os botões em modal rolável", () => {
    render(<EmbalagemSheet />);
    click("Editar linha");
    expect(dialog().classList.contains("overflow-y-auto")).toBe(true);
    expect(dialog().classList.contains("max-h-[calc(100dvh-2rem)]")).toBe(true);
    expect(dialog().querySelectorAll("input,textarea")).toHaveLength(16);
    expect(dialog().textContent).toContain("Comprimento");
    expect(dialog().textContent).toContain("Preço Premium");
    button("Cancelar"); button("Salvar");
    expect(service.mutate).not.toHaveBeenCalled();
  });

  it("card de variações troca a grade larga por campos rotulados no celular sem alterar SKU", () => {
    const sku = "SKU-TESTE-LONGO-".repeat(10);
    render(<SkuVariationsPopover skuRowId={1} baseSku={sku} enableSkuDecision><button>Abrir SKU</button></SkuVariationsPopover>);
    click("Abrir SKU");
    expect(popover().classList.contains("overflow-y-auto")).toBe(true);
    expect(popover().className).toContain("--radix-popover-content-available-height");
    const grids = Array.from(popover().querySelectorAll("div")).filter(el => el.className.includes("md:grid-cols-[minmax(190px,1fr)"));
    expect(grids).toHaveLength(3); // cabeçalho desktop + principal + variação
    for (const grid of Array.from(grids).slice(1)) {
      expect(grid.classList.contains("grid-cols-2")).toBe(true);
      expect(grid.firstElementChild?.classList.contains("col-span-2")).toBe(true);
    }
    const main = document.querySelector<HTMLInputElement>('input[aria-label="EAN principal"]')!;
    expect(main.parentElement?.tagName).toBe("LABEL");
    expect(main.classList.contains("min-w-0")).toBe(true);
    expect(popover().textContent).toContain(sku);
    expect(popover().textContent).toContain("VARIACAO-TESTE-".repeat(8));
    for (const label of ["Copiar SKU", "Editar SKU principal manualmente", "Editar SKU da variação 7", "Adicionar", "Manter o mesmo SKU", "Gerar SKU pela regra", "Editar manualmente"]) button(label);
    const variationList = document.querySelector('[aria-label="EAN da variação 7"]')!.closest('[class*="md:ml-4"]')!.parentElement!;
    expect(variationList.classList.contains("md:overflow-y-auto")).toBe(true);
    expect(variationList.classList.contains("overflow-y-auto")).toBe(false);
    click("Editar SKU principal manualmente");
    expect(document.querySelector<HTMLInputElement>('input[aria-label="Editar SKU principal"]')!.value).toBe(sku);
    button("Salvar SKU principal"); button("Cancelar edição do SKU principal");
    expect(service.mutate).not.toHaveBeenCalled();
  });

  it("exclusão de variação continua exigindo confirmação rolável; abrir/cancelar não salva", () => {
    render(<SkuVariationsPopover skuRowId={1} baseSku="SKU-TESTE"><button>Abrir SKU</button></SkuVariationsPopover>);
    click("Abrir SKU");
    click(`Excluir variação ${"VARIACAO-TESTE-".repeat(8)}`);
    const confirmation = document.querySelector<HTMLElement>('[data-slot="alert-dialog-content"]')!;
    expect(confirmation.classList.contains("overflow-y-auto")).toBe(true);
    expect(confirmation.classList.contains("max-h-[calc(100dvh-2rem)]")).toBe(true);
    button("Sim, excluir variação");
    click("Cancelar");
    expect(service.mutate).not.toHaveBeenCalled();
  });

  it("filtro preserva rótulos extensos e seleção, com popover limitado e alvos de toque", () => {
    const onToggle = vi.fn();
    const label = "Produto sem truncar ".repeat(12);
    render(<ColumnFilter label="Produto" options={[{ value: "teste", label }]} selected={["teste"]} onToggle={onToggle} onClear={vi.fn()} searchable />);
    expect(button("Filtrar Produto").classList.contains("h-9")).toBe(true);
    click("Filtrar Produto");
    expect(popover().classList.contains("overflow-y-auto")).toBe(true);
    expect(popover().className).toContain("--radix-popover-content-available-height");
    const option = popover().querySelector<HTMLButtonElement>('[aria-pressed="true"]')!;
    expect(option.classList.contains("min-h-10")).toBe(true);
    const text = option.lastElementChild!;
    expect(text.textContent).toBe(label);
    expect(text.classList.contains("truncate")).toBe(false);
    expect(text.classList.contains("break-words")).toBe(true);
    act(() => option.click());
    expect(onToggle).toHaveBeenCalledWith("teste");
    button("Limpar");
    expect(service.mutate).not.toHaveBeenCalled();
  });
});
