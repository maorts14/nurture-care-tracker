# API integration tests

Each file starts the real Express server and sends HTTP requests to it. PostgreSQL is never mocked: the database is reset to the schema and seed fixture before every test.

Run this suite with `npm run test:api`.
