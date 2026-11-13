// @vitest-environment jsdom
// Autoria: Manus e Fernando. Contratos de classes/DOM não substituem teste visual real.
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Projeto from "../client/src/pages/project/Projeto";
import ProjetoPainel from "../client/src/pages/project/ProjetoPainel";
import ProjetoProduto from "../client/src/pages/project/ProjetoProduto";
import ProjetoTimeline from "../client/src/pages/project/ProjetoTimeline";
import ProjetoAnalise from "../client/src/pages/project/ProjetoAnalise";
import ProjectProductCard from "../client/src/components/project/ProjectProductCard";
import { GuestNameDialog } from "../client/src/components/project/GuestNameDialog";

const services = vi.hoisted(() => ({ mutate: vi.fn(), mutateAsync: vi.fn(), navigate: vi.fn(), refetch: vi.fn() }));
const fixture = vi.hoisted(() => {
  const product = {
    id: 731, name: "Produto sintético com nome longo para leitura completa no celular",
    priority: "media" as const, currentStep: "fornecedor", supplier: "Fornecedor sintético",
    supplierContact: "contato-sintetico@example.invalid", description: "Descrição sintética",
    notes: "Observações de teste", expectedArrival: new Date("2099-04-20T12:00:00Z"),
    updatedAt: new Date("2026-01-01T12:00:00Z"), completedCount: 1, progressPct: 10,
    steps: ["fornecedor", "amostra", "pedido", "producao", "inspecao", "embarque", "transito", "desembaraco", "recebimento", "lancamento"].map((key, index) => ({ key, status: index === 0 ? "concluido" : "pendente" })),
  };
  const dynamicSteps = [
    { stageId: 1, label: "Preparação inicial do produto", done: true, note: null },
    { stageId: 2, label: "Conferência de documentação e acompanhamento do fornecedor", done: false, note: "Nota sintética comprida para verificar quebra no celular" },
  ];
  return {
    product, dynamicSteps,
    docs: [{ id: 1, name: "documento-sintetico-com-nome-longo-sem-espacos-para-teste.pdf", url: "https://example.invalid/synthetic.pdf", type: "documento" }],
    todos: [{ id: 1, title: "Tarefa sintética com texto longo para quebra", completed: false }],
    comments: [{ id: 1, userId: 1, authorName: "Autor sintético com nome longo", content: "Comentário sintético", createdAt: new Date("2026-01-01T12:00:00Z") }],
  };
});
vi.mock("@/lib/trpc", () => {
  const query = (data: unknown) => ({ useQuery: () => ({ data, isLoading: false, refetch: services.refetch }) });
  const mutation = { useMutation: () => ({ mutate: services.mutate, mutateAsync: services.mutateAsync, isPending: false }) };
  return { trpc: {
    project: {
      products: { list: query([fixture.product]), byId: query(fixture.product), dashboardOverview: query([fixture.product]), timelineOverview: query([fixture.product]), create: mutation, update: mutation, delete: mutation },
      todos: { byProduct: query(fixture.todos), create: mutation, update: mutation, delete: mutation },
      documents: { byProduct: query(fixture.docs), upload: mutation, delete: mutation },
      comments: { list: query(fixture.comments), create: mutation, delete: mutation },
    },
    luisTimeline: {
      overview: query({ stages: fixture.dynamicSteps.map(s => ({ id: s.stageId, label: s.label })), products: [{ id: fixture.product.id, steps: fixture.dynamicSteps }] }),
      progress: { setDone: mutation, setNote: mutation },
    },
  } };
});
vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ isAuthenticated: true, user: { id: 1 } }) }));
vi.mock("@/hooks/useGuestName", () => ({ useGuestName: () => ({ guestName: "Visitante sintético", setGuestName: vi.fn() }) }));
vi.mock("wouter", () => ({ useLocation: () => ["/projeto", services.navigate], useParams: () => ({ id: "731" }), useRoute: () => [false], Route: () => null, Switch: () => null }));
// Os gráficos Recharts requerem medidas de layout reais; só o SVG próprio/tabela é avaliado aqui.
vi.mock("recharts", async importOriginal => ({ ...(await importOriginal<typeof import("recharts")>()), ResponsiveContainer: () => null }));

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  expect(services.mutate).not.toHaveBeenCalled();
  expect(services.mutateAsync).not.toHaveBeenCalled();
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
function render(element: React.ReactElement) { act(() => root.render(element)); }
function byText(text: string, scope: ParentNode = container) {
  const button = Array.from(scope.querySelectorAll("button")).find(node => node.textContent?.trim() === text);
  expect(button, text).toBeDefined();
  return button!;
}
function click(text: string) { act(() => byText(text).click()); }
function columnsAt(element: Element, width: number) {
  const breakpoints: Record<string, number> = { sm: 640, md: 768, lg: 1024, xl: 1280 };
  return element.className.split(" ").flatMap(token => {
    const match = token.match(/^(?:(sm|md|lg|xl):)?grid-cols-(\d+)$/);
    if (!match) return [];
    const min = match[1] ? breakpoints[match[1]] : 0;
    return width >= min ? [{ min, columns: Number(match[2]) }] : [];
  }).sort((a, b) => b.min - a.min)[0]?.columns;
}
function checkDialog() {
  const dialog = document.querySelector('[data-slot="dialog-content"]')!;
  expect(dialog).not.toBeNull();
  expect(dialog.classList.contains("max-h-[calc(100dvh-2rem)]")).toBe(true);
  expect(dialog.classList.contains("overflow-y-auto")).toBe(true);
  expect(dialog.querySelector('[data-slot="dialog-footer"]')).not.toBeNull();
}

describe("Projeto — contratos responsivos de classes e DOM com serviços simulados", () => {
  it.each([[360, 1], [390, 1], [768, 2], [1024, 3], [1440, 4]])("mantém grade planejada e filtros sem largura mínima rígida em %ipx", (width, columns) => {
    render(<ProjetoPainel />);
    const card = container.querySelector("h3")!.closest("button")!;
    expect(columnsAt(card.parentElement!, width)).toBe(columns);
    const search = container.querySelector('input[placeholder="Buscar produto..."]')!.parentElement!;
    expect(search.classList.contains("w-full")).toBe(true);
    expect(search.classList.contains("min-w-0")).toBe(true);
    expect(search.classList.contains("min-w-[200px]")).toBe(false);
    const triggers = container.querySelectorAll('[data-slot="select-trigger"]');
    expect(triggers).toHaveLength(2);
    triggers.forEach(trigger => {
      expect(trigger.classList.contains("w-full")).toBe(true);
      expect(trigger.classList.contains("min-w-0")).toBe(true);
    });
    expect(byText("Novo Produto").classList.contains("w-full")).toBe(true);
    expect(byText("Novo Produto").parentElement!.classList.contains("flex-col")).toBe(true);
  });

  it("lista móvel mantém etapa, progresso e nome completos em vez de hidden", () => {
    render(<ProjectProductCard product={fixture.product} viewMode="list" onClick={services.navigate} completedCount={1} totalSteps={2} progressPct={50} currentStageLabel="Etapa sintética extensa" />);
    const card = container.querySelector("button")!;
    expect(card.textContent).toContain("Etapa sintética extensa");
    expect(card.textContent).toContain("50%");
    expect(card.querySelector(".hidden")).toBeNull();
    expect(card.querySelector(".truncate")).toBeNull();
    expect(card.querySelector("h3")!.classList.contains("break-words")).toBe(true);
    act(() => card.click());
    expect(services.navigate).toHaveBeenCalledOnce();
  });

  it("dossiê deixa documentos legíveis e ações de toque/foco sem remover permissões", () => {
    render(<ProjetoProduto />);
    const link = container.querySelector(`a[href="${fixture.docs[0].url}"]`)!;
    expect(link.textContent).toBe(fixture.docs[0].name);
    expect(link.classList.contains("break-words")).toBe(true);
    expect(link.classList.contains("truncate")).toBe(false);
    for (const label of ["Excluir documento", "Excluir tarefa", "Excluir comentário"]) {
      const action = container.querySelector(`button[aria-label="${label}"]`)!;
      expect(action.classList.contains("opacity-100")).toBe(true);
      expect(action.classList.contains("focus-visible:opacity-100")).toBe(true);
      expect(action.classList.contains("[@media(hover:hover)]:opacity-0")).toBe(true);
      expect(action.classList.contains("opacity-0")).toBe(false);
    }
    const title = container.querySelector("h1")!;
    expect(title.classList.contains("basis-full")).toBe(true);
    expect(title.classList.contains("break-words")).toBe(true);
    const pending = Array.from(container.querySelectorAll("span")).find(node => node.textContent === "Pendente")!;
    expect(pending.classList.contains("hidden")).toBe(false);
    click("Editar");
    expect(byText("Salvar").parentElement!.classList.contains("flex-wrap")).toBe(true);
    expect(container.querySelector('input[value="' + fixture.product.name + '"]')).not.toBeNull();
  });

  it.each(["Novo Produto", "Nova", "etapa", "visitante"])("modal %s fica limitado à altura dinâmica e rolável sem salvar", (modal) => {
    if (modal === "Novo Produto") { render(<ProjetoPainel />); click(modal); }
    else if (modal === "visitante") { render(<GuestNameDialog open onConfirm={services.mutate} onCancel={vi.fn()} />); }
    else {
      render(<ProjetoProduto />);
      if (modal === "Nova") click("Nova");
      else {
        const stage = Array.from(container.querySelectorAll("button")).find(node => node.textContent?.includes(fixture.dynamicSteps[1].label))!;
        act(() => stage.click());
      }
    }
    checkDialog();
  });

  it("cronograma usa scroll local nas dez etapas, sem comprimir os rótulos", () => {
    render(<ProjetoTimeline />);
    const track = container.querySelector('.min-w-\\[560px\\]')!;
    expect(track).not.toBeNull();
    expect(track.parentElement!.classList.contains("overflow-x-auto")).toBe(true);
    expect(track.parentElement!.classList.contains("max-w-full")).toBe(true);
    expect(track.querySelectorAll('[title]')).toHaveLength(10);
    const productName = container.querySelector("h3")!;
    expect(productName.classList.contains("break-words")).toBe(true);
    expect(container.textContent).toContain("1 de 10 etapas concluídas");
  });

  it("Análise mantém gráfico e tabela completos em rolagem local e detalhes expansíveis por toque", () => {
    render(<ProjetoAnalise />);
    const graph = container.querySelector('[aria-label="Gráfico de progresso dos produtos com rolagem horizontal"]')!;
    expect(graph.classList.contains("overflow-x-auto")).toBe(true);
    expect(graph.classList.contains("min-w-0")).toBe(true);
    expect(graph.getAttribute("tabindex")).toBe("0");
    const details = container.querySelector("details")!;
    expect(details.querySelector("summary")!.textContent).toContain("toque ou clique");
    details.open = true;
    expect(details.open).toBe(true);
    const table = details.querySelector("table")!;
    expect(table.querySelectorAll("th")).toHaveLength(7);
    expect(table.querySelectorAll("tbody tr")).toHaveLength(1);
    expect(table.querySelector(".hidden, .truncate")).toBeNull();
    expect(table.parentElement!.classList.contains("overflow-x-auto")).toBe(true);
    expect(table.parentElement!.classList.contains("max-w-full")).toBe(true);
    expect(table.querySelector("a")!.getAttribute("href")).toBe("/projeto/produto/731");
    expect(table.textContent).toContain(fixture.product.name);
    expect(table.textContent).toContain("10%");
  });

  it("três abas seguem presentes, flexíveis e sem funcionalidades ocultadas", () => {
    render(<Projeto />);
    for (const label of ["Painel", "Cronograma", "Análise"]) {
      const tab = byText(label);
      expect(tab.classList.contains("flex-1")).toBe(true);
      expect(tab.classList.contains("sm:flex-none")).toBe(true);
      expect(tab.classList.contains("hidden")).toBe(false);
      expect(tab.querySelector("svg")!.classList.contains("shrink-0")).toBe(true);
    }
  });
});
