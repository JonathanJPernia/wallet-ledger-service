'use client';

import { useState } from 'react';
import { apiData, newIdempotencyKey } from '@/lib/api/client';
import type {
  DepositResult,
  HealthResponse,
  TransferResult,
  Wallet,
  WalletDetail,
  WalletMovementsList,
  WithdrawResult,
} from '@/lib/api/types';
import { PageHero } from '@/components/layout/PageHero';
import {
  Button,
  Collapsible,
  JsonBlock,
  PanelCard,
  StepProgress,
  VerdictBanner,
} from '@/components/ui/Primitives';

const STEPS = [
  'Comprobar servidor',
  'Crear billeteras',
  'Ingresar dinero',
  'Enviar a otra billetera',
  'Retirar dinero',
  'Ver saldo y movimientos',
];

type StepMessage = {
  tone: 'ok' | 'error' | 'warn';
  title: string;
  message: string;
};

function formatMoney(value: string | undefined) {
  if (!value) return '—';
  return `$${value}`;
}

export function TutorialWizard() {
  const [step, setStep] = useState(0);
  const [walletA, setWalletA] = useState('');
  const [walletB, setWalletB] = useState('');
  const [balanceA, setBalanceA] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [lastMessage, setLastMessage] = useState<StepMessage | null>(null);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [technicalLog, setTechnicalLog] = useState<unknown[]>([]);

  function markDone(stepIndex: number) {
    setCompletedSteps((prev) => new Set(prev).add(stepIndex));
  }

  function pushLog(entry: unknown) {
    setTechnicalLog((prev) => [...prev, entry]);
  }

  async function runStep() {
    setRunning(true);
    setLastMessage(null);

    try {
      if (step === 0) {
        const h = await apiData<HealthResponse>('/health');
        pushLog(h);
        if (h.ok && h.data?.status === 'ok') {
          markDone(0);
          setLastMessage({
            tone: 'ok',
            title: 'Servidor listo',
            message:
              'Tu API está en línea y la base de datos responde. Podemos continuar con las billeteras.',
          });
        } else {
          setLastMessage({
            tone: 'error',
            title: 'No se pudo conectar',
            message:
              h.error ??
              'Revisa Conexión en la barra superior y que CORS esté configurado en Railway.',
          });
        }
      }

      if (step === 1) {
        const a = await apiData<Wallet>('/wallets', {
          method: 'POST',
          body: { currency: 'USD' },
        });
        const b = await apiData<Wallet>('/wallets', {
          method: 'POST',
          body: { currency: 'USD' },
        });
        pushLog({ a, b });
        if (a.data && b.data) {
          setWalletA(a.data.id);
          setWalletB(b.data.id);
          markDone(1);
          setLastMessage({
            tone: 'ok',
            title: 'Dos billeteras creadas',
            message:
              'Tienes una billetera principal y otra para recibir transferencias. Siguiente paso: cargar dinero.',
          });
        } else {
          setLastMessage({
            tone: 'error',
            title: 'Error al crear billeteras',
            message: a.error ?? b.error ?? 'Intenta de nuevo.',
          });
        }
      }

      if (step === 2 && walletA) {
        const d = await apiData<DepositResult>(`/wallets/${walletA}/deposit`, {
          method: 'POST',
          body: { amount: 100 },
          idempotencyKey: newIdempotencyKey('tutorial-dep'),
        });
        pushLog(d);
        if (d.ok && d.data) {
          setBalanceA(d.data.balanceAfter);
          markDone(2);
          setLastMessage({
            tone: 'ok',
            title: 'Dinero ingresado',
            message: `Ingresaste $100.00. Tu saldo ahora es ${formatMoney(d.data.balanceAfter)}.`,
          });
        } else {
          setLastMessage({
            tone: 'error',
            title: 'No se pudo ingresar dinero',
            message: d.error ?? 'Revisa el servidor.',
          });
        }
      }

      if (step === 3 && walletA && walletB) {
        const t = await apiData<TransferResult>('/wallets/transfer', {
          method: 'POST',
          body: { fromWalletId: walletA, toWalletId: walletB, amount: 30 },
          idempotencyKey: newIdempotencyKey('tutorial-tr'),
        });
        pushLog(t);
        if (t.ok && t.data) {
          setBalanceA(t.data.fromBalanceAfter);
          markDone(3);
          setLastMessage({
            tone: 'ok',
            title: 'Transferencia enviada',
            message: `Enviaste $30.00 a la otra billetera. Tu saldo quedó en ${formatMoney(t.data.fromBalanceAfter)}.`,
          });
        } else {
          setLastMessage({
            tone: 'error',
            title: 'Transferencia fallida',
            message: t.error ?? 'No hay fondos suficientes o el servidor rechazó la operación.',
          });
        }
      }

      if (step === 4 && walletA) {
        const w = await apiData<WithdrawResult>(`/wallets/${walletA}/withdraw`, {
          method: 'POST',
          body: { amount: 20 },
          idempotencyKey: newIdempotencyKey('tutorial-wd'),
        });
        pushLog(w);
        if (w.ok && w.data) {
          setBalanceA(w.data.balanceAfter);
          markDone(4);
          setLastMessage({
            tone: 'ok',
            title: 'Retiro realizado',
            message: `Retiraste $20.00. Saldo actual: ${formatMoney(w.data.balanceAfter)}.`,
          });
        } else {
          setLastMessage({
            tone: 'error',
            title: 'Retiro fallido',
            message: w.error ?? 'Intenta de nuevo.',
          });
        }
      }

      if (step === 5 && walletA) {
        const detail = await apiData<WalletDetail>(`/wallets/${walletA}`);
        const mov = await apiData<WalletMovementsList>(
          `/wallets/${walletA}/movements?limit=10`,
        );
        pushLog({ detail, mov });
        if (detail.ok && detail.data && mov.ok && mov.data) {
          markDone(5);
          setBalanceA(detail.data.currentBalance);
          setLastMessage({
            tone: detail.data.isConsistent ? 'ok' : 'warn',
            title: detail.data.isConsistent ? '¡Todo cuadra!' : 'Revisa los números',
            message: detail.data.isConsistent
              ? `Saldo ${formatMoney(detail.data.currentBalance)} · ${mov.data.movements.length} movimientos en el historial. Puedes ver más en Mi cuenta.`
              : `El saldo en pantalla no coincide con el ledger (${formatMoney(detail.data.ledgerBalance)}).`,
          });
        } else {
          setLastMessage({
            tone: 'error',
            title: 'No se pudo consultar la cuenta',
            message: detail.error ?? mov.error ?? 'Intenta de nuevo.',
          });
        }
      }
    } finally {
      setRunning(false);
    }
  }

  function goNext() {
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
      setLastMessage(null);
    }
  }

  const allDone = completedSteps.size === STEPS.length;

  return (
    <div className="space-y-10">
      <PageHero
        title="Tutorial paso a paso"
        description="El recorrido típico de una billetera: crear cuentas, ingresar dinero, transferir, retirar y comprobar que todo cuadra."
      />

      {allDone ? (
        <VerdictBanner
          tone="ok"
          title="¡Tutorial completado!"
          message="Recorriste todo el flujo básico. Si quieres ir más allá, prueba las pruebas de estrés en el menú."
        />
      ) : null}

      <PanelCard title="Tu progreso">
        <StepProgress steps={STEPS} current={step} />

        {walletA ? (
          <div className="feature-card mt-6 text-sm">
            <p>
              <strong>Tu billetera:</strong>{' '}
              {walletA.slice(0, 8)}…
              {balanceA != null ? (
                <>
                  {' '}
                  · <strong>Saldo:</strong> {formatMoney(balanceA)}
                </>
              ) : null}
            </p>
            {walletB ? (
              <p className="mt-1">
                <strong>Billetera destino:</strong>{' '}
                {walletB.slice(0, 8)}…
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-3">
          <Button size="lg" onClick={runStep} disabled={running}>
            {running ? 'Procesando…' : `Hacer paso ${step + 1}: ${STEPS[step]}`}
          </Button>
          {completedSteps.has(step) && step < STEPS.length - 1 ? (
            <Button variant="outline" size="lg" onClick={goNext}>
              Siguiente paso
            </Button>
          ) : null}
        </div>
      </PanelCard>

      {lastMessage ? (
        <VerdictBanner
          tone={lastMessage.tone}
          title={lastMessage.title}
          message={lastMessage.message}
        />
      ) : null}

      {technicalLog.length > 0 ? (
        <Collapsible title="Ver respuesta técnica del servidor">
          <JsonBlock value={technicalLog} />
        </Collapsible>
      ) : null}
    </div>
  );
}
