# Wallet Ledger Service

API backend para un sistema financiero tipo wallet ledger (NestJS + PostgreSQL + Prisma).

## Requisitos

- Node.js 20+
- Docker y Docker Compose
- npm

## Inicio rápido

```bash
# 1. Variables de entorno
cp .env.example .env

# 2. Base de datos
npm run docker:up

# 3. Cliente Prisma
npm run prisma:generate

# 4. Desarrollo
npm run start:dev
```

Health check: `GET http://localhost:3000/api/health` (DB, uptime, memory, version, build SHA)  
Swagger: `http://localhost:3000/api/docs`

## Scripts

| Script | Descripción |
|--------|-------------|
| `npm run start:dev` | Servidor en modo watch |
| `npm run build` | Genera Prisma client y compila |
| `npm run lint` / `lint:check` | ESLint (fix / solo verificación) |
| `npm run format` / `format:check` | Prettier |
| `npm run prisma:generate` | Genera el cliente Prisma |
| `npm run prisma:migrate:dev` | Migraciones en desarrollo |
| `npm run docker:up` | Levanta PostgreSQL y Redis |
| `npm test` | Unit tests |
| **`npm run test:final`** | **Suite de evaluación final** (STEPS 1–4 + assert global, orden fijo) |
| `npm run test:e2e` | Todos los E2E |
| `npm run test:e2e:financial` | E2E flujo financiero (STEP 1) |
| `npm run test:e2e:concurrency` | E2E concurrencia / idempotency (STEP 2) |
| `npm run test:audit` | Integridad monetaria global (STEP 3) |
| `npm run test:reporting` | Validación P&L vs ledger (STEP 4) |
| `npm run test:load` | Load tests (DB + flag `RUN_LOAD_TESTS`) |
| `npm run test:all` | Unit + E2E |

**Guía completa de tests:** [tests.md](./tests.md)

## Estructura

```
src/
  common/           # filters, interceptors, guards, pipes, logger
  config/           # ConfigModule, Joi, configuración tipada
  infrastructure/   # prisma, redis
  modules/
    health/
    wallets/
    ledger/
    idempotency/
prisma/             # Schema y migraciones
```

## Producción (Railway / Docker)

| Variable | Uso |
|----------|-----|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` en Railway |
| `NODE_ENV` | `production` |
| `PORT` | Lo asigna Railway (debe coincidir con Networking) |
| `CORS_ORIGINS` | Orígenes del frontend, separados por coma |
| `PRISMA_LOG_QUERY` | `true` al inicio; luego quitar (solo `warn,error`) |
| `RAILWAY_GIT_COMMIT_SHA` | Auto en Railway → aparece en `/api/health` |

**Migraciones:** solo `npm run deploy:migrate` (`prisma migrate deploy`). **No** uses `prisma db push` en producción.

**Pre-deploy (Railway):** `npx prisma migrate deploy`  
**Start:** `npm run start`  
**Health probe:** `GET /api/health` (503 si la DB no responde)

## Docker

```bash
# PostgreSQL + Redis
npm run docker:up

# O manualmente
docker compose up -d
```
