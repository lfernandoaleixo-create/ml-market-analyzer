import { describe, it, expect, vi } from "vitest";
import { resolveMlUserId, mlUserIdFromToken } from "./resolveMlUserId";

const TOKEN = "APP_USR-1790005725650717-061114-084f2b2ab47ed829d373cc75c7691e59-3308178634";
const ML_ID = 3308178634;

describe("mlUserIdFromToken", () => {
  it("extracts the trailing seller id", () => {
    expect(mlUserIdFromToken(TOKEN)).toBe(ML_ID);
  });
  it("returns 0 for empty/invalid tokens", () => {
    expect(mlUserIdFromToken("")).toBe(0);
    expect(mlUserIdFromToken(null)).toBe(0);
    expect(mlUserIdFromToken("no-numeric-suffix-here")).toBe(0);
  });
});

describe("resolveMlUserId", () => {
  it("prefers the persisted db value and does NOT call /users/me", async () => {
    const meLookup = vi.fn(async () => 999999999);
    const r = await resolveMlUserId(TOKEN, ML_ID, meLookup);
    expect(r).toEqual({ mlUserId: ML_ID, source: "db" });
    expect(meLookup).not.toHaveBeenCalled();
  });

  it("rejects the local app id (1) persisted and falls back to /users/me", async () => {
    // This is the exact bug: the local user id (1) had been stored. It must be
    // rejected and the authoritative /users/me result used instead.
    const meLookup = vi.fn(async () => ML_ID);
    const r = await resolveMlUserId(TOKEN, 1, meLookup);
    expect(r).toEqual({ mlUserId: ML_ID, source: "me" });
    expect(meLookup).toHaveBeenCalledOnce();
  });

  it("falls back to /users/me when nothing is persisted", async () => {
    const meLookup = vi.fn(async () => ML_ID);
    const r = await resolveMlUserId(TOKEN, null, meLookup);
    expect(r).toEqual({ mlUserId: ML_ID, source: "me" });
  });

  it("falls back to the token suffix when /users/me fails", async () => {
    const meLookup = vi.fn(async () => null);
    const r = await resolveMlUserId(TOKEN, null, meLookup);
    expect(r).toEqual({ mlUserId: ML_ID, source: "token" });
  });

  it("returns none when no source yields a plausible id", async () => {
    const meLookup = vi.fn(async () => null);
    const r = await resolveMlUserId("garbage-token", null, meLookup);
    expect(r).toEqual({ mlUserId: 0, source: "none" });
  });

  it("never accepts a tiny (local) id from any source", async () => {
    const meLookup = vi.fn(async () => 2); // implausible seller id
    const r = await resolveMlUserId("APP_USR-x-y-z-3", 1, meLookup);
    // db(1) rejected, me(2) rejected, token suffix(3) rejected → none
    expect(r.mlUserId).toBe(0);
    expect(r.source).toBe("none");
  });
});
