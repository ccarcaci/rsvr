# Dockerfile — rsvr reservation service
#
# glibc requirement: Bun requires glibc. oven/bun:1.3-debian is used for the
# runtime stage because it includes Bun runtime with glibc ≥ 2.31.
#
# Remote debugging: override ENTRYPOINT in docker-compose to enable --inspect:
#   entrypoint: ["bun", "--inspect=0.0.0.0:9228"]
#   ports:
#     - 9228:9228
# Then connect your IDE debugger to localhost:9228.
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

FROM oven/bun:1.3-debian AS runtime

# Install curl for the HEALTHCHECK instruction below.
# Bun images include curl by default in many cases, but explicitly ensure it's
# available. --no-install-recommends keeps the layer small by skipping optional
# suggested packages. The apt lists are removed immediately after installation
# to avoid stale package index data in the image layer.
RUN apt-get update \
    && apt-get install --yes --no-install-recommends curl \
    && rm --recursive --force /var/lib/apt/lists/*

WORKDIR /app

# Security: run as a dedicated non-root user.
# UID/GID 1001 is used consistently across all rsvr service images.
# --no-create-home: the user has no home directory; the app runs from /app.
# --shell /usr/sbin/nologin: prevents interactive login if the container is
# somehow compromised and an attacker tries to exec a shell as this user.
RUN groupadd --gid 1001 rsvr \
    && useradd --uid 1001 --gid rsvr --no-create-home --shell /usr/sbin/nologin rsvr

# Create the data directory for the SQLite database file.
# The database path defaults to ./data/rsvr.db (relative to /app).
# This directory should be backed by a named volume or bind mount in production
# so data persists across container restarts and image upgrades.
# Ownership is set to rsvr so the non-root process can create/write the db file.
RUN mkdir --parents data && chown rsvr:rsvr data

# Copy the lockfile first so dependency installation is cached independently of
# source changes. Docker/Podman layer caching invalidates from the first changed
# layer downward, so ordering matters: lockfile → package.json → source.
COPY bun.lock package.json ./

# --frozen-lockfile: fail the build if bun.lock is out of sync with package.json.
# This prevents silent lock file mutations in CI and makes builds reproducible.
RUN bun install --frozen-lockfile

# Copy source files needed for compilation.
COPY tsconfig.json ./
COPY src/ ./src/

USER rsvr

# Declare the SQLite data directory as a volume mount point.
# This is a documentation hint to orchestrators and compose files; the actual
# volume must be declared in the docker-compose or podman run invocation.
VOLUME ["/app/data"]

# The Hono server listens on PORT (default 3000).
EXPOSE 3000

# Debug inspector port (optional). Exposed when --inspect flag is used.
EXPOSE 9228

# Health check: /status performs a live SQLite ping and returns HTTP 200 when
# healthy or 503 when degraded. /status is public (no auth required), making it
# suitable for healthchecks from orchestrators. curl is available in the runtime stage.
# --fail causes curl to exit non-zero on HTTP 4xx/5xx, which marks the
# container unhealthy. --silent suppresses progress output.
# --start-period=20s gives the Telegram bot and DB initialisation time to finish
# before the first check is evaluated against the --retries threshold.
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
    CMD curl --fail --silent http://localhost:${PORT:-3000}/status || exit 1

# Start via Bun. All nine config values must be passed as CLI arguments
# (see header comment). In docker-compose, use the `command:` block to supply
# all --flag values. To enable debugging, override entrypoint in compose:
#   entrypoint: ["bun", "--inspect=0.0.0.0:9228"]
ENTRYPOINT ["bun"]
CMD ["src/index.ts"]
