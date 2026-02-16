# ========================================================================
# Hotel Booking Backend - Dockerfile
# ========================================================================
# Build context requirements:
# - Build from repository ROOT directory (where hotel-booking-backend/ and shared/ folders exist)
# - Dockerfile path: ./hotel-booking-backend/Dockerfile
#
# For Render deployment:
# - Root Directory: . (empty or dot)
# - Dockerfile Path: ./hotel-booking-backend/Dockerfile
# - This allows Docker to find: ../shared directory
#
# For local Docker build:
# - docker build -f hotel-booking-backend/Dockerfile -t hotel-booking-backend .
# ========================================================================

# Stage 1: Builder (install deps + compile TypeScript)
FROM node:20-alpine AS builder
WORKDIR /app
# Copy backend + shared (backend imports from ../../../shared)
COPY hotel-booking-backend/package*.json ./hotel-booking-backend/
COPY shared ./shared
RUN cd hotel-booking-backend && npm ci
COPY hotel-booking-backend ./hotel-booking-backend
RUN cd hotel-booking-backend && npm run build

# Stage 2: Production runner
FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache openssl
COPY hotel-booking-backend/package*.json ./hotel-booking-backend/
RUN cd hotel-booking-backend && npm ci --only=production
COPY --from=builder /app/hotel-booking-backend/dist ./hotel-booking-backend/dist
COPY --from=builder /app/shared ./shared

WORKDIR /app/hotel-booking-backend

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 5000) + '/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

CMD ["node", "dist/src/index.js"]
