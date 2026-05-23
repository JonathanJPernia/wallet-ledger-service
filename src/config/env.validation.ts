import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  APP_NAME: Joi.string().default('wallet-ledger-service'),
  PORT: Joi.number().port().default(3000),
  LOG_LEVEL: Joi.string()
    .valid('fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent')
    .default('info'),
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgresql', 'postgres'] })
    .required(),
  REDIS_HOST: Joi.string().hostname().default('localhost'),
  REDIS_PORT: Joi.number().port().default(6379),
  APP_VERSION: Joi.string().default('0.0.1'),
  BUILD_SHA: Joi.string().optional().allow(''),
  GIT_COMMIT_SHA: Joi.string().optional().allow(''),
  CORS_ORIGINS: Joi.string().optional().allow(''),
  PRISMA_LOG: Joi.string().optional().allow(''),
  PRISMA_LOG_QUERY: Joi.string().valid('true', 'false').optional(),
  PRISMA_LOG_INFO: Joi.string().valid('true', 'false').optional(),
});
