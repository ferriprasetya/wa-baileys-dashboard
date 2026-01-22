# --- Stage 1: Build ---
FROM node:20-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

RUN npm run build

# --- Stage 2: Production ---
FROM node:20-slim AS runner

WORKDIR /app

# Install production dependencies only
COPY package.json package-lock.json ./
RUN npm ci --only=production

# Copy build result from stage 1
COPY --from=builder /app/dist ./dist
# Copy migration files (penting!)
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/drizzle.config.ts ./

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Run migrations, then start app
CMD ["sh", "-c", "npm run db:migrate && node dist/server.js"]
