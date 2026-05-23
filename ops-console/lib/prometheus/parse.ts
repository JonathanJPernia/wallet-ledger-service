export type ParsedMetric = {
  name: string;
  type: string;
  help: string;
  samples: { labels: Record<string, string>; value: number }[];
};

export function parsePrometheusText(text: string): ParsedMetric[] {
  const lines = text.split('\n');
  const metrics = new Map<string, ParsedMetric>();
  let currentName = '';
  let currentType = 'untyped';
  let currentHelp = '';

  for (const line of lines) {
    if (line.startsWith('# HELP ')) {
      const rest = line.slice(7);
      const space = rest.indexOf(' ');
      currentName = rest.slice(0, space);
      currentHelp = rest.slice(space + 1);
      continue;
    }
    if (line.startsWith('# TYPE ')) {
      const rest = line.slice(7);
      const space = rest.indexOf(' ');
      currentName = rest.slice(0, space);
      currentType = rest.slice(space + 1);
      if (!metrics.has(currentName)) {
        metrics.set(currentName, {
          name: currentName,
          type: currentType,
          help: currentHelp,
          samples: [],
        });
      } else {
        const m = metrics.get(currentName)!;
        m.type = currentType;
        m.help = currentHelp || m.help;
      }
      continue;
    }
    if (!line || line.startsWith('#')) {
      continue;
    }

    const match = line.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{[^}]*\})?\s+(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)/);
    if (!match) {
      continue;
    }

    const name = match[1];
    const labelsRaw = match[2];
    const value = Number(match[3]);
    const labels: Record<string, string> = {};

    if (labelsRaw) {
      const inner = labelsRaw.slice(1, -1);
      for (const part of inner.match(/[a-zA-Z_][a-zA-Z0-9_]*="[^"]*"/g) ?? []) {
        const eq = part.indexOf('=');
        const key = part.slice(0, eq);
        const val = part.slice(eq + 2, -1);
        labels[key] = val;
      }
    }

    if (!metrics.has(name)) {
      metrics.set(name, {
        name,
        type: 'untyped',
        help: '',
        samples: [],
      });
    }

    metrics.get(name)!.samples.push({ labels, value });
  }

  return [...metrics.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export const KEY_METRICS = [
  'financial_operation_total',
  'idempotency_replay_total',
  'idempotency_conflict_total',
  'reconciliation_drift_total',
  'http_request_duration_seconds',
  'circuit_breaker_open_total',
  'outbox_dispatch_total',
] as const;
