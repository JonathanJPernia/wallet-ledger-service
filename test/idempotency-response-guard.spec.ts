import {
  isValidTransferResponse,
  isValidWithdrawResponse,
} from '../src/common/database/idempotency-response-guard';

describe('idempotency response guard', () => {
  it('accepts complete transfer snapshot', () => {
    expect(
      isValidTransferResponse({
        transferId: 'g1',
        fromWalletId: 'a',
        toWalletId: 'b',
        amount: '100.00',
        baseAmount: '100.00',
        feeAmount: '0.50',
        totalDeducted: '100.50',
        fromBalanceBefore: '200.00',
        fromBalanceAfter: '99.50',
        toBalanceBefore: '0.00',
        toBalanceAfter: '100.00',
        status: 'COMPLETED',
        idempotencyKey: 'k1',
      }),
    ).toBe(true);
  });

  it('rejects transfer snapshot missing fee fields', () => {
    expect(
      isValidTransferResponse({
        transferId: 'g1',
        fromWalletId: 'a',
        toWalletId: 'b',
        amount: '100.00',
        fromBalanceBefore: '200.00',
        fromBalanceAfter: '100.00',
        toBalanceBefore: '0.00',
        toBalanceAfter: '100.00',
        status: 'COMPLETED',
        idempotencyKey: 'k1',
      }),
    ).toBe(false);
  });

  it('accepts complete withdraw snapshot', () => {
    expect(
      isValidWithdrawResponse({
        withdrawId: 'g1',
        ledgerEntryId: 'le1',
        walletId: 'w1',
        currency: 'USD',
        amount: '50.00',
        baseAmount: '50.00',
        feeAmount: '0.50',
        totalDeducted: '50.50',
        balanceBefore: '100.00',
        balanceAfter: '49.50',
        status: 'COMPLETED',
        idempotencyKey: 'k1',
      }),
    ).toBe(true);
  });
});
