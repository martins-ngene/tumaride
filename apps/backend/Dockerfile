# Builder Stage
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/backend/package.json ./apps/backend/

RUN npm install

COPY packages/shared ./packages/shared
COPY apps/backend ./apps/backend

RUN npm --prefix packages/shared run build
RUN npm --prefix apps/backend run prisma:generate
RUN npm --prefix apps/backend run build

# Production Stage
FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/backend/dist ./apps/backend/dist
COPY --from=builder /app/apps/backend/prisma ./apps/backend/prisma
COPY --from=builder /app/apps/backend/scripts ./apps/backend/scripts
COPY --from=builder /app/apps/backend/package.json ./apps/backend/package.json

WORKDIR /app/apps/backend
EXPOSE 4000

CMD ["node", "scripts/start-production.js"]
