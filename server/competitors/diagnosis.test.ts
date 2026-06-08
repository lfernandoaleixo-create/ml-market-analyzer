import { describe, it, expect } from "vitest";
import { diagnoseCompetitor, parsePastSales } from "./diagnosis";
import type { CompetitorProductDetail, MyListingBaseline } from "@shared/competitors";

function makeCompetitor(over: Partial<CompetitorProductDetail> = {}): CompetitorProductDetail {
  return {
    name: "Concorrente X",
    url: "https://www.mercadolivre.com.br/x/p/MLB123",
    image: null,
    price: 100,
    listingPrice: null,
    currency: "BRL",
    currencySymbol: "R$",
    brand: null,
    description: null,
    rating: 4.5,
    totalRatings: 100,
    images: ["a", "b"],
    isAvailable: true,
    state: "Novo",
    soldBy: "Loja X",
    sellerSales: "+10mil vendas",
    sellerLabels: ["MercadoLíder"],
    remainingCredits: null,
    ...over,
  };
}

function makeMine(over: Partial<MyListingBaseline> = {}): MyListingBaseline {
  return {
    title: "Meu anúncio",
    price: 90,
    soldQuantity: 10,
    reputationLabel: "Verde",
    hasFull: null,
    hasFreeInstallments: null,
    photosCount: null,
    rating: null,
    totalRatings: null,
    ...over,
  };
}

describe("parsePastSales", () => {
  it("parses 'mil' and 'mi' hints", () => {
    expect(parsePastSales("+10mil vendas")).toBe(10_000);
    expect(parsePastSales("+100mil vendas")).toBe(100_000);
    expect(parsePastSales("+1000 vendas")).toBe(1000);
    expect(parsePastSales(null)).toBeNull();
  });
});

describe("diagnoseCompetitor", () => {
  it("returns one factor per analyzed dimension with recommendations", () => {
    const d = diagnoseCompetitor(makeMine(), makeCompetitor());
    expect(d.factors.length).toBe(6);
    for (const f of d.factors) {
      expect(f.factor).toBeTruthy();
      expect(f.recommendation).toBeTruthy();
      expect(["high", "medium", "low"]).toContain(f.impact);
      expect(["mine", "theirs", "tie", "unknown"]).toContain(f.advantage);
    }
  });

  it("marks price as MY advantage when I'm cheaper", () => {
    const d = diagnoseCompetitor(makeMine({ price: 80 }), makeCompetitor({ price: 100 }));
    const price = d.factors.find((f) => f.factor === "Preço")!;
    expect(price.advantage).toBe("mine");
  });

  it("marks reputation as THEIRS when competitor is MercadoLíder and I'm just Verde", () => {
    const d = diagnoseCompetitor(
      makeMine({ reputationLabel: "Verde" }),
      makeCompetitor({ sellerLabels: ["MercadoLíder"] }),
    );
    const rep = d.factors.find((f) => f.factor === "Reputação do vendedor")!;
    expect(rep.advantage).toBe("theirs");
  });

  it("flags social proof to competitor when they have far more ratings", () => {
    const d = diagnoseCompetitor(
      makeMine({ totalRatings: 5, rating: 4.8 }),
      makeCompetitor({ totalRatings: 5000, rating: 4.6 }),
    );
    const social = d.factors.find((f) => f.factor === "Prova social (avaliações)")!;
    expect(social.advantage).toBe("theirs");
    expect(social.impact).toBe("high");
  });

  it("summarizes the high-impact reasons the competitor sells more", () => {
    const d = diagnoseCompetitor(
      makeMine({ price: 120, reputationLabel: "Verde", totalRatings: 2 }),
      makeCompetitor({ price: 100, sellerLabels: ["MercadoLíder"], totalRatings: 4000 }),
    );
    expect(d.summary.toLowerCase()).toContain("concorrente");
    expect(d.factors.some((f) => f.advantage === "theirs")).toBe(true);
  });

  it("handles missing data gracefully (unknown advantages, no throw)", () => {
    const mine: MyListingBaseline = {
      title: "Meu anúncio",
      price: null,
      soldQuantity: null,
      reputationLabel: null,
      hasFull: null,
      hasFreeInstallments: null,
      photosCount: null,
      rating: null,
      totalRatings: null,
    };
    const comp = makeCompetitor({
      price: null,
      rating: null,
      totalRatings: null,
      sellerLabels: [],
      images: [],
    });
    const d = diagnoseCompetitor(mine, comp);
    expect(d.factors.length).toBe(6);
    expect(d.factors.some((f) => f.advantage === "unknown")).toBe(true);
  });
});
