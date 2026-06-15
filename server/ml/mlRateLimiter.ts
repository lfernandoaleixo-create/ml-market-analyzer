/**
 * Global Mercado Livre rate limiter (single shared bottleneck).
 *
 * The whole app fans out to the ML API from many places at once: opening the
 * ADS tab alone fires Dashboard + Campaigns + Ads + Categories + Audit +
 * Insights queries in parallel, and each of those pages forward through several
 * PAGED requests. The seller dashboard pages (Vendas, Anúncios, Pós-venda,
 * Reputação) do the same. ML throttles bursts within a short window, so this
 * parallel fan-out is exactly what produced the recurring "429 — não foi
 * possível carregar".
 *
 * The fix is to never let those requests hit ML as a burst. Every ML fetch in
 * the process (AdsProvider AND AccountProvider) is funnelled through ONE queue
 * that:
 *   - runs at most `MAX_CONCURRENCY` requests at a time (1 = fully serialized);
 *   - enforces a minimum spacing of `MIN_SPACING_MS` between consecutive starts;
 *   - applies a global cooldown when ML returns 429/Retry-After, so a throttle
 *     on one call automatically backs off ALL queued calls instead of each one
 *     discovering the limit independently.
 *
 * This is process-local (Cloud Run min-instances=0, single process), which is
 * the right scope: the goal is to flatten this instance's own bursts, the very
 * thing that triggers ML's per-token short-window limit.
 *
 * Tunables are overridable via env so we can tighten/relax without a code change:
 *   ML_RL_MIN_SPACING_MS   (default 220)
 *   ML_RL_MAX_CONCURRENCY  (default 1)
 */

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Under the test runner the spacing/cooldown only add latency (the unit specs
 * that exercise the provider's 429/401 paths fire many sequential requests and
 * would blow vitest's 5s timeout). The limiter's OWN behaviour is covered by
 * mlRateLimiter.test.ts using isolated instances with explicit timings, so here
 * we make the shared instance transparent when running under Vitest. Production
 * (and the dedicated limiter specs) keep the real spacing.
 */
const IS_TEST = process.env.VITEST === "true" || process.env.NODE_ENV === "test";

const MIN_SPACING_MS = IS_TEST ? 0 : envInt("ML_RL_MIN_SPACING_MS", 350);
const MAX_CONCURRENCY = envInt("ML_RL_MAX_CONCURRENCY", IS_TEST ? 64 : 1);

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface QueueItem {
  run: () => void;
}

class MlRateLimiter {
  private queue: QueueItem[] = [];
  private active = 0;
  /** Epoch ms when the most recent request was allowed to start. */
  private lastStart = 0;
  /** Epoch ms until which ALL requests must wait (set on a 429/Retry-After). */
  private cooldownUntil = 0;
  private readonly minSpacingMs: number;
  private readonly maxConcurrency: number;
  private readonly cooldownDisabled: boolean;
  private readonly bypass: boolean;

  constructor(opts?: {
    minSpacingMs?: number;
    maxConcurrency?: number;
    cooldownDisabled?: boolean;
    bypass?: boolean;
  }) {
    this.minSpacingMs = opts?.minSpacingMs ?? MIN_SPACING_MS;
    this.maxConcurrency = opts?.maxConcurrency ?? MAX_CONCURRENCY;
    // Default: the shared instance disables cooldown under test; explicit
    // test instances (mlRateLimiter.test.ts) re-enable it to verify behaviour.
    this.cooldownDisabled = opts?.cooldownDisabled ?? IS_TEST;
    this.bypass = opts?.bypass ?? IS_TEST;
  }

  /**
   * Schedule `task` to run through the shared bottleneck. Resolves/rejects with
   * the task's own result, so callers use it transparently:
   *   const json = await mlLimiter.schedule(() => fetch(...));
   */
  schedule<T>(task: () => Promise<T>): Promise<T> {
    // Under test the shared instance is fully transparent: run the task inline
    // with no queue/timers. This keeps the limiter from coupling to specs that
    // use fake timers or rely on per-test isolation (the limiter's real queuing
    // behaviour is verified separately in mlRateLimiter.test.ts).
    if (this.bypass) return task();
    return new Promise<T>((resolve, reject) => {
      const item: QueueItem = {
        run: () => {
          task().then(resolve, reject).finally(() => {
            this.active -= 1;
            this.pump();
          });
        },
      };
      this.queue.push(item);
      this.pump();
    });
  }

  /**
   * Apply a global cooldown so every queued/next request waits at least `ms`
   * before starting. Called when ML signals a rate limit, so one throttled
   * request backs the whole queue off instead of each call hitting 429 alone.
   */
  applyCooldown(ms: number): void {
    // The shared instance is transparent under Vitest; a global cooldown there
    // would leak across tests (it's a process singleton) and stall unrelated
    // specs. The cooldown behaviour itself is covered by mlRateLimiter.test.ts
    // on isolated instances.
    if (this.cooldownDisabled) return;
    if (!Number.isFinite(ms) || ms <= 0) return;
    const until = Date.now() + ms;
    if (until > this.cooldownUntil) this.cooldownUntil = until;
  }

  /** Drain the queue while respecting concurrency, spacing and cooldown. */
  private pump(): void {
    if (this.active >= this.maxConcurrency) return;
    const next = this.queue.shift();
    if (!next) return;

    const now = Date.now();
    const spacingWait = Math.max(0, this.lastStart + this.minSpacingMs - now);
    const cooldownWait = Math.max(0, this.cooldownUntil - now);
    const wait = Math.max(spacingWait, cooldownWait);

    this.active += 1;

    const start = () => {
      this.lastStart = Date.now();
      next.run();
      // Try to start more workers if concurrency allows (rarely >1 here).
      if (this.active < this.maxConcurrency && this.queue.length > 0) this.pump();
    };

    if (wait > 0) {
      sleep(wait).then(start);
    } else {
      start();
    }
  }

  /** Test/inspection helper. */
  get pendingCount(): number {
    return this.queue.length;
  }
}

/** The single, process-wide ML limiter shared by all providers. */
export const mlLimiter = new MlRateLimiter();

/** Test helper to build an isolated limiter (so specs don't share state).
 *  Accepts explicit timings so the limiter's own behaviour is verified with
 *  real spacing even though the shared instance is transparent under Vitest. */
export function __createMlLimiterForTest(opts?: {
  minSpacingMs?: number;
  maxConcurrency?: number;
  cooldownDisabled?: boolean;
  bypass?: boolean;
}): MlRateLimiter {
  return new MlRateLimiter({
    minSpacingMs: 220,
    maxConcurrency: 1,
    cooldownDisabled: false,
    bypass: false,
    ...opts,
  });
}
