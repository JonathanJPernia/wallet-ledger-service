# Wallet Ledger Service

API backend para un sistema financiero tipo wallet ledger (NestJS + PostgreSQL + Prisma).

---

## Demo en vivo

<p align="center">
  <a href="https://wallet-ledger-service-git-develop-jonathanjpr-s-projects.vercel.app/"><strong>ABRIR FRONTEND — Billetera Demo</strong></a>
  <br /><br />
  <a href="https://wallet-ledger-service-production.up.railway.app/api/docs"><strong>ABRIR SWAGGER — Documentación del API</strong></a>
</p>

| | Enlace directo |
|---|----------------|
| **Frontend (Vercel)** | https://wallet-ledger-service-git-develop-jonathanjpr-s-projects.vercel.app/ |
| **Backend API (Railway)** | https://wallet-ledger-service-production.up.railway.app |
| **Swagger UI** | https://wallet-ledger-service-production.up.railway.app/api/docs |
| **Health** | https://wallet-ledger-service-production.up.railway.app/api/health |

El **frontend** incluye tutorial paso a paso y pruebas de estrés contra el API en producción.  
**Swagger** sirve para explorar y ejecutar endpoints (wallets, depósitos, transferencias, reconciliación, reporting, etc.).

*Prueba hecha por Jonathan Pernía.*

---

## Requisitos

- Node.js 20+
- Docker y Docker Compose
- npm

## Inicio rápido

### Un solo comando (API + Postgres + Redis)

```bash
cp .env.example .env
npm run docker:stack
```

API en http://localhost:3000 · Swagger http://localhost:3000/api/docs

### Solo infra (desarrollo local del API en el host)

```bash
cp .env.example .env
npm run docker:up
npm run prisma:generate
npm run prisma:migrate:dev
npm run start:dev
```

Local: health `http://localhost:3000/api/health` · Swagger `http://localhost:3000/api/docs`

### Consultar cuenta (API)

| Acción | Método |
|--------|--------|
| Saldo y detalle | `GET /api/wallets/:id` |
| Movimientos | `GET /api/wallets/:id/movements?limit=50` |

### Ops Console (código del frontend)

```bash
cd ops-console && cp .env.example .env.local && npm install
npm run ops:dev   # puerto 3001
```

Deploy y variables: [ops-console/README.md](./ops-console/README.md) · En Railway: `CORS_ORIGINS` = URL de Vercel + `http://localhost:3001`.

## Scripts

| Script | Descripción |
|--------|-------------|
| `npm run start:dev` | Servidor en modo watch |
| `npm run build` | Genera Prisma client y compila |
| `npm run lint` / `lint:check` | ESLint (fix / solo verificación) |
| `npm run format` / `format:check` | Prettier |
| `npm run prisma:generate` | Genera el cliente Prisma |
| `npm run prisma:migrate:dev` | Migraciones en desarrollo |
| `npm run docker:stack` | **Todo:** Postgres + Redis + API + migraciones |
| `npm run docker:up` | Solo PostgreSQL y Redis |
| `npm run ops:dev` | Ops Console Next.js (puerto 3001) |
| `npm run ops:build` | Build del Ops Console |
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
**Estrategia por riesgos (qué cubre cada test y por qué):** [tests-risks.md](./tests-risks.md)

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
