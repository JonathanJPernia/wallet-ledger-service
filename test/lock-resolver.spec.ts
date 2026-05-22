import { LockResolverService } from '../src/common/database/lock-resolver.service';

describe('LockResolverService', () => {
  const resolver = new LockResolverService();

  it('sorts and deduplicates wallet ids', () => {
    expect(
      resolver.resolveOrderedWalletIds('b', 'a', 'b', undefined, ''),
    ).toEqual(['a', 'b']);
  });

  it('builds deterministic transfer lock set', () => {
    const ids = resolver.resolveTransferLockSet(
      'wallet-z',
      'wallet-a',
      'wallet-m',
    );
    expect(ids).toEqual(['wallet-a', 'wallet-m', 'wallet-z']);
  });
});
