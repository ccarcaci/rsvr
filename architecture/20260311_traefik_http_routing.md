# rsvr — Traefik HTTP Routing and Dokploy Deployment

**Date:** 2026-03-11
**Status:** Current (local Podman/Dokploy setup)

---

## Overview

Traefik acts as the reverse proxy for all external HTTP(S) traffic reaching the rsvr stack. It runs as a dedicated container (`dokploy-traefik`) managed by Dokploy, and discovers routing rules by watching the Podman socket — the same mechanism Docker Swarm users rely on, adapted for a single-host Podman setup.

Two application containers sit behind Traefik:

| Container | Image        | App port | Purpose                                   |
|-----------|--------------|----------|-------------------------------------------|
| `rsvr`    | `rsvr:latest`  | 3000     | Main reservation service (Hono + grammY)  |
| `whap`    | `whap:latest`  | 3010     | WhatsApp Cloud API mock                   |

---

## Configuration Sources

Traefik's behaviour is controlled from three places, processed in order:

```
1. traefik.yml           Static config — entry points, provider, dashboard
2. Container labels      Dynamic routing — injected by Dokploy at deploy time
3. Docker socket         Live discovery — Traefik watches for label changes
```

### traefik.yml (static config)

File: `local_infra/traefik.yml`. Seeded into the `dokploy-traefik-config` named
volume by `make start` using a short-lived Alpine container (bind-mounting
`/etc/traefik` directly from macOS fails because the Podman Machine VM does not
see paths outside `~/`).

```yaml
api:
  dashboard: true
  insecure: true          # Dashboard accessible on :8080 — local only

entryPoints:
  web:
    address: ":80"
  websecure:
    address: ":443"
  traefik:
    address: ":8080"      # Required when api.insecure: true

providers:
  docker:
    endpoint: "unix:///var/run/docker.sock"
    exposedByDefault: false   # Containers must opt in with traefik.enable=true
    watch: true
```

### Dokploy auto-injected labels

When a Compose service is deployed through Dokploy, it injects a set of Traefik
labels into the running container automatically. These labels declare:

- `traefik.enable=true` — opt this container in
- `traefik.http.routers.<name>.rule` — the `Host(...)` match rule
- `traefik.http.routers.<name>.entrypoints` — which entry point to listen on
- `traefik.http.services.<name>.loadbalancer.server.port` — backend port

The `Host(...)` value is the DNS name Dokploy assigns. In the local setup this
is a `traefik.me` subdomain (see Section 3 below).

Labels already present in the `docker-compose.yml` file are NOT overridden by
Dokploy. This is how `whap` declares its non-default backend port:

```yaml
labels:
  - "traefik.http.services.rsvr-whap.loadbalancer.server.port=3010"
```

Without this label Traefik would default to port 3000 and route to the wrong
process inside the `whap` container.

### Docker socket

`dokploy-traefik` is started with the Podman socket mounted at
`/var/run/docker.sock`. `--security-opt label=disable` is required on both
`dokploy` and `dokploy-traefik` to bypass SELinux confinement (Podman Machine
runs RHEL CoreOS with enforcing SELinux; `container_t` is denied
`{ connectto }` on `container_runtime_t` without this flag).

---

## Port Mappings

Host-to-container port bindings are set by the `podman run --publish` flags in
`local_infra/Makefile start`:

| Host port | Container port | Protocol | Purpose                                     |
|-----------|----------------|----------|---------------------------------------------|
| 3001      | 80             | TCP      | Traefik `web` entry point (HTTP)            |
| 3002      | 443            | TCP+UDP  | Traefik `websecure` entry point (HTTPS/H3)  |
| 8080      | 8080           | TCP      | Traefik dashboard                           |
| 3000      | 3000           | TCP      | Dokploy UI                                  |

Traefik is NOT on the standard ports 80/443 on the host because Dokploy's own
UI claims port 3000 and the design avoids running as root (ports < 1024
require elevated privileges on the host without `net.ipv4.ip_unprivileged_port_start`).

---

## Routing Scenarios

### Scenario 1 — Local testing with traefik.me

`traefik.me` is a public wildcard DNS service that **extracts the IP address
embedded in the subdomain itself** and returns it as the A record. No
`/etc/hosts` edit is needed. Dokploy generates per-service subdomains that
embed both the Dokploy compose ID and the host machine's advertised IP
(set via `ADVERTISE_ADDR` in the Dokploy setup).

For example, the subdomain:
```
rsvr-backend-achoqq-edd390-172-253-228-153.traefik.me
```
resolves to `172.253.228.153` — the IP embedded in the subdomain, with dashes
replacing dots. It does **not** resolve to a fixed `127.0.0.1`.

See: https://traefik.me/

**Note on local vs. external testing:**

- **Local development (from the host machine itself):** `172.253.228.153`
  routes back to the host. However, Traefik listens on `localhost:3001`, not
  on `172.253.228.153:80`. Curling the traefik.me domain directly (port 80)
  will fail — nothing listens on port 80. Use `localhost:3001` with an explicit
  `Host` header instead (see Scenario 3).
- **External testing (from another machine on the network):** DNS resolves
  `172.253.228.153` to the host machine's network IP. The remote machine
  connects to `172.253.228.153:80`, but Traefik is on port 3001, not 80. Use
  port 3001 explicitly:

  ```bash
  # From another machine on the same network
  curl http://172.253.228.153:3001/health \
    --header "Host: rsvr-backend-achoqq-edd390-172-253-228-153.traefik.me"
  ```

  Alternatively, port-forward `80 → 3001` on the host so the standard port
  works without explicit port specification.

Request flow (local testing — correct approach):

```
curl http://localhost:3001/health --header "Host: rsvr-backend-achoqq-edd390-172-253-228-153.traefik.me"
  |
  | Explicit localhost:3001 + Host header
  |
  v
localhost:3001  (host port → Traefik container port 80)
  |
  | Traefik matches the Host header against router rules
  | Router rule: Host(`rsvr-backend-achoqq-edd390-172-253-228-153.traefik.me`)
  |
  v
http://rsvr:3000/health  (Docker DNS → rsvr container, app port 3000)
  |
  v
Hono handler: GET /health → 200 JSON
```

The subdomain format Dokploy uses:
```
<project>-<service>-<compose-id-prefix>-<hash>-<advertise-ip-dashes>.traefik.me
```

Current hostnames (as of 2026-03-11):

| Service | Traefik.me hostname                                          |
|---------|--------------------------------------------------------------|
| rsvr    | `rsvr-backend-achoqq-edd390-172-253-228-153.traefik.me`     |
| whap    | `rsvr-backend-achoqq-a3fc6a-172-253-228-153.traefik.me`     |

These hostnames change if the compose service is deleted and recreated in
Dokploy.

### Scenario 2 — Real domain (production)

For a real deployment pointing `rsvr.timediscrete.co` to the host, the Traefik
router rule changes to:

```
Host(`rsvr.timediscrete.co`)
```

This is set either by configuring a custom domain in the Dokploy UI (which
re-injects the label) or by overriding the label manually in
`dokploy_compose_local.yml`:

```yaml
labels:
  - "traefik.http.routers.rsvr-app.rule=Host(`rsvr.timediscrete.co`)"
  - "traefik.http.routers.rsvr-app.entrypoints=websecure"
  - "traefik.http.routers.rsvr-app.tls.certresolver=letsencrypt"
```

Request flow:

```
Internet / curl
  |
  | GET https://rsvr.timediscrete.co/health
  | DNS A record → host IP
  |
  v
host:443  → Traefik container port 443
  |
  | TLS termination by Traefik (Let's Encrypt cert)
  | Router match: Host(`rsvr.timediscrete.co`)
  |
  v
http://rsvr:3000  (plaintext inside Docker network)
  |
  v
Hono handler: GET /health → 200 JSON
```

Traefik handles TLS termination; the backend container always receives plain
HTTP.

### Scenario 3 — Localhost curl with Host header

When the DNS name is not resolvable (no network, no traefik.me, or in CI),
supply the `Host` header manually. This bypasses DNS entirely while still
exercising the full Traefik routing path.

```bash
# rsvr health check
curl --verbose \
  --header "Host: rsvr-backend-achoqq-edd390-172-253-228-153.traefik.me" \
  http://localhost:3001/health

# whap status check
curl --verbose \
  --header "Host: rsvr-backend-achoqq-a3fc6a-172-253-228-153.traefik.me" \
  http://localhost:3001/status

# WhatsApp webhook delivery simulation (POST)
curl --verbose \
  --request POST \
  --header "Host: rsvr-backend-achoqq-edd390-172-253-228-153.traefik.me" \
  --header "Content-Type: application/json" \
  --data '{"object":"test"}' \
  http://localhost:3001/webhook/whatsapp
```

These are also exposed as Makefile targets in `local_infra/Makefile`:

```bash
make curl_rsvr_health    # GET /health via Traefik
make curl_whap_status    # GET /status via Traefik
make test_both           # Both of the above
```

---

## Service-to-Service Communication (Bypassing Traefik)

Internal traffic between containers does NOT go through Traefik. It travels
directly over the `dokploy-network` bridge network using Docker DNS.

```
whap container
  |
  | POST http://rsvr:3000/webhook/whatsapp
  | (Docker DNS resolves "rsvr" → container IP on dokploy-network)
  |
  v
rsvr container (port 3000, no TLS, no Host header matching)
```

This URL is configured via the `WEBHOOK_URL` environment variable in the
compose file:

```yaml
environment:
  WEBHOOK_URL: ${WHAP_WEBHOOK_URL:-http://rsvr:3000/webhook/whatsapp}
```

Routing table for internal calls:

| Caller | Target                                  | Protocol |
|--------|----------------------------------------|----------|
| whap   | `http://rsvr:3000/webhook/whatsapp`   | HTTP     |

Direct container-to-container calls are faster (no TLS overhead, no extra
network hop) and work regardless of whether Traefik is healthy.

---

## Path-Based Routing

The current setup uses host-based routing: each service has a distinct `Host`
header. An alternative is path-based routing under a single hostname, using
the `PathPrefix` matcher.

To enable `/rsvr/` and `/whap/` prefixes under a single domain:

```yaml
# rsvr service labels
- "traefik.http.routers.rsvr-app.rule=Host(`example.com`) && PathPrefix(`/rsvr`)"
- "traefik.http.middlewares.rsvr-strip.stripprefix.prefixes=/rsvr"
- "traefik.http.routers.rsvr-app.middlewares=rsvr-strip"

# whap service labels
- "traefik.http.routers.whap-app.rule=Host(`example.com`) && PathPrefix(`/whap`)"
- "traefik.http.middlewares.whap-strip.stripprefix.prefixes=/whap"
- "traefik.http.routers.whap-app.middlewares=whap-strip"
```

The `stripprefix` middleware removes `/rsvr` before forwarding to the backend,
so the application does not need to be aware of the prefix. Without the
middleware, Hono would receive `/rsvr/health` instead of `/health` and return
404.

Path-based routing is not used in the current setup because the services have
distinct public-facing functions and host-based routing gives cleaner URLs for
webhook registration with Meta and Telegram.

---

## TLS and HTTPS

### Current state (local)

TLS is not enabled locally. All traffic between the host and Traefik uses plain
HTTP on port 3001. The `websecure` entry point is defined but no certificate
resolver is configured in `traefik.yml`.

### Let's Encrypt setup (production)

Add a `certificatesResolvers` block to `traefik.yml`:

```yaml
certificatesResolvers:
  letsencrypt:
    acme:
      email: ops@timediscrete.co    # TODO: replace with real address
      storage: /etc/traefik/acme.json
      httpChallenge:
        entryPoint: web
```

Then add the HTTP-to-HTTPS redirect on the `web` entry point:

```yaml
entryPoints:
  web:
    address: ":80"
    http:
      redirections:
        entryPoint:
          to: websecure
          scheme: https
          permanent: true
  websecure:
    address: ":443"
```

And reference the resolver in the service router label:

```yaml
- "traefik.http.routers.rsvr-app.tls.certresolver=letsencrypt"
```

The `acme.json` file must persist across container restarts. Mount it from
a named volume or a bind mount on the host:

```bash
--volume dokploy-traefik-acme:/etc/traefik    # named volume approach
```

### TLS in the current named volume approach

The `dokploy-traefik-config` volume is seeded once (during `make start`) from
`local_infra/traefik.yml`. To add TLS configuration:

1. Update `local_infra/traefik.yml` with the `certificatesResolvers` block.
2. Recreate the volume: `podman volume rm dokploy-traefik-config` then
   `make start` (the seeding step only runs when the volume does not exist).

---

## Traefik Dashboard

The dashboard is enabled in `insecure` mode and reachable at:

```
http://localhost:8080/dashboard/
```

It shows all discovered routers, services, and middlewares in real time.
Useful for diagnosing routing mismatches — if a container is not visible here
it either does not have `traefik.enable=true` or Traefik cannot reach the
Docker socket.

Do not expose port 8080 publicly. In production, set `api.insecure: false`
and protect the dashboard with Traefik's own `BasicAuth` middleware or a
firewall rule.

---

## Full Request Flow Diagram

```
                        ┌─────────────────────────────────────┐
                        │           dokploy-network            │
                        │                                      │
 Internet / curl        │  ┌──────────────────────────────┐   │
 ──────────────         │  │     dokploy-traefik           │   │
                        │  │                               │   │
 host:3001 ─────────────┼──┤ :80  (web entry point)       │   │
 host:3002 ─────────────┼──┤ :443 (websecure entry point) │   │
 host:8080 ─────────────┼──┤ :8080 (dashboard)            │   │
                        │  │                               │   │
                        │  │  ┌─────────────────────────┐ │   │
                        │  │  │  Docker provider         │ │   │
                        │  │  │  reads labels from       │ │   │
                        │  │  │  containers via socket   │ │   │
                        │  │  └──────────┬──────────────┘ │   │
                        │  │             │ route to         │   │
                        │  └────────────┼─────────────────┘   │
                        │               │                      │
                        │    ┌──────────┴─────┐               │
                        │    │                │                │
                        │  ┌─▼──────────┐  ┌─▼──────────┐    │
                        │  │   rsvr     │  │   whap     │    │
                        │  │   :3000    │  │   :3010    │    │
                        │  └─────┬──────┘  └────────────┘    │
                        │        │ http://rsvr:3000/...       │
                        │        └────────────────────────────┤
                        │          (internal Docker DNS)       │
                        └─────────────────────────────────────┘

  ─────────────────────────────────────────────────────────
  Host port mapping:
    3001  →  Traefik :80    (HTTP, use Host header for routing)
    3002  →  Traefik :443   (HTTPS, TLS termination here)
    8080  →  Traefik :8080  (Dashboard, local only)
    3000  →  Dokploy :3000  (Dokploy UI, not Traefik)
  ─────────────────────────────────────────────────────────
```

---

## Related Files

| File                                  | Purpose                                                              |
|---------------------------------------|----------------------------------------------------------------------|
| `local_infra/traefik.yml`             | Static Traefik configuration (entry points, Docker provider)         |
| `local_infra/dokploy_compose_local.yml` | Compose file deployed to Dokploy; includes whap port label         |
| `local_infra/Makefile`                | Stack lifecycle and curl test targets                                |

## Related Documents

| Document                                                               | Description                        |
|------------------------------------------------------------------------|------------------------------------|
| [General Architecture](./20260302_general_architecture.md)             | Full system design and agent loop  |
| [WhatsApp Cloud API Recap](./20260308_whatsapp_cloud_api_recap.md)     | WhatsApp webhook and send API      |
