# --- Stage 1: Builder ---
FROM node:20-bullseye-slim AS builder

WORKDIR /app

# Install build tools (WAJIB untuk argon2 & baileys)
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./

# Install semua dependencies (termasuk devDependencies untuk build)
RUN npm ci

COPY . .

# Build TypeScript ke folder dist/
RUN npm run build

# Bersihkan dev dependencies, TAPI biarkan dependencies 'prod' (tsx, drizzle-kit, argon2)
RUN npm prune --production

# --- Stage 2: Production Runner ---
FROM node:20-bullseye-slim

WORKDIR /app

# Install openssl (dibutuhkan Drizzle/Prisma) & netcat (untuk healthcheck script)
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Copy node_modules yang sudah bersih dari builder
COPY --from=builder /app/node_modules ./node_modules

# Copy hasil build (JS files)
COPY --from=builder /app/dist ./dist

# CRITICAL: Copy file yang dibutuhkan untuk runtime scripts (Seed & Migrate)
COPY --from=builder /app/package.json ./
COPY --from=builder /app/drizzle.config.ts ./
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/src ./src 
# ^ Note: Copy src dibutuhkan jika drizzle.config.ts merujuk ke schema.ts di dalam src
COPY --from=builder /app/drizzle ./drizzle
# ^ Note: Pastikan folder migrasi sql (biasanya folder 'drizzle') ikut di-copy

# Copy entrypoint script (akan kita buat di bawah)
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENV NODE_ENV=production
ENV PORT=3000

USER node

EXPOSE 3000

# Gunakan script entrypoint custom
ENTRYPOINT ["docker-entrypoint.sh"]
