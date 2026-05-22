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

Health check: `GET http://localhost:3000/api/health`  
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
| `npm run test:e2e` | Tests end-to-end |

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

## Docker

```bash
# PostgreSQL + Redis
npm run docker:up

# O manualmente
docker compose up -d
```
