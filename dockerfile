FROM node:20-bookworm-slim AS builder
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

COPY package*.json tsconfig.json ./
RUN npm ci --build-from-source=sqlite3

COPY src ./src
COPY swagger ./swagger
RUN npm run build

FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev --build-from-source=sqlite3

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/swagger ./swagger

RUN groupadd -r app && useradd -r -g app app \
 && mkdir -p /app/data \
 && chown -R app:app /app
USER app

EXPOSE 3000
CMD ["node", "dist/server.js"]