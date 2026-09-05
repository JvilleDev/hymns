FROM oven/bun:alpine AS base

WORKDIR /app

COPY frontend/package.json frontend/bun.lock* ./
RUN bun install

COPY frontend/ .
RUN bun run build

EXPOSE 3000

CMD ["bun", "run", "preview"]