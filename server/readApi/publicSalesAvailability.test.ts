import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dependencies = vi.hoisted(() => ({
  credentials: vi.fn(),
  owner: vi.fn(),
  token: vi.fn(),
}));
vi.mock("../dbMl", () => ({
  getCredentials: dependencies.credentials,
  resolveMlOwnerUserId: dependencies.owner,
}));
vi.mock("../ml/oauthMl", () => ({
  ensureUserAccessToken: dependencies.token,
}));
import {
  SalesMarginProviderError,
  type VerifiedMarginAccount,
} from "../salesMargin/provider";
import { readPublicSalesAvailability } from "./publicSalesAvailability";

const SELLER = "3308178634";
const NOW = Date.parse("2026-11-16T11:00:00Z");
const account = (): VerifiedMarginAccount => ({
  ownerUserId: 42,
  sellerId: SELLER,
  nickname: "PRIVATE_NICKNAME",
  token: "PRIVATE_TOKEN",
  deadlineAt: NOW + 80_000,
});
const order = (patch: Record<string, unknown> = {}) => ({
  id: 1001,
  seller: { id: Number(SELLER) },
  date_created: "2024-03-01T02:30:00Z",
  ...patch,
});
const page = (records: unknown[] = [order()], total = records.length) => ({
  paging: { total, offset: 0, limit: 1 },
  results: records,
});
const reader = (first: unknown = page(), second: unknown = page([])) =>
  vi
    .fn<(url: string, account: VerifiedMarginAccount) => Promise<unknown>>()
    .mockResolvedValueOnce(first)
    .mockResolvedValueOnce(second);

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function expectUnknown(first: unknown, second: unknown = page([])) {
  const read = vi
    .fn<(url: string, account: VerifiedMarginAccount) => Promise<unknown>>()
    .mockResolvedValueOnce(first)
    .mockResolvedValueOnce(second);
  const result = await readPublicSalesAvailability(account(), read);
  expect(result).toMatchObject({ dataStart: null, confirmed: false });
  expect(result.warnings.join(" ")).toMatch(/não foi possível confirmar/i);
  expect(read).toHaveBeenCalledTimes(2);
}

describe("global public sales availability", () => {
  it("issues exactly two seller-only ascending GET reads, including explicit cancelled, without date filters", async () => {
    const verified = account();
    const read = reader();
    await readPublicSalesAvailability(verified, read);
    expect(read).toHaveBeenCalledTimes(2);
    expect(read.mock.calls.map(([url]) => url)).toEqual([
      `https://api.mercadolibre.com/orders/search?seller=${SELLER}&sort=date_asc&limit=1&offset=0`,
      `https://api.mercadolibre.com/orders/search?seller=${SELLER}&sort=date_asc&limit=1&offset=0&order.status=cancelled`,
    ]);
    for (const [rawUrl, passedAccount] of read.mock.calls) {
      const url = new URL(rawUrl);
      expect(passedAccount).toBe(verified);
      expect([...url.searchParams.keys()].some(key => /date/.test(key))).toBe(
        false
      );
      expect(rawUrl).not.toContain(verified.token);
    }
    expect(dependencies.credentials).not.toHaveBeenCalled();
    expect(dependencies.owner).not.toHaveBeenCalled();
    expect(dependencies.token).not.toHaveBeenCalled();
  });

  it.each([
    ["2024-03-01T02:30:00Z", "2020-01-01T02:59:59Z", "2019-12-31"],
    ["2018-01-01T00:15:00-03:00", "2020-01-01T00:00:00Z", "2018-01-01"],
    ["2024-03-01T01:00:00-03:00", "2024-03-01T03:30:00Z", "2024-03-01"],
  ])(
    "selects earliest actual instant across both searches, in São Paulo: %s / %s",
    async (first, second, expected) => {
      const read = reader(
        page([order({ date_created: first })], 500),
        page(
          [
            order({
              id: "cancelled-oldest",
              status: "cancelled",
              date_created: second,
            }),
          ],
          700
        )
      );
      const result = await readPublicSalesAvailability(account(), read);
      expect(result).toMatchObject({ dataStart: expected, confirmed: true });
      expect(result.warnings.join(" ")).toMatch(/primeiro pedido visível/i);
      expect(result.warnings.join(" ")).toMatch(
        /não comprova o início absoluto/i
      );
    }
  );

  it("uses historical São Paulo DST through Intl rather than a fixed UTC-3 subtraction", async () => {
    const read = reader(
      page([order({ date_created: "2018-12-01T02:30:00Z" })])
    );
    expect(await readPublicSalesAvailability(account(), read)).toMatchObject({
      dataStart: "2018-12-01",
      confirmed: true,
    });
  });

  it("confirms two empty zero-total searches without inventing a date", async () => {
    const result = await readPublicSalesAvailability(
      account(),
      reader(page([]), page([]))
    );
    expect(result).toMatchObject({ dataStart: null, confirmed: true });
    expect(result.warnings.join(" ")).not.toMatch(
      /não foi possível|limite de tempo/i
    );
  });

  it.each([true, false])(
    "one confirmed empty search plus one record remains valid (empty default=%s)",
    async emptyDefault => {
      const empty = page([]),
        populated = page();
      const result = await readPublicSalesAvailability(
        account(),
        reader(
          emptyDefault ? empty : populated,
          emptyDefault ? populated : empty
        )
      );
      expect(result).toMatchObject({
        dataStart: "2024-02-29",
        confirmed: true,
      });
    }
  );

  it.each([
    undefined,
    null,
    [],
    "PRIVATE_PAYLOAD",
    {},
    { results: [], paging: {} },
    { results: [], paging: null },
    { results: [], paging: { total: "0" } },
    { results: [], paging: { total: -1 } },
    { results: [], paging: { total: 0.5 } },
    { results: [], paging: { total: NaN } },
    { results: [], paging: { total: Infinity } },
    { results: [], paging: { total: Number.MAX_SAFE_INTEGER + 1 } },
    { results: {}, paging: { total: 0 } },
    { results: [order()], paging: { total: 0 } },
    { results: [], paging: { total: 1 } },
    { results: [order(), order({ id: 1002 })], paging: { total: 2 } },
    { results: [order()], paging: { total: 1, offset: 1 } },
    { results: [order()], paging: { total: 1, offset: "0" } },
    { results: [order()], paging: { total: 1, limit: 2 } },
    { results: [order()], paging: { total: 1, limit: "1" } },
  ])(
    "bad paging or inconsistent payload %j cannot confirm availability",
    async payload => {
      await expectUnknown(payload);
    }
  );

  it("accepts paging without optional limit/offset and positive integer totals above the one-record probe", async () => {
    const result = await readPublicSalesAvailability(
      account(),
      reader(
        { results: [order()], paging: { total: 999 } },
        { results: [], paging: { total: 0 } }
      )
    );
    expect(result).toMatchObject({ dataStart: "2024-02-29", confirmed: true });
  });

  it.each([
    undefined,
    null,
    123,
    "",
    "2024-03-01",
    "2024-03-01T02:30:00",
    "2026-02-30T09:00:00Z",
    "2023-02-29T09:00:00Z",
    "2024-04-31T09:00:00Z",
    "2024-00-01T09:00:00Z",
    "2024-13-01T09:00:00Z",
    "2024-03-00T09:00:00Z",
    "2024-03-01T24:00:00Z",
    "2024-03-01T23:60:00Z",
    "2024-03-01T23:59:60Z",
    "2024-03-01T01:00:00+24:00",
    "2024-03-01T01:00:00-03:60",
  ])(
    "missing/non-ISO/impossible date %j remains null and unconfirmed",
    async date_created => {
      await expectUnknown(page([order({ date_created })]));
    }
  );

  it.each([
    null,
    [],
    "opaque",
    {},
    order({ id: undefined }),
    order({ id: 0 }),
    order({ id: 1.5 }),
    order({ id: " " }),
    order({ seller: undefined }),
    order({ seller: [] }),
    order({ seller: {} }),
    order({ seller: { id: 0 } }),
  ])("invalid order identity %j is not accepted or skipped", async record => {
    await expectUnknown(page([record]));
  });

  it.each([true, false])(
    "failure in either search discards even a valid oldest date (default fails=%s)",
    async defaultFails => {
      const read = vi
        .fn<(url: string, account: VerifiedMarginAccount) => Promise<unknown>>()
        .mockImplementation(async url => {
          if (
            (new URL(url).searchParams.get("order.status") !== "cancelled") ===
            defaultFails
          ) {
            throw new Error(
              "PRIVATE_TOKEN PRIVATE_BUYER_EMAIL RAW_SOURCE_ERROR"
            );
          }
          return page();
        });
      const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
      const warn = vi
        .spyOn(console, "warn")
        .mockImplementation(() => undefined);
      const error = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      const result = await readPublicSalesAvailability(account(), read);
      expect(result).toMatchObject({ dataStart: null, confirmed: false });
      expect(read).toHaveBeenCalledTimes(2);
      expect(JSON.stringify(result)).not.toMatch(/PRIVATE_|RAW_SOURCE_ERROR/);
      expect(log).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
    }
  );

  it("empty default plus failed cancellation cannot become a confirmed zero", async () => {
    const read = vi
      .fn<(url: string, account: VerifiedMarginAccount) => Promise<unknown>>()
      .mockResolvedValueOnce(page([]))
      .mockRejectedValueOnce(new Error("PRIVATE_ERROR"));
    expect(await readPublicSalesAvailability(account(), read)).toMatchObject({
      dataStart: null,
      confirmed: false,
    });
  });

  it.each([true, false])(
    "foreign seller in either search throws FORBIDDEN, never fallback (default=%s)",
    async foreignDefault => {
      const foreign = page([
        order({ seller: { id: 123 }, buyer: { email: "PRIVATE_EMAIL" } }),
      ]);
      const read = reader(
        foreignDefault ? foreign : page(),
        foreignDefault ? page() : foreign
      );
      const result = readPublicSalesAvailability(account(), read);
      await expect(result).rejects.toBeInstanceOf(SalesMarginProviderError);
      await expect(result).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(result).rejects.not.toThrow(/PRIVATE_|123/);
      expect(read).toHaveBeenCalledTimes(foreignDefault ? 1 : 2);
    }
  );

  it("foreign identity wins over bad paging, over-limit results and impossible dates", async () => {
    const read = reader({
      results: [
        order(),
        order({
          seller: { id: "999" },
          date_created: "impossible",
          id: undefined,
        }),
      ],
      paging: { total: -1 },
    });
    await expect(
      readPublicSalesAvailability(account(), read)
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("still checks the second search for foreign data after the first lookup failed", async () => {
    const read = vi
      .fn<(url: string, account: VerifiedMarginAccount) => Promise<unknown>>()
      .mockRejectedValueOnce(new Error("PRIVATE_FAILURE"))
      .mockResolvedValueOnce(page([order({ seller: { id: 123 } })]));
    await expect(
      readPublicSalesAvailability(account(), read)
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("rethrows a read adapter's FORBIDDEN safely instead of returning unknown", async () => {
    const read = vi
      .fn()
      .mockRejectedValue(
        new SalesMarginProviderError("FORBIDDEN", "PRIVATE_TOKEN PRIVATE_ERROR")
      );
    const result = readPublicSalesAvailability(account(), read);
    await expect(result).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(result).rejects.not.toThrow(/PRIVATE_/);
  });

  it("does not expose private fields from otherwise valid orders", async () => {
    const read = reader(
      page([
        order({
          buyer: { email: "PRIVATE_BUYER" },
          metadata: { token: "PRIVATE_TOKEN" },
        }),
      ])
    );
    expect(
      JSON.stringify(await readPublicSalesAvailability(account(), read))
    ).not.toMatch(/PRIVATE_/);
  });

  it.each([0, -1])(
    "starts no request when deadline is already reached (%s ms remaining)",
    async remaining => {
      const read = reader();
      const result = await readPublicSalesAvailability(
        { ...account(), deadlineAt: NOW + remaining },
        read
      );
      expect(result).toMatchObject({ dataStart: null, confirmed: false });
      expect(result.warnings.join(" ")).toMatch(/limite de tempo/i);
      expect(read).not.toHaveBeenCalled();
    }
  );

  it("starts no second request if the first consumes the remaining budget", async () => {
    const read =
      vi.fn<
        (url: string, account: VerifiedMarginAccount) => Promise<unknown>
      >();
    read.mockImplementationOnce(async () => {
      vi.setSystemTime(NOW + 80_000);
      return page();
    });
    const result = await readPublicSalesAvailability(account(), read);
    expect(result).toMatchObject({ dataStart: null, confirmed: false });
    expect(result.warnings.join(" ")).toMatch(/limite de tempo/i);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("does not confirm a second response arriving after the deadline", async () => {
    const read =
      vi.fn<
        (url: string, account: VerifiedMarginAccount) => Promise<unknown>
      >();
    read.mockImplementationOnce(async () => page());
    read.mockImplementationOnce(async () => {
      vi.setSystemTime(NOW + 80_001);
      return page([]);
    });
    const result = await readPublicSalesAvailability(account(), read);
    expect(result).toMatchObject({ dataStart: null, confirmed: false });
    expect(result.warnings.join(" ")).toMatch(/limite de tempo/i);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("foreign response remains forbidden even when it arrives after the deadline", async () => {
    const read = vi.fn().mockImplementation(async () => {
      vi.setSystemTime(NOW + 80_001);
      return page([order({ seller: { id: 123 } })]);
    });
    await expect(
      readPublicSalesAvailability(account(), read)
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("does not cache independently: repeated invocations always perform both reads", async () => {
    const read = vi.fn().mockResolvedValue(page([]));
    const verified = account();
    await readPublicSalesAvailability(verified, read);
    await readPublicSalesAvailability(verified, read);
    expect(read).toHaveBeenCalledTimes(4);
    expect(verified).toEqual(account());
  });
});
