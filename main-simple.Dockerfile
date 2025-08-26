FROM node:22-bookworm-slim AS base
WORKDIR /app

# Install system dependencies
RUN apt update
RUN apt install -y \
      git \
      wget \
      cmake \
      ffmpeg \
      curl \
      make \
      # remotion dependencies
      libnss3 \
      libdbus-1-3 \
      libatk1.0-0 \
      libgbm-dev \
      libasound2 \
      libxrandr2 \
      libxkbcommon-dev \
      libxfixes3 \
      libxcomposite1 \
      libxdamage1 \
      libatk-bridge2.0-0 \
      libpango-1.0-0 \
      libcairo2 \
      libcups2 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# setup pnpm
RUN corepack enable

FROM base AS prod-deps
COPY package.json pnpm-lock.yaml* /app/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --no-frozen-lockfile
RUN pnpm install --prefer-offline --no-cache --prod

FROM prod-deps AS build
COPY tsconfig.json /app
COPY tsconfig.build.json /app
COPY vite.config.ts /app
COPY src /app/src
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --no-frozen-lockfile
RUN pnpm build

FROM base
COPY static /app/static
COPY --from=prod-deps /app/node_modules /app/node_modules
COPY --from=build /app/dist /app/dist
COPY package.json /app/

# app configuration via environment variables
ENV DATA_DIR_PATH=/app/data
ENV DOCKER=true
ENV CONCURRENCY=1
ENV VIDEO_CACHE_SIZE_IN_BYTES=2097152000

# Create data directory for runtime
RUN mkdir -p /app/data

# Set minimal environment variables for build
ENV PEXELS_API_KEY=dummy_build_key
ENV NODE_ENV=production
ENV LOG_LEVEL=info

# install kokoro, headless chrome and ensure music files are present (with dummy env)
RUN node dist/scripts/install.js || true

# Expose port 8080 for Northflank
EXPOSE 8080

CMD ["pnpm", "start"]