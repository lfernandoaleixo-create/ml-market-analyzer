/**
 * Lógica PURA da regra sequencial das etapas do Cronograma do Luís.
 * Fica em `shared/` para ser testável (vitest) e reutilizável tanto no backend
 * (orquestração das gravações) quanto, se preciso, no client.
 *
 * Regra:
 *  - Para CONCLUIR a etapa de índice `targetIdx`, TODAS as etapas anteriores
 *    (índices < targetIdx) devem estar concluídas; senão a operação é bloqueada.
 *  - Ao DESMARCAR a etapa `targetIdx`, todas as etapas posteriores que estiverem
 *    concluídas também devem ser desmarcadas (cascata).
 */

export type SequentialDecision =
  | { ok: false; blocked: "previous"; cascadeIdx: number[] }
  | { ok: true; blocked: null; cascadeIdx: number[] };

/**
 * Decide o resultado de marcar/desmarcar a etapa em `targetIdx`, dado o vetor
 * `doneFlags` com o estado atual (concluída?) de cada etapa, na ordem canônica.
 * Retorna os ÍNDICES das etapas posteriores que devem ser desmarcadas em cascata
 * (não inclui a própria `targetIdx`).
 */
export function decideSequentialToggle(
  doneFlags: boolean[],
  targetIdx: number,
  done: boolean,
): SequentialDecision {
  if (targetIdx < 0 || targetIdx >= doneFlags.length) {
    throw new Error("targetIdx out of range");
  }

  if (done) {
    const previousAllDone = doneFlags.slice(0, targetIdx).every(Boolean);
    if (!previousAllDone) {
      return { ok: false, blocked: "previous", cascadeIdx: [] };
    }
    return { ok: true, blocked: null, cascadeIdx: [] };
  }

  // Desmarcar: cascata nas posteriores que estão concluídas.
  const cascadeIdx: number[] = [];
  for (let i = targetIdx + 1; i < doneFlags.length; i++) {
    if (doneFlags[i]) cascadeIdx.push(i);
  }
  return { ok: true, blocked: null, cascadeIdx };
}
