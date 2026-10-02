FROM oven/bun:alpine AS base

WORKDIR /app

COPY frontend/package.json frontend/bun.lock* ./
RUN bun install

COPY frontend/ .
ARG NUXT_PUBLIC_COMMIT_HASH=unknown
ENV NUXT_PUBLIC_COMMIT_HASH=$NUXT_PUBLIC_COMMIT_HASH
RUN bun run build

EXPOSE 3000

CMD ["bun", "run", "preview"]