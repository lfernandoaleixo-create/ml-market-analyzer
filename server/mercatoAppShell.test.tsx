// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InstallAppButton } from "../client/src/components/app/InstallAppButton";
import { NetworkStatus } from "../client/src/components/app/NetworkStatus";
import {
  registerMercatoWorker,
  trackMercatoViewport,
} from "../client/src/lib/mercatoPwa";

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function mount(element: React.ReactElement) {
  act(() => root.render(element));
}
function installButton() {
  return document.querySelector<HTMLButtonElement>(
    'button[aria-label="Instalar Mercato"]'
  )!;
}

describe("Instalação e shell do Mercato", () => {
  it("oferece instruções em português se o navegador não disponibiliza prompt", async () => {
    mount(<InstallAppButton />);
    await act(async () => installButton().click());
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain("iPhone e iPad");
    expect(dialog.textContent).toContain("Android");
    expect(dialog.textContent).toContain("Adicionar ao Dock");
    expect(dialog.textContent).toContain("exigem internet");
    expect(dialog.querySelector('img[alt="Toujours"]')).not.toBeNull();
    expect(dialog.textContent).toContain("pode solicitar login novamente");
  });
  it("abre o prompt apenas pelo clique e não declara instalação confirmada só por aceite", async () => {
    mount(<InstallAppButton />);
    const prompt = vi.fn(async () => {});
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.assign(event, {
      prompt,
      userChoice: Promise.resolve({ outcome: "accepted" }),
    });
    act(() => window.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(true);
    expect(prompt).not.toHaveBeenCalled();
    await act(async () => installButton().click());
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toContain("App instalado");
    act(() => window.dispatchEvent(new Event("appinstalled")));
    expect(container.textContent).toContain("App instalado");
    expect(installButton()).toBeNull();
  });
  it("após recusa não reutiliza o prompt consumido e permite consultar instruções", async () => {
    mount(<InstallAppButton />);
    const prompt = vi.fn(async () => {});
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.assign(event, {
      prompt,
      userChoice: Promise.resolve({ outcome: "dismissed" }),
    });
    act(() => window.dispatchEvent(event));
    await act(async () => installButton().click());
    await act(async () => installButton().click());
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  });
  it("falha de prompt preserva acesso ao guia e não trava o aplicativo", async () => {
    mount(<InstallAppButton />);
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.assign(event, {
      prompt: vi.fn(async () => {
        throw new Error("indisponível");
      }),
      userChoice: Promise.resolve({ outcome: "dismissed" }),
    });
    act(() => window.dispatchEvent(event));
    await act(async () => installButton().click());
    expect(installButton().disabled).toBe(false);
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  });
  it("detecta janela standalone sem criar botão de reinstalação", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }))
    );
    mount(<InstallAppButton />);
    expect(container.textContent).toContain("App instalado");
    expect(installButton()).toBeNull();
  });
  it("sinaliza offline sem prometer dados atuais ou gravações offline", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    mount(<NetworkStatus />);
    expect(container.textContent).toContain("podem estar desatualizadas");
    expect(container.textContent).toContain("não agenda gravações offline");
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    act(() => window.dispatchEvent(new Event("online")));
    expect(container.textContent).toBe("");
  });
  it("não registra worker no ambiente de desenvolvimento", async () => {
    const register = vi.fn();
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { register },
    });
    await registerMercatoWorker(false);
    expect(register).not.toHaveBeenCalled();
  });
  it("worker só registra em contexto seguro e sem recarga ou mensagens de atualizar", async () => {
    const register = vi.fn(async () => ({}));
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { register },
    });
    vi.stubGlobal("isSecureContext", true);
    await registerMercatoWorker(true);
    expect(register).toHaveBeenCalledWith("/mercato-sw.js", {
      scope: "/",
      updateViaCache: "none",
    });
  });
  it("falha do worker não derruba login nem aplicativo", async () => {
    const register = vi.fn(async () => {
      throw new Error("falha");
    });
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { register },
    });
    vi.stubGlobal("isSecureContext", true);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await registerMercatoWorker(true)).toBeUndefined();
  });
  it("acompanha altura/offset do teclado e remove os listeners ao encerrar", () => {
    const viewport = Object.assign(new EventTarget(), {
      height: 720,
      offsetTop: 0,
    });
    vi.stubGlobal("visualViewport", viewport);
    const cleanup = trackMercatoViewport();
    expect(
      document.documentElement.style.getPropertyValue(
        "--mercato-visible-height"
      )
    ).toBe("720px");
    viewport.height = 320;
    viewport.offsetTop = 45;
    viewport.dispatchEvent(new Event("resize"));
    expect(
      document.documentElement.style.getPropertyValue(
        "--mercato-visible-height"
      )
    ).toBe("320px");
    expect(
      document.documentElement.style.getPropertyValue("--mercato-visible-top")
    ).toBe("45px");
    cleanup();
    viewport.height = 200;
    viewport.dispatchEvent(new Event("resize"));
    expect(
      document.documentElement.style.getPropertyValue(
        "--mercato-visible-height"
      )
    ).toBe("320px");
  });
});
