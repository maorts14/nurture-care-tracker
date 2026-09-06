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

## OVH VPS deployment

The production stack is designed for the OVH VPS currently used for this project: Ubuntu 25.04, 6 vCores, 12 GB RAM, and 100 GB storage. It uses one Docker Compose stack:

- Caddy is the only public service, on ports 80 and 443. It obtains and renews the TLS certificate automatically.
- The React app, Express API, and PostgreSQL are private Docker services; PostgreSQL and port 3001 are never published to the internet.
- Each service uses `restart: unless-stopped`. The systemd unit makes the stack start after Docker on a VPS reboot.
- The production database starts empty. It deliberately does **not** load the local demo seed.
- OVH automated backups are already enabled. A daily compressed SQL dump provides a second, app-level recovery path.

### How the production system works

```text
Browser
  │ https://care.example.com (80 redirects to HTTPS; 443 serves the app)
  ▼
Caddy ── private Docker network ──► Nginx / React web container
                                         │ /api and /socket.io
                                         ▼
                                    Express API ──► PostgreSQL named volume
```

All four containers are in the same private Docker network. Only Caddy has host ports, so the internet cannot directly reach the API on port 3001 or PostgreSQL on port 5432.

#### `docker-compose.prod.yml` — the production stack

This is deliberately separate from `docker-compose.yml`, which remains a convenient local-development stack. The production file does **not** mount `server/seed.sql`, so a new VPS database has no sample people, children, or activity logs.

`db` is the PostgreSQL container. Its data lives in the Docker named volume `nurture_data`, outside the short-lived container filesystem. Rebuilding or replacing the `db` container therefore does not erase real data. `server/schema.sql` is mounted only for PostgreSQL's first initialization of a completely empty volume. Later application schema changes are handled by the API's migration runner.

`api` is the Express and Socket.IO server. It waits for PostgreSQL's health check before starting. On startup, it runs any unapplied SQL migrations and then serves the application. Its `/api/health` endpoint returns `{"status":"ok"}` only after a real `SELECT 1` succeeds against PostgreSQL; Docker uses this endpoint to identify an unhealthy API.

`web` is Nginx serving the built React files. Nginx also forwards `/api/*` and `/socket.io/*` to `api:3001` inside Docker. That means the browser sees one origin (`https://care.example.com`), which keeps cookies and real-time Socket.IO connections simple.

`caddy` is the public edge. It is the only service with `80:80` and `443:443` published to the VPS. Once `APP_DOMAIN` resolves publicly to the VPS and those ports are reachable, Caddy obtains a TLS certificate automatically, redirects HTTP to HTTPS, and renews the certificate before expiry. Its `caddy_data` volume preserves certificate/account data across container replacement; do not delete that volume casually.

Every service has `restart: unless-stopped`. Docker restarts a container after its process crashes and restores it after Docker starts on a reboot, unless you intentionally stopped it yourself.

#### `Caddyfile` — HTTPS and reverse proxy rules

`{$APP_DOMAIN}` reads the domain from the VPS `.env` file. It is intentionally not hard-coded, so the same code works for any final domain. `encode zstd gzip` compresses text responses when the browser supports it. `reverse_proxy web:80` sends every incoming HTTPS request to the private web container. The web container then routes static files, API requests, and WebSocket upgrades to the appropriate internal service.

There is no manual certificate renewal task. The DNS record and open ports are the important prerequisites. If DNS is wrong or port 80/443 is blocked, Caddy cannot prove domain ownership and certificate issuance will fail.

#### `deploy/nurture.service` — boot-time recovery

This is a small `systemd` unit, Ubuntu's service manager. It does not run the Node application itself. Instead, once Docker is ready during a VPS boot, it runs:

```sh
docker compose --env-file .env -f docker-compose.prod.yml up -d --build --remove-orphans
```

`up -d` creates or starts the required containers in the background. `--build` ensures the image matches the checked-out code. `--remove-orphans` removes containers from an older Compose definition that no longer belong to Nurture. `RemainAfterExit=yes` records that the desired stack was started even though the command itself finishes quickly.

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

This script first runs `git pull --ff-only`. “Fast-forward only” refuses to merge unexpected server-side edits, rather than silently creating a merge commit. It then runs Compose with `--build --remove-orphans`, rebuilding only images whose inputs changed and preserving the PostgreSQL and Caddy volumes. Finally it prints the container status.

The API migration runner applies new SQL migration files once and records them in `schema_migration`, so a normal deploy updates code and database structure together. A deploy does not deliberately wipe data or seed demo data. It is not a zero-downtime deployment: the API/web container may restart briefly. If a bad release is deployed, revert the Git commit, then run `./scripts/deploy.sh` again. Database migrations should therefore be designed to remain compatible with a rollback.

#### Secrets and boundaries

The VPS `.env` contains the JWT secret, database password, and optionally Google OAuth secret. It must never be committed or copied into a container image. `.gitignore` prevents Git from tracking it, and `.dockerignore` keeps it out of Docker build context. `.env.production.example` is safe to commit because it contains placeholders only.

This is a robust single-VPS deployment, not high availability: if OVH's entire region is unavailable, the app is unavailable until the server or a backup is restored. That is appropriate for the small initial user count and can later evolve into managed database backups, off-site dumps, and a second server if needed.

### 1. Prepare DNS and Google OAuth

Choose a domain or subdomain, for example `care.example.com`, and create an **A record** pointing it to the VPS IPv4 address. Wait until `dig +short care.example.com` returns that address. Caddy cannot issue an HTTPS certificate until DNS resolves publicly and ports 80/443 reach the VPS.

If Google sign-in is enabled, add these exact entries in the existing Google OAuth client:

```text
Authorized JavaScript origin: https://care.example.com
Authorized redirect URI: https://care.example.com/api/auth/google/callback
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

### 3. Install and configure Nurture

```sh
sudo git clone https://github.com/maorts14/nurture-care-tracker.git /opt/nurture
sudo chown -R "$USER":"$USER" /opt/nurture
cd /opt/nurture
cp .env.production.example .env
openssl rand -base64 48
```

Edit `/opt/nurture/.env`. Set `APP_DOMAIN`, paste the generated value into `JWT_SECRET`, choose a unique database password, and add the Google client values if using Google sign-in. Keep this file only on the VPS; it is ignored by Git and Docker build contexts.

Start and verify the stack:

```sh
docker compose --env-file .env -f docker-compose.prod.yml up -d --build
docker compose --env-file .env -f docker-compose.prod.yml ps
curl -fsS https://care.example.com/api/health
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

### Updating the deployed app

```sh
cd /opt/nurture
./scripts/deploy.sh
```

This fast-forwards the checked-out `main` branch, rebuilds changed containers, runs SQL migrations during the API start, and leaves the database volume intact.

The current app intentionally does not support offline operation or external email delivery; invitations are shareable links that must be accepted by the invited email address.
