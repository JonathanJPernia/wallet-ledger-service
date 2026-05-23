/**
 * Debe cargarse vía setupFiles en jest-e2e.json antes de AppModule.
 * Permite 50–100 requests paralelos en tests de concurrencia sin 429.
 */
process.env.E2E_THROTTLE_LIMIT = '100000';
process.env.E2E_DISABLE_CRONS = 'true';
