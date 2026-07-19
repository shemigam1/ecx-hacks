# Deploying Steward on Oracle Cloud (OCI)

End-to-end guide to run the full stack (SPA + API + WebSockets, single origin, TLS) on an OCI VM, with
GitHub Actions CI/CD. Copy-paste commands. See [`../deploy/README.md`](../deploy/README.md) for the
architecture.

**What you'll have:** `https://your-domain` serving the React app, REST API, and `wss://` socket.io —
all from one Nest process behind Caddy (auto-TLS). No ngrok.

---

## 0. Prerequisites
- An OCI account (Always Free tier is enough).
- A domain you can add a DNS record to.
- An SSH keypair. Generate one for deploys if needed:
  ```sh
  ssh-keygen -t ed25519 -f ~/.ssh/steward_oci -C steward-oci
  ```
  (You'll upload the **public** key to the VM and put the **private** key in a GitHub secret.)

---

## 1. Create the VM
OCI Console → **Compute → Instances → Create instance**:
- **Image:** Ubuntu 22.04.
- **Shape:** `VM.Standard.A1.Flex` (Ampere/ARM, Always Free — pick ~2 OCPU / 12 GB; the build needs RAM).
  Avoid the 1 GB `E2.1.Micro` — the image build can OOM there.
- **SSH keys:** paste the contents of `~/.ssh/steward_oci.pub`.
- Keep the default VCN + **assign a public IPv4**. Create.

Note the **public IP**.

## 2. Open ports (BOTH firewalls — this is the #1 gotcha)
**a) OCI Security List / NSG** (VCN → your subnet → Security List → Add Ingress Rules):
| Source `0.0.0.0/0` | Protocol | Dest port |
|---|---|---|
| Ingress | TCP | 22 (usually there) |
| Ingress | TCP | 80 |
| Ingress | TCP | 443 |

**b) The instance's own firewall.** SSH in first (`ssh -i ~/.ssh/steward_oci ubuntu@<PUBLIC_IP>`), then:
```sh
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```
(Oracle Linux instead of Ubuntu: `sudo firewall-cmd --permanent --add-port=80/tcp --add-port=443/tcp && sudo firewall-cmd --reload`.)

## 3. Point DNS at the VM
Add an **A record**: `steward.yourdomain.com → <PUBLIC_IP>`. Wait for it to resolve (`dig steward.yourdomain.com`).

## 4. Install Docker + git (on the VM)
```sh
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER          # then log out and back in so `docker` works without sudo
sudo apt-get update && sudo apt-get install -y git
```

## 5. Clone + configure
```sh
git clone https://github.com/<you>/ecx-hacks.git ~/ecx-hacks   # use a token/deploy key if private
cd ~/ecx-hacks

# Backend secrets
cp ecx-backend/.env.example ecx-backend/.env
nano ecx-backend/.env
#   JWT_SECRET=<long random>            (required)
#   TOKEN_ENC_KEY=<32+ char random>     (required)
#   OPENROUTER_API_KEY=<your key>       (for the live agent)
#   INTERNAL_API_KEY=<pick one>         (shared api key)
#   PUBLIC_BASE_URL=https://steward.yourdomain.com   (for voice webhooks)
#   STT_API_KEY / STT_BASE_URL          (only for live voice STT)

# Deploy settings
cp deploy/.env.example deploy/.env
nano deploy/.env
#   SITE_ADDRESS=steward.yourdomain.com
#   VITE_API_KEY=<same value as INTERNAL_API_KEY above>
```

## 6. First deploy
```sh
cd ~/ecx-hacks/deploy
docker compose up -d --build     # builds frontend+backend, runs migrations+seed, starts Caddy(TLS)
docker compose logs -f app       # watch it migrate/seed/start (Ctrl-C to stop tailing)
```
Caddy fetches a Let's Encrypt cert automatically for `SITE_ADDRESS`.

## 7. Verify
```sh
curl https://steward.yourdomain.com/health          # -> Hello World!
curl 'https://steward.yourdomain.com/socket.io/?EIO=4&transport=polling'   # -> 0{"sid":...}
```
Open `https://steward.yourdomain.com` in a browser — the app loads; the console/cosign use `wss://`.

---

## 8. CI/CD with GitHub Actions
The workflow ([`.github/workflows/ci-cd.yml`](../.github/workflows/ci-cd.yml)) runs backend + frontend
build/test on every push & PR, and on push to `main` it SSHes into the VM, pulls `main`, and
`docker compose up -d --build`.

**Add these repo secrets** (GitHub → Settings → Secrets and variables → Actions):
| Secret | Value |
|---|---|
| `OCI_HOST` | the VM public IP |
| `OCI_USER` | `ubuntu` (or `opc` on Oracle Linux) |
| `OCI_SSH_KEY` | contents of the **private** key `~/.ssh/steward_oci` |

Requirements on the VM (from steps 4–5): Docker installed, repo cloned at `~/ecx-hacks`, and the `.env`
files present (they're gitignored, so `git reset --hard` won't touch them).

Now every push to `main` auto-deploys after CI passes.

---

## Ops cheatsheet
```sh
cd ~/ecx-hacks/deploy
docker compose ps                 # status
docker compose logs -f app        # app logs
docker compose logs -f caddy      # TLS / cert logs
docker compose restart app        # restart backend
docker compose down               # stop (Postgres data persists in a volume)
docker compose up -d --build      # redeploy latest
```

## Troubleshooting
- **Site unreachable / cert won't issue:** ports 80+443 not open in **both** firewalls (step 2), or DNS
  not pointing at the VM yet. Caddy needs 80/443 reachable for the ACME challenge.
- **Build OOM-killed:** use a bigger shape (Ampere A1 with ≥8 GB), or build the image in CI and push to
  a registry (GHCR/OCIR) and `docker compose pull` on the VM instead of `--build`.
- **`docker` needs sudo:** you didn't re-login after `usermod -aG docker` (step 4).
- **Agent/voice not working:** check `OPENROUTER_API_KEY` / `STT_API_KEY` in `ecx-backend/.env`, then
  `docker compose up -d` to reload env.
- **WebSockets not connecting:** confirm `VITE_API_KEY` (deploy/.env) matches `INTERNAL_API_KEY`
  (ecx-backend/.env) — the socket handshake auth uses it.
