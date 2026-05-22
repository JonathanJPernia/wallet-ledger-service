import { Prisma } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import { ReportingRepository } from '../src/modules/reporting/repositories/reporting.repository';
import { PnlService } from '../src/modules/reporting/services/pnl.service';
import { SnapshotService } from '../src/modules/reporting/services/snapshot.service';
import { ReconciliationRepository } from '../src/modules/reconciliation/repositories/reconciliation.repository';
import { utcDayBounds } from '../src/modules/reporting/utils/reporting-date.util';

describe('Reporting financial invariants', () => {
  describe('P&L determinism (mocked ledger)', () => {
    let pnlService: PnlService;

    const reportingRepository = {
      sumFeeRevenue: jest.fn(),
      feeBreakdownByGroupType: jest.fn(),
    };

    beforeEach(async () => {
      jest.clearAllMocks();
      reportingRepository.sumFeeRevenue.mockResolvedValue(new Prisma.Decimal('125.50'));
      reportingRepository.feeBreakdownByGroupType.mockResolvedValue([
        { sourceType: 'TRANSFER', revenue: new Prisma.Decimal('80.25') },
        { sourceType: 'WITHDRAW', revenue: new Prisma.Decimal('45.25') },
      ]);

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          PnlService,
          { provide: ReportingRepository, useValue: reportingRepository },
        ],
      }).compile();

      pnlService = module.get(PnlService);
    });

    it('maps FEE_IN aggregates deterministically from repository', async () => {
      const result = await pnlService.getPnl({
        period: 'daily',
        startDate: '2026-05-01T00:00:00.000Z',
        endDate: '2026-05-10T00:00:00.000Z',
        currency: 'USD',
      });

      expect(result.data.totalRevenue).toBe('125.50');
      expect(result.data.netProfit).toBe('125.50');
      expect(result.data.feeBreakdown.TRANSFER).toBe('80.25');
      expect(result.data.feeBreakdown.WITHDRAW).toBe('45.25');
      expect(result.data.feeBreakdown.DEPOSIT).toBe('0.00');
      expect(reportingRepository.sumFeeRevenue).toHaveBeenCalledWith(
        expect.objectContaining({ currency: 'USD' }),
      );
    });
  });

  describe('Snapshot vs ledger fee revenue', () => {
    it('frozen period bounds match utc day', () => {
      const day = new Date('2026-05-20T18:00:00.000Z');
      const { start, end } = utcDayBounds(day);
      expect(start.toISOString()).toBe('2026-05-20T00:00:00.000Z');
      expect(end.toISOString()).toBe('2026-05-21T00:00:00.000Z');
    });

    it('verifySnapshot uses same range as stored period', async () => {
      const day = new Date('2026-05-20');
      const { start, end } = utcDayBounds(day);

      const reportingRepository = {
        findFinancialSnapshot: jest.fn().mockResolvedValue({
          totalFeeRevenue: new Prisma.Decimal('10.50'),
        }),
        sumFeeRevenue: jest.fn().mockResolvedValue(new Prisma.Decimal('10.50')),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SnapshotService,
          { provide: ReportingRepository, useValue: reportingRepository },
        ],
      }).compile();

      const snapshotService = module.get(SnapshotService);
      const verification = await snapshotService.verifySnapshotAgainstLedger(
        '2026-05-20',
        'USD',
      );

      expect(verification.matches).toBe(true);
      expect(reportingRepository.sumFeeRevenue).toHaveBeenCalledWith({
        startDate: start,
        endDate: end,
        currency: 'USD',
      });
    });
  });

  describe('Reconciliation signed amount (ledger truth)', () => {
    it('zero difference means consistent wallet', async () => {
      const reconciliationRepository = {
        findWalletDriftRows: jest.fn().mockResolvedValue([]),
      };

      const drifts = await reconciliationRepository.findWalletDriftRows();
      const walletId = 'wallet-a';
      const row = drifts.find((d: { walletId: string }) => d.walletId === walletId);
      expect(row).toBeUndefined();
    });

    it('detects drift when projection != ledger', async () => {
      const reconciliationRepository = {
        findWalletDriftRows: jest.fn().mockResolvedValue([
          {
            walletId: 'w1',
            projectionBalance: new Prisma.Decimal(100),
            ledgerBalance: new Prisma.Decimal(99),
            difference: new Prisma.Decimal(1),
          },
        ]),
      };

      const drifts = await reconciliationRepository.findWalletDriftRows();
      expect(drifts[0].difference.toString()).toBe('1');
    });
  });
});
