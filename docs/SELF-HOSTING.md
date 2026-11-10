# Running Rovex on your own Mac

Two different jobs, often confused:

- **Development** — the code, the tests, a local database. Any Mac can do this.
- **Hosting** — the public site at `rovexjo.com`. This one has to stay up when you are asleep.

You can do both on one machine. This document covers both, in that order, and is honest about
what self-hosting costs.

---

## Part 1 — Development on a new Mac

### 1.1 One command

```bash
git clone https://github.com/ahmaddirar-ios/OpenStock.git
cd OpenStock
bash scripts/setup-mac.sh
```

The script installs Homebrew, Node 22 (the same major as the Docker image), MongoDB, the Vercel
CLI and a Playwright Chromium, then runs `npm ci`. It is idempotent and safe to re-run.

### 1.2 What does not move

| Path | Size | Why it is not copied |
| --- | --- | --- |
| `node_modules/` | ~780 MB | Native modules are compiled for the old CPU. `npm ci` rebuilds them. |
| `.next/` | ~850 MB | Build output. `npm run build` regenerates it. |
| `.git/` | small | Comes with the clone. |

Copying either of the first two across machines is the most common way to get a build that fails
in a way nobody can explain.

### 1.3 Secrets

`.env` is gitignored, so it does not travel with the clone. Copy it from the old Mac (AirDrop,
USB, or a password manager). For development it should read:

```dotenv
MONGODB_URI=mongodb://127.0.0.1:27017/openstock
BETTER_AUTH_URL=http://localhost:3000
BETTER_AUTH_SECRET=<keep the same value>
FINNHUB_API_KEY=<your key>
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<...>
VAPID_PRIVATE_KEY=<...>
VAPID_SUBJECT=mailto:you@example.com
ADMIN_EMAILS=ahmad.dirar@gmail.com
```

Keep `BETTER_AUTH_SECRET` identical to the old machine: changing it invalidates every existing
session, and on a hosted deployment it signs out every user.

Check the file with:

```bash
node scripts/check-env.mjs
```

### 1.4 Data

The local database is small (about 0.1 MB of data). Move it with a dump:

```bash
# on the old machine
mongodump --uri="mongodb://127.0.0.1:27017/openstock" --out=./rovex-dump

# on the new one
mongorestore --uri="mongodb://127.0.0.1:27017" ./rovex-dump
```

If you only care about the code, skip this: `npm run dev` creates the collections it needs on
first use.

### 1.5 Verify

```bash
npm run dev            # http://localhost:3000
npm test               # unit tests
npx tsc --noEmit       # types
npm run build          # production build
```

### 1.6 The end-to-end sweep

The sweep drives a real browser against a running server and a **disposable** review account:

```bash
E2E_EMAIL='trader-review@rovex.test' E2E_PASSWORD='TraderPass123!' npm run test:e2e
```

`playwright-core` ships no browser. `scripts/setup-mac.sh` downloads one; if you skip that step,
point the sweep at any Chrome with `E2E_CHROMIUM=/path/to/Chromium`.

---

## Part 2 — Hosting the public site from the Mac

### 2.1 The shape

```
Internet
   │  HTTPS
   ▼
Cloudflare  (DNS + TLS + caching)
   │  outbound-only tunnel
   ▼
cloudflared  ──►  localhost:3000  ──►  Docker Compose (app + MongoDB)
```

The Mac makes an **outbound** connection to Cloudflare. Nothing on your router is opened, no
static IP is needed, and the certificate is Cloudflare's.

### 2.2 Why a tunnel and not port forwarding

- Home connections have a dynamic IP; a tunnel does not care.
- Forwarding 80/443 puts the Mac directly on the internet, with macOS as the only firewall.
- Let's Encrypt renewal is one more thing that can silently expire and take the site down.

### 2.3 Run the app

The repository already ships a `Dockerfile` and a `docker-compose.yml` that runs the app and
MongoDB together:

```bash
docker compose up -d --build
docker compose logs -f openstock
```

`restart: unless-stopped` means both containers come back after a reboot or a crash.

### 2.4 Environment for production

`docker-compose.yml` reads `.env` at runtime, and `.dockerignore` keeps every `.env*` file out of
the image. That gives a clean split on one machine:

| File | Used by | Contents |
| --- | --- | --- |
| `.env` | Docker Compose (production) | `BETTER_AUTH_URL=https://rovexjo.com`, the production database |
| `.env.local` | `npm run dev` (development) | `BETTER_AUTH_URL=http://localhost:3000`, the local database |

Next.js gives `.env.local` priority over `.env`, so development never accidentally talks to the
production database — and the container never sees `.env.local` at all.

### 2.5 The tunnel

```bash
brew install cloudflared
cloudflared tunnel login                       # opens a browser, pick the rovexjo.com zone
cloudflared tunnel create rovex
cloudflared tunnel route dns rovex rovexjo.com
cloudflared tunnel route dns rovex www.rovexjo.com
```

Copy `scripts/self-host/cloudflared.yml.example` to `~/.cloudflared/config.yml`, fill in the
tunnel id and the credentials path, then:

```bash
cloudflared tunnel run rovex                   # test it in the foreground first
sudo cloudflared service install               # then run it as a service
```

### 2.5b If you have a static IP: direct, with Caddy

A fixed public IP and a stable connection make direct hosting possible without a tunnel. It is
shorter to set up and one hop faster, but the Mac is then reachable from the whole internet, so the
firewall, the updates and the certificate become your job.

```bash
brew install caddy
```

`/opt/homebrew/etc/Caddyfile` (Intel: `/usr/local/etc/Caddyfile`):

```caddyfile
rovexjo.com, www.rovexjo.com {
    encode gzip zstd
    reverse_proxy 127.0.0.1:3000
}
```

```bash
sudo caddy start          # or: brew services start caddy
```

Then forward TCP **80** and **443** on the router to the Mac, and point the domain's A record at
the static IP. Caddy obtains and renews the certificate on its own.

| | Tunnel (§2.5) | Direct + Caddy (§2.5b) |
| --- | --- | --- |
| Open ports | none | 80, 443 |
| Certificate | Cloudflare | Caddy (automatic) |
| DDoS protection | yes | none |
| DNS change | nameservers → Cloudflare | one A record |
| Latency | one extra hop | shortest |
| Keeps working if the IP changes | yes | no |

With a static IP and no CDN, every visitor is served from one city. That is fine for a regional
audience and noticeable for a distant one.

### 2.6 Keeping it up

A laptop that sleeps is a website that is down. On the Mac that hosts:

- **System Settings → Energy**: enable *Prevent automatic sleeping when the display is off*, and
  *Start up automatically after a power failure*.
- **System Settings → Users & Groups → Automatic login**: on, so a reboot comes back without a
  keyboard.
- **Docker Desktop → Settings → General**: *Start Docker Desktop when you sign in*.
- A UPS is not optional if the site matters: an unclean shutdown corrupts the Mongo volume.

### 2.7 Backups

`scripts/self-host/backup-mongo.sh` dumps the database and keeps the last 14 days. Schedule it
with `launchd` (or `cron`) and copy the folder somewhere that is not this Mac — an external disk,
iCloud, or the old machine.

A backup that lives only on the machine it backs up is not a backup.

### 2.8 Cutover from Vercel

Do it in this order, so the site is never down for more than a DNS TTL:

1. Bring the tunnel up and test it on a temporary hostname (`rovex-test.rovexjo.com`).
2. Sign in, open a chart, place a trade, check the alerts page — on the tunnel, not on localhost.
3. Change the DNS record for `rovexjo.com` to the tunnel.
4. **Leave the Vercel deployment in place for a week** as a fallback. It costs nothing and it is
   the fastest way back if the Mac misbehaves.
5. Only then remove it.

### 2.9 What you accept

| Risk | What it means |
| --- | --- |
| Uptime = your power + your ISP | A 20-minute outage at home is a 20-minute outage for every user. |
| Security is yours | macOS updates, Docker updates, no exposed ports, a strong login password. |
| No edge caching | Every request reaches the Mac; a slow query is a slow page for everyone. |
| Reboots | A macOS update reboots the machine. The site is down until it comes back. |
| One machine, one copy | Disk failure loses the site and the database together, unless 2.7 is done. |

### 2.10 The honest recommendation

Keep **Vercel for the public site** and use the Mac for development. Vercel is free at this size,
it is already deployed, and it does not go down when your internet does.

If you still want the Mac to serve, do it behind the tunnel, keep Vercel as a hot standby for a
week, and set up the backup before the cutover — not after.
