# Beginner-Friendly End-to-End Setup

This guide walks absolute beginners through everything required to expose UsenetStreamer on the public internet with HTTPS. Follow each section in order; commands target Ubuntu 22.04 on a fresh VPS.

## 0. Accounts and Services You Need First

1. **Usenet provider:** e.g., Newshosting, Easynews, Eweka. Without a provider you cannot download anything.
2. **Indexer platform:** Prowlarr needs at least one NZB indexer/API key (NZBGeek, Crawler, DrunkenSlug, etc.).
3. **DuckDNS account:** free dynamic DNS name used later for HTTPS. Sign up at [https://www.duckdns.org](https://www.duckdns.org), create a subdomain (e.g., `mystreamer`), and note the API token—you’ll use it to keep that hostname pointed at your VPS.

## 1. Rent a VPS and Log In

Choose any reputable cloud (Oracle recommended)

If you hate terminals on Windows, use **MobaXterm**:

1. Download it from https://mobaxterm.mobatek.net and launch the Home edition.
2. Click `Session` → `SSH`, enter your VPS IP in “Remote host,” keep username `root`.
3. Tick “Use private key” and select your `.ppk`/`id_rsa` file (or press `Generate` if you need one).
4. Click `OK`; MobaXterm will open a terminal window and prompt you to accept the host fingerprint.

Prefer raw SSH? Run this from PowerShell/macOS/Linux:

```bash
ssh root@your-vps-ip
```

## 2. Install Docker and Compose

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg lsb-release
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER
newgrp docker
```

## 3. Prepare Folders and Secrets

Before creating folders, confirm your user/group IDs—Oracle and other VPS images sometimes use `1001` or higher. Run:

```bash
id
```

Note the `uid=` and `gid=` values and reuse them anywhere this guide mentions `PUID`/`PGID`.

```bash
mkdir -p ~/usenetstack/{prowlarr,nzbdav,usenetstreamer}
cd ~/usenetstack
openssl rand -hex 16 | tr -d '\n' > .shared-secret
cat .shared-secret   # copy this for later
```

## 4. Create `docker-compose.yml`

```yaml
version: "3.9"

services:
  prowlarr:
    image: lscr.io/linuxserver/prowlarr:latest
    container_name: prowlarr
    restart: unless-stopped
    ports:
      - "9696:9696"
    volumes:
      - ./prowlarr:/config
    environment:
      - PUID=1000
      - PGID=1000
      - TZ=Etc/UTC

  nzbdav:
    image: nzbdav/nzbdav:alpha
    container_name: nzbdav
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - PUID=1000
      - PGID=1000
    volumes:
      - ./nzbdav:/config

  usenetstreamer:
    image: ghcr.io/sanket9225/usenetstreamer:latest
    container_name: usenetstreamer
    restart: unless-stopped
    depends_on:
      - prowlarr
      - nzbdav
    ports:
      - "7000:7000"
    environment:
      ADDON_SHARED_SECRET: ${ADDON_SECRET:?set ADDON_SECRET}
      ADDON_BASE_URL: https://your-duckdns-subdomain.duckdns.org/${ADDON_SECRET}/
      INDEXER_MANAGER: prowlarr
      INDEXER_MANAGER_URL: http://prowlarr:9696
      INDEXER_MANAGER_API_KEY: change-me-after-prowlarr-setup
      NZBDAV_URL: http://nzbdav:3000
      NZBDAV_API_KEY: change-this-now
      NZBDAV_WEBDAV_URL: http://nzbdav:3000
      NZBDAV_WEBDAV_USER: admin
      NZBDAV_WEBDAV_PASS: admin
```

### `.env` for secrets

```bash
cat <<'EOF' > .env
ADDON_SECRET=$(cat .shared-secret)
EOF
```

## 5. Launch the Stack

```bash
docker compose pull
docker compose up -d
```

Visit the services:

- `http://your-vps-ip:9696` – finish Prowlarr onboarding, create API key, add indexers.
- `http://your-vps-ip:3000` – configure NZBDav: add your Usenet provider credentials, set up WebDAV username/password, and copy the API key for UsenetStreamer.
- `http://your-vps-ip:7000/<ADDON_SECRET>/admin/` – enter Prowlarr and NZBDav connection details.

## 6. Open Firewall Ports

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 9696/tcp
sudo ufw allow 3000/tcp
sudo ufw allow 7000/tcp
sudo ufw enable
```

Also open the same ports inside your cloud provider security group.

## 7. Configure DuckDNS

No scripts needed. Just:

1. Log in at [duckdns.org](https://www.duckdns.org) and create a subdomain (e.g., `mystreamer`).
2. In the “Current IP” box, paste your VPS public IP and click **Update IP**.
3. Wait a few minutes for DNS propagation (`ping mystreamer.duckdns.org` should resolve to your server).

You’ll use `mystreamer.duckdns.org` in the Caddy config later.

## 8. Install and Configure Caddy for HTTPS

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/caddy-stable-archive-keyring.gpg] https://dl.cloudsmith.io/public/caddy/stable/deb/debian any-version main" | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
```

Create `/etc/caddy/Caddyfile`:

```
mystreamer.duckdns.org {
  reverse_proxy 127.0.0.1:7000
}
```

Reload Caddy:

```bash
sudo systemctl reload caddy
```

## 9. Final Checklist

- Update `INDEXER_MANAGER_API_KEY`, NZBDav credentials, and `ADDON_BASE_URL` inside the UsenetStreamer dashboard (now reachable at your DuckDNS URL).
- Run the **Connection Tests** tab to confirm every service is reachable.
- Add `https://mystreamer.duckdns.org/super-secret-token/manifest.json` inside Stremio on each device.
- Stay current with `docker compose pull && docker compose up -d`.

Need more help? Jump into [Discord](https://discord.gg/NJsprZyz) and share screenshots/logs.
