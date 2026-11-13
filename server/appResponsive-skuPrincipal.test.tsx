// @vitest-environment jsdom
// Autoria: Manus e Fernando. jsdom valida DOM/classes, não medidas de layout ou CSS real.
import React, { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SkuStyleSheet, { type SkuStyleBinding } from "../client/src/pages/pedro/SkuStyleSheet";

const services = vi.hoisted(() => ({
  verifyPassword: vi.fn(), historyQuery: vi.fn(), navigate: vi.fn(),
  exportExcel: vi.fn(), exportPdf: vi.fn(), clipboard: vi.fn(), network: vi.fn(),
}));
vi.mock("@/lib/trpc", () => ({ trpc: {
  auth: { verifyPassword: { useMutation: () => ({ mutate: services.verifyPassword, isPending: false }) } },
  skuSheet: { skuChangeHistory: { useQuery: (input: unknown) => {
    services.historyQuery(input);
    return { isLoading: false, data: [{
      timestamp: 0, authorizedBy: "Pessoa sintética", action: "Teste",
      description: "Descrição sintética longa ".repeat(20), affectedCount: 1,
    }] };
  } } },
} }));
vi.mock("wouter", () => ({ useLocation: () => ["/sku", services.navigate] }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("../client/src/pages/pedro/sheetExport", () => ({
  exportToExcel: services.exportExcel, exportToPdf: services.exportPdf,
}));
// O card de variações e as abas têm cobertura própria; aqui avaliamos somente a planilha principal.
vi.mock("../client/src/pages/pedro/SheetTabs", () => ({ default: () => <nav aria-label="Abas simuladas" /> }));
vi.mock("../client/src/pages/pedro/SkuVariationsPopover", () => ({ default: ({ children }: { children: ReactNode }) => <>{children}</> }));

const widths = [360, 390, 768, 1024, 1440];
const customName = "Coluna sintética muito longa ".repeat(8);
const kitSku = "KIT-SINTETICO-SEM-DADOS-REAIS-".repeat(10);
const mainSku = "SKU-SINTETICO-SEM-DADOS-REAIS-".repeat(10);
const customColumns = Array.from({ length: 18 }, (_, index) => ({ id: index + 1, position: index + 1, name: index === 0 ? customName : `Extra sintética ${index + 1}` }));
const fixtureRows: NonNullable<SkuStyleBinding["rows"]> = [{
  id: 731, position: 73, productNumber: 88, variantNumber: 91,
  cadastradoMl: "PENDENTE", tipoSku: "2", categoryId: "teste", categoryName: "Categoria sintética",
  subCategoryId: "subteste", subCategoryName: "Subcategoria sintética", produto: "Produto sintético editável",
  variante: "Variante sintética", sku: "", gerarSkuKit: false, skuKit: kitSku,
  skuMode: "pending", revision: 7, mainMlb: "MLB-SINTETICO", mainDone: false,
  eanGtin: "EAN-SINTETICO", ncm: "NCM-SINTETICO", gpc: "GPC-SINTETICO", cest: "CEST-SINTETICO",
  precoClassico: "10,01", precoPremium: "12,01", precoAtacado: "8,01",
  embProfundidade: "11", embLargura: "12", embAltura: "13", embPeso: "0,5",
  caracteristicas: "Características sintéticas ".repeat(20), rowColor: "",
  customValues: '{"1":"Valor sintético"}',
}, {
  id: 732, position: 74, productNumber: 89, variantNumber: 92,
  cadastradoMl: "ATIVO", tipoSku: "2", categoryId: "teste", categoryName: "Categoria sintética",
  subCategoryId: "subteste", subCategoryName: "Subcategoria sintética", produto: "Produto sintético bloqueado",
  variante: "Outra variante", sku: mainSku, gerarSkuKit: true, skuKit: kitSku,
  skuMode: "manual", revision: 8, mainMlb: "MLB-SINTETICO-B", mainDone: false,
  eanGtin: "EAN-B", ncm: "NCM-B", gpc: "GPC-B", cest: "CEST-B",
  precoClassico: "20,01", precoPremium: "22,01", precoAtacado: "18,01",
  embProfundidade: "21", embLargura: "22", embAltura: "23", embPeso: "1,5",
  caracteristicas: "Características bloqueadas", rowColor: "", customValues: null,
}];

let root: Root;
let container: HTMLDivElement;
let binding: SkuStyleBinding;
let initialRows: string;
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("fetch", services.network);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: services.clipboard } });
  binding = {
    rows: fixtureRows.map(row => ({ ...row })), isLoading: false,
    categories: [{ id: "teste", name: "Categoria sintética", children: [{ id: "subteste", name: "Subcategoria sintética" }] }],
    customColumns, createPending: false, supportsSkuDecisions: true,
    update: vi.fn(), create: vi.fn(), remove: vi.fn(), createColumn: vi.fn(),
    renameColumn: vi.fn(), deleteColumn: vi.fn(), setCustomValue: vi.fn(),
  };
  initialRows = JSON.stringify(binding.rows);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  for (const operation of [binding.update, binding.create, binding.remove, binding.createColumn,
    binding.renameColumn, binding.deleteColumn, binding.setCustomValue,
    services.verifyPassword, services.exportExcel, services.exportPdf, services.network, services.navigate]) {
    expect(operation).not.toHaveBeenCalled();
  }
  expect(JSON.stringify(binding.rows)).toBe(initialRows);
  vi.clearAllTimers();
  vi.useRealTimers();
  document.body.replaceChildren();
  document.body.removeAttribute("style");
  Reflect.deleteProperty(navigator, "clipboard");
  vi.unstubAllGlobals();
});
function render(props: Partial<React.ComponentProps<typeof SkuStyleSheet>> = {}) {
  act(() => root.render(<SkuStyleSheet binding={binding} title="Planilha SKU sintética" subtitle="Subtítulo sintético" exportTitle="Exportação sintética" {...props} />));
}
function button(label: string, scope: ParentNode = document): HTMLButtonElement {
  const match = Array.from(scope.querySelectorAll<HTMLButtonElement>("button")).find(element =>
    element.getAttribute("aria-label") === label || element.textContent?.trim() === label,
  );
  expect(match, `Botão ${label}`).toBeDefined();
  return match!;
}
function click(label: string, scope: ParentNode = document) { act(() => button(label, scope).click()); }
function dialog() { return document.querySelector<HTMLElement>('[data-slot="dialog-content"]')!; }
function region() { return container.querySelector<HTMLElement>('[aria-label="Planilha completa com rolagem horizontal e vertical"]')!; }
function expectWindow(element: HTMLElement) {
  expect(element).not.toBeNull();
  expect(element.classList.contains("min-w-0")).toBe(true);
  expect(element.classList.contains("max-w-[calc(100%-2rem)]")).toBe(true);
  expect(element.classList.contains("max-h-[calc(100dvh-2rem)]")).toBe(true);
}
function expectScrollableBodyWithFooter(element: HTMLElement) {
  expectWindow(element);
  expect(element.classList.contains("flex-col")).toBe(true);
  expect(element.classList.contains("overflow-hidden")).toBe(true);
  const footer = element.querySelector<HTMLElement>('[data-slot="dialog-footer"]')!;
  expect(footer.classList.contains("shrink-0")).toBe(true);
  const body = footer.previousElementSibling!;
  expect(body.classList.contains("min-h-0")).toBe(true);
  expect(body.classList.contains("overflow-y-auto")).toBe(true);
  return body;
}

const fixedHeaders = ["#", "Cadastrado ML", "Tipo SKU", "Categoria", "Subcategoria", "Nº", "Produto", "Nº",
  "Variante", "SKU", "Gerar Kit?", "SKU Kit Base", "NCM", "GPC", "CEST", "Preço Clássico", "Preço Premium",
  "Preço Atacado", "Emb. Prof.", "Emb. Larg.", "Emb. Alt.", "Peso (kg)", "Características"];

describe("Planilha SKU principal — contratos responsivos de UI com serviços simulados", () => {
  it.each(widths)("preserva tabela completa, numeração e toolbar flexível em viewport simulada %ipx", width => {
    vi.stubGlobal("innerWidth", width);
    render();
    // Não inferimos medidas a partir de innerWidth: jsdom não executa os breakpoints CSS.
    expect(container.firstElementChild!.classList.contains("min-w-0")).toBe(true);
    expect(container.firstElementChild!.classList.contains("max-w-full")).toBe(true);
    const search = container.querySelector<HTMLInputElement>('input[aria-label="Buscar na planilha"]')!;
    expect(search.classList.contains("w-full")).toBe(true);
    expect(search.classList.contains("w-60")).toBe(false);
    expect(search.parentElement!.classList.contains("sm:w-60")).toBe(true);
    const toolbar = search.parentElement!.parentElement!;
    for (const name of ["flex-wrap", "min-w-0", "w-full", "max-w-full", "lg:w-auto"]) expect(toolbar.classList.contains(name)).toBe(true);
    for (const label of ["Colunas", "Exportar", "Histórico", "Nova linha"]) button(label, toolbar);
    const scroll = region();
    for (const name of ["min-w-0", "max-w-full", "overflow-x-auto", "overflow-y-auto", "overscroll-contain", "[zoom:1]", "lg:[zoom:0.85]", "max-h-[60dvh]", "lg:max-h-[calc(100dvh-220px)]"]) expect(scroll.classList.contains(name)).toBe(true);
    expect(scroll.style.getPropertyValue("zoom")).toBe("");
    expect(scroll.tabIndex).toBe(0);
    expect(scroll.getAttribute("role")).toBe("region");
    const headers = Array.from(scroll.querySelectorAll("thead th"));
    expect(headers.map(header => header.textContent?.trim())).toEqual([...fixedHeaders, ...customColumns.map(column => column.name.trim()), "Ações"]);
    expect(scroll.querySelector("thead")!.classList.contains("sticky")).toBe(true);
    const rows = scroll.querySelectorAll("tbody tr");
    expect(rows).toHaveLength(binding.rows!.length);
    rows.forEach((row, index) => {
      expect(row.children).toHaveLength(headers.length);
      expect(row.children[0].textContent).toBe(String(index + 1));
      expect(row.children[5].textContent).toBe(String(binding.rows![index].productNumber));
      expect(row.children[7].textContent).toBe(String(binding.rows![index].variantNumber));
      const actions = row.lastElementChild!;
      expect(actions.classList.contains("sticky")).toBe(false);
      expect(actions.classList.contains("sm:sticky")).toBe(true);
      expect(button("Editar linha", actions).disabled).toBe(index === 1);
    });
    expect(scroll.querySelector(".hidden, .truncate")).toBeNull();
    expect(scroll.textContent).toContain(kitSku);
    expect(scroll.querySelector<HTMLInputElement>('input[value="GPC-SINTETICO"]')!.value).toBe("GPC-SINTETICO");
  });

  it("mantém cópia visível no toque, revelada por foco e com clipboard exclusivamente simulado", () => {
    render();
    const copy = button("Copiar SKU", region());
    for (const name of ["opacity-100", "group-focus-within/sku:opacity-100", "focus-visible:opacity-100", "h-10", "w-10", "focus-visible:ring-2"]) expect(copy.classList.contains(name)).toBe(true);
    expect(copy.classList.contains("opacity-0")).toBe(false);
    expect(copy.classList.contains("[@media(hover:hover)_and_(pointer:fine)]:opacity-0")).toBe(true);
    act(() => copy.focus());
    expect(document.activeElement).toBe(copy);
    act(() => copy.click());
    expect(services.clipboard).toHaveBeenCalledOnce();
    expect(services.clipboard).toHaveBeenCalledWith(kitSku);
    act(() => vi.advanceTimersByTime(1500));
    const skuTrigger = button("Escolher como definir o SKU", region());
    expect(skuTrigger.classList.contains("focus-visible:ring-2")).toBe(true);
    expect(skuTrigger.classList.contains("h-10")).toBe(true);
    expect(button("Editar linha", region()).classList.contains("h-10")).toBe(true);
  });

  it.each(widths)("colunas: criação empilhável, corpo rolável e Fechar fora da rolagem em %ipx", width => {
    vi.stubGlobal("innerWidth", width);
    render(); click("Colunas");
    const body = expectScrollableBodyWithFooter(dialog());
    const input = body.querySelector<HTMLInputElement>('input[placeholder="Nome da nova coluna (ex.: Fornecedor)"]')!;
    expect(input.parentElement!.classList.contains("flex-col")).toBe(true);
    expect(input.parentElement!.classList.contains("sm:flex-row")).toBe(true);
    expect(input.classList.contains("min-w-0")).toBe(true);
    expect(body.querySelectorAll("input")).toHaveLength(customColumns.length + 1);
    expect(body.querySelector<HTMLInputElement>(`input[value="${customName}"]`)).not.toBeNull();
    button("Criar", dialog()); button("Excluir coluna", dialog());
    click("Fechar", dialog());
  });

  it.each(widths)("edição: mantém campos, SKU longo e ações fora do corpo rolável em %ipx", width => {
    vi.stubGlobal("innerWidth", width);
    // Expõe um SKU longo sem desbloquear via senha nem alterar regras de bloqueio: variante vazia é editável.
    const editFixture = { ...binding.rows![0], sku: mainSku, variante: "" };
    binding.rows = [editFixture];
    initialRows = JSON.stringify(binding.rows);
    render(); click("Editar linha", region());
    const body = expectScrollableBodyWithFooter(dialog());
    expect(body.classList.contains("grid-cols-1")).toBe(true);
    expect(body.classList.contains("sm:grid-cols-2")).toBe(true);
    expect(body.classList.contains("[&>div]:min-w-0")).toBe(true);
    const expectedLabels = ["Cadastrado ML", "Tipo SKU", "Categoria", "Subcategoria", "Produto (nome)", "Variante",
      "Nº da variante (permanente)", "Gerar SKU Kit?", "Nº do produto (auto)", "SKU (auto)", "SKU Kit (auto)",
      "EAN/GTIN", "NCM", "GPC", "CEST", "Preço Clássico", "Preço Premium", "Preço Atacado", "Emb. Profundidade",
      "Emb. Largura", "Emb. Altura", "Peso (kg)", "Características", ...customColumns.map(column => column.name.trim())];
    expect(Array.from(body.querySelectorAll("label")).map(label => label.textContent?.trim())).toEqual(expectedLabels);
    const main = Array.from(body.querySelectorAll("label")).find(label => label.textContent === "SKU (auto)")!.nextElementSibling!;
    expect(main.textContent).toBe(mainSku);
    expect(main.classList.contains("[overflow-wrap:anywhere]")).toBe(true);
    const kit = Array.from(body.querySelectorAll("label")).find(label => label.textContent === "SKU Kit (auto)")!.nextElementSibling!;
    expect(kit.textContent).toBe(kitSku);
    expect(kit.classList.contains("overflow-x-auto")).toBe(true);
    const permanentNumber = body.querySelector<HTMLInputElement>('input[value="91"]')!;
    expect(permanentNumber.disabled).toBe(true);
    button("Salvar", dialog()); click("Cancelar", dialog());
  });

  it.each(["linha", "coluna", "senha"])("confirmação %s é limitada/rolável; abrir e cancelar não salva", kind => {
    render();
    if (kind === "linha") click("Excluir linha", region());
    if (kind === "coluna") { click("Colunas"); click("Excluir coluna", dialog()); }
    if (kind === "senha") click("Desbloquear linha", region());
    const confirmation = document.querySelector<HTMLElement>('[data-slot="alert-dialog-content"]')!;
    expectWindow(confirmation);
    expect(confirmation.classList.contains("overflow-y-auto")).toBe(true);
    if (kind === "senha") {
      expect(confirmation.querySelector('input[type="password"]')).not.toBeNull();
      expect(button("Desbloquear", confirmation).disabled).toBe(true);
    } else button(kind === "linha" ? "Sim, excluir logicamente" : "Excluir", confirmation);
    click("Cancelar", confirmation);
  });

  it("histórico mantém todas as cinco colunas em rolagem local dentro da janela", () => {
    render(); click("Histórico");
    expectWindow(dialog());
    const history = dialog().querySelector<HTMLElement>('[aria-label="Histórico de SKU com rolagem horizontal e vertical"]')!;
    for (const name of ["min-w-0", "min-h-0", "max-w-full", "overflow-x-auto", "overflow-y-auto"]) expect(history.classList.contains(name)).toBe(true);
    expect(history.tabIndex).toBe(0);
    expect(history.querySelectorAll("thead th")).toHaveLength(5);
    expect(history.querySelector("table")!.classList.contains("min-w-[640px]")).toBe(true);
    expect(services.historyQuery).toHaveBeenCalledWith({ limit: 100 });
  });

  it("a seleção e ações extras continuam no DOM com wrappers flexíveis, sem mudar marcações", () => {
    const onToggle = vi.fn(); const onToggleAll = vi.fn();
    render({
      headerExtra: <button>Ação extra sintética</button>,
      selection: { selectedIds: [731], onToggle, onToggleAll, renderBar: () => <button>Ação de seleção sintética</button> },
    });
    const bar = button("Ação de seleção sintética").parentElement!;
    expect(bar.classList.contains("flex-wrap")).toBe(true);
    expect(bar.parentElement!.classList.contains("flex-wrap")).toBe(true);
    button("Ação extra sintética");
    const checkbox = region().querySelector<HTMLInputElement>('input[aria-label="Selecionar linha 1"]')!;
    expect(checkbox.checked).toBe(true);
    expect(onToggle).not.toHaveBeenCalled(); expect(onToggleAll).not.toHaveBeenCalled();
  });
});
