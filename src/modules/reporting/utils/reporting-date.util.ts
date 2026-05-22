import type { ReportingPeriod } from '../reporting.types';

export function utcDayBounds(date: Date): { start: Date; end: Date } {
  const start = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const end = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1),
  );
  return { start, end };
}

export function resolveReportingRange(
  period: ReportingPeriod,
  startDate?: string,
  endDate?: string,
): { startDate: Date; endDate: Date } {
  const now = new Date();

  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new Error('Invalid startDate or endDate');
    }
    if (end <= start) {
      throw new Error('endDate must be after startDate');
    }
    return { startDate: start, endDate: end };
  }

  const end = now;
  const start = new Date(end);

  switch (period) {
    case 'daily':
      start.setUTCDate(start.getUTCDate() - 1);
      break;
    case 'weekly':
      start.setUTCDate(start.getUTCDate() - 7);
      break;
    case 'monthly':
      start.setUTCMonth(start.getUTCMonth() - 1);
      break;
    default:
      start.setUTCDate(start.getUTCDate() - 1);
  }

  return { startDate: start, endDate: end };
}

/** Día UTC anterior al instante actual (cierre diario). */
export function previousUtcClosingDay(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1),
  );
}
