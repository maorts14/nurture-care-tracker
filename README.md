# Nurture

Shared child-care tracking with a persistent PostgreSQL timeline, real-time updates, and passive in-app reminders.

## Run locally

```powershell
docker compose up --build -d
```

Open http://localhost:8080.

Seeded local accounts:

- `alex@nurture.local` / `nurture-demo` (owner)
- `maya@nurture.local` / `nurture-demo` (caregiver)

The API is exposed at `http://localhost:3001` and PostgreSQL at `localhost:5432` for local development. Stop the stack with `docker compose down`. Add `-v` only when you intentionally want to erase the local database volume and rerun the seed data.

## What is working

- Password registration/sign-in and a wired Google OAuth flow
- Multiple child spaces, direct owner/caregiver/viewer membership, and copyable invitations
- Feeding and diaper activities created by default, plus custom activities and typed fields
- Backdated care logs, editable/deletable own notes and comments, hard-delete controls, and real-time Socket.IO refreshes
- Passive one-off and recurring reminders with create, edit, complete, and delete controls; recurring timing is based on the latest matching activity
- Care gaps for Shabbat or other breaks. Events inside a gap and intervals crossing it are excluded from analytics.
- Per-activity dashboards with record counts, median/average intervals, anomaly warnings, and numeric custom-field averages
- CSV export of historical logs and pending future reminders, plus a printable report that can be saved as PDF
- Per-user English/Hebrew direction setting and a basic installable PWA configuration
- Automatic SQL migration runner when the API container starts

## Local configuration and Google sign-in

The local `.env` holds the generated local JWT/database credentials and localhost origins. Google login remains inactive until you supply an OAuth client. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, then register this redirect URI in Google Cloud:

```
https://your-domain.example/api/auth/google/callback
```

For local development, use `http://localhost:8080/api/auth/google/callback` and update `APP_URL` if you change the local address.

## VPS deployment

Install Docker and Docker Compose on the VPS, copy the project plus `.env`, set the production values, and run `docker compose up --build -d`. Put an HTTPS reverse proxy in front of port 8080 and set `WEB_ORIGIN`/`APP_URL` to the public domain. The current app intentionally does not support offline operation or external email delivery; invitations are shareable links that must be accepted by the invited email address.
