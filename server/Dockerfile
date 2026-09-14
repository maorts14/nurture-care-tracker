FROM node:24-alpine
WORKDIR /app
ARG BUILD_VERSION=development
ARG BUILD_COMMIT=unknown
ENV APP_VERSION=$BUILD_VERSION
ENV APP_COMMIT=$BUILD_COMMIT
COPY package*.json ./
RUN npm ci
COPY server ./server
COPY tsconfig.server.json ./
CMD ["sh", "-c", "npx tsx server/migrate.ts && npx tsx server/index.ts"]
