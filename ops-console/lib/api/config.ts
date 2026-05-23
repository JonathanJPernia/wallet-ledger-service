export type ApiConfig = {
  baseUrl: string;
  correlationPrefix: string;
};

const STORAGE_KEY = 'wallet-ops-api-config';

export const DEFAULT_API_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  'https://wallet-ledger-service-production.up.railway.app';

export function loadApiConfig(): ApiConfig {
  if (typeof window === 'undefined') {
    return {
      baseUrl: DEFAULT_API_URL.replace(/\/$/, ''),
      correlationPrefix: 'ops-console',
    };
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        baseUrl: DEFAULT_API_URL.replace(/\/$/, ''),
        correlationPrefix: 'ops-console',
      };
    }
    const parsed = JSON.parse(raw) as ApiConfig;
    return {
      baseUrl: (parsed.baseUrl || DEFAULT_API_URL).replace(/\/$/, ''),
      correlationPrefix: parsed.correlationPrefix || 'ops-console',
    };
  } catch {
    return {
      baseUrl: DEFAULT_API_URL.replace(/\/$/, ''),
      correlationPrefix: 'ops-console',
    };
  }
}

export function saveApiConfig(config: ApiConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function apiUrl(baseUrl: string, path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const withApi = normalized.startsWith('/api') ? normalized : `/api${normalized}`;
  return `${baseUrl.replace(/\/$/, '')}${withApi}`;
}
