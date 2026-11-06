import { describe, expect, it } from "vitest";
import {
  flowBoardHeight,
  flowCompactLayout,
  flowReadingZoom,
  flowOverviewZoom,
} from "./flowGeometry";
describe("flow graph bounds", () => {
  it.each([5, 6])("does not cut %i tall margin nodes or arrows", count => {
    const heights = Array(count).fill(178);
    const total = heights.reduce((sum, h) => sum + h, 0) + (count - 1) * 24;
    const board = flowBoardHeight([[124], Array(5).fill(124), heights], 24, 82);
    expect(board).toBeGreaterThanOrEqual(total + 164);
    expect((board - total) / 2 + total).toBeLessThanOrEqual(board - 82);
  });
  it("maintains a minimum for small empty graphs", () => {
    expect(flowBoardHeight([[], [124]], 24, 82)).toBe(540);
  });
  it("opens at readable scale even on a narrow or short screen", () => {
    expect(flowReadingZoom(1904, 1200)).toBe(0.78);
    expect(flowReadingZoom(1904, 375)).toBe(0.78);
    expect(flowReadingZoom(1904, 2400)).toBe(1);
  });
  it("fits all tall terminals when overview is explicitly requested", () => {
    const zoom = flowOverviewZoom(1904, 1220, 1440, 640);
    expect(zoom).toBeLessThan(0.52);
    expect(1904 * zoom).toBeLessThanOrEqual(1440 - 32);
    expect(1220 * zoom).toBeLessThanOrEqual(640 - 32);
  });
  it("uses bounded zoom for an unmeasured viewport", () => {
    expect(flowReadingZoom(0, 0)).toBe(0.86);
    expect(flowOverviewZoom(0, 0, 0, 0)).toBe(0.78);
  });
  it.each([5, 6])(
    "keeps all %i margins separated and inside the board",
    count => {
      const layout = flowCompactLayout(
        [[164], ...Array(5).fill([146])],
        count,
        226,
        192,
        248,
        24,
        28
      );
      expect(layout.marginStep).toBeGreaterThanOrEqual(226 + 24);
      expect(28 + (count - 1) * layout.marginStep + 226).toBeLessThanOrEqual(
        layout.width - 28
      );
      expect(layout.marginY + 192).toBeLessThanOrEqual(layout.height - 82);
      expect(layout.height).toBeLessThan(700);
    }
  );
  it("places margins below expanded alternatives without overlaps", () => {
    const layout = flowCompactLayout(
      [[164], Array(5).fill(146), [146]],
      5,
      226,
      192,
      248,
      24,
      28
    );
    expect(layout.routeHeight).toBe(826);
    expect(layout.marginY).toBeGreaterThan(82 + layout.routeHeight);
    expect(layout.height).toBeGreaterThan(layout.marginY + 192);
  });
});
