import { describe, it, expect } from "vitest";
import {
  PROJECT_STEP_ORDER,
  TOTAL_PROJECT_STEPS,
  normalizeSteps,
  countCompletedSteps,
  computeProgressPct,
  deriveCurrentStep,
} from "./projectProgress";

describe("projectProgress", () => {
  it("tem 10 etapas canônicas na ordem correta", () => {
    expect(TOTAL_PROJECT_STEPS).toBe(10);
    expect(PROJECT_STEP_ORDER[0]).toBe("fornecedor");
    expect(PROJECT_STEP_ORDER[TOTAL_PROJECT_STEPS - 1]).toBe("lancamento");
  });

  it("normaliza etapas parciais preenchendo pendentes", () => {
    const steps = normalizeSteps({ fornecedor: "concluido", amostra: "em_andamento" });
    expect(steps).toHaveLength(10);
    expect(steps[0]).toEqual({ key: "fornecedor", status: "concluido" });
    expect(steps[1]).toEqual({ key: "amostra", status: "em_andamento" });
    expect(steps[2]).toEqual({ key: "aprovacao", status: "pendente" });
  });

  it("conta etapas concluídas", () => {
    expect(countCompletedSteps({})).toBe(0);
    expect(
      countCompletedSteps({ fornecedor: "concluido", amostra: "concluido", aprovacao: "em_andamento" }),
    ).toBe(2);
  });

  it("calcula percentual de progresso inteiro", () => {
    expect(computeProgressPct({})).toBe(0);
    expect(computeProgressPct({ fornecedor: "concluido" })).toBe(10);
    expect(
      computeProgressPct({
        fornecedor: "concluido",
        amostra: "concluido",
        aprovacao: "concluido",
        embalagem: "concluido",
        pedido: "concluido",
      }),
    ).toBe(50);
  });

  it("deriva etapa atual: prioridade para em_andamento", () => {
    const current = deriveCurrentStep({
      fornecedor: "concluido",
      amostra: "concluido",
      aprovacao: "em_andamento",
    });
    expect(current).toBe("aprovacao");
  });

  it("deriva etapa atual: última concluída quando não há em_andamento", () => {
    const current = deriveCurrentStep({
      fornecedor: "concluido",
      amostra: "concluido",
    });
    expect(current).toBe("amostra");
  });

  it("deriva etapa atual: fornecedor quando nada foi iniciado", () => {
    expect(deriveCurrentStep({})).toBe("fornecedor");
  });

  it("em_andamento à frente vence concluída anterior", () => {
    // Mesmo com chegada concluída, um em_andamento anterior define a etapa atual.
    const current = deriveCurrentStep({
      fornecedor: "concluido",
      amostra: "em_andamento",
      chegada: "concluido",
    });
    expect(current).toBe("amostra");
  });
});
