import { describe, expect, it } from "vitest";
import { compactLegendFits } from "../../client/src/alpha/lib/flowCompactPdfPages";

describe("legenda do PDF compacto de meia página", () => {
  it("acomoda a legenda curta sem tocar a explicação final", () => {
    expect(compactLegendFits(1)).toBe(true);
    expect(compactLegendFits(2)).toBe(true);
    expect(compactLegendFits(3)).toBe(true);
  });
  it("recusa motivos extensos em vez de cortar ou sobrepor outra metade", () => {
    expect(compactLegendFits(4)).toBe(false);
    expect(compactLegendFits(20)).toBe(false);
    expect(compactLegendFits(0)).toBe(false);
  });
});
