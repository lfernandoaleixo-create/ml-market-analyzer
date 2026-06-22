import { describe, it, expect } from "vitest";
import { parseAwesomeUsdBrl } from "./fx";

describe("parseAwesomeUsdBrl", () => {
  it("extrai o bid do payload da AwesomeAPI", () => {
    const payload = { USDBRL: { bid: "5.4321", ask: "5.44", high: "5.50" } };
    expect(parseAwesomeUsdBrl(payload)).toBeCloseTo(5.4321, 4);
  });

  it("aceita bid numérico", () => {
    expect(parseAwesomeUsdBrl({ USDBRL: { bid: 5.5 } })).toBeCloseTo(5.5, 4);
  });

  it("cai para ask quando bid ausente", () => {
    expect(parseAwesomeUsdBrl({ USDBRL: { ask: "5.6" } })).toBeCloseTo(5.6, 4);
  });

  it("lança quando par ausente", () => {
    expect(() => parseAwesomeUsdBrl({})).toThrow();
  });

  it("lança quando valor inválido", () => {
    expect(() => parseAwesomeUsdBrl({ USDBRL: { bid: "abc" } })).toThrow();
    expect(() => parseAwesomeUsdBrl({ USDBRL: { bid: "-1" } })).toThrow();
  });

  it("lança quando payload não é objeto", () => {
    expect(() => parseAwesomeUsdBrl(null)).toThrow();
    expect(() => parseAwesomeUsdBrl("x")).toThrow();
  });
});

import { parsePairBrl } from "./fx";

describe("parsePairBrl", () => {
  const payload = {
    USDBRL: { bid: "5.4321" },
    CNYBRL: { bid: "0.7543" },
  };

  it("extrai USD->BRL", () => {
    expect(parsePairBrl(payload, "USD")).toBeCloseTo(5.4321, 4);
  });

  it("extrai CNY->BRL (yuan)", () => {
    expect(parsePairBrl(payload, "CNY")).toBeCloseTo(0.7543, 4);
  });

  it("lança quando o par solicitado está ausente", () => {
    expect(() => parsePairBrl({ USDBRL: { bid: "5" } }, "CNY")).toThrow();
  });
});
