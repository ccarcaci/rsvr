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
# Configuration: src/config/args.ts reads ALL config exclusively from CLI
# arguments via parseArgs(). No environment variables are used for config.
#
# All nine values must be passed as --flag value arguments:
#   --port, --database_path,
#   --telegram_bot_token, --whatsapp_verify_token, --whatsapp_access_token,
#   --whatsapp_phone_number_id, --anthropic_api_key, --openai_api_key,
#   --internal_api_key
#
# Example with mock values (for local/testing):
#   docker run rsvr:latest --port 3000 --database_path ./data/rsvr.db \
#     --telegram_bot_token mock_telegram_bot_token \
#     --anthropic_api_key mock_anthropic_api_key ...

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

# Copy the database schema to a fixed container path (/app/schema.sql).
# The compiled binary cannot use import.meta.dir to locate schema.sql because
# `bun build --compile` embeds TypeScript but not arbitrary non-TS files; at
# runtime import.meta.dir resolves to the virtual /$bunfs/root/ filesystem which
# is not accessible via readFileSync. Copying the file here gives the binary a
# stable absolute path it can always find regardless of how it was started.
COPY --from=builder --chown=rsvr:rsvr /build/src/db/schema.sql ./schema.sql

# Create the data directory for the SQLite database file.
# The database path defaults to ./data/rsvr.db (relative to /app).
# This directory should be backed by a named volume or bind mount in production
# so data persists across container restarts and image upgrades.
# Ownership is set to rsvr so the non-root process can create/write the db file.
RUN mkdir --parents data && chown rsvr:rsvr data

# Install curl for the HEALTHCHECK instruction below.
# debian:bookworm-slim ships neither curl nor wget; apt-get is the only way to
# add a lightweight HTTP client. --no-install-recommends keeps the layer small
# by skipping optional suggested packages. The apt lists are removed immediately
# after installation to avoid stale package index data in the image layer.
RUN apt-get update \
    && apt-get install --yes --no-install-recommends curl \
    && rm --recursive --force /var/lib/apt/lists/*

USER rsvr

# Declare the SQLite data directory as a volume mount point.
# This is a documentation hint to orchestrators and compose files; the actual
# volume must be declared in the docker-compose or podman run invocation.
VOLUME ["/app/data"]

# The Hono server listens on PORT (default 3000).
EXPOSE 3000

# Health check: /health performs a live SQLite ping and returns HTTP 200 when
# healthy or 503 when degraded. curl is installed above in the runtime stage.
# --fail causes curl to exit non-zero on HTTP 4xx/5xx, which marks the
# container unhealthy. --silent suppresses progress output.
# --start-period=20s gives the Telegram bot and DB initialisation time to finish
# before the first check is evaluated against the --retries threshold.
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
    CMD curl --fail --silent http://localhost:${PORT:-3000}/health || exit 1

# Start the compiled binary. All nine config values must be passed as CLI
# arguments (see header comment). In docker-compose, use the `command:` block
# to supply all --flag values.
ENTRYPOINT ["./rsvr"]
