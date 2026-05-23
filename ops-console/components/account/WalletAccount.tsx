'use client';

import { useState } from 'react';
import { apiData } from '@/lib/api/client';
import type { WalletDetail, WalletMovementsList } from '@/lib/api/types';
import { PageHero } from '@/components/layout/PageHero';
import {
  Button,
  Input,
  PanelCard,
  VerdictBanner,
} from '@/components/ui/Primitives';

const OPERATION_LABELS: Record<string, string> = {
  DEPOSIT: 'Ingreso',
  WITHDRAW: 'Retiro',
  TRANSFER_IN: 'Transferencia recibida',
  TRANSFER_OUT: 'Transferencia enviada',
  FEE_IN: 'Comisión (entrada)',
  FEE_OUT: 'Comisión',
};

function formatMoney(value: string) {
  const n = Number(value);
  if (Number.isNaN(n)) return value;
  const prefix = n < 0 ? '-' : '+';
  return `${prefix}$${Math.abs(n).toFixed(2)}`;
}

export function WalletAccount() {
  const [walletId, setWalletId] = useState('');
  const [wallet, setWallet] = useState<WalletDetail | null>(null);
  const [movements, setMovements] = useState<WalletMovementsList | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | undefined>();

  async function loadAccount(cursor?: string, append = false) {
    const id = walletId.trim();
    if (!id) {
      setError('Escribe el ID de la billetera.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const detail = await apiData<WalletDetail>(`/wallets/${id}`);
      if (!detail.ok || !detail.data) {
        setError(detail.error ?? 'No se encontró la billetera.');
        setWallet(null);
        setMovements(null);
        return;
      }
      setWallet(detail.data);

      const path = cursor
        ? `/wallets/${id}/movements?limit=20&cursor=${encodeURIComponent(cursor)}`
        : `/wallets/${id}/movements?limit=20`;

      const mov = await apiData<WalletMovementsList>(path);
      if (!mov.ok || !mov.data) {
        setError(mov.error ?? 'No se pudieron cargar los movimientos.');
        return;
      }

      setNextCursor(mov.data.nextCursor);
      setMovements((prev) =>
        append && prev
          ? {
              ...mov.data!,
              movements: [...prev.movements, ...mov.data!.movements],
            }
          : mov.data!,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-10">
      <PageHero
        title="Mi cuenta"
        description="Consulta el saldo actual y el historial de movimientos de una billetera."
      />

      <PanelCard title="Buscar billetera">
        <Input
          label="ID de la billetera"
          hint="Pégalo desde el tutorial o tras crear una cuenta"
          value={walletId}
          onChange={setWalletId}
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
        />
        <div className="mt-5">
          <Button size="lg" onClick={() => loadAccount()} disabled={loading}>
            {loading ? 'Cargando…' : 'Ver saldo y movimientos'}
          </Button>
        </div>
        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
      </PanelCard>

      {wallet ? (
        <>
          <VerdictBanner
            tone={wallet.isConsistent ? 'ok' : 'warn'}
            title={`Saldo: $${wallet.currentBalance} ${wallet.currency}`}
            message={
              wallet.isConsistent
                ? `El saldo coincide con el ledger ($${wallet.ledgerBalance}). Estado: ${wallet.status}.`
                : `Hay diferencia con el ledger ($${wallet.ledgerBalance}). Consulta al equipo técnico.`
            }
          />

          {movements ? (
            <PanelCard
              title="Movimientos"
              subtitle={`${movements.movements.length} en esta página${movements.hasMore ? ' · hay más' : ''}`}
            >
              {movements.movements.length === 0 ? (
                <p className="text-sm text-slate-600">Sin movimientos todavía.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-slate-500">
                      <tr>
                        <th className="pb-2 pr-3">Fecha</th>
                        <th className="pb-2 pr-3">Tipo</th>
                        <th className="pb-2 pr-3">Monto</th>
                        <th className="pb-2">Saldo después</th>
                      </tr>
                    </thead>
                    <tbody>
                      {movements.movements.map((m) => (
                        <tr key={`${m.id}-${m.createdAt}`} className="border-t border-slate-100">
                          <td className="py-2.5 pr-3 text-slate-600">
                            {new Date(m.createdAt).toLocaleString('es')}
                          </td>
                          <td className="py-2.5 pr-3">
                            {OPERATION_LABELS[m.operationType] ?? m.operationType}
                          </td>
                          <td
                            className={`py-2.5 pr-3 font-medium ${
                              Number(m.signedAmount) < 0
                                ? 'text-red-700'
                                : 'text-[var(--brand-dark)]'
                            }`}
                          >
                            {formatMoney(m.signedAmount)}
                          </td>
                          <td className="py-2.5">${m.balanceAfter}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {movements.hasMore && nextCursor ? (
                <div className="mt-5">
                  <Button
                    variant="outline"
                    disabled={loading}
                    onClick={() => loadAccount(nextCursor, true)}
                  >
                    Cargar más
                  </Button>
                </div>
              ) : null}
            </PanelCard>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
