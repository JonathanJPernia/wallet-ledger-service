/**
 * Transferencias: lock ordering determinista para evitar deadlock (A→B vs B→A).
 * Siempre bloquear la wallet con id menor (lexicográfico) primero.
 */
export function sortWalletIdsForLock(
  walletIdA: string,
  walletIdB: string,
): [string, string] {
  return walletIdA < walletIdB
    ? [walletIdA, walletIdB]
    : [walletIdB, walletIdA];
}
