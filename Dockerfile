# -------- Builder stage --------
FROM node:20 AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

RUN npm run build && \
    npx prisma generate --schema=prisma/schema.prisma


# -------- Runtime stage --------
FROM node:20-slim

WORKDIR /app

RUN apt-get update -y && apt-get install -y --no-install-recommends \
        python3 \
        python3-pip \
        build-essential \
        curl \
    && pip3 install --no-cache-dir --break-system-packages ortools \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src/solver ./src/solver

ENV PRISMA_SCHEMA=/app/prisma/schema.prisma

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:${PORT:-3000}/health || exit 1

CMD ["node", "dist/index.js"]
