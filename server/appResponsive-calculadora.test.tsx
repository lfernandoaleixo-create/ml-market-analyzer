// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import path from "node:path";
import postcss, { type AtRule, type Node, type Rule } from "postcss";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AlphaCalculator from "../client/src/alpha/AlphaCalculator";
import CalculadoraFinal from "../client/src/pages/CalculadoraFinal";
import Calculadora from "../client/src/pages/Calculadora";
import { AlphaIntegrationContext, type AlphaIntegration } from "../client/src/alpha/AlphaIntegrationContext";

const services = vi.hoisted(() => ({
  save: vi.fn(),
  refresh: vi.fn(),
  suggest: vi.fn(),
  attach: vi.fn(),
  refetch: vi.fn(),
  selectedSearch: "",
  longName: `Produto de teste ${"NomeExtensoSemEspacos".repeat(12)}`,
  sku: `SKU-TESTE-${"X".repeat(60)}`,
}));
vi.mock("../client/src/_core/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: 17 }, loading: false }) }));
vi.mock("wouter", () => ({
  useLocation: () => ["/calculadora/final", vi.fn()],
  useSearch: () => services.selectedSearch,
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("../client/src/lib/trpc", () => ({ trpc: {
  useUtils: () => ({ alpha: { documents: { list: { invalidate: vi.fn() } } }, project: { documents: { byProduct: { invalidate: vi.fn() } } } }),
  project: { products: { list: { useQuery: () => ({ data: [{ id: 17, name: services.longName }], isLoading: false }) } } },
  alpha: {
    pricing: { suggestCategory: { useMutation: () => ({ isPending: false, mutate: services.suggest }) } },
    documents: {
      list: { useQuery: () => ({ data: [{ exportId: "teste", filename: "arquivo-teste.pdf", url: "/teste.pdf", description: services.longName, sku: services.sku, createdAt: "2026-01-01T00:00:00Z", projectProductId: 17 }], refetch: services.refetch }) },
      attachPdf: { useMutation: () => ({ mutateAsync: services.attach }) },
    },
  },
} }));
vi.mock("../client/src/alpha/hooks/useProductCatalog", () => ({ useProductCatalog: () => ({
  records: [], active: null, privateOwner: null, isAuthenticated: false, authLoading: false,
  loading: false, busy: false, error: "", save: services.save, refresh: services.refresh,
  open: vi.fn(), remove: vi.fn(), signIn: vi.fn(), clearActive: vi.fn(),
}) }));
vi.mock("sonner", () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }));

const integration: AlphaIntegration = {
  projects: [], selectedProjectProductId: null, selectProjectProduct: vi.fn(),
  freezeDestination: vi.fn(() => ({ ownerId: 17, projectProductId: null, label: "Teste" })),
  persistPdf: vi.fn(async () => ({ url: "/teste.pdf", documentId: null, alreadyExists: false })),
};
const alphaCss = readFileSync(path.resolve("client/src/alpha/alpha.css"), "utf8");
const flowCss = readFileSync(path.resolve("client/src/alpha/components/FlowExplorer.css"), "utf8");
const parsedCss = postcss.parse(`${alphaCss}\n${flowCss}`);

// Inspeção das regras, não motor de layout: cobre somente as media queries usadas
// nestas regressões. Não substitui validação visual em navegador real.
function activeRule(rule: Rule, width: number, height: number, coarse = false) {
  for (let parent: Node | undefined = rule.parent; parent; parent = parent.parent) {
    if (parent.type !== "atrule") continue;
    const media = parent as AtRule;
    if (media.name !== "media") continue;
    const matches = media.params.split(",").some(query => {
      if (/\bprint\b/.test(query)) return false;
      if (/prefers-reduced-motion/.test(query)) return false;
      if (/pointer:\s*coarse/.test(query) && !coarse) return false;
      const conditions = [...query.matchAll(/(min|max)-(width|height):\s*(\d+)px/g)];
      return conditions.every(([, bound, dimension, value]) => {
        const actual = dimension === "width" ? width : height;
        return bound === "max" ? actual <= Number(value) : actual >= Number(value);
      });
    });
    if (!matches) return false;
  }
  return true;
}
function cssProperty(element: Element, prop: string, width: number, height = 900, coarse = false) {
  let found = "";
  let priority = -1;
  parsedCss.walkRules(rule => {
    if (!activeRule(rule, width, height, coarse)) return;
    for (const selector of rule.selectors) {
      let matches = false;
      try { matches = element.matches(selector); } catch { continue; }
      if (!matches) continue;
      // Os seletores verificados aqui só usam classes e tipos (sem :is/:where).
      const specificity = (selector.match(/\.[\w-]+/g)?.length ?? 0) * 10 +
        (selector.match(/(?:^|[\s>+~])(?:button|input|select|h2|svg)\b/g)?.length ?? 0);
      rule.walkDecls(prop, declaration => {
        if (specificity < priority) return;
        priority = specificity;
        found = declaration.value;
      });
    }
  });
  return found;
}

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  (globalThis as { React?: typeof React }).React = React;
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
  services.selectedSearch = "";
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
async function mountAlpha() {
  await act(async () => root.render(
    <AlphaIntegrationContext.Provider value={integration}>
      <div className="alpha-calculator"><AlphaCalculator /></div>
    </AlphaIntegrationContext.Provider>
  ));
}
const element = (selector: string) => {
  const found = container.querySelector(selector);
  expect(found, selector).not.toBeNull();
  return found!;
};

describe("Calculadora Alpha — apresentação responsiva isolada", () => {
  it.each([360, 390, 768, 1024, 1440])("mantém colunas e ações dentro das regras locais em %ipx", async width => {
    await mountAlpha();
    const workspace = element(".workspace");
    const result = element(".result-column");
    expect(cssProperty(workspace, "flex-wrap", width)).toBe("wrap");
    expect(cssProperty(workspace, "flex-direction", width) || "row").toBe(width <= 1100 ? "column" : "row");
    expect(cssProperty(result, "min-width", width)).toBe("0");
    expect(cssProperty(result, "max-width", width)).toBe("100%");
    expect(cssProperty(result, "position", width)).toBe(width <= 1100 ? "static" : "sticky");
    const nav = element(".header-actions");
    expect(nav.querySelectorAll("button")).toHaveLength(4);
    const text = element(".header-actions .nav-text");
    expect(cssProperty(text, "display", width) || "inline").toBe("inline");
    expect(cssProperty(element(".field-row > .field"), "flex-basis", width)).toBe(width <= 600 ? "100%" : "");
    if (width <= 600) {
      expect(cssProperty(nav, "grid-template-columns", width)).toBe("repeat(2, minmax(0, 1fr))");
      expect(cssProperty(element(".packaging-presets"), "grid-template-columns", width)).toBe("minmax(0, 1fr)");
    }
    expect(services.save).not.toHaveBeenCalled();
    expect(services.suggest).not.toHaveBeenCalled();
    expect(services.attach).not.toHaveBeenCalled();
  });

  it("reserva espaço real para o sufixo unidades e permite wrap nos segmentos", async () => {
    await mountAlpha();
    const quantity = element('.quantity-cost-row input[aria-label="Quantidade de unidades"]');
    expect(cssProperty(quantity, "padding-right", 360)).toBe("76px");
    expect(element(".quantity-cost-row .field-suffix").textContent).toBe("unidades");
    await act(async () => (element('button[aria-label="Histórico da calculadora e produtos salvos"]') as HTMLButtonElement).click());
    expect(cssProperty(element(".segment button"), "white-space", 360)).toBe("normal");
    expect(cssProperty(element(".segment button"), "min-height", 360)).toBe("44px");
  });

  it("deixa a ajuda rolável com fechar acessível em toque e mantém ações disponíveis", async () => {
    await mountAlpha();
    await act(async () => (element('button[aria-label="Como funciona a calculadora"]') as HTMLButtonElement).click());
    const modal = element('.modal[role="dialog"]');
    expect(cssProperty(modal, "max-height", 360, 640)).toBe("calc(100dvh - 20px)");
    expect(cssProperty(modal, "overflow-y", 360, 640)).toBe("auto");
    expect(cssProperty(element('.modal-header button[aria-label="Fechar"]'), "min-width", 360)).toBe("44px");
    expect(container.textContent).toContain("Fontes oficiais consultadas");
    expect(services.save).not.toHaveBeenCalled();
    expect(services.attach).not.toHaveBeenCalled();
  });

  it("preserva SKU e dados extensos na central PDF com ações empilháveis", async () => {
    services.selectedSearch = "?productId=17";
    await act(async () => root.render(<CalculadoraFinal />));
    const controls = element("#alpha-project-destination");
    expect(controls.classList.contains("min-w-0")).toBe(true);
    expect(controls.classList.contains("max-w-full")).toBe(true);
    const show = [...container.querySelectorAll("button")].find(button => button.textContent?.includes("Ver PDFs salvos"))!;
    expect(show.parentElement?.classList.contains("flex-col")).toBe(true);
    await act(async () => show.click());
    const link = element('a[href="/teste.pdf"]');
    const documentCard = link.parentElement!.parentElement!;
    expect(documentCard.classList.contains("flex-col")).toBe(true);
    expect(documentCard.textContent).toContain(services.sku);
    expect(documentCard.textContent).toContain(services.longName);
    expect(documentCard.querySelector("p")?.classList.contains("break-words")).toBe(true);
    expect(services.attach).not.toHaveBeenCalled();
    expect(services.save).not.toHaveBeenCalled();
  });

  it("mantém os três modelos visíveis com alternador que quebra títulos longos", async () => {
    await act(async () => root.render(<Calculadora />));
    const modelButtons = [...container.querySelectorAll("button")].filter(button =>
      ["Calculadora Final", "Calculadora de Precificação", "Preço a ser pago para a Matriz"].includes(button.textContent?.trim() ?? "")
    );
    expect(modelButtons).toHaveLength(3);
    expect(modelButtons.every(button => button.classList.contains("whitespace-normal") && button.classList.contains("min-h-11"))).toBe(true);
    expect(modelButtons[0].parentElement?.classList.contains("flex-col")).toBe(true);
  });

  it("remove mínimos fixos dos kits e truncamento do catálogo sem mudar identificação", () => {
    container.innerHTML = '<div class="alpha-calculator"><div class="kit-item-number-fields"></div><button class="kit-item-remove">Remover</button><div class="catalog-card"><h3>Nome completo</h3><div class="catalog-card-details"><span class="catalog-category">Categoria completa</span></div><span class="catalog-sku">SKU original</span></div></div>';
    expect(cssProperty(element(".kit-item-number-fields"), "grid-template-columns", 360)).toBe("minmax(0, 1fr)");
    expect(cssProperty(element(".kit-item-number-fields"), "grid-template-columns", 1024)).toBe("repeat(auto-fit, minmax(min(100%, 140px), 1fr))");
    expect(cssProperty(element(".catalog-card h3"), "white-space", 390)).toBe("normal");
    expect(cssProperty(element(".catalog-category"), "overflow", 390)).toBe("visible");
    expect(cssProperty(element(".catalog-sku"), "overflow-wrap", 390)).toBe("anywhere");
    expect(cssProperty(element(".kit-item-remove"), "min-width", 1440, 900, true)).toBe("44px");
  });

  it("preserva largura desktop e limita o fluxograma a scroll local após seu CSS lazy", () => {
    container.innerHTML = '<div class="alpha-calculator"><div class="workspace"><div class="result-column"></div></div><div class="flow-explorer__overlay"><section class="flow-explorer__dialog"><div class="flow-explorer__viewport"></div><div class="flow-explorer__zoom-group"></div><footer class="flow-explorer__footer-actions"><button class="flow-explorer__apply">Aplicar na calculadora</button></footer></section></div></div>';
    expect(cssProperty(element(".result-column"), "width", 1440)).toBe("420px");
    for (const [width, height] of [[360, 640], [390, 844], [1024, 600]]) {
      expect(cssProperty(element(".flow-explorer__dialog"), "overflow-y", width, height)).toBe("auto");
      expect(cssProperty(element(".flow-explorer__viewport"), "min-height", width, height)).toBe("260px");
      expect(cssProperty(element(".flow-explorer__viewport"), "overflow", width, height)).toBe("auto");
      expect(cssProperty(element(".flow-explorer__zoom-group"), "flex-wrap", width, height)).toBe("wrap");
      expect(cssProperty(element(".flow-explorer__apply"), "white-space", width, height)).toBe("normal");
    }
    expect(cssProperty(element(".flow-explorer__dialog"), "overflow", 1440)).toBe("hidden");
  });
});
