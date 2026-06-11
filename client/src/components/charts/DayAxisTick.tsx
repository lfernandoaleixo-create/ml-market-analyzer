import { dayAxisLabelParts } from "@shared/visitsTrend";

/**
 * GLOBAL RULE: every time-series chart in the app renders its day axis exactly
 * like the "Visitas diárias" chart. A SINGLE vertical label per day in the form
 * "10 ter" (day number + weekday abbreviation) so there is never any overlap.
 * The whole label is rotated -90° and anchored at its end (right next to the
 * axis), keeping every day's number perfectly aligned on the same baseline
 * regardless of 1- or 2-digit days. Weekends (Sat/Sun) are red; today uses the
 * primary color.
 *
 * The `dataKey` feeding the axis MUST be an ISO date string (yyyy-mm-dd).
 */
export function DayAxisTick({ x, y, payload, todayKey }: any) {
  const iso = payload?.value as string;
  if (!iso) return null;
  const { dayNum, weekday, color, bold } = dayAxisLabelParts(iso, todayKey);
  return (
    <g transform={`translate(${x},${y})`}>
      <text
        x={0}
        y={0}
        dy={4}
        transform="rotate(-90)"
        textAnchor="end"
        fontSize={11}
        fontWeight={bold ? 700 : 500}
        fill={color}
      >
        <tspan>{dayNum}</tspan>
        <tspan dx={5} fontSize={9} fontWeight={bold ? 600 : 400} opacity={0.85}>
          {weekday}
        </tspan>
      </text>
    </g>
  );
}

/**
 * Shared XAxis props for a day-based axis, so all charts stay identical to the
 * visits chart. Spread these onto a Recharts <XAxis dataKey="<iso date>"> and
 * pass `tick={<DayAxisTick todayKey={todayKey} />}`.
 */
export const dayAxisProps = {
  tickLine: false as const,
  axisLine: { stroke: "var(--border)" },
  interval: 0 as const,
  minTickGap: 0,
  height: 84,
  tickMargin: 8,
};
