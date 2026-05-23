'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  DEFAULT_API_URL,
  loadApiConfig,
  saveApiConfig,
  type ApiConfig,
} from '@/lib/api/config';

type ApiConfigContextValue = {
  config: ApiConfig;
  setBaseUrl: (url: string) => void;
  setCorrelationPrefix: (prefix: string) => void;
  reset: () => void;
};

const ApiConfigContext = createContext<ApiConfigContextValue | null>(null);

export function ApiConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<ApiConfig>({
    baseUrl: DEFAULT_API_URL,
    correlationPrefix: 'ops-console',
  });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setConfig(loadApiConfig());
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) {
      saveApiConfig(config);
    }
  }, [config, ready]);

  const value = useMemo<ApiConfigContextValue>(
    () => ({
      config,
      setBaseUrl: (url) =>
        setConfig((c) => ({ ...c, baseUrl: url.replace(/\/$/, '') })),
      setCorrelationPrefix: (prefix) =>
        setConfig((c) => ({ ...c, correlationPrefix: prefix })),
      reset: () =>
        setConfig({
          baseUrl: DEFAULT_API_URL.replace(/\/$/, ''),
          correlationPrefix: 'ops-console',
        }),
    }),
    [config],
  );

  return (
    <ApiConfigContext.Provider value={value}>{children}</ApiConfigContext.Provider>
  );
}

export function useApiConfig() {
  const ctx = useContext(ApiConfigContext);
  if (!ctx) {
    throw new Error('useApiConfig must be used within ApiConfigProvider');
  }
  return ctx;
}
