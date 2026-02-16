# ========================================================================
# Hotel Booking Backend - Dockerfile
# ========================================================================
# This Dockerfile builds the backend service for Render deployment
# Build context: Repository root (hotel-booking-backend directory)
# ========================================================================

# Stage 1: Builder (install deps + compile TypeScript)
FROM node:20-alpine AS builder
WORKDIR /app

# Copy package files and TypeScript config
COPY package*.json ./
COPY tsconfig*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY src ./src

# Build TypeScript
RUN npm run build

# Stage 2: Production runner
FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache openssl

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy built application from builder stage
# Copy --from=builder /app/dist ./dist

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 5000) + '/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

CMD ["node", "dist/index.js"]

CMD ["node", "dist/src/index.js"]
