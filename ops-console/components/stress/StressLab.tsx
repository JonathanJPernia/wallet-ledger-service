'use client';

import { useMemo, useState } from 'react';
import { runStress, type StressRunResult } from '@/lib/stress/runner';
import { STRESS_SCENARIOS } from '@/lib/stress/scenarios';
import {
  friendlyAssertion,
  SCENARIO_COPY,
} from '@/lib/stress/scenario-copy';
import { apiData } from '@/lib/api/client';
import type { ReconciliationResult } from '@/lib/api/types';
import { PageHero } from '@/components/layout/PageHero';
import {
  Badge,
  Button,
  Collapsible,
  Input,
  JsonBlock,
  PanelCard,
  VerdictBanner,
} from '@/components/ui/Primitives';

function computeVerdict(
  result: StressRunResult,
  assertions: string[],
): { tone: 'ok' | 'warn' | 'error'; title: string; message: string } {
  const hasFail = assertions.some((a) => a.startsWith('FAIL'));
  const throttled = result.attempts.filter((a) => a.status === 429).length;

  if (hasFail) {
    return {
      tone: 'error',
      title: 'Algo no cuadra',
      message:
        'Revisa el detalle abajo. Puede haber doble cobro o respuestas inconsistentes.',
    };
  }

  if (throttled > 0) {
    return {
      tone: 'warn',
      title: 'Prueba parcial — servidor ocupado',
      message: `${result.successCount} peticiones OK y ${throttled} rechazadas por límite de velocidad (demasiadas a la vez). Baja la intensidad o espera 1 minuto. Lo importante: entre las exitosas, ¿hubo un solo movimiento?`,
    };
  }

  if (result.successCount === result.attempts.length) {
    return {
      tone: 'ok',
      title: 'Prueba completada',
      message: `Las ${result.successCount} peticiones respondieron bien. Revisa el resumen para confirmar que no hubo doble cobro.`,
    };
  }

  return {
    tone: 'warn',
    title: 'Resultado mixto',
    message: `${result.successCount} exitosas y ${result.errorCount} con error. Abre el detalle técnico si necesitas investigar.`,
  };
}

export function StressLab() {
  const [scenarioId, setScenarioId] = useState(STRESS_SCENARIOS[0].id);
  const [total, setTotal] = useState(STRESS_SCENARIOS[0].defaultTotal);
  const [concurrency, setConcurrency] = useState(STRESS_SCENARIOS[0].defaultConcurrency);
  const [amount, setAmount] = useState(STRESS_SCENARIOS[0].defaultAmount);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [setupLog, setSetupLog] = useState<string[]>([]);
  const [result, setResult] = useState<StressRunResult | null>(null);
  const [assertions, setAssertions] = useState<string[]>([]);
  const [recon, setRecon] = useState<ReconciliationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const scenario = useMemo(
    () => STRESS_SCENARIOS.find((s) => s.id === scenarioId) ?? STRESS_SCENARIOS[0],
    [scenarioId],
  );
  const copy = SCENARIO_COPY[scenario.id] ?? {
    title: scenario.title,
    subtitle: '',
    whatItTests: scenario.description,
    tip: '',
  };

  function selectScenario(id: string) {
    const s = STRESS_SCENARIOS.find((x) => x.id === id)!;
    setScenarioId(id);
    setTotal(s.defaultTotal);
    setConcurrency(s.defaultConcurrency);
    setAmount(s.defaultAmount);
    setResult(null);
    setAssertions([]);
    setRecon(null);
    setError(null);
  }

  async function run() {
    setRunning(true);
    setError(null);
    setResult(null);
    setAssertions([]);
    setRecon(null);
    setProgress(0);

    try {
      const { context, log } = await scenario.setup();
      setSetupLog(log);

      const runResult = await runStress(
        {
          label: scenario.id,
          execute: (index) => scenario.runAttempt(index, context, amount),
        },
        {
          total,
          concurrency,
          onProgress: (done, max) => setProgress(Math.round((done / max) * 100)),
        },
      );

      setResult(runResult);
      setAssertions(scenario.assert(runResult.attempts, context));

      if (context.walletId) {
        const r = await apiData<ReconciliationResult>(
          `/reconciliation/wallets/${context.walletId}`,
        );
        if (r.ok && r.data) {
          setRecon(r.data);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  const verdict = result ? computeVerdict(result, assertions) : null;

  return (
    <div className="space-y-10">
      <PageHero
        title="Pruebas de estrés"
        description="Muchas operaciones a la vez, como si cientos de personas usaran la app al mismo tiempo. Comprueba que el dinero no se duplique ni se pierda."
      />

      <PanelCard title="Elige una prueba">
        <div className="grid gap-3 sm:grid-cols-2">
          {STRESS_SCENARIOS.map((s) => {
            const c = SCENARIO_COPY[s.id];
            const selected = s.id === scenarioId;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => selectScenario(s.id)}
                className={`p-4 text-left transition ${
                  selected
                    ? 'feature-card ring-2 ring-[var(--brand)]'
                    : 'panel-card hover:border-[color-mix(in_srgb,var(--brand)_40%,transparent)]'
                }`}
              >
                <p className="font-semibold text-[var(--brand-dark)]">
                  {c?.title ?? s.title}
                </p>
                <p className="mt-1 text-xs opacity-80">{c?.subtitle}</p>
              </button>
            );
          })}
        </div>

        <div className="feature-card mt-6 text-sm leading-relaxed">
          <p className="font-medium">{copy.whatItTests}</p>
          {copy.tip ? <p className="mt-2 opacity-80">{copy.tip}</p> : null}
        </div>
      </PanelCard>

      <PanelCard title="Intensidad de la prueba">
        <div className="grid items-end gap-4 sm:grid-cols-3">
          <Input
            label="Cuántas peticiones"
            hint="Total de intentos"
            type="number"
            value={total}
            onChange={(v) => setTotal(Number(v))}
          />
          <Input
            label="A la vez"
            hint="Simultáneas"
            type="number"
            value={concurrency}
            onChange={(v) => setConcurrency(Number(v))}
          />
          <Input
            label="Monto (USD)"
            hint="Por operación"
            type="number"
            value={amount}
            onChange={(v) => setAmount(Number(v))}
          />
        </div>

        <div className="mt-6">
          <Button size="lg" onClick={run} disabled={running}>
            {running ? `Ejecutando… ${progress}%` : 'Iniciar prueba'}
          </Button>
          {running ? (
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-[var(--brand)] transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          ) : null}
        </div>

        {setupLog.length > 0 ? (
          <p className="mt-4 text-sm text-slate-500">
            Preparación: billetera creada y fondos cargados para la prueba.
          </p>
        ) : null}

        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
      </PanelCard>

      {result && verdict ? (
        <>
          <VerdictBanner
            tone={verdict.tone}
            title={verdict.title}
            message={verdict.message}
          />

          <PanelCard title="Resumen rápido">
            <div className="flex flex-wrap gap-2">
              <Badge tone="ok">{result.successCount} exitosas</Badge>
              {result.errorCount > 0 ? (
                <Badge tone="error">{result.errorCount} con error</Badge>
              ) : null}
              <Badge>{(result.totalMs / 1000).toFixed(2)} s en total</Badge>
            </div>

            <ul className="mt-5 list-disc space-y-2 pl-5">
              {assertions.map((line) => (
                <li
                  key={line}
                  className={`text-sm ${
                    line.startsWith('FAIL')
                      ? 'text-red-700'
                      : line.startsWith('PASS')
                        ? 'text-green-800'
                        : 'text-slate-700'
                  }`}
                >
                  {friendlyAssertion(line)}
                </li>
              ))}
            </ul>

            {recon ? (
              <p className="mt-4 text-sm text-slate-600">
                {recon.isConsistent
                  ? 'Los registros internos coinciden con el saldo mostrado.'
                  : 'Hay diferencia entre el saldo y los movimientos — consulta al equipo técnico.'}
              </p>
            ) : null}
          </PanelCard>

          <Collapsible title="Ver detalle técnico de cada petición">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-slate-500">
                  <tr>
                    <th className="pb-2 pr-4">#</th>
                    <th className="pb-2 pr-4">Resultado</th>
                    <th className="pb-2 pr-4">Tiempo</th>
                    <th className="pb-2">Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {result.attempts.map((a) => (
                    <tr key={a.index} className="border-t border-slate-100">
                      <td className="py-2 pr-4">{a.index + 1}</td>
                      <td className="py-2 pr-4">
                        <Badge tone={a.ok ? 'ok' : a.status === 429 ? 'warn' : 'error'}>
                          {a.ok ? 'OK' : a.status === 429 ? 'Límite' : 'Error'}
                        </Badge>
                      </td>
                      <td className="py-2 pr-4 text-slate-500">{a.durationMs} ms</td>
                      <td className="py-2 text-xs text-slate-600">
                        {a.summary ?? a.error ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {recon ? (
              <div className="mt-4">
                <p className="mb-2 text-xs font-medium text-slate-500">Datos de verificación</p>
                <JsonBlock value={recon} />
              </div>
            ) : null}
          </Collapsible>
        </>
      ) : null}
    </div>
  );
}
