# Automated tests

All automated tests use a dedicated `feedme_test` PostgreSQL database. The reset helper refuses to connect to any other database name.

## Local setup

Run everything with one command:

```bash
npm run test:local
```

It starts the disposable database, ensures Chromium is available, runs both suites, then removes the test container, network, and volume even if a test fails.

The test stack does not interfere with the development stack: PostgreSQL uses port `5433` (development uses `5432`), the test API uses `3002` (development uses `3001`), and the Playwright web server uses `5174` (development uses `5173`).

## Commands

```bash
npm run test:api  # live API + PostgreSQL integration tests
npm run test:e2e  # Playwright browser journeys
npm test          # both suites, in order
```

The API suite recreates the schema and seed data before each feature test file. Browser tests run against the same disposable database and reset it before each journey.

## Coverage map

| Area | PostgreSQL integration coverage | Browser coverage |
| --- | --- | --- |
| Authentication and account data | Sign-in, registration, sign-out, locale, export, deletion, Google configuration | Registration/onboarding and deletion confirmation |
| Children and caregiver access | Child lifecycle, permanent child-data cascade, memberships, role changes, invitations, ownership transfer | Caregiver role management and link invitation acceptance from landing page through registration |
| Timeline | Logs, multi-portion feeding, editing permissions, deletion, comments, timing intervals | Log creation, record editor, comment creation, activity filtering |
| Activities & reminders | Custom activities, fields, activity-owned schedules, notes, caregiver administration boundaries | Activity creation, recurring and one-time schedules |
| Care pauses and Insights | Pause CRUD, affected-day averages, history flags, viewer restrictions, report export | Pause management, Insights selection, history-export options |
| Public experience | Public route behavior is static; language state is covered through the UI | Landing-page language selection |
