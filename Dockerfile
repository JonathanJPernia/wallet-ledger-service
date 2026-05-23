# syntax=docker/dockerfile:1

FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache openssl

# Install deps without lifecycle scripts (schema not copied yet).
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

FROM base AS development
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "run", "start:dev"]

FROM base AS build
ARG BUILD_SHA=local
ARG APP_VERSION=0.0.1
ENV BUILD_SHA=${BUILD_SHA}
ENV APP_VERSION=${APP_VERSION}
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM base AS production
ARG BUILD_SHA=local
ARG APP_VERSION=0.0.1
ENV NODE_ENV=production
ENV BUILD_SHA=${BUILD_SHA}
ENV APP_VERSION=${APP_VERSION}
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/prisma ./prisma
EXPOSE 3000
CMD ["node", "dist/main.js"]
