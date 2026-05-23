'use client';

import { useEffect, useState } from 'react';
import { apiData } from '@/lib/api/client';
import type { HealthResponse } from '@/lib/api/types';
import { PageHero } from '@/components/layout/PageHero';
import {
  Button,
  FeatureCard,
  PanelCard,
  StatTile,
  VerdictBanner,
} from '@/components/ui/Primitives';

export default function DashboardPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const result = await apiData<HealthResponse>('/health');
    if (result.ok && result.data) {
      setHealth(result.data);
      setError(null);
    } else {
      setError(
        result.status === 0
          ? 'No pudimos contactar al servidor. Abre Conexión arriba a la derecha y revisa CORS.'
          : `El servidor respondió con un problema (${result.status}).`,
      );
      setHealth(null);
    }
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const online = health?.status === 'ok';

  return (
    <div className="space-y-10">
      <PageHero
        title="Prueba tu billetera digital"
        description="Demostración para validar depósitos, transferencias y retiros contra tu API en vivo. Empieza con el tutorial o salta directo a las pruebas de estrés."
        actions={[
          { label: 'Empezar tutorial', href: '/tutorial' },
          { label: 'Pruebas de estrés', href: '/stress' },
        ]}
      />

      {error ? (
        <VerdictBanner tone="error" title="Sin conexión" message={error} />
      ) : online ? (
        <VerdictBanner
          tone="ok"
          title="Servidor en línea"
          message="Todo listo. La base de datos responde y puedes comenzar las pruebas."
        />
      ) : loading ? (
        <PanelCard title="Comprobando…">
          <p className="text-sm text-slate-600">Un momento, estamos verificando el servidor.</p>
        </PanelCard>
      ) : (
        <VerdictBanner
          tone="warn"
          title="Revisar servidor"
          message="El sistema respondió pero algo no está al 100%. Consulta al equipo técnico."
        />
      )}

      {health ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatTile
            label="Estado"
            value={online ? 'En línea' : 'Revisar'}
            hint={health.environment === 'production' ? 'Producción' : health.environment}
          />
          <StatTile
            label="Base de datos"
            value={health.database.status === 'up' ? 'Conectada' : 'Problema'}
            hint={`${health.database.latencyMs} ms`}
          />
          <StatTile
            label="Activo"
            value={`${Math.floor(health.uptimeSeconds / 60)} min`}
            hint={`v${health.version}`}
          />
        </div>
      ) : null}

      <div className="grid gap-5 md:grid-cols-3">
        <FeatureCard
          title="Tutorial guiado"
          action={{ label: 'Comenzar', href: '/tutorial' }}
        >
          <p>
            Paso a paso: crear billeteras, ingresar dinero, transferir, retirar y verificar que
            los saldos cuadran.
          </p>
        </FeatureCard>

        <FeatureCard
          title="Pruebas de estrés"
          action={{ label: 'Abrir pruebas', href: '/stress' }}
        >
          <p>
            Simula muchas operaciones a la vez y comprueba que no se cobre dos veces ni se pierda
            dinero.
          </p>
        </FeatureCard>

        <FeatureCard title="Qué validamos">
          <p>
            Idempotencia en retiros y transferencias, saldos coherentes y resistencia cuando
            muchos usuarios operan en paralelo.
          </p>
        </FeatureCard>
      </div>

      <PanelCard title="Estado del servidor">
        <Button variant="outline" onClick={load} disabled={loading}>
          {loading ? 'Actualizando…' : 'Actualizar estado'}
        </Button>
      </PanelCard>
    </div>
  );
}
