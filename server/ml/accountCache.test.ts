import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cachedAccount,
  cachedAccountResilient,
  invalidateAccount,
  __clearAccountCache,
} from "./accountCache";

afterEach(() => {
  __clearAccountCache();
  vi.restoreAllMocks();
});

describe("cachedAccount", () => {
  it("serves a fresh value from cache without calling the loader twice", async () => {
    const loader = vi.fn(async () => "VALUE");
    const a = await cachedAccount(1, "k", loader);
    const b = await cachedAccount(1, "k", loader);
    expect(a).toBe("VALUE");
    expect(b).toBe("VALUE");
    // Second call hit the cache → loader ran only once.
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("de-duplicates concurrent calls into a SINGLE loader invocation", async () => {
    let calls = 0;
    const loader = vi.fn(async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 20));
      return calls;
    });
    // Five queries mount at once (the page burst) for the same key.
    const results = await Promise.all(
      Array.from({ length: 5 }, () => cachedAccount(2, "burst", loader)),
    );
    expect(results.every((r) => r === 1)).toBe(true);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("re-fetches after the TTL expires", async () => {
    const loader = vi.fn(async () => Math.random());
    const ttl = 30;
    const first = await cachedAccount(3, "k", loader, ttl);
    // Within TTL: cached.
    const cached = await cachedAccount(3, "k", loader, ttl);
    expect(cached).toBe(first);
    // After TTL: fetch again.
    await new Promise((r) => setTimeout(r, ttl + 10));
    const refreshed = await cachedAccount(3, "k", loader, ttl);
    expect(loader).toHaveBeenCalledTimes(2);
    expect(refreshed).not.toBe(first);
  });

  it("does NOT cache errors — a failed load is retried next time", async () => {
    const loader = vi
      .fn()
      .mockRejectedValueOnce(new Error("ML rate limited"))
      .mockResolvedValueOnce("RECOVERED");
    await expect(cachedAccount(4, "k", loader)).rejects.toThrow("ML rate limited");
    // The failure was not remembered → next call retries and succeeds.
    const ok = await cachedAccount(4, "k", loader);
    expect(ok).toBe("RECOVERED");
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("namespaces by user — one user's cache never leaks to another", async () => {
    await cachedAccount(10, "same-key", async () => "USER_10");
    const u11 = await cachedAccount(11, "same-key", async () => "USER_11");
    expect(u11).toBe("USER_11");
  });

  it("invalidateAccount forces the next call to reload", async () => {
    const loader = vi.fn(async () => Date.now());
    const first = await cachedAccount(5, "k", loader);
    invalidateAccount(5, "k");
    const second = await cachedAccount(5, "k", loader);
    expect(loader).toHaveBeenCalledTimes(2);
    expect(second).toBeGreaterThanOrEqual(first);
  });
});

describe("cachedAccountResilient (stale-while-error)", () => {
  it("returns fresh value and marks it not stale", async () => {
    const loader = vi.fn(async () => ({ n: 1 }));
    const r = await cachedAccountResilient(100, "k", loader);
    expect(r.value).toEqual({ n: 1 });
    expect(r.stale).toBe(false);
    expect(typeof r.asOf).toBe("number");
  });

  it("serves the last known-good value when a later load FAILS", async () => {
    const loader = vi
      .fn()
      .mockResolvedValueOnce({ n: 1 }) // first: good
      .mockRejectedValueOnce(new Error("ML rate limited")); // second: fails

    const ttl = 10;
    const first = await cachedAccountResilient(101, "k", loader, ttl);
    expect(first.stale).toBe(false);
    expect(first.value).toEqual({ n: 1 });

    // Let the TTL expire so the next call re-runs the (now failing) loader.
    await new Promise((res) => setTimeout(res, ttl + 5));

    const second = await cachedAccountResilient(101, "k", loader, ttl);
    // Instead of throwing, it falls back to the last good snapshot.
    expect(second.stale).toBe(true);
    expect(second.value).toEqual({ n: 1 });
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("propagates the error when there is NO usable fallback yet", async () => {
    const loader = vi.fn().mockRejectedValue(new Error("ML rate limited"));
    await expect(cachedAccountResilient(102, "k", loader)).rejects.toThrow(
      "ML rate limited",
    );
  });

  it("does NOT serve a stale fallback older than staleMaxMs", async () => {
    const loader = vi
      .fn()
      .mockResolvedValueOnce({ n: 1 })
      .mockRejectedValueOnce(new Error("ML rate limited"));

    const ttl = 5;
    const staleMax = 20;
    await cachedAccountResilient(103, "k", loader, ttl, staleMax);
    // Wait past BOTH the ttl and the stale window.
    await new Promise((res) => setTimeout(res, staleMax + 10));
    await expect(
      cachedAccountResilient(103, "k", loader, ttl, staleMax),
    ).rejects.toThrow("ML rate limited");
  });

  it("recovers to fresh once the loader succeeds again", async () => {
    const loader = vi
      .fn()
      .mockResolvedValueOnce({ n: 1 })
      .mockRejectedValueOnce(new Error("blip"))
      .mockResolvedValueOnce({ n: 2 });
    const ttl = 5;
    await cachedAccountResilient(104, "k", loader, ttl);
    await new Promise((res) => setTimeout(res, ttl + 2));
    const stale = await cachedAccountResilient(104, "k", loader, ttl);
    expect(stale.stale).toBe(true);
    expect(stale.value).toEqual({ n: 1 });
    await new Promise((res) => setTimeout(res, ttl + 2));
    const fresh = await cachedAccountResilient(104, "k", loader, ttl);
    expect(fresh.stale).toBe(false);
    expect(fresh.value).toEqual({ n: 2 });
  });
});
