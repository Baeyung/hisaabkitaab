# EPIC: Convert Spare Laptop → Home Server with Public Access (Cloudflare Tunnel)

**Goal:** Deploy Spring Boot / Angular apps on a spare laptop and access them publicly via `*.yourdomain.com`, with HTTPS, no port forwarding, CGNAT-proof.

**Prerequisites (buy/prepare before starting):**
- [ ] USB drive (4GB+)
- [ ] A domain (~$10/yr — buy directly on Cloudflare Registrar for zero markup, or Namecheap)
- [ ] Free Cloudflare account
- [ ] Laptop plugged into power + Ethernet (Wi-Fi works but Ethernet is more reliable)

**Estimated total time:** ~2–3 hours (most of it is Ubuntu install + waiting on DNS)

---

## TICKET-01: Install Ubuntu Server
**Estimate:** 30–40 min

### Tasks
- [ ] Download Ubuntu Server 24.04 LTS ISO → https://ubuntu.com/download/server
- [ ] Flash to USB with balenaEtcher or Rufus
- [ ] Boot laptop from USB (usually F12 / Esc / F2 for boot menu)
- [ ] Install with defaults, EXCEPT:
    - ✅ Check **"Install OpenSSH server"** when prompted
    - Username suggestion: `deploy`
    - Use entire disk (this wipes the laptop)
- [ ] Reboot, remove USB, log in locally once
- [ ] Note the laptop's IP: `ip a` (e.g. `192.168.1.50`)
- [ ] From your main machine, verify SSH works:
  ```bash
  ssh deploy@192.168.1.50
  ```

### Acceptance criteria
- Can SSH into the laptop from your main machine. Everything after this ticket is done over SSH — close the laptop lid after TICKET-02.

---

## TICKET-02: Laptop "server-mode" tweaks
**Estimate:** 10 min

### Tasks
- [ ] **Ignore lid close** — edit `/etc/systemd/logind.conf`:
  ```bash
  sudo sed -i 's/#HandleLidSwitch=.*/HandleLidSwitch=ignore/' /etc/systemd/logind.conf
  sudo sed -i 's/#HandleLidSwitchExternalPower=.*/HandleLidSwitchExternalPower=ignore/' /etc/systemd/logind.conf
  sudo systemctl restart systemd-logind
  ```
- [ ] **Disable sleep/suspend:**
  ```bash
  sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target
  ```
- [ ] **BIOS: auto power-on after outage** — reboot into BIOS, find *"Restore on AC Power Loss"* / *"AC Back"* → set to **Power On**. (Critical for load-shedding recovery.)
- [ ] **Static local IP** — easiest: log into your router → DHCP settings → reserve the laptop's MAC to a fixed IP (e.g. `192.168.1.50`). Avoids netplan edits entirely.

### Acceptance criteria
- Lid closed → laptop stays on (SSH still responds)
- Pull power + battery dead scenario: machine boots itself when power returns
- IP never changes across reboots

---

## TICKET-03: Harden SSH + firewall
**Estimate:** 15 min

### Tasks
- [ ] **SSH key auth** — from your MAIN machine:
  ```bash
  ssh-keygen -t ed25519          # skip if you already have a key
  ssh-copy-id deploy@192.168.1.50
  ssh deploy@192.168.1.50        # must log in WITHOUT password prompt
  ```
- [ ] **Disable password login** (only after key login works!):
  ```bash
  sudo sed -i 's/#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
  sudo systemctl restart ssh
  ```
- [ ] **Firewall:**
  ```bash
  sudo ufw allow OpenSSH
  sudo ufw enable
  ```
  > Note: we do NOT open 80/443 — Cloudflare Tunnel is outbound-only. 🎉
- [ ] **Auto security updates + fail2ban:**
  ```bash
  sudo apt update
  sudo apt install -y unattended-upgrades fail2ban
  sudo dpkg-reconfigure -plow unattended-upgrades   # choose Yes
  ```

### Acceptance criteria
- `ssh deploy@192.168.1.50` works with key, and password auth is rejected
- `sudo ufw status` shows only OpenSSH allowed

---

## TICKET-04: Install Docker + Docker Compose
**Estimate:** 10 min

### Tasks
- [ ] Install via official script:
  ```bash
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker $USER
  ```
- [ ] Log out and back in (for group change), then verify:
  ```bash
  docker run --rm hello-world
  docker compose version
  ```

### Acceptance criteria
- `docker run hello-world` succeeds without `sudo`

---

## TICKET-05: Cloudflare — domain + tunnel
**Estimate:** 30 min (+ DNS propagation if domain bought elsewhere)

### Tasks
- [ ] Add your domain to Cloudflare (skip if bought on Cloudflare Registrar — it's automatic). If bought elsewhere: change nameservers at your registrar to the two Cloudflare gives you, wait for "Active" status.
- [ ] Go to **Cloudflare Dashboard → Zero Trust → Networks → Tunnels → Create a tunnel**
    - Type: **Cloudflared**
    - Name: `home-server`
- [ ] Cloudflare shows you an install command with a token. On the laptop, run the **Debian / apt** variant it gives you, e.g.:
  ```bash
  # Copy the EXACT command from the dashboard — it includes your token
  curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
  sudo dpkg -i cloudflared.deb
  sudo cloudflared service install <YOUR_TOKEN>
  ```
- [ ] Verify tunnel shows **HEALTHY** in the dashboard
- [ ] In the tunnel's **Public Hostnames** tab, add routes (we'll point them at services in TICKET-06):

  | Subdomain | Domain | Service |
    |---|---|---|
  | `app` | yourdomain.com | `http://localhost:8080` |
  | `whoami` | yourdomain.com | `http://localhost:8081` |

### Acceptance criteria
- Tunnel status = HEALTHY
- `sudo systemctl status cloudflared` = active (running)

---

## TICKET-06: Deploy a test app end-to-end
**Estimate:** 15 min

### Tasks
- [ ] Create a project dir and a smoke-test compose file:
  ```bash
  mkdir -p ~/apps && cd ~/apps
  ```
  `~/apps/docker-compose.yml`:
  ```yaml
  services:
    whoami:
      image: traefik/whoami
      container_name: whoami
      restart: unless-stopped
      ports:
        - "8081:80"
  ```
- [ ] Start it:
  ```bash
  docker compose up -d
  ```
- [ ] Confirm locally: `curl http://localhost:8081` → returns request info
- [ ] Open `https://whoami.yourdomain.com` from your **phone on mobile data** (proves it's truly public, not just LAN)

### Acceptance criteria
- ✅ HTTPS works automatically (Cloudflare handles the cert)
- ✅ App reachable from outside your network

---

## TICKET-07: Deploy YOUR apps
**Estimate:** varies

### Pattern for a Spring Boot + Postgres app
`~/apps/myapp/docker-compose.yml`:
```yaml
services:
  db:
    image: postgres:16
    restart: unless-stopped
    environment:
      POSTGRES_DB: myapp
      POSTGRES_USER: myapp
      POSTGRES_PASSWORD: change-me
    volumes:
      - pgdata:/var/lib/postgresql/data

  api:
    build: .                     # or image: from your registry
    restart: unless-stopped
    depends_on: [db]
    environment:
      SPRING_DATASOURCE_URL: jdbc:postgresql://db:5432/myapp
      SPRING_DATASOURCE_USERNAME: myapp
      SPRING_DATASOURCE_PASSWORD: change-me
    ports:
      - "8080:8080"

volumes:
  pgdata:
```

### Tasks
- [ ] One compose file (or folder) per app; each app exposes a unique localhost port
- [ ] Add one Public Hostname in the tunnel per app → `http://localhost:<port>`
- [ ] Angular apps: serve the production build via an `nginx:alpine` container, expose e.g. `8082:80`, map a subdomain to it
- [ ] `restart: unless-stopped` on everything — containers auto-start after power cuts

### Acceptance criteria
- Each app reachable on its own subdomain over HTTPS
- Full reboot test: `sudo reboot` → everything comes back up on its own

---

## TICKET-08: Backups + monitoring (don't skip)
**Estimate:** 20 min

Already done and verified: DB volume persists across `docker compose up -d --build`; `./backup.sh` and `src/backend/scripts/db-import.sh` both work. So this ticket is only: **schedule it, ship it off-box, get alerted.**

Paths assume the repo is at `~/hisaabkitaab` on the server.

### 0. Set the server timezone first
Ubuntu installs default to UTC, so `3 AM` would fire at 8 AM Pakistan time and filenames would carry the wrong date.
```bash
timedatectl                                  # check "Time zone"
sudo timedatectl set-timezone Asia/Karachi   # if it says UTC
sudo systemctl restart cron
```

### 1. Hourly dump + 7-day retention
```bash
mkdir -p ~/backups
crontab -e
```
```
0  * * * * cd $HOME/hisaabkitaab && ./backup.sh $HOME/backups/hisaabkitaab-$(date +\%F-\%H).sql.gz >> $HOME/backups/backup.log 2>&1
15 3 * * * find $HOME/backups -name 'hisaabkitaab-*.sql.gz' -mtime +7 -delete
```
Three gotchas:
- **Every** `%` must be `\%` in crontab — `\%F-\%H` gives `hisaabkitaab-2026-07-28-14.sql.gz`.
- The `%H` is what makes hourly work. With date only, all 24 runs overwrite one file.
- The output path must be **absolute** — `backup.sh` cds to the repo root, so a relative name lands in the working tree and breaks `git pull`.

Cost, measured: 400k `transaction_lines` rows = 44 MB of SQL → **2.1 MB gzipped in 0.5 s** on one core. Hourly is ~50 MB/day, ~350 MB per 7-day window. CPU duty cycle is under 0.02%. `pg_dump` takes only `ACCESS SHARE`, so app reads and writes are never blocked — it conflicts only with DDL, i.e. a Flyway migration during `update.sh`, which just waits a few seconds.

### 2. Off-machine copy → Google Drive
```bash
sudo apt install -y rclone
rclone config          # new remote -> gdrive -> drive -> blank id/secret -> scope 1
```
Headless server: answer **N** to *"Use web browser to automatically authenticate?"*, run `rclone authorize "drive"` on your laptop, paste the token back.
```
30 * * * * rclone copy $HOME/backups gdrive:hisaabkitaab-backups --include '*.sql.gz' --bwlimit 2M
```
`--bwlimit 2M` caps the upload so rclone can't starve the Cloudflare Tunnel serving your users. Home *upload* bandwidth is the one resource hourly backups genuinely compete for.

Drive's free tier is 15 GB; at ~50 MB/day a 7-day window is ~350 MB, so add matching retention there once it's been running a while:
```
45 3 * * * rclone delete gdrive:hisaabkitaab-backups --min-age 30d
```

### 3. Verify now (don't wait for the next hour)
```bash
cd ~/hisaabkitaab && ./backup.sh $HOME/backups/manual-$(date +%F-%H).sql.gz
rclone copy ~/backups gdrive:hisaabkitaab-backups --include '*.sql.gz' -v
rclone ls gdrive:hisaabkitaab-backups
crontab -l                    # confirm the lines are actually installed
```
Note: run manually in a shell, `%` needs **no** escaping — the `\%` rule is crontab-only.

### 4. Alerting
Cloudflare Dashboard → Zero Trust → **Notifications** → **Tunnel health** → your email. Free, no containers, covers power cut / laptop dead / tunnel down — which is most real outages.

### 5. Uptime Kuma — only if step 4 isn't enough
Adds one thing: catching a 502 while the tunnel is healthy. Skip until that actually bites you.
```yaml
  uptime-kuma:
    image: louislam/uptime-kuma
    container_name: hisaabkitaab-kuma
    restart: unless-stopped
    ports: ["3001:3001"]
    volumes: [kuma:/app/data]
```
Add `kuma:` under top-level `volumes:`, tunnel hostname `status` → `http://localhost:3001`, then two HTTP monitors:
- `https://aapka.hisaabkitaab.shop/` → expect 200
- `http://backend:8080/api/stores` → **Accepted Status Codes = 401** (no `/health` endpoint exists; a 401 already proves Spring is up, cheaper than adding actuator)

Put it behind Cloudflare Access, or don't expose it — the admin UI is unauthenticated on first boot.

### Acceptance criteria
- `~/backups/backup.log` shows `wrote ...`; a fresh `.sql.gz` is in Drive next morning
- `ls ~/backups` never exceeds ~14 dumps
- Email arrives when the tunnel drops

---

## Troubleshooting cheatsheet

| Symptom | Check |
|---|---|
| Subdomain shows Cloudflare error 1033/530 | Tunnel down → `sudo systemctl restart cloudflared` |
| 502 Bad Gateway | App container down or wrong port in Public Hostname → `docker ps`, `curl localhost:<port>` |
| Can't SSH | Laptop asleep? Lid config from TICKET-02 not applied? |
| Everything dead after power cut | BIOS auto power-on not set, or router boots slower than laptop → just wait / power cycle laptop |
| Tunnel healthy but site slow | Home upload bandwidth is the bottleneck — check your ISP's upload speed |

---

## Definition of Done (whole epic)
- [ ] Laptop runs headless, lid closed, survives power cuts unattended
- [ ] SSH is key-only, firewall on, auto-updates enabled
- [ ] Test app + at least one real app publicly reachable over HTTPS
- [ ] Nightly DB backups land in Google Drive, with retention
- [ ] Full reboot requires zero manual steps

# Hourly backup change note
```shell
0  * * * * cd $HOME/hisaabkitaab && ./backup.sh $HOME/backups/hisaabkitaab-$(date +\%F-\%H).sql.gz >> $HOME/backups/backup.log 2>&1
15 3 * * * find $HOME/backups -name 'hisaabkitaab-*.sql.gz' -mtime +7 -delete
30 * * * * rclone copy $HOME/backups gdrive:hisaabkitaab-backups --include '*.sql.gz' --bwlimit 2M

Before that, two setup commands:

mkdir -p ~/backups
timedatectl                                  # if it says UTC:
sudo timedatectl set-timezone Asia/Karachi && sudo systemctl restart cron

Timezone matters more with hourly than it did nightly — the %H in the filename comes from the system clock, so on UTC your -14 file is actually 7 PM local and the date rolls over mid-evening.

```
