# -------- Builder stage --------
FROM node:20 AS builder

WORKDIR /app

# Copy package.json first (better caching)
COPY package*.json ./

# Install dev dependencies (needed for prisma + tsc)
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript + generate Prisma client
RUN npm run build

# -------- Runtime stage --------
FROM node:20-slim

WORKDIR /app

# Install dependencies: libssl1.1 + Python + pip
RUN echo "deb http://deb.debian.org/debian bullseye main" > /etc/apt/sources.list.d/bullseye.list \
    && echo "deb http://security.debian.org/debian-security bullseye-security main" >> /etc/apt/sources.list.d/bullseye.list \
    && apt-get update -y \
    && apt-get install -y \
        libssl1.1 \
        python3 \
        python3-pip \
    && pip3 install --break-system-packages ortools \
    && rm -rf /var/lib/apt/lists/* /etc/apt/sources.list.d/bullseye.list

# Copy app files
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma/schema.prisma ./prisma/schema.prisma

# Copy Python solver (IMPORTANT)
COPY --from=builder /app/src/solver ./src/solver

# Generate Prisma client and start server
CMD ["sh", "-c", "npx prisma generate && node dist/index.js"]
