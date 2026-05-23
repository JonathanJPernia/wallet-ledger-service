'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '@/lib/api/client';
import { KEY_METRICS, parsePrometheusText, type ParsedMetric } from '@/lib/prometheus/parse';
import { Badge, Button, Card, JsonBlock } from '@/components/ui/Primitives';

export function MetricsPanel() {
  const [loading, setLoading] = useState(false);
  const [raw, setRaw] = useState('');
  const [metrics, setMetrics] = useState<ParsedMetric[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const fetchMetrics = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await apiRequest<string>('/metrics');
    setLoading(false);

    if (!result.ok) {
      setError(result.error ?? `HTTP ${result.status}`);
      return;
    }

    const text = typeof result.raw === 'string' ? result.raw : '';
    setRaw(text);
    setMetrics(parsePrometheusText(text));
  }, []);

  useEffect(() => {
    if (!autoRefresh) {
      return;
    }
    void fetchMetrics();
    const timer = setInterval(() => void fetchMetrics(), 10_000);
    return () => clearInterval(timer);
  }, [autoRefresh, fetchMetrics]);

  const keyMetrics = metrics.filter((m) =>
    (KEY_METRICS as readonly string[]).includes(m.name),
  );

  return (
    <div className="space-y-6">
      <Card
        title="Prometheus — métricas reales"
        subtitle="Prioridad #2. GET /api/metrics (text/plain)"
      >
        <div className="flex flex-wrap gap-3">
          <Button onClick={fetchMetrics} disabled={loading}>
            {loading ? 'Scraping…' : 'Scrape metrics'}
          </Button>
          <label className="flex items-center gap-2 text-sm text-zinc-400">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh 10s
          </label>
        </div>
        {error ? <p className="mt-3 text-sm text-rose-400">{error}</p> : null}
      </Card>

      {keyMetrics.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {keyMetrics.map((m) => (
            <Card key={m.name} title={m.name} subtitle={m.help || m.type}>
              <div className="space-y-2">
                {m.samples.slice(0, 8).map((s, i) => (
                  <div
                    key={i}
                    className="flex justify-between font-mono text-xs text-zinc-300"
                  >
                    <span className="truncate text-zinc-500">
                      {Object.entries(s.labels)
                        .map(([k, v]) => `${k}="${v}"`)
                        .join(' ') || '(no labels)'}
                    </span>
                    <Badge tone="ok">{s.value}</Badge>
                  </div>
                ))}
                {m.samples.length > 8 ? (
                  <p className="text-xs text-zinc-500">
                    +{m.samples.length - 8} more samples
                  </p>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      ) : null}

      {raw ? (
        <Card title="Raw exposition" subtitle="Prometheus text format">
          <pre className="max-h-96 overflow-auto text-xs text-zinc-400">{raw}</pre>
        </Card>
      ) : null}

      {metrics.length > 0 ? (
        <Card title="All parsed metrics">
          <JsonBlock
            value={metrics.map((m) => ({
              name: m.name,
              type: m.type,
              sampleCount: m.samples.length,
            }))}
          />
        </Card>
      ) : null}
    </div>
  );
}
