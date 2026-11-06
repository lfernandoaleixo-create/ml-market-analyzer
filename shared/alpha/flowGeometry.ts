/** Includes tall margin cards, not just the shorter choice nodes. */
export function flowBoardHeight(
  groups: readonly (readonly number[])[],
  rowGap: number,
  padding: number,
  minimum = 540
): number {
  const tallest = Math.max(
    0,
    ...groups.map(
      group =>
        group.reduce((sum, height) => sum + height, 0) +
        Math.max(0, group.length - 1) * rowGap
    )
  );
  return Math.max(minimum, tallest + padding * 2);
}

/** Keep the decision path above a horizontal comparison of all margins. */
export function flowCompactLayout(
  routeGroups: readonly (readonly number[])[],
  marginCount: number,
  nodeWidth: number,
  marginHeight: number,
  columnWidth: number,
  rowGap: number,
  horizontalPadding: number
) {
  const routeHeight = flowBoardHeight(routeGroups, rowGap, 0, 0);
  const count = Math.max(1, marginCount);
  const width = Math.max(
    horizontalPadding * 2 + routeGroups.length * columnWidth,
    horizontalPadding * 2 + count * nodeWidth + (count - 1) * rowGap
  );
  const marginY = 82 + routeHeight + 96;
  return {
    width,
    height: marginY + marginHeight + 82,
    routeHeight,
    marginY,
    marginStep:
      count > 1 ? (width - horizontalPadding * 2 - nodeWidth) / (count - 1) : 0,
  };
}

/** Opening the explorer prioritizes reading, with scrolling rather than tiny type. */
export function flowReadingZoom(
  sceneWidth: number,
  viewportWidth: number
): number {
  if (sceneWidth <= 0 || viewportWidth <= 0) return 0.86;
  return Math.min(1, Math.max(0.78, (viewportWidth - 32) / sceneWidth));
}

/** A deliberate overview can fit every node, including the final margin. */
export function flowOverviewZoom(
  sceneWidth: number,
  sceneHeight: number,
  viewportWidth: number,
  viewportHeight: number
): number {
  if (sceneWidth <= 0 || sceneHeight <= 0) return 0.78;
  return Math.min(
    1,
    Math.max(
      0.2,
      Math.min(
        Math.max(1, viewportWidth - 32) / sceneWidth,
        Math.max(1, viewportHeight - 32) / sceneHeight
      )
    )
  );
}
