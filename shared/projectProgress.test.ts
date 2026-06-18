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

import { progressFromCompleted } from "./projectProgress";

describe("progressFromCompleted (régua única)", () => {
  it("0 concluídas = 0% e não lançado", () => {
    const r = progressFromCompleted(0);
    expect(r.progressPct).toBe(0);
    expect(r.completedCount).toBe(0);
    expect(r.totalSteps).toBe(10);
    expect(r.launched).toBe(false);
  });

  it("5 concluídas = 50%", () => {
    const r = progressFromCompleted(5);
    expect(r.progressPct).toBe(50);
    expect(r.launched).toBe(false);
  });

  it("10 concluídas = 100% e lançado", () => {
    const r = progressFromCompleted(10);
    expect(r.progressPct).toBe(100);
    expect(r.launched).toBe(true);
  });

  it("satura acima de 10 e abaixo de 0", () => {
    expect(progressFromCompleted(99).progressPct).toBe(100);
    expect(progressFromCompleted(99).launched).toBe(true);
    expect(progressFromCompleted(-3).progressPct).toBe(0);
    expect(progressFromCompleted(-3).completedCount).toBe(0);
  });

  it("trunca valores fracionários", () => {
    expect(progressFromCompleted(3.9).completedCount).toBe(3);
    expect(progressFromCompleted(3.9).progressPct).toBe(30);
  });
});
