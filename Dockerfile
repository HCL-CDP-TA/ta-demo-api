# syntax=docker/dockerfile:1

# Builder stage
FROM node:20-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Rewrite GitHub SSH URLs to HTTPS in both package.json and package-lock.json
RUN sed -i 's|git+ssh://git@github.com/|git+https://github.com/|g' package-lock.json && \
    sed -i 's|"github:\([^"]*\)"|"https://github.com/\1"|g' package.json

# Install dependencies (uses GITHUB_TOKEN for private repos)
RUN --mount=type=secret,id=github_token \
    if [ -f /run/secrets/github_token ]; then \
        git config --global url."https://$(cat /run/secrets/github_token)@github.com/".insteadOf "https://github.com/"; \
        git config --global url."https://$(cat /run/secrets/github_token)@github.com/".insteadOf "ssh://git@github.com/"; \
    fi && \
    npm ci

# Generate Prisma client
RUN npx prisma generate

# Copy source code
COPY . .

# Build Next.js application (standalone output)
RUN npm run build

# Runner stage
FROM node:20-slim AS runner

WORKDIR /app

# Install postgresql-client and OpenSSL for Prisma
RUN apt-get update && apt-get install -y --no-install-recommends \
    postgresql-client \
    openssl \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user with home directory
RUN groupadd --system --gid 1001 nodejs
RUN useradd --system --uid 1001 --gid nodejs --create-home nextjs

# Copy prisma schema and generated client
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma/client ./node_modules/@prisma/client

# Install Prisma CLI and tsx for migrations and seeding
RUN npm install -g prisma@5.22.0 tsx@4.21.0

# Copy standalone Next.js build
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Copy docker entrypoint script
COPY --chmod=755 docker-entrypoint.sh /docker-entrypoint.sh

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3300
ENV HOSTNAME="0.0.0.0"

# Add labels for metadata
LABEL org.opencontainers.image.title="TA Demo API"
LABEL org.opencontainers.image.description="Technical Architect Demo API for geofence-to-WhatsApp-to-reservation flow"

EXPOSE 3300

USER nextjs

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "server.js"]
