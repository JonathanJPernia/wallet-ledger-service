'use client';

import { useState } from 'react';
import { apiData, apiRequest, newIdempotencyKey } from '@/lib/api/client';
import { Badge, Button, Card, Input, JsonBlock } from '@/components/ui/Primitives';

type EndpointDef = {
  id: string;
  group: string;
  method: 'GET' | 'POST';
  path: string;
  needsIdempotency?: boolean;
  bodyTemplate?: Record<string, unknown>;
  queryParams?: string[];
};

const ENDPOINTS: EndpointDef[] = [
  { id: 'health', group: 'Health', method: 'GET', path: '/health' },
  { id: 'metrics', group: 'Observability', method: 'GET', path: '/metrics' },
  { id: 'create-wallet', group: 'Wallets', method: 'POST', path: '/wallets', bodyTemplate: { currency: 'USD' } },
  {
    id: 'deposit',
    group: 'Wallets',
    method: 'POST',
    path: '/wallets/{walletId}/deposit',
    needsIdempotency: true,
    bodyTemplate: { amount: 100 },
  },
  {
    id: 'transfer',
    group: 'Wallets',
    method: 'POST',
    path: '/wallets/transfer',
    needsIdempotency: true,
    bodyTemplate: { fromWalletId: '', toWalletId: '', amount: 50 },
  },
  {
    id: 'withdraw',
    group: 'Wallets',
    method: 'POST',
    path: '/wallets/{walletId}/withdraw',
    needsIdempotency: true,
    bodyTemplate: { amount: 20 },
  },
  { id: 'drift', group: 'Reconciliation', method: 'GET', path: '/reconciliation/drift' },
  { id: 'recon-wallet', group: 'Reconciliation', method: 'GET', path: '/reconciliation/wallets/{walletId}' },
  { id: 'pnl', group: 'Reporting', method: 'GET', path: '/reporting/pnl', queryParams: ['currency=USD'] },
  { id: 'analytics-sys', group: 'Reporting', method: 'GET', path: '/reporting/analytics/system' },
  { id: 'monitoring', group: 'Monitoring', method: 'GET', path: '/monitoring/live' },
  { id: 'risk', group: 'Risk', method: 'GET', path: '/risk/wallets/{walletId}' },
  { id: 'anomaly-wallet', group: 'Anomaly', method: 'GET', path: '/anomaly/wallets/{walletId}' },
  { id: 'anomaly-scan', group: 'Anomaly', method: 'GET', path: '/anomaly/scan?currency=USD' },
  { id: 'events', group: 'Events', method: 'GET', path: '/events/wallets/{walletId}?limit=20' },
  { id: 'audit-replay', group: 'Audit', method: 'GET', path: '/audit/replay/wallets/{walletId}' },
  { id: 'audit-diff', group: 'Audit', method: 'GET', path: '/audit/wallets/{walletId}/diff' },
  { id: 'mv-refresh', group: 'Materialized', method: 'POST', path: '/materialized/refresh' },
];

export function ApiExplorer({ filter }: { filter?: string }) {
  const [walletId, setWalletId] = useState('');
  const [body, setBody] = useState('{}');
  const [selected, setSelected] = useState(ENDPOINTS[0]);
  const [result, setResult] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  const list = filter
    ? ENDPOINTS.filter((e) => e.group.toLowerCase().includes(filter.toLowerCase()))
    : ENDPOINTS;

  function resolvePath(path: string) {
    return path.replace(/\{walletId\}/g, walletId || '00000000-0000-4000-8000-000000000001');
  }

  async function execute() {
    setLoading(true);
    const path = resolvePath(selected.path);
    const parsedBody = body.trim() ? JSON.parse(body) : undefined;

    const call =
      selected.path === '/metrics'
        ? apiRequest(path)
        : apiData(path, {
            method: selected.method,
            body: selected.method === 'POST' ? parsedBody : undefined,
            idempotencyKey: selected.needsIdempotency
              ? newIdempotencyKey(selected.id)
              : undefined,
          });

    const res = await call;
    setResult(res);
    setLoading(false);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card title="Endpoints" className="lg:col-span-1">
        <Input
          label="walletId (for path params)"
          value={walletId}
          onChange={setWalletId}
          className="mb-4"
        />
        <ul className="max-h-[480px] space-y-1 overflow-auto text-sm">
          {list.map((ep) => (
            <li key={ep.id}>
              <button
                type="button"
                onClick={() => {
                  setSelected(ep);
                  setBody(JSON.stringify(ep.bodyTemplate ?? {}, null, 2));
                }}
                className={`w-full rounded-lg px-2 py-2 text-left ${
                  selected.id === ep.id ? 'bg-emerald-900/40' : 'hover:bg-zinc-800'
                }`}
              >
                <Badge tone="neutral">{ep.method}</Badge>{' '}
                <span className="text-zinc-300">{ep.path}</span>
              </button>
            </li>
          ))}
        </ul>
      </Card>

      <div className="space-y-4 lg:col-span-2">
        <Card title={selected.path} subtitle={selected.group}>
          <label className="block text-sm">
            <span className="mb-1 text-zinc-400">Request body (JSON)</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 p-3 font-mono text-xs"
            />
          </label>
          <div className="mt-4">
          <Button onClick={execute} disabled={loading}>
            {loading ? 'Sending…' : 'Execute'}
          </Button>
          </div>
        </Card>
        {result ? (
          <Card title="Response">
            <JsonBlock value={result} />
          </Card>
        ) : null}
      </div>
    </div>
  );
}
