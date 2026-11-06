import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VisitsEvolutionChart } from "../client/src/components/charts/VisitsEvolutionChart";

vi.mock("recharts", () => {
  const Wrapper = ({ children }: { children?: React.ReactNode }) => React.createElement("div", null, children);
  const Chart = ({ children }: { children?: React.ReactNode }) => React.createElement("svg", null, children);
  const Empty = () => null;
  return { Area: Empty, ComposedChart: Chart, Line: Empty, Legend: Empty, CartesianGrid: Empty, ResponsiveContainer: Wrapper, Tooltip: Empty, XAxis: Empty, YAxis: Empty };
});

beforeEach(() => { vi.stubGlobal("React", React); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function render(props: React.ComponentProps<typeof VisitsEvolutionChart>) {
  return renderToStaticMarkup(React.createElement(VisitsEvolutionChart, props));
}

describe("VisitsEvolutionChart — honestidade dos estados", () => {
  it("falha de consulta não vira a mensagem de zero visitas", () => {
    const html = render({ series: [], error: "Consulta ao ML falhou", onRetry: () => {} });
    expect(html).toContain("Visitas indisponíveis no momento");
    expect(html).toContain("Isso não significa que seus anúncios tiveram zero visitas");
    expect(html).not.toContain("Sem visitas registradas");
    expect(html).toContain("Tentar novamente");
  });

  it("zero confirmado é apresentado como zero real", () => {
    const html = render({ series: [{ date: "2026-11-06", visits: 0 }] });
    expect(html).toContain("Sem visitas registradas");
    expect(html).not.toContain("indisponíveis");
  });

  it("zero parcial não declara ausência de visitas em toda a loja", () => {
    const html = render({ series: [{ date: "2026-11-06", visits: 0 }], partial: true });
    expect(html).toContain("O total do período ainda não está confirmado");
    expect(html).not.toContain("Sem visitas registradas");
  });

  it("mantém números do snapshot anterior mas identifica a atualização não confirmada", () => {
    const html = render({ series: [{ date: "2026-11-06", visits: 12 }], stale: true, error: "Falha temporária" });
    expect(html).toContain("Exibindo o último resultado disponível");
    expect(html).toContain("12");
    expect(html).not.toContain("Visitas indisponíveis no momento");
  });

  it("mantém dados parciais positivos com aviso explícito", () => {
    const html = render({ series: [{ date: "2026-11-06", visits: 8 }], partial: true });
    expect(html).toContain("Dados parciais");
    expect(html).toContain("Os totais ainda não estão completos");
  });

  it("após meia-noite não fabrica Hoje=0 nem confunde Ontem com anteontem", () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-11-07T03:15:00Z"));
    const html = render({ series: [{ date: "2026-11-05", visits: 99 }, { date: "2026-11-06", visits: 14 }], stale: true });
    expect(html).toContain("Hoje · não consultado");
    expect(html).toMatch(/Hoje · não consultado[\s\S]*?<\/span>\s*<span[^>]*>—<\/span>/);
    expect(html).toMatch(/>Ontem<\/span>\s*<span[^>]*>14<\/span>/);
    expect(html).not.toContain("Hoje (parcial)");
  });

  it("procura Ontem por data mesmo quando só existe um ponto no snapshot", () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-11-07T03:15:00Z"));
    const html = render({ series: [{ date: "2026-11-06", visits: 14 }], stale: true });
    expect(html).toMatch(/>Ontem<\/span>\s*<span[^>]*>14<\/span>/);
    expect(html).toContain("Hoje · não consultado");
  });
});
