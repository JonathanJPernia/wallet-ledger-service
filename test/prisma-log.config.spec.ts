import { resolvePrismaLogLevels } from '../src/infrastructure/prisma/prisma-log.config';

describe('resolvePrismaLogLevels', () => {
  const env = process.env;

  afterEach(() => {
    process.env = { ...env };
  });

  it('uses PRISMA_LOG when set', () => {
    process.env.PRISMA_LOG = 'query,warn,error';
    delete process.env.PRISMA_LOG_QUERY;
    expect(resolvePrismaLogLevels()).toEqual(['query', 'warn', 'error']);
  });

  it('defaults to warn and error without flags', () => {
    delete process.env.PRISMA_LOG;
    delete process.env.PRISMA_LOG_QUERY;
    delete process.env.PRISMA_LOG_INFO;
    expect(resolvePrismaLogLevels()).toEqual(['warn', 'error']);
  });

  it('appends query when PRISMA_LOG_QUERY=true', () => {
    delete process.env.PRISMA_LOG;
    process.env.PRISMA_LOG_QUERY = 'true';
    expect(resolvePrismaLogLevels()).toEqual(['query', 'warn', 'error']);
  });
});
