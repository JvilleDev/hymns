FROM oven/bun:alpine AS base

WORKDIR /app

COPY package.json bun.lock* ./
RUN --mount=type=cache,target=/root/.cache/bun bun install --frozen-lockfile

COPY . .
ARG NUXT_PUBLIC_COMMIT_HASH=unknown
ENV NUXT_PUBLIC_COMMIT_HASH=$NUXT_PUBLIC_COMMIT_HASH
ENV NUXT_TELEMETRY_DISABLED=1
RUN bun run build

EXPOSE 3000

CMD ["bun", "run", "preview"]