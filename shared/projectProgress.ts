// Lógica pura (sem dependência de banco) do pipeline de importação do Projeto.
// Mantida no shared para ser testável e reutilizável entre server e client.

export const PROJECT_STEP_ORDER = [
  "fornecedor",
  "amostra",
  "aprovacao",
  "embalagem",
  "pedido",
  "producao",
  "inspecao",
  "embarque",
  "chegada",
  "lancamento",
] as const;

export type ProjectStep = (typeof PROJECT_STEP_ORDER)[number];
export type ProjectStatus = "pendente" | "em_andamento" | "concluido";

export const TOTAL_PROJECT_STEPS = PROJECT_STEP_ORDER.length;

/**
 * Normaliza um conjunto de etapas (parcial) para a sequência canônica completa,
 * preenchendo as ausentes como "pendente".
 */
export function normalizeSteps(
  stepStatuses: Partial<Record<ProjectStep, ProjectStatus>>,
): Array<{ key: ProjectStep; status: ProjectStatus }> {
  return PROJECT_STEP_ORDER.map((key) => ({
    key,
    status: stepStatuses[key] ?? "pendente",
  }));
}

/** Conta quantas etapas estão concluídas. */
export function countCompletedSteps(
  stepStatuses: Partial<Record<ProjectStep, ProjectStatus>>,
): number {
  return PROJECT_STEP_ORDER.reduce(
    (acc, key) => (stepStatuses[key] === "concluido" ? acc + 1 : acc),
    0,
  );
}

/** Percentual de progresso (0–100, inteiro) com base nas etapas concluídas. */
export function computeProgressPct(
  stepStatuses: Partial<Record<ProjectStep, ProjectStatus>>,
): number {
  return Math.round((countCompletedSteps(stepStatuses) / TOTAL_PROJECT_STEPS) * 100);
}

/**
 * Deriva a etapa atual do produto:
 * - a primeira etapa marcada como "em_andamento" tem prioridade;
 * - caso não exista, a última etapa "concluido" na ordem canônica;
 * - se nada foi iniciado, retorna "fornecedor".
 */
export function deriveCurrentStep(
  stepStatuses: Partial<Record<ProjectStep, ProjectStatus>>,
): ProjectStep {
  let currentStep: ProjectStep = "fornecedor";
  for (const step of PROJECT_STEP_ORDER) {
    const status = stepStatuses[step];
    if (status === "em_andamento") return step;
    if (status === "concluido") currentStep = step;
  }
  return currentStep;
}


/**
 * Régua única de progresso a partir do NÚMERO de etapas concluídas.
 * Usada por Painel, Cronograma e Análise para garantir o mesmo número em todas as telas.
 * - completedCount é saturado em [0, TOTAL_PROJECT_STEPS].
 * - launched = todas as etapas concluídas.
 */
export function progressFromCompleted(completedCount: number): {
  completedCount: number;
  totalSteps: number;
  progressPct: number;
  launched: boolean;
} {
  const clamped = Math.max(0, Math.min(TOTAL_PROJECT_STEPS, Math.floor(completedCount)));
  return {
    completedCount: clamped,
    totalSteps: TOTAL_PROJECT_STEPS,
    progressPct: Math.round((clamped / TOTAL_PROJECT_STEPS) * 100),
    launched: clamped >= TOTAL_PROJECT_STEPS,
  };
}
