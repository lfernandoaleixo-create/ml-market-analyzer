import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cachedAccount,
  cachedAccountResilient,
  invalidateAccount,
  swrAccount,
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

describe("swrAccount (non-blocking stale-while-revalidate)", () => {
  it("cold start returns loading immediately and kicks off a background load", async () => {
    let resolved = 0;
    const loader = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 20));
      resolved += 1;
      return { n: resolved };
    });

    // First (cold) read must return synchronously with no value.
    const first = swrAccount<{ n: number }>(200, "k", loader);
    expect(first.status).toBe("loading");
    expect(first.value).toBeUndefined();
    expect(first.asOf).toBe(0);
    // The loader was kicked off in the background.
    expect(loader).toHaveBeenCalledTimes(1);

    // Wait for the background collection to land.
    await new Promise((r) => setTimeout(r, 40));

    // Next read now serves the collected value as fresh.
    const second = swrAccount<{ n: number }>(200, "k", loader);
    expect(second.status).toBe("fresh");
    expect(second.value).toEqual({ n: 1 });
    // No extra load while fresh.
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("never blocks: returns even if the loader takes far longer than the call", async () => {
    const loader = vi.fn(
      () => new Promise<{ n: number }>((r) => setTimeout(() => r({ n: 9 }), 500)),
    );
    const start = Date.now();
    const r = swrAccount<{ n: number }>(201, "k", loader);
    // Returned essentially instantly, well under the loader's 500ms.
    expect(Date.now() - start).toBeLessThan(50);
    expect(r.status).toBe("loading");
  });

  it("serves the OLD value (stale) while a refresh runs after the TTL", async () => {
    const loader = vi
      .fn()
      .mockResolvedValueOnce({ n: 1 })
      .mockResolvedValueOnce({ n: 2 });
    const ttl = 20;

    // Cold start → loading; wait for first value.
    swrAccount<{ n: number }>(202, "k", loader, ttl);
    await new Promise((r) => setTimeout(r, 10));
    const fresh = swrAccount<{ n: number }>(202, "k", loader, ttl);
    expect(fresh.status).toBe("fresh");
    expect(fresh.value).toEqual({ n: 1 });

    // Let the TTL expire → next read serves the OLD value as stale and triggers refresh.
    await new Promise((r) => setTimeout(r, ttl + 5));
    const stale = swrAccount<{ n: number }>(202, "k", loader, ttl);
    expect(stale.status).toBe("stale");
    expect(stale.value).toEqual({ n: 1 });

    // After the background refresh lands, the new value is served fresh.
    await new Promise((r) => setTimeout(r, 10));
    const refreshed = swrAccount<{ n: number }>(202, "k", loader, ttl);
    expect(refreshed.status).toBe("fresh");
    expect(refreshed.value).toEqual({ n: 2 });
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("keeps serving the last value when a background refresh FAILS", async () => {
    const loader = vi
      .fn()
      .mockResolvedValueOnce({ n: 1 })
      .mockRejectedValueOnce(new Error("ML rate limited"));
    const ttl = 20;

    swrAccount<{ n: number }>(203, "k", loader, ttl);
    await new Promise((r) => setTimeout(r, 10));
    expect(swrAccount<{ n: number }>(203, "k", loader, ttl).value).toEqual({ n: 1 });

    // Expire TTL → stale read triggers a refresh that will reject.
    await new Promise((r) => setTimeout(r, ttl + 5));
    const stale = swrAccount<{ n: number }>(203, "k", loader, ttl);
    expect(stale.status).toBe("stale");
    expect(stale.value).toEqual({ n: 1 });

    // Let the failing refresh settle — we must STILL hold the last good value.
    await new Promise((r) => setTimeout(r, 10));
    const afterFail = swrAccount<{ n: number }>(203, "k", loader, ttl);
    expect(afterFail.value).toEqual({ n: 1 });
  });

  it("cold start whose loader FAILS surfaces status 'error' with the message (not a forever loading)", async () => {
    const loader = vi
      .fn()
      .mockRejectedValueOnce(new Error("ML rate limited (429)"))
      .mockResolvedValueOnce({ n: 7 });
    // Cold read kicks the (failing) background load.
    const first = swrAccount<{ n: number }>(205, "k", loader);
    expect(first.status).toBe("loading");
    expect(first.value).toBeUndefined();
    // Let the rejection settle.
    await new Promise((r) => setTimeout(r, 10));
    // Now a read must report the error (so the client stops polling and shows a message).
    const errored = swrAccount<{ n: number }>(205, "k", loader);
    expect(errored.status).toBe("error");
    expect(errored.value).toBeUndefined();
    expect(errored.error).toMatch(/rate|429|limit/i);
    // A manual retry (refetch) re-runs the loader and recovers.
    await new Promise((r) => setTimeout(r, 10));
    const recovered = swrAccount<{ n: number }>(205, "k", loader);
    // The retry kicks a fresh background load; wait for it to land.
    await new Promise((r) => setTimeout(r, 10));
    const fresh = swrAccount<{ n: number }>(205, "k", loader);
    expect(["loading", "error", "fresh"]).toContain(recovered.status);
    expect(fresh.value).toEqual({ n: 7 });
  });

  it("de-duplicates: a burst of reads triggers only ONE background load", async () => {
    const loader = vi.fn(
      () => new Promise<{ n: number }>((r) => setTimeout(() => r({ n: 1 }), 20)),
    );
    // Five reads mount at once on a cold cache.
    for (let i = 0; i < 5; i++) swrAccount(204, "k", loader);
    expect(loader).toHaveBeenCalledTimes(1);
  });
});
