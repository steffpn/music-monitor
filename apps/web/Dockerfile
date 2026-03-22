FROM node:20-bookworm-slim AS base

RUN corepack enable && corepack prepare pnpm@10.6.0 --activate

WORKDIR /app

# Copy workspace config for dependency caching
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/tsconfig/package.json packages/tsconfig/
COPY apps/web/package.json apps/web/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/ packages/
COPY apps/web/ apps/web/

# Build shared + web
RUN pnpm --filter @myfuckingmusic/shared build && pnpm --filter web build

WORKDIR /app/apps/web

EXPOSE 3000

CMD ["pnpm", "start"]
