import {
  LEDGER_SIGNED_OPERATION_TYPES,
  ledgerSignedAmountExpression,
} from '../src/modules/reconciliation/repositories/ledger-signed-amount.sql';

describe('ledgerSignedAmountExpression', () => {
  it('maps every core OperationType explicitly (no implicit debit ELSE)', () => {
    const sql = ledgerSignedAmountExpression().strings.join(' ');

    for (const op of LEDGER_SIGNED_OPERATION_TYPES) {
      expect(sql).toContain(`'${op}'`);
    }

    expect(sql).toContain("WHEN 'DEPOSIT' THEN amount");
    expect(sql).toContain("WHEN 'TRANSFER_IN' THEN amount");
    expect(sql).toContain("WHEN 'WITHDRAW' THEN -amount");
    expect(sql).toContain("WHEN 'TRANSFER_OUT' THEN -amount");
    expect(sql).toContain("WHEN 'FEE_IN' THEN amount");
    expect(sql).toContain("WHEN 'FEE_OUT' THEN -amount");
    expect(sql).not.toMatch(/ELSE\s+-amount/i);
  });
});
