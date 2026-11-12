// @vitest-environment jsdom

import React, { act, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Modal,
  NumberField,
} from "../client/src/alpha/components/PricingFields";
import { MarginPriceControl } from "../client/src/alpha/components/MarginPriceControl";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  // Vitest uses the classic JSX transform; the app uses Vite's automatic one.
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
  document.body.style.overflow = "";
  vi.unstubAllGlobals();
});

function render(children: ReactNode) {
  act(() => root.render(children));
}

function input(label: string) {
  const field = container.querySelector<HTMLInputElement>(
    `input[aria-label="${label}"]`
  );
  expect(field).not.toBeNull();
  return field!;
}

function typeValue(
  field: HTMLInputElement,
  value: string,
  cursor = value.length
) {
  act(() => {
    // Bypass React's value tracker just as a native user edit does.
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!.call(field, value);
    field.setSelectionRange(cursor, cursor);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function escape() {
  act(() =>
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    )
  );
}

function closeButton() {
  return container.querySelector<HTMLButtonElement>(
    'button[aria-label="Fechar"]'
  )!;
}

function backdrop() {
  return container.querySelector<HTMLDivElement>(".modal-backdrop")!;
}

function ModalHarness({
  onClose,
  busy = false,
}: {
  onClose: () => void;
  busy?: boolean;
}) {
  const [margin, setMargin] = useState(20);
  return (
    <Modal
      title="Margens personalizadas"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <NumberField
        label="Margem personalizada"
        value={margin}
        onChange={setMargin}
        suffix="%"
      />
    </Modal>
  );
}

function PriceHarness({
  calculatedPrice = 120,
  error,
}: {
  calculatedPrice?: number | null;
  error?: string;
}) {
  const [mode, setMode] = useState<"target" | "sale">("target");
  const [goal, setGoal] = useState(20);
  const [manualPrice, setManualPrice] = useState(90);
  return (
    <MarginPriceControl
      mode={mode}
      goal={goal}
      goals={[10, 20, 30]}
      calculatedPrice={calculatedPrice}
      error={error}
      manualPrice={manualPrice}
      obtainedMargin={12.5}
      obtainedProfit={9}
      onGoal={setGoal}
      onMode={setMode}
      onManualPrice={setManualPrice}
    />
  );
}

function clickButton(text: string) {
  const button = Array.from(container.querySelectorAll("button")).find(button =>
    button.textContent?.includes(text)
  );
  expect(button).toBeDefined();
  act(() => {
    button!.focus();
    button!.click();
  });
}

describe("Modal: foco e callback de fechamento", () => {
  it("mantém o mesmo input, foco e cursor quando o callback muda", () => {
    const firstClose = vi.fn();
    render(<ModalHarness onClose={firstClose} />);
    const field = input("Margem personalizada");
    act(() => field.focus());
    field.setSelectionRange(1, 1);

    render(<ModalHarness onClose={vi.fn()} />);

    expect(input("Margem personalizada")).toBe(field);
    expect(document.activeElement).toBe(field);
    expect(field.selectionStart).toBe(1);
    expect(field.selectionEnd).toBe(1);
    expect(firstClose).not.toHaveBeenCalled();
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("não interrompe a digitação decimal com onClose inline", () => {
    render(<ModalHarness onClose={vi.fn()} />);
    const field = input("Margem personalizada");
    act(() => field.focus());
    typeValue(field, "21,");

    expect(document.activeElement).toBe(field);
    expect(field.value).toBe("21,");
    expect(field.selectionStart).toBe(3);
    typeValue(field, "21,5");
    expect(document.activeElement).toBe(field);
    expect(field.value).toBe("21,5");
    expect(field.selectionStart).toBe(4);
  });

  it("Escape usa o último callback e o fechamento restaura overflow e foco original", () => {
    const opener = document.createElement("button");
    document.body.prepend(opener);
    opener.focus();
    document.body.style.overflow = "scroll";
    const firstClose = vi.fn();
    const latestClose = vi.fn(() => root.render(null));
    render(<ModalHarness onClose={firstClose} />);
    expect(document.activeElement).toBe(closeButton());
    act(() => input("Margem personalizada").focus());
    render(<ModalHarness onClose={latestClose} />);

    escape();

    expect(firstClose).not.toHaveBeenCalled();
    expect(latestClose).toHaveBeenCalledOnce();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.body.style.overflow).toBe("scroll");
    expect(document.activeElement).toBe(opener);
  });

  it("clique no botão ou backdrop usa o último callback, sem fechar ao clicar no conteúdo", () => {
    const firstClose = vi.fn();
    const latestClose = vi.fn();
    render(<ModalHarness onClose={firstClose} />);
    render(<ModalHarness onClose={latestClose} />);
    act(() =>
      input("Margem personalizada").dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true })
      )
    );
    expect(latestClose).not.toHaveBeenCalled();
    act(() => closeButton().click());
    act(() =>
      backdrop().dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))
    );
    expect(latestClose).toHaveBeenCalledTimes(2);
    expect(firstClose).not.toHaveBeenCalled();
  });

  it("respeita o bloqueio busy atualizado em Escape, botão e backdrop", () => {
    const onClose = vi.fn();
    render(<ModalHarness onClose={onClose} />);
    render(<ModalHarness onClose={onClose} busy />);
    escape();
    act(() => closeButton().click());
    act(() =>
      backdrop().dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(document.body.style.overflow).toBe("hidden");

    render(<ModalHarness onClose={onClose} busy={false} />);
    escape();
    act(() => closeButton().click());
    act(() =>
      backdrop().dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))
    );
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("preserva o ciclo de Tab e Shift+Tab dentro do diálogo", () => {
    render(<ModalHarness onClose={vi.fn()} />);
    const field = input("Margem personalizada");
    act(() => field.focus());
    const tab = new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
    });
    act(() => document.dispatchEvent(tab));
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(closeButton());
    const shiftTab = new KeyboardEvent("keydown", {
      key: "Tab",
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    act(() => document.dispatchEvent(shiftTab));
    expect(shiftTab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(field);
  });
});

function StackedModals({
  busy = false,
  hideHistory = false,
  onHistoryClose,
}: {
  busy?: boolean;
  hideHistory?: boolean;
  onHistoryClose: () => void;
}) {
  const [historyOpen, setHistoryOpen] = useState(true);
  const [pdfOpen, setPdfOpen] = useState(false);
  return (
    <>
      {pdfOpen && (
        <Modal
          title="PDF teste"
          onClose={() => {
            if (!busy) setPdfOpen(false);
          }}
        >
          <input aria-label="PDF margem" disabled={busy} />
          <button disabled={busy}>Gerar PDF</button>
        </Modal>
      )}
      {historyOpen && !hideHistory && (
        <Modal
          title="Histórico teste"
          onClose={() => {
            onHistoryClose();
            setHistoryOpen(false);
          }}
        >
          <button onClick={() => setPdfOpen(true)}>Abrir PDF teste</button>
        </Modal>
      )}
    </>
  );
}

describe("Teclado e rolagem de modais empilhados", () => {
  it("Escape ocupado não fecha Histórico; depois fecha somente o PDF e restaura foco/scroll ao final", () => {
    const opener = document.createElement("button");
    document.body.prepend(opener);
    opener.focus();
    document.body.style.overflow = "scroll";
    const historyClose = vi.fn();
    render(<StackedModals busy onHistoryClose={historyClose} />);
    clickButton("Abrir PDF teste");
    const pdf = container.querySelector<HTMLElement>(
      '[aria-label="PDF teste"]'
    )!;
    const history = container.querySelector<HTMLElement>(
      '[aria-label="Histórico teste"]'
    )!;
    expect(Number(pdf.parentElement!.style.zIndex)).toBeGreaterThan(
      Number(history.parentElement!.style.zIndex)
    );
    escape();
    expect(historyClose).not.toHaveBeenCalled();
    expect(container.querySelectorAll('[role="dialog"]')).toHaveLength(2);
    expect(document.body.style.overflow).toBe("hidden");
    render(<StackedModals onHistoryClose={historyClose} />);
    escape();
    expect(container.querySelector('[aria-label="PDF teste"]')).toBeNull();
    expect(
      container.querySelector('[aria-label="Histórico teste"]')
    ).not.toBeNull();
    expect(historyClose).not.toHaveBeenCalled();
    expect(document.activeElement?.textContent).toBe("Abrir PDF teste");
    expect(document.body.style.overflow).toBe("hidden");
    escape();
    expect(historyClose).toHaveBeenCalledOnce();
    expect(document.body.style.overflow).toBe("scroll");
    expect(document.activeElement).toBe(opener);
  });

  it("remover o modal inferior não libera rolagem nem perde a restauração final", () => {
    const opener = document.createElement("button");
    document.body.prepend(opener);
    opener.focus();
    document.body.style.overflow = "auto";
    const historyClose = vi.fn();
    render(<StackedModals busy onHistoryClose={historyClose} />);
    clickButton("Abrir PDF teste");
    const pdf = container.querySelector<HTMLElement>(
      '[aria-label="PDF teste"]'
    )!;
    render(<StackedModals busy hideHistory onHistoryClose={historyClose} />);
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.activeElement).toBe(
      pdf.querySelector('button[aria-label="Fechar"]')
    );
    render(<StackedModals hideHistory onHistoryClose={historyClose} />);
    escape();
    expect(document.body.style.overflow).toBe("auto");
    expect(document.activeElement).toBe(opener);
  });

  it("Tab ignora campos desabilitados e fica no único botão habilitado do PDF ocupado", () => {
    render(<StackedModals busy onHistoryClose={vi.fn()} />);
    clickButton("Abrir PDF teste");
    const close = container.querySelector<HTMLButtonElement>(
      '[aria-label="PDF teste"] button[aria-label="Fechar"]'
    )!;
    act(() => close.focus());
    for (const shiftKey of [false, true]) {
      const event = new KeyboardEvent("keydown", {
        key: "Tab",
        shiftKey,
        bubbles: true,
        cancelable: true,
      });
      act(() => document.dispatchEvent(event));
      expect(event.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(close);
    }
  });
});

describe("MarginPriceControl: edição contínua do preço", () => {
  it("a primeira tecla muda target para sale sem remontar input ou perder foco, draft e cursor", () => {
    render(<PriceHarness />);
    const field = input("Preço de venda calculado");
    expect(field.value).toBe("120");
    act(() => field.focus());
    typeValue(field, "1,");

    const manualField = input("Preço real/manual");
    expect(manualField).toBe(field);
    expect(document.activeElement).toBe(field);
    expect(field.value).toBe("1,");
    expect(field.selectionStart).toBe(2);
    expect(field.selectionEnd).toBe(2);
    expect(
      container.querySelectorAll('input[inputmode="decimal"]')
    ).toHaveLength(2);
    typeValue(field, "1,2");
    typeValue(field, "1,25");
    expect(input("Preço real/manual")).toBe(field);
    expect(document.activeElement).toBe(field);
    expect(field.value).toBe("1,25");
    expect(field.selectionStart).toBe(4);
    act(() => field.blur());
    expect(field.value).toBe("1,25");
  });

  it("retorno a target sincroniza preço automático quando não focado, mantendo o input", () => {
    render(<PriceHarness />);
    const field = input("Preço de venda calculado");
    act(() => field.focus());
    typeValue(field, "99,5");
    act(() => input("Preço real/manual").blur());
    render(<PriceHarness calculatedPrice={145.75} />);
    clickButton("Voltar ao preço calculado pela margem");

    expect(input("Preço de venda calculado")).toBe(field);
    expect(field.value).toBe("145,75");
    render(<PriceHarness calculatedPrice={151.25} />);
    expect(field.value).toBe("151,25");
  });

  it("preserva classes, avisos, labels e resultado opcional nos dois modos", () => {
    render(<PriceHarness error="Margem inviável" />);
    const field = input("Preço de venda calculado");
    expect(field.closest(".automatic-price-output")).not.toBeNull();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Margem inviável"
    );
    expect(container.querySelector(".small-note")?.textContent).toContain(
      "não usamos um preço antigo"
    );
    expect(
      container.querySelector(".automatic-price-output .field-hint")
        ?.textContent
    ).toContain("edite este campo");
    clickButton("Já tenho um preço: apenas conferir");

    const manualField = input("Preço real/manual");
    expect(manualField.closest(".manual-price-check")).not.toBeNull();
    expect(
      container.querySelector(".manual-price-check .callout")?.textContent
    ).toContain("não é determinado pela margem");
    expect(
      container.querySelector(
        '[aria-label="Resultado obtido com o preço real/manual"]'
      )?.textContent
    ).toContain("Margem obtida");
    expect(container.querySelector(".obtained-result")?.textContent).toContain(
      "Lucro"
    );
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(manualField.value).toBe("90");
    clickButton("Voltar ao preço calculado pela margem");
    expect(input("Preço de venda calculado").value).toBe("120");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Margem inviável"
    );
  });
});
