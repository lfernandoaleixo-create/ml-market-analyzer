// @vitest-environment jsdom
// Autoria: Manus e Fernando. TanStack/React reais; nenhuma API ou banco.
import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  MutationCache,
  MutationObserver,
  QueryClient,
  onlineManager,
} from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMercatoMutationCache,
  installOnlineInteractionGuard,
  MERCATO_OFFLINE_MESSAGE,
} from "../client/src/lib/mercatoOnlineMutations";

let client: QueryClient;
let cleanups: Array<() => void>;
let root: Root | undefined;
let container: HTMLDivElement;
function browserOnline(online: boolean) {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(online);
}
function connection(browser: boolean, manager = browser) {
  browserOnline(browser);
  onlineManager.setOnline(manager);
}
function guard(notify = vi.fn()) {
  const cleanup = installOnlineInteractionGuard(notify);
  cleanups.push(cleanup);
  return { notify, cleanup };
}
function dispatch(element: Element, type: string) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  act(() => {
    element.dispatchEvent(event);
  });
  return event;
}
function button(label: string) {
  return [...container.querySelectorAll<HTMLButtonElement>("button")].find(
    node =>
      node.getAttribute("aria-label") === label || node.textContent === label
  )!;
}
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  connection(true);
  cleanups = [];
  client = new QueryClient({
    mutationCache: createMercatoMutationCache(),
    defaultOptions: {
      mutations: { networkMode: "always", retry: false, gcTime: Infinity },
    },
  });
  client.mount(); // A real onlineManager subscription exercises automatic resume.
  container = document.createElement("div");
  document.body.append(container);
});
afterEach(() => {
  cleanups.forEach(cleanup => cleanup());
  if (root) act(() => root!.unmount());
  root = undefined;
  client.unmount();
  client.clear();
  onlineManager.setOnline(true);
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Mercato mutation cache — no offline queue", () => {
  it.each([
    [false, true],
    [true, false],
    [false, false],
  ])(
    "rejects when browser=%s and onlineManager=%s, before any optimistic hook/API",
    async (browser, manager) => {
      connection(browser, manager);
      const localOnMutate = vi.fn(() =>
        client.setQueryData(["sku"], "SKU-OTIMISTA")
      );
      const mutationFn = vi.fn(async () => "gravado");
      const onError = vi.fn();
      const observer = new MutationObserver(client, {
        mutationFn,
        onMutate: localOnMutate,
        onError,
      });
      client.setQueryData(["sku"], "SKU-ORIGINAL");
      const states: Array<{ status: string; isPaused: boolean }> = [];
      cleanups.push(
        observer.subscribe(result =>
          states.push({ status: result.status, isPaused: result.isPaused })
        )
      );
      await expect(observer.mutate(undefined)).rejects.toThrow(
        MERCATO_OFFLINE_MESSAGE
      );
      expect(client.getMutationCache()).toBeInstanceOf(MutationCache);
      expect(observer.getCurrentResult()).toMatchObject({
        status: "error",
        isPaused: false,
      });
      expect(states.every(state => !state.isPaused)).toBe(true);
      expect(onError).toHaveBeenCalledOnce();
      expect(localOnMutate).not.toHaveBeenCalled();
      expect(mutationFn).not.toHaveBeenCalled();
      expect(client.getQueryData(["sku"])).toBe("SKU-ORIGINAL");
      connection(true);
      await client.resumePausedMutations();
      expect(observer.getCurrentResult().status).toBe("error");
      expect(mutationFn).not.toHaveBeenCalled();
    }
  );

  it("preserves local onMutate context and the normal online success path", async () => {
    const context = { previousSku: "SKU-ORIGINAL" };
    const onMutate = vi.fn(() => context);
    const mutationFn = vi.fn(async (sku: string) => sku);
    const onSuccess = vi.fn();
    const observer = new MutationObserver(client, {
      mutationFn,
      onMutate,
      onSuccess,
    });
    await expect(observer.mutate("SKU-ONLINE")).resolves.toBe("SKU-ONLINE");
    expect(onMutate).toHaveBeenCalledOnce();
    expect(mutationFn).toHaveBeenCalledOnce();
    expect(onSuccess.mock.calls[0][2]).toBe(context);
    expect(observer.getCurrentResult()).toMatchObject({
      status: "success",
      context,
      isPaused: false,
    });
  });

  it("does not retry a request started online that fails after losing connection", async () => {
    let fail!: (error: Error) => void;
    const mutationFn = vi.fn(
      () =>
        new Promise<string>((_resolve, reject) => {
          fail = reject;
        })
    );
    const observer = new MutationObserver(client, { mutationFn });
    const pending = observer.mutate();
    const rejection = expect(pending).rejects.toThrow("Conexão perdida");
    await vi.waitFor(() => expect(mutationFn).toHaveBeenCalledOnce());
    connection(false);
    fail(new Error("Conexão perdida"));
    await rejection;
    expect(observer.getCurrentResult()).toMatchObject({
      status: "error",
      isPaused: false,
    });
    connection(true);
    await client.resumePausedMutations();
    expect(mutationFn).toHaveBeenCalledOnce();
    expect(observer.getCurrentResult().status).toBe("error");
  });
});

function SyntheticSku({
  changed,
  clicked,
  escaped,
}: {
  changed: ReturnType<typeof vi.fn>;
  clicked: ReturnType<typeof vi.fn>;
  escaped: ReturnType<typeof vi.fn>;
}) {
  const [sku, setSku] = useState("SKU-ORIGINAL");
  return (
    <>
      <output>{sku}</output>
      <input
        aria-label="SKU principal"
        value={sku}
        onChange={event => {
          changed();
          setSku(event.target.value);
        }}
      />
      <textarea
        aria-label="Características"
        onChange={changed}
        defaultValue="Original"
      />
      <select aria-label="Tipo SKU" defaultValue="a" onChange={changed}>
        <option value="a">A</option>
        <option value="b">B</option>
      </select>
      <input
        type="checkbox"
        aria-label="Marcar SKU como concluído"
        onChange={() => {
          changed();
          setSku("SKU-OTIMISTA");
        }}
      />
      <button
        onClick={() => {
          clicked();
          setSku("SKU-OTIMISTA");
        }}
        aria-label="Salvar SKU principal"
      >
        <svg>
          <path />
        </svg>
      </button>
      <button
        onClick={() => {
          clicked();
          setSku("SKU-OTIMISTA");
        }}
      >
        Manter o mesmo SKU
      </button>
      <button aria-label="Editar SKU da variação 1" onClick={clicked}>
        <svg />
      </button>
      <div
        role="option"
        tabIndex={0}
        onPointerUp={() => {
          changed();
          setSku("SKU-OTIMISTA");
        }}
      >
        SKU alternativo
      </div>
      <input type="search" aria-label="Buscar na planilha" onChange={escaped} />
      <button onClick={escaped}>Cancelar</button>
      <button aria-label="Cancelar edição do SKU principal" onClick={escaped}>
        <svg />
      </button>
      <button onClick={escaped}>Fechar</button>
      <button onClick={escaped}>Close</button>
      <button aria-label="Copiar SKU" onClick={escaped}>
        <svg />
      </button>
      <button aria-label="Instalar Mercato" onClick={escaped}>
        <svg />
      </button>
      <button onClick={escaped}>Entendi</button>
      <button aria-label="Abrir menu do Mercato" onClick={escaped}>
        <svg />
      </button>
      <button aria-label="Recolher menu" onClick={escaped}>
        <svg />
      </button>
      <button aria-haspopup="menu" onClick={escaped}>
        Conta
      </button>
      <button role="tab" onClick={escaped}>
        Variações
      </button>
      <button data-sidebar="menu-button" onClick={escaped}>
        Painel
      </button>
      <button onClick={escaped}>Voltar</button>
      <a href="#sku" onClick={escaped}>
        Planilha
      </a>
      <button onClick={escaped}>Ver SKU e variações</button>
      <button aria-label="Ajuda" onClick={escaped}>
        <svg className="lucide-save" />
      </button>
    </>
  );
}
function renderSku() {
  const changed = vi.fn(),
    clicked = vi.fn(),
    escaped = vi.fn();
  root = createRoot(container);
  act(() =>
    root!.render(
      <SyntheticSku changed={changed} clicked={clicked} escaped={escaped} />
    )
  );
  return { changed, clicked, escaped };
}

describe("Mercato online-only interaction capture", () => {
  it("blocks click handlers and local optimistic SKU changes, even through an SVG target", () => {
    const { clicked } = renderSku();
    const { notify } = guard();
    connection(false);
    const event = dispatch(
      button("Salvar SKU principal").querySelector("path")!,
      "click"
    );
    expect(event.defaultPrevented).toBe(true);
    dispatch(button("Manter o mesmo SKU"), "click");
    dispatch(button("Editar SKU da variação 1"), "click");
    expect(clicked).not.toHaveBeenCalled();
    expect(container.querySelector("output")!.textContent).toBe("SKU-ORIGINAL");
    expect(notify).toHaveBeenCalledWith(MERCATO_OFFLINE_MESSAGE);
  });

  it("captures beforeinput/input/change before existing React onChange for text, select and checkbox", () => {
    const { changed } = renderSku();
    guard();
    connection(false);
    const input = container.querySelector<HTMLInputElement>(
      'input[aria-label="SKU principal"]'
    )!;
    expect(dispatch(input, "beforeinput").defaultPrevented).toBe(true);
    // Bypass React's value tracker, as a native browser edit would do.
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!.call(input, "SKU-OTIMISTA");
    dispatch(input, "input");
    dispatch(input, "change");
    const select = container.querySelector("select")!;
    select.value = "b";
    dispatch(select, "change");
    const nativeChange = new Event("change", {
      bubbles: true,
      cancelable: false,
    });
    act(() => {
      select.dispatchEvent(nativeChange);
    });
    expect(nativeChange.defaultPrevented).toBe(false); // Propagation, not cancellation, stops React.
    dispatch(container.querySelector("textarea")!, "beforeinput");
    act(() =>
      container
        .querySelector<HTMLInputElement>('input[type="checkbox"]')!
        .click()
    );
    dispatch(container.querySelector('[role="option"]')!, "pointerup");
    expect(changed).not.toHaveBeenCalled();
    expect(container.querySelector("output")!.textContent).toBe("SKU-ORIGINAL");
  });

  it("also rejects when only onlineManager reports offline", () => {
    const { clicked } = renderSku();
    guard();
    connection(true, false);
    dispatch(button("Salvar SKU principal"), "click");
    expect(clicked).not.toHaveBeenCalled();
  });

  it("always permits navigation, menus, cancel/close, copy, install, view controls and search", () => {
    const { escaped } = renderSku();
    const { notify } = guard();
    connection(false);
    const labels = [
      "Cancelar",
      "Cancelar edição do SKU principal",
      "Fechar",
      "Close",
      "Copiar SKU",
      "Instalar Mercato",
      "Entendi",
      "Abrir menu do Mercato",
      "Recolher menu",
      "Conta",
      "Variações",
      "Painel",
      "Voltar",
      "Ver SKU e variações",
      "Ajuda",
    ];
    for (const label of labels)
      expect(dispatch(button(label), "click").defaultPrevented).toBe(false);
    dispatch(container.querySelector("a")!, "click");
    dispatch(container.querySelector('input[type="search"]')!, "beforeinput");
    expect(escaped).toHaveBeenCalledTimes(labels.length + 1);
    expect(notify).not.toHaveBeenCalled();
  });

  it("allows Escape, Tab and copying but prevents keyboard edits and form submit offline", () => {
    renderSku();
    const { notify } = guard();
    connection(false);
    const input = container.querySelector("input")!;
    for (const options of [
      { key: "Escape" },
      { key: "Tab" },
      { key: "c", ctrlKey: true },
      { key: "c", metaKey: true },
    ]) {
      const event = new KeyboardEvent("keydown", {
        ...options,
        bubbles: true,
        cancelable: true,
      });
      input.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }
    const edit = new KeyboardEvent("keydown", {
      key: "x",
      bubbles: true,
      cancelable: true,
    });
    input.dispatchEvent(edit);
    expect(edit.defaultPrevented).toBe(true);
    const form = document.createElement("form"),
      submit = vi.fn();
    form.addEventListener("submit", submit);
    container.append(form);
    expect(dispatch(form, "submit").defaultPrevented).toBe(true);
    expect(submit).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it("leaves online clicks and onChange unchanged; cleanup removes every capture listener", () => {
    const { clicked, changed } = renderSku();
    const { notify, cleanup } = guard();
    dispatch(button("Salvar SKU principal"), "click");
    const select = container.querySelector("select")!;
    select.value = "b";
    dispatch(select, "change");
    expect(clicked).toHaveBeenCalledOnce();
    expect(changed).toHaveBeenCalledOnce();
    expect(notify).not.toHaveBeenCalled();
    cleanup();
    cleanup();
    connection(false);
    dispatch(button("Salvar SKU principal"), "click");
    expect(clicked).toHaveBeenCalledTimes(2);
    for (const event of [
      "beforeinput",
      "input",
      "change",
      "pointerup",
      "keydown",
      "submit",
    ]) {
      expect(dispatch(select, event).defaultPrevented).toBe(false);
    }
    expect(changed).toHaveBeenCalledTimes(2);
    expect(notify).not.toHaveBeenCalled();
  });
});
