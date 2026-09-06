export interface TimedEvent {
  eventTime: string;
}

export interface CareGapWindow {
  startsAt: string;
  endsAt: string;
}

/**
 * Returns only genuine adjacent intervals. An interval that crosses or touches
 * a declared care gap is deliberately omitted: the events are not comparable.
 */
export function usableIntervals(events: TimedEvent[], gaps: CareGapWindow[]): number[] {
  const ordered = [...events].sort(
    (left, right) => new Date(left.eventTime).getTime() - new Date(right.eventTime).getTime(),
  );
  const orderedGaps = gaps.map((gap) => ({
    startsAt: new Date(gap.startsAt).getTime(),
    endsAt: new Date(gap.endsAt).getTime(),
  }));
  const intervals: number[] = [];

  for (let index = 1; index < ordered.length; index += 1) {
    const previous = new Date(ordered[index - 1].eventTime).getTime();
    const current = new Date(ordered[index].eventTime).getTime();
    const crossesGap = orderedGaps.some((gap) => previous <= gap.startsAt && current >= gap.endsAt);
    const eventInsideGap = orderedGaps.some((gap) =>
      (previous >= gap.startsAt && previous <= gap.endsAt) || (current >= gap.startsAt && current <= gap.endsAt),
    );

    if (!crossesGap && !eventInsideGap) intervals.push(current - previous);
  }

  return intervals;
}
