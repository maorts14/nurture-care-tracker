# Feedme

Shared child-care tracking with a persistent PostgreSQL timeline, real-time updates, and passive in-app reminders.

## Run locally

```powershell
docker compose up -d --build --wait
```

Open http://localhost:5173 after Docker reports the stack is healthy. Docker runs PostgreSQL, the API, and Vite locally. The API uses polling so it reliably reloads after changes in `server/` on Windows bind mounts; Vite reloads the browser after frontend edits. Node debugging is exposed only in the development stack on port 9229.

Seeded local accounts:

- `alex@nurture.local` / `nurture-demo` (owner)
- `maya@nurture.local` / `nurture-demo` (caregiver)
- `sam@nurture.local` / `nurture-demo` (care manager for Leo)

The API is exposed at `http://localhost:3001`, PostgreSQL at `localhost:5432`, and the Node inspector at `localhost:9229` for local development. Stop the local stack with `docker compose down`. Add `-v` only when you intentionally want to erase the local database volume and rerun the seed data.

In VS Code, run **Tasks: Run Task → App: start development**. For breakpoints, choose **Run and Debug → Debug Feedme locally**. The saved configuration starts the local development containers, attaches the API debugger, and opens the Vite app. Production uses `docker-compose.prod.yml`, which has no watch mode or exposed debugger.

## What is working

- Password registration/sign-in and a wired Google OAuth flow
- Multiple child spaces, direct owner/care-manager/caregiver/viewer membership, and copyable invitations
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

For local development, use `http://localhost:5173/api/auth/google/callback` and update `APP_URL` if you change the local address.

## OVH VPS deployment

Feedme is deployed on an OVH VPS running Ubuntu 24.04. Production is a small, self-contained Docker Compose stack. The VPS does not clone the source repository or build the app: it pulls versioned, private images from GitHub Container Registry (GHCR).

- Caddy is the only public service, on ports 80 and 443. It obtains and renews the TLS certificate automatically.
- The React app, Express API, and PostgreSQL are private Docker services; PostgreSQL and port 3001 are never published to the internet.
- Each service uses `restart: unless-stopped`. The systemd unit makes the stack start after Docker on a VPS reboot.
- The production database starts empty. It deliberately does **not** load the local demo seed.
- OVH automated backups are the server-level recovery option. A daily compressed SQL dump provides a second, app-level recovery path.

### How the production system works

```text
Browser
  │ https://feedme-baby.com (80 redirects to HTTPS; 443 serves the app)
  ▼
Caddy ── private Docker network ──► Nginx / React web container
                                         │ /api and /socket.io
                                         ▼
                                    Express API ──► PostgreSQL named volume
```

All four containers are in the same private Docker network. Only Caddy has host ports, so the internet cannot directly reach the API on port 3001 or PostgreSQL on port 5432.

#### `docker-compose.prod.yml` — the production stack

This is deliberately separate from `docker-compose.yml`, which is the hot-reloading local development stack. The production file does **not** mount `server/seed.sql`, so a new VPS database has no sample people, children, or activity logs.

`db` is an otherwise standard PostgreSQL 16 container. The custom database image only bundles `server/schema.sql` as PostgreSQL's first-run initialization file, so the VPS can start an empty database without a source checkout. It contains no real data. Real data lives in the Docker named volume `nurture_data`, outside the short-lived container filesystem. Replacing the database image does not erase that volume. Later schema changes are handled by the API migration runner.

`api` is the Express and Socket.IO server. It waits for PostgreSQL's health check before starting. On startup, it runs any unapplied SQL migrations and then serves the application. Its `/api/health` endpoint returns `{"status":"ok"}` only after a real `SELECT 1` succeeds against PostgreSQL; Docker uses this endpoint to identify an unhealthy API.

`web` is Nginx serving the built React files. Nginx also forwards `/api/*` and `/socket.io/*` to `api:3001` inside Docker. That means the browser sees one origin (`https://feedme-baby.com`), which keeps cookies and real-time Socket.IO connections simple.

`caddy` is the public edge. It is the only service with `80:80` and `443:443` published to the VPS. Once `APP_DOMAIN` resolves publicly to the VPS and those ports are reachable, Caddy obtains a TLS certificate automatically, redirects HTTP to HTTPS, and renews the certificate before expiry. Its `caddy_data` volume preserves certificate/account data across container replacement; do not delete that volume casually.

Every service has `restart: unless-stopped`. Docker restarts a container after its process crashes and restores it after Docker starts on a reboot, unless you intentionally stopped it yourself.

#### `Caddyfile` — HTTPS and reverse proxy rules

`{$APP_DOMAIN}` reads the domain from the VPS `.env` file. It is intentionally not hard-coded, so the same code works for any final domain. `encode zstd gzip` compresses text responses when the browser supports it. `reverse_proxy web:80` sends every incoming HTTPS request to the private web container. The web container then routes static files, API requests, and WebSocket upgrades to the appropriate internal service.

There is no manual certificate renewal task. The DNS record and open ports are the important prerequisites. If DNS is wrong or port 80/443 is blocked, Caddy cannot prove domain ownership and certificate issuance will fail.

#### `deploy/nurture.service` — boot-time recovery

This is a small `systemd` unit, Ubuntu's service manager. It does not run the Node application itself. Instead, once Docker is ready during a VPS boot, it runs:

```sh
docker compose --env-file .env -f docker-compose.prod.yml up -d --pull always --remove-orphans
```

`up -d` creates or starts the required containers in the background. `--pull always` checks GHCR for the chosen image versions; it does not build on the VPS. `--remove-orphans` removes containers from an older Compose definition that no longer belong to Feedme. `RemainAfterExit=yes` records that the desired stack was started even though the command itself finishes quickly.

This gives two layers of recovery: Docker handles an individual container crash; systemd starts the desired Compose stack when the whole VPS reboots. Useful commands are:

```sh
sudo systemctl status nurture
sudo systemctl restart nurture
sudo journalctl -u nurture -n 100 --no-pager
docker compose --env-file .env -f docker-compose.prod.yml ps
```

#### `scripts/backup-database.sh` — logical database backups

OVH automated backups protect the VPS as a server-level recovery option. This script adds a database-specific backup: it runs PostgreSQL's `pg_dump` inside the live `db` container, compresses the SQL stream with `gzip`, and writes a file such as `nurture-2026-09-07T00-15-00Z.sql.gz` to `/opt/nurture/backups`.

The script loads the VPS `.env` only to know the database name and user; it does not print credentials. It then deletes dumps older than 14 days. The cron entry runs it daily at 03:15 UTC. The backup directory is intentionally protected with `chmod 700` because dumps contain all care logs, notes, and user accounts.

This is a **logical** backup: it can be restored into PostgreSQL even when restoring a whole VM snapshot would be inconvenient. It is not off-site by itself, because the dump remains on the same VPS. For the first release, OVH's automated backup is the off-server recovery layer. If the app becomes important enough, the next upgrade should encrypt and copy these dumps to separate storage.

#### `scripts/deploy.sh` — safe application updates

This script runs `docker compose pull`, then starts the chosen images with `--remove-orphans`, preserving PostgreSQL and Caddy volumes. There is no source checkout or build on the VPS. To release a new version, publish new images, change the three image tags in the VPS `.env`, then run this script. Finally it prints the container status.

The API migration runner applies new SQL migration files once and records them in `schema_migration`. A release does not deliberately wipe data or load demo data. Database migrations should remain compatible with a rollback.

#### Database-changing releases

For an existing production database, add a new, monotonically named SQL file such as `server/migrations/002_add_activity_location.sql`. Never edit a migration that may already have been released: its filename is recorded in `schema_migration`, so it will not run again. The migration runner wraps each new file in a transaction; do not add `BEGIN` or `COMMIT` inside the migration file.

Also update `server/schema.sql` to the same final schema. That file is only for a completely new PostgreSQL volume; existing Feedme databases are changed only by migrations. `scripts/publish-images.ps1` builds both the API image (which runs migrations) and the database image (which carries the clean-install schema), so publish all three images for every release.

Before a database-changing production release, run a manual backup with `./scripts/backup-database.sh`. Publish the version, update the three image tags in `.env`, deploy normally, then check the API logs and the `schema_migration` table. If a migration fails, the transaction is rolled back and the API does not become healthy. Fix the migration and publish a corrected image before retrying. If it already succeeded, do not merely roll application code back when the migration removed or changed old data; prefer a forward-fix release.

Use the expand/migrate/contract pattern for risky changes: first add compatible columns or tables, then switch application reads and writes, and only remove old columns in a later release. This keeps the prior application version usable during a rollback.

#### Secrets and boundaries

The VPS `.env` contains the JWT secret, database password, and optionally Google OAuth secret. It must never be committed or copied into a container image. `.gitignore` prevents Git from tracking it, and `.dockerignore` keeps it out of Docker build context. `.env.production.example` is safe to commit because it contains placeholders only.

This is a robust single-VPS deployment, not high availability: if OVH's entire region is unavailable, the app is unavailable until the server or a backup is restored. That is appropriate for the small initial user count and can later evolve into managed database backups, off-site dumps, and a second server if needed.

### 1. Prepare DNS and Google OAuth

Create an **A record** pointing the domain to the VPS IPv4 address. Feedme currently uses `feedme-baby.com` → `148.113.44.137`. Caddy cannot issue an HTTPS certificate until DNS resolves publicly and ports 80/443 reach the VPS.

If Google sign-in is enabled, add these exact entries in the existing Google OAuth client:

```text
Authorized JavaScript origin: https://feedme-baby.com
Authorized redirect URI: https://feedme-baby.com/api/auth/google/callback
```

### 2. First-time VPS preparation

SSH to the server, then install Docker from Docker's official Ubuntu repository. Do this once:

```sh
sudo apt update
sudo apt install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
sudo tee /etc/apt/sources.list.d/docker.sources > /dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"
```

Sign out and back in once (or run `newgrp docker`) before continuing, so the deployment commands can use Docker without `sudo`.

Allow only SSH, HTTP, and HTTPS through the Ubuntu firewall. Make sure SSH is allowed before enabling the firewall:

```sh
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### 3. Install and configure Feedme

Copy only the runtime files to `/opt/nurture`: `docker-compose.prod.yml`, `Caddyfile`, `deploy/nurture.service`, and the two scripts. Create `/opt/nurture/.env` from `.env.production.example`, set its permissions to `600`, and fill in the domain, database credentials, JWT secret, image tags, and Google OAuth values. Do not commit or upload this file.

Because the GHCR images are private, the VPS needs its own GitHub Personal Access Token with **only** `read:packages`. Log it in for both `ubuntu` and root (the systemd service uses root's Docker context):

```sh
printf '%s' "$GHCR_READ_TOKEN" | docker login ghcr.io -u maorts14 --password-stdin
printf '%s' "$GHCR_READ_TOKEN" | sudo docker login ghcr.io -u maorts14 --password-stdin
```

Start and verify the stack:

```sh
cd /opt/nurture
sudo systemctl start nurture
docker compose --env-file .env -f docker-compose.prod.yml ps
curl -fsS https://feedme-baby.com/api/health
```

The health endpoint returns `{"status":"ok"}` only when Express can reach PostgreSQL.

### 4. Restart automatically after a VPS reboot

Install the included systemd unit:

```sh
sudo cp deploy/nurture.service /etc/systemd/system/nurture.service
sudo systemctl daemon-reload
sudo systemctl enable --now nurture
sudo systemctl status nurture
```

Docker restarts individual containers after a crash; systemd ensures the desired Compose stack is brought up after the VPS itself restarts.

### 5. Daily database backups

```sh
mkdir -p /opt/nurture/backups
chmod 700 /opt/nurture/backups
chmod +x scripts/backup-database.sh scripts/deploy.sh
crontab -e
```

Add this line to run a backup daily at 03:15 UTC and retain 14 days of dumps:

```cron
15 3 * * * /opt/nurture/scripts/backup-database.sh >> /opt/nurture/backups/backup.log 2>&1
```

To restore a dump, stop the API and web services, then pipe the chosen dump into the `db` service. Practice this only against a non-production copy first.

### Publishing and updating the deployed app

GitHub Actions checks every pull request and every push to `main` with `npm run check`, `npm run build`, and a build of each production Docker image. It never receives production credentials and it does not contact the VPS.

To publish a release, push a protected Git tag in the form `v1.0.1`. The **Publish release images** workflow publishes these release tags for all three images:

```sh
git tag v1.0.1
git push origin v1.0.1
```

It uses GitHub's short-lived `GITHUB_TOKEN` with `packages: write`; no personal access token is stored in GitHub Actions. Configure the repository so workflows may write packages and protect release tags from being moved or deleted. Each release publishes three tags for every image: the version (such as `1.0.1`), `sha-<commit>` for traceability, and `latest` as the normal deployment channel.

For a local emergency or development-computer publish, supply an explicit version. This publishes that numbered release and advances `latest` to it:

```sh
./scripts/publish-images.ps1 -Version 1.0.1
```

For the normal automatic-update channel, set the three `FEEDME_*_IMAGE` values in `/opt/nurture/.env` to `:latest` once. Future releases then require only:

```sh
cd /opt/nurture
./scripts/deploy.sh
```

The API migration runner applies new SQL migrations once and records them in `schema_migration`, so a normal release updates code and database structure together. A release does not deliberately wipe data or load demo data. It is not zero-downtime: the API and web container may restart briefly. To roll back application code, change all three image values to the same prior version, such as `:1.0.0`, and run the deploy script again. Database migrations must therefore remain compatible with a rollback.

The VPS deployment remains a manual, explicit step. Do not add its SSH key, GHCR read token, OAuth credentials, database credentials, JWT secret, or `/opt/nurture/.env` to this repository or to GitHub Actions. If automatic deployment is wanted later, create separate deployment credentials and an environment with required approval; keep publishing and deployment as distinct stages.

The current app intentionally does not support offline operation or external email delivery; invitations are shareable links that must be accepted by the invited email address.
