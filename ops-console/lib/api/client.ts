import { apiUrl, loadApiConfig, type ApiConfig } from './config';
import type { ApiEnvelope } from './types';

export type RequestOptions = {
  method?: 'GET' | 'POST';
  body?: unknown;
  idempotencyKey?: string;
  correlationId?: string;
  signal?: AbortSignal;
};

export type ApiCallResult<T> = {
  ok: boolean;
  status: number;
  durationMs: number;
  data?: T;
  error?: string;
  raw?: unknown;
  headers: Record<string, string>;
};

function buildHeaders(
  config: ApiConfig,
  options: RequestOptions,
): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'x-request-id': options.correlationId ?? newCorrelationId(config),
  };

  if (options.idempotencyKey) {
    headers['Idempotency-Key'] = options.idempotencyKey;
  }

  return headers;
}

export function newCorrelationId(config?: ApiConfig): string {
  const prefix = config?.correlationPrefix ?? 'ops-console';
  return `${prefix}-${crypto.randomUUID()}`;
}

export function newIdempotencyKey(label: string): string {
  return `${label}-${crypto.randomUUID()}`;
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
  configOverride?: ApiConfig,
): Promise<ApiCallResult<T>> {
  const config = configOverride ?? loadApiConfig();
  const url = apiUrl(config.baseUrl, path);
  const started = performance.now();

  try {
    const response = await fetch(url, {
      method: options.method ?? 'GET',
      headers: buildHeaders(config, options),
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });

    const durationMs = Math.round(performance.now() - started);
    const contentType = response.headers.get('content-type') ?? '';

    if (contentType.includes('text/plain') || contentType.includes('text/csv')) {
      const text = await response.text();
      return {
        ok: response.ok,
        status: response.status,
        durationMs,
        raw: text,
        headers: { 'content-type': contentType },
      };
    }

    const raw = await response.json().catch(() => null);

    if (!response.ok) {
      const message =
        typeof raw === 'object' && raw && 'message' in raw
          ? String((raw as { message: unknown }).message)
          : JSON.stringify(raw);
      return {
        ok: false,
        status: response.status,
        durationMs,
        error: message,
        raw,
        headers: {},
      };
    }

    return {
      ok: true,
      status: response.status,
      durationMs,
      data: raw as T,
      raw,
      headers: {},
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      durationMs: Math.round(performance.now() - started),
      error: error instanceof Error ? error.message : String(error),
      headers: {},
    };
  }
}

export async function apiData<T>(
  path: string,
  options?: RequestOptions,
): Promise<ApiCallResult<T>> {
  const result = await apiRequest<ApiEnvelope<T>>(path, options);
  if (result.ok && result.data && 'data' in (result.data as object)) {
    return { ...result, data: (result.data as ApiEnvelope<T>).data };
  }
  return result as ApiCallResult<T>;
}
