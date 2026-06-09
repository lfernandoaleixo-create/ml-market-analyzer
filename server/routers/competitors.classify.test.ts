import { describe, it, expect } from "vitest";
import { classifyCompetitorError } from "./competitors";
import { UnwrangleError } from "../competitors/unwrangle";

describe("classifyCompetitorError — honest error mapping", () => {
  it("maps a JSON.parse SyntaxError (HTML error page) to BAD_GATEWAY", () => {
    // This is the exact failure behind the user-reported "Unexpected token '<'".
    let parseErr: unknown;
    try {
      JSON.parse("<!DOCTYPE html><html><body>502</body></html>");
    } catch (e) {
      parseErr = e;
    }
    const out = classifyCompetitorError(parseErr);
    expect(out.code).toBe("BAD_GATEWAY");
    expect(out.message).not.toMatch(/unexpected token/i); // no raw stack leak
    expect(out.message).toMatch(/inst|tempor/i);
  });

  it("maps a network TypeError to BAD_GATEWAY", () => {
    const out = classifyCompetitorError(new TypeError("fetch failed"));
    expect(out.code).toBe("BAD_GATEWAY");
  });

  it("maps Unwrangle not_configured to PRECONDITION_FAILED", () => {
    const out = classifyCompetitorError(new UnwrangleError("not_configured", "x"));
    expect(out.code).toBe("PRECONDITION_FAILED");
  });

  it("maps Unwrangle credits/auth to FORBIDDEN", () => {
    expect(classifyCompetitorError(new UnwrangleError("credits", "x")).code).toBe("FORBIDDEN");
    expect(classifyCompetitorError(new UnwrangleError("auth", "x")).code).toBe("FORBIDDEN");
  });

  it("maps Unwrangle upstream to BAD_GATEWAY", () => {
    expect(classifyCompetitorError(new UnwrangleError("upstream", "x")).code).toBe("BAD_GATEWAY");
  });

  it("maps an unknown error to INTERNAL_SERVER_ERROR without leaking details", () => {
    const out = classifyCompetitorError(new Error("boom secret detail"));
    expect(out.code).toBe("INTERNAL_SERVER_ERROR");
    expect(out.message).not.toMatch(/boom secret/);
  });
});
