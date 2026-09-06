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
