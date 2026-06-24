import { describe, it, expect } from "vitest";
import { decideSequentialToggle } from "./luisSequential";

describe("decideSequentialToggle", () => {
  it("permite concluir a primeira etapa sem restrição", () => {
    const r = decideSequentialToggle([false, false, false], 0, true);
    expect(r.ok).toBe(true);
    expect(r.cascadeIdx).toEqual([]);
  });

  it("permite concluir uma etapa quando todas as anteriores estão concluídas", () => {
    const r = decideSequentialToggle([true, true, false, false], 2, true);
    expect(r.ok).toBe(true);
    expect(r.blocked).toBeNull();
  });

  it("bloqueia concluir uma etapa quando há etapa anterior pendente", () => {
    const r = decideSequentialToggle([true, false, false], 2, true);
    expect(r.ok).toBe(false);
    expect(r).toMatchObject({ blocked: "previous", cascadeIdx: [] });
  });

  it("bloqueia a segunda etapa se a primeira não estiver concluída", () => {
    const r = decideSequentialToggle([false, false], 1, true);
    expect(r.ok).toBe(false);
  });

  it("ao desmarcar, faz cascata nas posteriores concluídas", () => {
    const r = decideSequentialToggle([true, true, true, true], 1, false);
    expect(r.ok).toBe(true);
    // Desmarcando o índice 1, as posteriores concluídas (2 e 3) entram na cascata.
    expect(r.cascadeIdx).toEqual([2, 3]);
  });

  it("ao desmarcar, ignora posteriores que já estavam pendentes", () => {
    const r = decideSequentialToggle([true, true, false, true], 1, false);
    // índice 2 já está pendente; só o 3 (concluído) entra na cascata.
    expect(r.cascadeIdx).toEqual([3]);
  });

  it("desmarcar a última etapa não gera cascata", () => {
    const r = decideSequentialToggle([true, true, true], 2, false);
    expect(r.cascadeIdx).toEqual([]);
  });

  it("lança erro para índice fora do intervalo", () => {
    expect(() => decideSequentialToggle([true], 5, true)).toThrow();
    expect(() => decideSequentialToggle([true], -1, false)).toThrow();
  });
});
