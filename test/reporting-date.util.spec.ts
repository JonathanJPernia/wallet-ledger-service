import {
  previousUtcClosingDay,
  resolveReportingRange,
  utcDayBounds,
} from '../src/modules/reporting/utils/reporting-date.util';

describe('reporting-date.util', () => {
  it('utcDayBounds covers one UTC calendar day', () => {
    const day = new Date('2026-05-20T15:30:00.000Z');
    const { start, end } = utcDayBounds(day);
    expect(start.toISOString()).toBe('2026-05-20T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-05-21T00:00:00.000Z');
  });

  it('resolveReportingRange uses explicit dates when provided', () => {
    const range = resolveReportingRange(
      'daily',
      '2026-05-01T00:00:00.000Z',
      '2026-05-10T00:00:00.000Z',
    );
    expect(range.startDate.toISOString()).toBe('2026-05-01T00:00:00.000Z');
    expect(range.endDate.toISOString()).toBe('2026-05-10T00:00:00.000Z');
  });

  it('previousUtcClosingDay is yesterday UTC', () => {
    const prev = previousUtcClosingDay();
    expect(prev.getUTCHours()).toBe(0);
    expect(prev.getUTCMinutes()).toBe(0);
  });
});
