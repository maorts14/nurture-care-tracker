FROM postgres:16-alpine

COPY server/schema.sql /docker-entrypoint-initdb.d/01-schema.sql
