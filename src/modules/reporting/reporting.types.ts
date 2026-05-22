export type ReportingPeriod = 'daily' | 'weekly' | 'monthly';

export type DateRangeFilter = {
  startDate: Date;
  endDate: Date;
  currency?: string;
};
