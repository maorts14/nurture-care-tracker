# Automated tests

All automated tests use a dedicated `feedme_test` PostgreSQL database. The reset helper refuses to connect to any other database name.

## Local setup

Start the disposable database once:

```bash
docker compose -p feedme-tests -f docker-compose.test.yml up -d
```

Install Playwright Chromium once after dependencies are installed:

```bash
npx playwright install chromium
```

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
| Children and caregiver access | Child lifecycle, memberships, role changes, invitations, ownership transfer | Caregiver role management |
| Timeline | Logs, multi-portion feeding, editing permissions, deletion, comments, timing intervals | Log creation, record editor, comment creation, activity filtering |
| Care management | Custom activities, fields, reminders, notes | Custom activity, shared note, interval reminder |
| Care pauses and Insights | Pause CRUD, affected-day averages, history flags, viewer restrictions, report export | Pause management, Insights selection, history-export options |
| Public experience | Public route behavior is static; language state is covered through the UI | Landing-page language selection |
