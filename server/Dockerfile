FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY server ./server
COPY tsconfig.server.json ./
CMD ["sh", "-c", "npx tsx server/migrate.ts && npx tsx server/index.ts"]
