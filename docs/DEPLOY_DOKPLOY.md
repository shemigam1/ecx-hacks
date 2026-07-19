# Deploying Steward with Dokploy (on your VPS)

Deploy the full stack (SPA + API + WebSockets, single origin, auto-TLS) on your own VPS using
[Dokploy](https://dokploy.com) — a self-hosted PaaS. Dokploy's Traefik handles the reverse proxy, TLS,
and WebSocket upgrades, so **we don't need our own Caddy** here. CI runs tests; a Dokploy webhook does the deploy.

**Result:** `https://your-domain` serving the React app, REST API, and `wss://` socket.io from one Nest process.

---

## 0. Prerequisites
- A VPS with Docker (≥ ~2 GB RAM for the build; add swap if less).
- Ports **80 + 443** open on the VPS firewall/security group (Traefik needs them for TLS + traffic),
  and **3000** for the Dokploy dashboard (you can lock this down later).
- A domain (or use `sslip.io`: `<VPS_IP>.sslip.io` — no DNS setup needed).

## 1. Install Dokploy (on the VPS, once)
```sh
curl -sSL https://dokploy.com/install.sh | sh
```
Then open **`http://<VPS_IP>:3000`** and create the admin account.

## 2. Create the database
Dokploy dashboard → **Create → Database → PostgreSQL**. Give it a name (e.g. `steward-db`). After it's
created, open it and copy the **internal connection string** (something like
`postgresql://user:pass@steward-db:5432/dbname`) — the app uses this as `DATABASE_URL`.

## 3. Create the application
Dashboard → **Create → Application**.
- **Source:** GitHub → select your (public) repo, branch `main`.
- **Build type:** **Dockerfile**.
  - **Dockerfile path:** `deploy/Dockerfile`
  - **Build context / directory:** `.` (repo root — the Dockerfile copies both `frontend/` and `ecx-backend/`)
- **Build args:** add `VITE_API_KEY` = the same value you'll use for `INTERNAL_API_KEY` below.
- **Port:** `3000` (Dokploy routes the domain to this container port).

### Environment variables (paste in the app's Environment tab)
```
DATABASE_URL=<the internal URL from step 2>
INTERNAL_API_KEY=<your shared key — must equal the VITE_API_KEY build arg>
JWT_SECRET=<openssl rand -hex 32>
TOKEN_ENC_KEY=<openssl rand -base64 32>
OPENROUTER_API_KEY=<your OpenRouter key>
AGENT_MODEL=qwen/qwen3-32b
AGENT_MAX_TOKENS=400
STT_API_KEY=<Groq/OpenAI key, for live voice>
STT_BASE_URL=https://api.groq.com/openai/v1
STT_MODEL=whisper-large-v3
PUBLIC_BASE_URL=https://your-domain
PORT=3000
SEED_ON_DEPLOY=true
```
> **About `SEED_ON_DEPLOY`:** the seed is destructive (wipes + reseeds demo data). Leave it `true` for
> the **first** deploy, then change it to **`false`** so later redeploys keep your data.

## 4. Domain + TLS
In the app → **Domains** → add your domain (or `<VPS_IP>.sslip.io`), point it at **port 3000**, and
enable **HTTPS (Let's Encrypt)**. Traefik issues the cert and proxies HTTP **and WebSockets** — no extra config.

## 5. Deploy
Hit **Deploy**. Watch the logs: it builds both apps, runs `prisma migrate deploy`, seeds (first time),
and starts. Then visit `https://your-domain`. Quick checks:
```sh
curl https://your-domain/health                                   # -> Hello World!
curl 'https://your-domain/socket.io/?EIO=4&transport=polling'     # -> 0{"sid":...}
```
After it's up, set `SEED_ON_DEPLOY=false` and redeploy once.

## 6. CI/CD (auto-deploy on push, gated on tests)
The workflow ([`.github/workflows/ci-cd.yml`](../.github/workflows/ci-cd.yml)) runs backend + frontend
build/test on every push & PR, and on push to `main` it triggers a Dokploy redeploy **after CI passes**.

1. In Dokploy, open the app → find its **Deploy Webhook URL** (Deployments / Settings — it contains a token).
2. In GitHub → Settings → Secrets and variables → Actions → add:
   | Secret | Value |
   |---|---|
   | `DOKPLOY_DEPLOY_WEBHOOK` | the webhook URL from Dokploy |

Now: push to `main` → tests run → Dokploy pulls, rebuilds `deploy/Dockerfile`, and redeploys.

> Alternatively, enable Dokploy's **native GitHub auto-deploy** (deploys on every push) and drop the
> `deploy` job — but the webhook approach only deploys **after** CI is green, which is safer.

---

## Notes
- **No Caddy here.** `deploy/docker-compose.yml` + `deploy/Caddyfile` are for a plain (non-Dokploy) VPS;
  under Dokploy, Traefik replaces Caddy. You only use `deploy/Dockerfile`.
- **WebSockets:** Traefik proxies WS automatically; nothing to configure beyond pointing the domain at port 3000.
- **Low-RAM VPS:** if the build OOMs, add swap: `sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile`.
- **Secrets in Dokploy**, not in git — the `.env` files aren't used by the Dokploy build; you paste env in the UI.
