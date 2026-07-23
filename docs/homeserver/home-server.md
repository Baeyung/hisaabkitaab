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

### Tasks
- [ ] **DB backup cron** — `crontab -e`, add:
  ```
  0 3 * * * docker exec myapp-db-1 pg_dump -U myapp myapp | gzip > ~/backups/myapp-$(date +\%F).sql.gz
  ```
  ```bash
  mkdir -p ~/backups
  ```
- [ ] **Off-machine copies** — install rclone, configure Google Drive remote, add to the same cron:
  ```bash
  sudo apt install -y rclone
  rclone config    # follow prompts for Google Drive
  ```
  ```
  30 3 * * * rclone copy ~/backups gdrive:server-backups
  ```
- [ ] **Uptime Kuma** (optional, nice) — add to compose, expose on `3001`, map `status.yourdomain.com`:
  ```yaml
  uptime-kuma:
    image: louislam/uptime-kuma
    restart: unless-stopped
    ports: ["3001:3001"]
    volumes: [kuma:/app/data]
  ```

### Acceptance criteria
- A backup file appears in Google Drive tomorrow morning
- You get an alert if an app goes down

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
- [ ] Nightly DB backups land in Google Drive
- [ ] Full reboot requires zero manual steps
