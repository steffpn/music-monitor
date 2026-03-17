FROM node:20-bookworm-slim AS base

# Install system dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg python3 make g++ && \
    rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.6.0 --activate

WORKDIR /app

# Copy workspace config first for dependency caching
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/tsconfig/package.json packages/tsconfig/
COPY apps/api/package.json apps/api/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/ packages/
COPY apps/api/ apps/api/

# Build shared package only (API runs via tsx, no tsc needed)
RUN cd packages/shared && pnpm build

# Generate Prisma client
RUN cd apps/api && pnpm prisma generate

# Create data directory for stream segments
RUN mkdir -p apps/api/data/streams

WORKDIR /app/apps/api

EXPOSE 3000

CMD ["node", "--import", "tsx", "src/index.ts"]
