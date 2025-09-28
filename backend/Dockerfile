FROM oven/bun:latest AS base
WORKDIR /app
COPY package.json  ./
RUN bun install
COPY . .
EXPOSE 3100

CMD ["bun", "run", "start"]
