import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "./_core/context";

type CookieCall = { name: string; value: string; options: Record<string, unknown> };

function createContext(): { ctx: TrpcContext; setCookies: CookieCall[] } {
  const setCookies: CookieCall[] = [];
  const ctx: TrpcContext = {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      cookie: (name: string, value: string, options: Record<string, unknown>) => {
        setCookies.push({ name, value, options });
      },
      clearCookie: () => {},
    } as unknown as TrpcContext["res"],
  };
  return { ctx, setCookies };
}

const ORIGINAL_ENV = { ...process.env };

describe("auth.passwordLogin", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
  });

  async function buildRouter() {
    // Stub the DB lookup so we don't need a live database for the unit test.
    vi.doMock("./db", () => ({
      getUserByOpenId: vi.fn(async (openId: string) => ({
        id: 1,
        openId,
        email: "owner@example.com",
        name: "Owner",
        loginMethod: "manus",
        role: "admin",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      })),
    }));
    const { appRouter } = await import("./routers");
    return appRouter;
  }

  it("gateInfo reports enabled when ACCESS_PASSWORD is set", async () => {
    process.env.ACCESS_PASSWORD = "segredo123";
    process.env.OWNER_OPEN_ID = "owner-open-id";
    const appRouter = await buildRouter();
    const { ctx } = createContext();
    const result = await appRouter.createCaller(ctx).auth.gateInfo();
    expect(result.passwordGateEnabled).toBe(true);
  });

  it("issues a session cookie when the password is correct", async () => {
    process.env.ACCESS_PASSWORD = "segredo123";
    process.env.OWNER_OPEN_ID = "owner-open-id";
    process.env.JWT_SECRET = "test-secret";
    process.env.VITE_APP_ID = "app-id";
    const appRouter = await buildRouter();
    const { ctx, setCookies } = createContext();

    const result = await appRouter
      .createCaller(ctx)
      .auth.passwordLogin({ password: "segredo123" });

    expect(result).toEqual({ success: true });
    expect(setCookies).toHaveLength(1);
    expect(setCookies[0]?.name).toBe(COOKIE_NAME);
    expect(setCookies[0]?.value).toBeTruthy();
    expect(setCookies[0]?.options).toMatchObject({
      secure: true,
      sameSite: "none",
      httpOnly: true,
      path: "/",
    });
  });

  it("rejects an incorrect password with UNAUTHORIZED", async () => {
    process.env.ACCESS_PASSWORD = "segredo123";
    process.env.OWNER_OPEN_ID = "owner-open-id";
    const appRouter = await buildRouter();
    const { ctx, setCookies } = createContext();

    await expect(
      appRouter.createCaller(ctx).auth.passwordLogin({ password: "errada" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(setCookies).toHaveLength(0);
  });

  it("fails with PRECONDITION_FAILED when no password is configured", async () => {
    delete process.env.ACCESS_PASSWORD;
    process.env.OWNER_OPEN_ID = "owner-open-id";
    const appRouter = await buildRouter();
    const { ctx } = createContext();

    await expect(
      appRouter.createCaller(ctx).auth.passwordLogin({ password: "qualquer" })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
});
