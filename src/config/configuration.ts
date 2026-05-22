import { CONFIG_NAMESPACE } from './constants';

export interface AppConfig {
  name: string;
  env: string;
  port: number;
}

export interface DatabaseConfig {
  url: string;
}

export interface RedisConfig {
  host: string;
  port: number;
}

export interface LogConfig {
  level: string;
}

export interface RootConfig {
  [CONFIG_NAMESPACE.APP]: AppConfig;
  [CONFIG_NAMESPACE.DATABASE]: DatabaseConfig;
  [CONFIG_NAMESPACE.REDIS]: RedisConfig;
  [CONFIG_NAMESPACE.LOG]: LogConfig;
}

export default (): RootConfig => ({
  [CONFIG_NAMESPACE.APP]: {
    name: process.env.APP_NAME ?? 'wallet-ledger-service',
    env: process.env.NODE_ENV ?? 'development',
    port: parseInt(process.env.PORT ?? '3000', 10),
  },
  [CONFIG_NAMESPACE.DATABASE]: {
    url: process.env.DATABASE_URL ?? '',
  },
  [CONFIG_NAMESPACE.REDIS]: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  },
  [CONFIG_NAMESPACE.LOG]: {
    level: process.env.LOG_LEVEL ?? 'info',
  },
});
