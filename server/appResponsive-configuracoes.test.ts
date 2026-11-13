import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { READ_API_ROUTES, READ_API_SCOPES } from "../shared/readApi";

const state = vi.hoisted(() => ({
  role: "admin",
  pending: false,
  apiError: null as Error | null,
  mutate: vi.fn(),
  mutateAsync: vi.fn(),
  reset: vi.fn(),
  invalidate: vi.fn(),
  refetch: vi.fn(),
}));

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: 900001, role: state.role }, loading: false }),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));
vi.mock("@/lib/trpc", () => {
  const mutation = () => ({
    isPending: state.pending,
    mutate: state.mutate,
    mutateAsync: state.mutateAsync,
    reset: state.reset,
  });
  const query = (data: unknown) => ({ useQuery: () => ({ data }) });
  const invalidation = { invalidate: state.invalidate };
  return {
    trpc: {
      useUtils: () => ({
        market: { status: invalidation },
        monitor: { getCredentials: invalidation, getSchedule: invalidation },
        driveBackup: { status: invalidation },
        readApiKeys: { list: invalidation },
      }),
      market: { status: query(undefined) },
      monitor: {
        getCredentials: query({ status: "unconfigured", configured: true }),
        getSchedule: query({ enabled: false }),
        saveCredentials: { useMutation: mutation },
        testCredentials: { useMutation: mutation },
        setSchedule: { useMutation: mutation },
        setThresholds: { useMutation: mutation },
      },
      driveBackup: {
        status: query({ connected: false, requiresReconnect: true }),
        backupNow: { useMutation: mutation },
        setSchedule: { useMutation: mutation },
        disconnect: { useMutation: mutation },
      },
      readApiKeys: {
        list: {
          useQuery: () => ({
            data: [{
              id: 900002,
              name: "NomeDeTesteSemEspacos".repeat(8),
              prefix: "PREFIXO_FICTICIO_APENAS_TESTE",
              scopes: ["mercado:read"],
              createdAt: new Date("2026-01-01T12:00:00Z"),
              expiresAt: new Date("2099-01-01T12:00:00Z"),
              revokedAt: null,
            }],
            error: state.apiError,
            isLoading: false,
            isFetching: false,
            refetch: state.refetch,
          }),
        },
        create: { useMutation: mutation },
        revoke: { useMutation: mutation },
      },
    },
  };
});

import Configuracoes from "../client/src/pages/Configuracoes";

// SSR + JSDOM are used only to inspect markup/classes, not to simulate a
// browser layout. No handler, effect, OAuth or real service is executed.
function renderPage() {
  const html = renderToStaticMarkup(React.createElement(Configuracoes));
  return new JSDOM(html).window.document;
}
function cardByTitle(document: Document, title: string) {
  const heading = [...document.querySelectorAll("h2")].find(
    node => node.textContent === title
  );
  expect(heading, title).toBeDefined();
  return heading!.closest('[data-slot="card"]')!;
}
function action(element: Element, label: string) {
  const found = [...element.querySelectorAll('[data-slot="button"]')].find(
    node => node.textContent?.trim() === label
  );
  expect(found, label).toBeDefined();
  return found!;
}
function expectClasses(element: Element, ...classes: string[]) {
  for (const value of classes) expect(element.classList.contains(value), value).toBe(true);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("React", React);
  state.role = "admin";
  state.pending = false;
  state.apiError = null;
});
afterEach(() => vi.unstubAllGlobals());

describe("Configurações — proteção de layout responsivo (não é teste visual)", () => {
  it("mantém todos os cartões e grid redutível, conservando duas colunas no desktop", () => {
    const document = renderPage();
    const cards = document.querySelectorAll('[data-slot="card"]');
    expect(cards).toHaveLength(6);
    const credentials = cardByTitle(document, "Credenciais do Mercado Livre");
    expectClasses(credentials, "min-w-0");
    expectClasses(credentials.parentElement!, "grid", "min-w-0", "lg:grid-cols-2", "[&>*]:min-w-0");
    for (const title of ["Monitoramento automático", "Limiares de alerta", "Critérios de potencial", "API de leitura para outra IA"])
      expectClasses(cardByTitle(document, title), "min-w-0");
    expectClasses(cardByTitle(document, "API de leitura para outra IA"), "lg:col-span-2");
  });

  it("permite quebra do selo, empilha ações de credenciais quando não cabem e expande OAuth em altura", () => {
    const document = renderPage();
    const card = cardByTitle(document, "Credenciais do Mercado Livre");
    expectClasses(card.firstElementChild!, "flex-wrap");
    expectClasses(card.querySelector("h2")!.parentElement!, "min-w-0", "basis-[12rem]");
    const save = action(card, "Salvar");
    expectClasses(save.parentElement!, "flex-wrap");
    for (const button of [save, action(card, "Testar credenciais")])
      expectClasses(button, "min-w-0", "basis-[10rem]", "h-auto", "whitespace-normal");
    expectClasses(action(card, "Conectar ao Mercado Livre"), "w-full", "h-auto", "min-h-9", "whitespace-normal");
    for (const trigger of document.querySelectorAll('[data-slot="select-trigger"]:not([disabled])')) {
      // The backup trigger is styled by its dedicated ancestor below.
      if (!trigger.closest('[data-slot="card"]')?.textContent?.includes("Backup redundante"))
        expectClasses(trigger, "w-full", "min-w-0");
    }
  });

  it("contém ajustes de backup no wrapper local sem remover controles ou alterar o componente", () => {
    const document = renderPage();
    const backup = cardByTitle(document, "Backup redundante da Planilha SKU");
    const wrapper = backup.parentElement!;
    expectClasses(wrapper,
      "min-w-0", "[overflow-wrap:anywhere]",
      "[&>[data-slot=card]>div:first-child]:flex-wrap",
      "[&>[data-slot=card]>div:first-child>div:nth-child(2)]:min-w-0",
      "[&_[data-slot=button]]:h-auto",
      "[&_[data-slot=button]]:whitespace-normal",
      "[&_[data-slot=select-trigger]]:w-full",
      "[&_[data-slot=switch]]:ml-3");
    action(backup, "Reconectar Google Drive");
    action(backup, "Fazer backup agora");
    expect(backup.querySelector('[data-slot="switch"]')).not.toBeNull();
    expect(backup.querySelector('[data-slot="select-trigger"]')).not.toBeNull();
    expect(state.mutate).not.toHaveBeenCalled();
    expect(state.mutateAsync).not.toHaveBeenCalled();
  });

  it("mantém todos os escopos, endpoints e ações da API com grupos empilháveis e texto longo redutível", () => {
    const document = renderPage();
    const card = cardByTitle(document, "API de leitura para outra IA");
    expectClasses(card, "[overflow-wrap:anywhere]", "[&_[data-slot=button]]:h-auto", "[&_[data-slot=button]]:whitespace-normal");
    expectClasses(card.querySelector("form")!, "min-w-0");
    expectClasses(card.querySelector("fieldset")!, "min-w-0");
    expect(card.querySelectorAll('[data-slot="checkbox"]')).toHaveLength(READ_API_SCOPES.length);
    for (const route of READ_API_ROUTES) expect(card.textContent).toContain(`GET ${route.path}`);
    const name = [...card.querySelectorAll("li p")].find(node => node.textContent?.startsWith("NomeDeTesteSemEspacos"));
    expectClasses(name!, "break-all");
    for (const label of ["Copiar URL base", "Baixar OpenAPI", "Copiar URL OpenAPI"])
      expectClasses(action(card, label).parentElement!, "flex-col", "sm:flex-row");
    action(card, "Gerar chave de leitura");
    action(card, "Revogar");
    expect(state.mutateAsync).not.toHaveBeenCalled();
  });

  it("conserva o curl completo em rolagem horizontal local e permite foco pelo teclado", () => {
    const document = renderPage();
    const pre = document.querySelector("pre")!;
    expectClasses(pre, "min-w-0", "max-w-full", "overflow-x-auto");
    expect(pre.getAttribute("tabindex")).toBe("0");
    expect(pre.getAttribute("aria-label")).toContain("rolagem horizontal");
    expect(pre.textContent).toContain('curl "/api/public/v1/listings?limit=100&offset=0"');
    expect(pre.textContent).toContain("Authorization: Bearer SUA_CHAVE");
    expect(pre.closest("details")!.querySelector("summary")).not.toBeNull();
    expectClasses(pre.closest("details")!, "min-w-0");
    expect(document.querySelector('a[download="read-api-openapi.json"]')?.getAttribute("href"))
      .toBe("/api/public/v1/openapi.json");
  });

  it("preserva erros e progressos visíveis sem executar mutações e conserva a permissão de administrador", () => {
    state.pending = true;
    state.apiError = new Error("Erro fictício para verificar texto longo ".repeat(8));
    let document = renderPage();
    let card = cardByTitle(document, "API de leitura para outra IA");
    expect(action(card, "Gerando chave…").hasAttribute("disabled")).toBe(true);
    expect(card.querySelector('[role="alert"]')?.textContent).toContain(state.apiError.message);
    action(card, "Tentar novamente");
    state.role = "user";
    document = renderPage();
    card = cardByTitle(document, "API de leitura para outra IA");
    expect(card.textContent).toContain("Somente administradores");
    expect(card.querySelector("form")).toBeNull();
    expect(state.mutateAsync).not.toHaveBeenCalled();
  });
});
