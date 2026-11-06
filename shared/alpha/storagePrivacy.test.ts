import { describe, expect, it } from "vitest";
import {
  canPersistBrowserHistory,
  canPersistBrowserHistoryUpdate,
  getBrowserDraftAction,
} from "./storagePrivacy";

describe("private product history policy", () => {
  it("permits explicitly local public simulations after identity resolves", () =>
    expect(canPersistBrowserHistory(null, false, false)).toBe(true));
  it.each([
    [10, true, false],
    [10, false, false],
    [null, true, false],
    [null, false, true],
    [10, false, true],
    [null, true, true],
  ] as const)(
    "blocks private or pending state %s/%s/%s",
    (owner, auth, loading) => {
      expect(canPersistBrowserHistory(owner, auth, loading)).toBe(false);
    }
  );
  it("does not overwrite or remove a guest draft while identity is unresolved", () => {
    expect(getBrowserDraftAction(null, false, true)).toBe("wait");
    expect(getBrowserDraftAction(null, false, false)).toBe("persist");
  });
  it("clears local draft fields for authenticated or tainted private sessions", () => {
    expect(getBrowserDraftAction(null, true, false)).toBe("clear");
    expect(getBrowserDraftAction(10, false, true)).toBe("clear");
    expect(getBrowserDraftAction(10, false, false)).toBe("clear");
  });
  it("blocks initial writes, additions and rewrites while private or pending", () => {
    const first = { id: "guest-one" };
    const second = { id: "guest-two" };
    const previous = [first, second];
    expect(canPersistBrowserHistoryUpdate(false, previous, previous)).toBe(
      false
    );
    expect(
      canPersistBrowserHistoryUpdate(false, previous, [
        ...previous,
        { id: "private" },
      ])
    ).toBe(false);
    expect(
      canPersistBrowserHistoryUpdate(false, previous, [{ ...first }])
    ).toBe(false);
  });
  it("allows deletion of existing guest records without copying new data", () => {
    const first = { id: "guest-one" };
    const second = { id: "guest-two" };
    expect(
      canPersistBrowserHistoryUpdate(false, [first, second], [second])
    ).toBe(true);
    expect(canPersistBrowserHistoryUpdate(false, [first], [])).toBe(true);
    expect(canPersistBrowserHistoryUpdate(true, [], [first])).toBe(true);
  });
});
