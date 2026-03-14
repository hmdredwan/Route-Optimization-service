# -------- Builder stage --------
FROM node:20 AS builder

WORKDIR /app

# Copy only package files first → better caching
COPY package*.json ./
RUN npm ci --omit=dev  # only production deps in builder if possible

# Copy source code
COPY . .

# Build TypeScript + generate Prisma client
RUN npm run build && \
    npx prisma generate --schema=prisma/schema.prisma

# -------- Runtime stage --------
FROM node:20-slim

WORKDIR /app

# Install runtime dependencies (libssl1.1 + Python + minimal pip)
RUN apt-get update -y && apt-get install -y --no-install-recommends \
        libssl1.1 \
        python3 \
        python3-pip \
        && pip3 install --no-cache-dir --break-system-packages ortools \
        && apt-get clean && rm -rf /var/lib/apt/lists/*

# Copy only what's needed from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma               # whole prisma folder if you have migrations
COPY --from=builder /app/src/solver ./src/solver       # Python solver script

# Ensure Prisma client is available (generated in builder)
ENV PRISMA_SCHEMA=/app/prisma/schema.prisma

# Healthcheck (optional but very useful for orchestrators like Render/Railway/K8s)
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:${PORT:-3000}/health || exit 1

# Run Prisma generate again (just in case) + start server
CMD ["sh", "-c", "npx prisma generate --schema=/app/prisma/schema.prisma && node dist/index.js"]
