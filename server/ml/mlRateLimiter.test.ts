import { describe, it, expect } from "vitest";
import { __createMlLimiterForTest } from "./mlRateLimiter";

/**
 * The limiter is the guard that stops the ADS/account pages from bursting at ML
 * and triggering 429s. These specs lock in the three guarantees that matter:
 * serialization, minimum spacing between starts, and a global cooldown that
 * backs the WHOLE queue off when one call is throttled.
 *
 * Note: the production limiter reads spacing from env at module load. For the
 * default build that is 220ms; here we assert RELATIVE ordering/spacing rather
 * than exact timings so the test is robust regardless of the configured value.
 */

const SPACING_MS = Number(process.env.ML_RL_MIN_SPACING_MS) || 220;

describe("mlLimiter", () => {
  it("serializes concurrent tasks (no two run at the same instant)", async () => {
    const limiter = __createMlLimiterForTest();
    const startTimes: number[] = [];
    let concurrent = 0;
    let maxConcurrent = 0;

    const make = () =>
      limiter.schedule(async () => {
        concurrent += 1;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        startTimes.push(Date.now());
        await new Promise((r) => setTimeout(r, 10));
        concurrent -= 1;
        return true;
      });

    await Promise.all([make(), make(), make()]);

    // With MAX_CONCURRENCY=1 the tasks never overlap.
    expect(maxConcurrent).toBe(1);
    expect(startTimes).toHaveLength(3);
  });

  it("enforces minimum spacing between consecutive starts", async () => {
    const limiter = __createMlLimiterForTest();
    const starts: number[] = [];

    const make = () =>
      limiter.schedule(async () => {
        starts.push(Date.now());
        return true;
      });

    await Promise.all([make(), make(), make()]);

    // Each consecutive start must be at least (close to) SPACING_MS apart.
    for (let i = 1; i < starts.length; i++) {
      const gap = starts[i] - starts[i - 1];
      // Allow a small scheduler slack below the nominal spacing.
      expect(gap).toBeGreaterThanOrEqual(SPACING_MS - 40);
    }
  });

  it("applies a global cooldown that delays the next task", async () => {
    const limiter = __createMlLimiterForTest();

    // First task runs immediately and triggers a cooldown.
    const t0 = Date.now();
    await limiter.schedule(async () => {
      limiter.applyCooldown(300);
      return true;
    });

    // The next scheduled task must wait out the cooldown before starting.
    let secondStart = 0;
    await limiter.schedule(async () => {
      secondStart = Date.now();
      return true;
    });

    expect(secondStart - t0).toBeGreaterThanOrEqual(260);
  });

  it("propagates task rejections to the caller", async () => {
    const limiter = __createMlLimiterForTest();
    await expect(
      limiter.schedule(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    // The queue must keep working after a rejection.
    const ok = await limiter.schedule(async () => 42);
    expect(ok).toBe(42);
  });
});
