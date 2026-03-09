# Dockerfile — rsvr reservation service
#
# Build strategy: two-stage.
#   builder  — installs dependencies and compiles a self-contained binary via
#              `bun build --compile`. The binary embeds the Bun runtime and all
#              TypeScript source, so nothing else is needed at runtime.
#   runtime  — copies only the binary into a minimal Debian slim image.
#              No Bun installation, no node_modules, no source code at runtime,
#              which minimises the attack surface and image size.
#
# glibc requirement: Bun compiled binaries link against glibc. Alpine Linux uses
# musl libc and is therefore not compatible. debian:bookworm-slim is used for the
# runtime stage because it provides a minimal glibc ≥ 2.31 environment.
#
# SQLite persistence: the database file lives at /app/data/rsvr.db inside the
# container. Mount a named volume or host directory at /app/data to persist data
# across container restarts.
#
# Environment variables: all required config is injected via env vars at runtime
# (no .env file). The config loader (src/config/env.ts) reads from process.env.
# Required vars:
#   TELEGRAM_BOT_TOKEN, WHATSAPP_VERIFY_TOKEN, WHATSAPP_ACCESS_TOKEN,
#   WHATSAPP_PHONE_NUMBER_ID, ANTHROPIC_API_KEY, OPENAI_API_KEY, INTERNAL_API_KEY
# Optional vars:
#   PORT            (default: 3000)
#   DATABASE_PATH   (default: ./data/rsvr.db — resolved relative to /app)

# ── Stage 1: builder ──────────────────────────────────────────────────────────
# Pin to the same Bun major version locked in .bun-version (1.3.x).
# Using the -debian variant ensures glibc is available for native modules during
# the build phase. The full Bun image is acceptable here because this stage is
# not shipped — only the binary output crosses into the runtime stage.
FROM oven/bun:1.3-debian AS builder

WORKDIR /build

# Copy the lockfile first so dependency installation is cached independently of
# source changes. Docker/Podman layer caching invalidates from the first changed
# layer downward, so ordering matters: lockfile → package.json → source.
COPY bun.lock package.json ./

# --frozen-lockfile: fail the build if bun.lock is out of sync with package.json.
# This prevents silent lock file mutations in CI and makes builds reproducible.
RUN bun install --frozen-lockfile

# Copy source files needed for compilation.
COPY src/ ./src/
COPY tsconfig.json ./

# Compile to a self-contained native binary.
# --compile bundles the Bun runtime, all TypeScript source, and node_modules into
# a single executable. The result runs on any x86-64 or arm64 Linux host with
# glibc ≥ 2.31 without a Bun installation.
RUN bun build src/index.ts \
        --compile \
        --outfile dist/rsvr

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
# debian:bookworm-slim: minimal Debian 12 image with glibc. No Bun, no Node,
# no package manager overhead — just enough OS libraries for the compiled binary.
FROM debian:bookworm-slim AS runtime

# Security: run as a dedicated non-root user.
# UID/GID 1001 is used consistently across all rsvr service images.
# --no-create-home: the user has no home directory; the app runs from /app.
# --shell /usr/sbin/nologin: prevents interactive login if the container is
# somehow compromised and an attacker tries to exec a shell as this user.
RUN groupadd --gid 1001 rsvr \
    && useradd --uid 1001 --gid rsvr --no-create-home --shell /usr/sbin/nologin rsvr

WORKDIR /app

# Copy the compiled binary from the builder stage with correct ownership.
# --chown ensures the non-root user can execute the file without a separate RUN.
COPY --from=builder --chown=rsvr:rsvr /build/dist/rsvr ./rsvr

# Create the data directory for the SQLite database file.
# The database path defaults to ./data/rsvr.db (relative to /app).
# This directory should be backed by a named volume or bind mount in production
# so data persists across container restarts and image upgrades.
# Ownership is set to rsvr so the non-root process can create/write the db file.
RUN mkdir --parents data && chown rsvr:rsvr data

USER rsvr

# Declare the SQLite data directory as a volume mount point.
# This is a documentation hint to orchestrators and compose files; the actual
# volume must be declared in the docker-compose or podman run invocation.
VOLUME ["/app/data"]

# The Hono server listens on PORT (default 3000).
EXPOSE 3000

# Health check: /health performs a live SQLite ping and returns HTTP 200 when
# healthy or 503 when degraded. wget is available in debian:bookworm-slim.
# --start-period=20s gives the Telegram bot and DB initialisation time to finish
# before the first check is evaluated against the --retries threshold.
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
    CMD wget --quiet --spider http://localhost:${PORT:-3000}/health || exit 1

# Start the compiled binary. All configuration is provided via environment
# variables (see header comment). No command-line arguments are needed because
# src/config/env.ts falls back to process.env for every required setting.
ENTRYPOINT ["./rsvr"]
