# --- Stage 1: Build ---
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies (including devDependencies for build)
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

RUN npm run build

# --- Stage 2: Production ---
FROM node:20-alpine AS runner

WORKDIR /app

# Install production dependencies only
COPY package.json package-lock.json ./
RUN npm ci --only=production

# Copy build result from stage 1
COPY --from=builder /app/dist ./dist
# Copy public folder & views if any
COPY --from=builder /app/src/modules/dashboard/views ./dist/modules/dashboard/views
COPY --from=builder /app/public ./public

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "dist/server.js"]
