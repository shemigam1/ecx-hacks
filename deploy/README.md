# Deploy — one public origin (SPA + API + WebSockets)

This stack serves **the whole app from a single origin**: Caddy terminates TLS and reverse-proxies to
one Nest process that serves the React SPA, the REST API, **and socket.io (WSS)**. Because it's one
origin and one process, WebSockets "just work" — Caddy proxies the upgrade automatically (no nginx
`Upgrade`/`Connection` header fiddling).

```
Internet ──▶ Caddy (:443, auto-TLS) ──▶ Nest app (:3000) ──▶ Postgres
                                          ├─ SPA (frontend/dist, baked into the image)
                                          ├─ REST API
                                          └─ socket.io (WSS)
```

## Deploy to Oracle Cloud (or any VM with a public IP)

1. **DNS:** point a domain (e.g. `steward.yourdomain.com`) at the VM's public IP (A record).
2. **Install Docker** on the VM (`docker` + `docker compose` plugin).
3. **Clone + configure:**
   ```sh
   git clone <repo> && cd <repo>
   cp ecx-backend/.env.example ecx-backend/.env   # fill JWT_SECRET, OPENROUTER_API_KEY, TOKEN_ENC_KEY…
   cp deploy/.env.example deploy/.env             # set SITE_ADDRESS + VITE_API_KEY
   ```
   In `deploy/.env`: `SITE_ADDRESS=steward.yourdomain.com` and `VITE_API_KEY=<same as INTERNAL_API_KEY>`.
   For live voice, set `PUBLIC_BASE_URL=https://steward.yourdomain.com` in `ecx-backend/.env`.
4. **Run:**
   ```sh
   cd deploy && docker compose up -d --build
   ```
   Caddy fetches a Let's Encrypt cert automatically. Visit `https://steward.yourdomain.com`.

## Oracle-specific gotchas (these bite everyone)
- **Open ports 80 + 443 in BOTH places:** the OCI **Security List / NSG** *and* the instance's OS
  firewall. Oracle images ship with restrictive `iptables` — e.g.
  `sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT` (and 443), then persist,
  or use `firewalld`. Caddy needs 80+443 reachable for the ACME cert challenge and traffic.
- **ARM (Ampere free tier):** the VM is arm64. The image is multi-arch and Prisma/argon2 have arm64
  builds; because you `--build` **on the VM**, it compiles for arm64 automatically.

## Local test (no domain / no TLS)
```sh
cd deploy
SITE_ADDRESS=":80" HTTP_PORT=8080 docker compose up -d --build
curl http://localhost:8080/            # SPA
curl http://localhost:8080/health      # Hello World!
curl 'http://localhost:8080/socket.io/?EIO=4&transport=polling'   # socket.io handshake
```

## Notes
- Backend secrets come from `../ecx-backend/.env`; the app overrides `DATABASE_URL` to the internal
  `postgres` service.
- The container runs `prisma migrate deploy` + seed on boot (fresh demo data each `up`). Seed IDs are
  random UUIDs — the app resolves identity dynamically, so don't hardcode IDs.
- `dev` vs `prod`: `ecx-backend/docker-compose.yml` = backend + DB only (for development against the
  Vite dev server). `deploy/docker-compose.yml` = full single-origin stack (this file).
