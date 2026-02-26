# Makefile for rsvr local infrastructure
# Runs Dokploy on macOS via plain podman commands, mounting the Podman socket
# directly into containers — no podman-compose or docker compose dependency.
#
# Bind mount behaviour on macOS / Podman Machine
# -----------------------------------------------
# Podman on macOS runs containers inside a hidden Linux VM (Podman Machine).
# Bind mounts resolve paths inside that VM, not on the macOS host.
# Only a few host directories are automatically shared with the VM:
#   ~/  (home directory), /Users, /Volumes
# Paths under /etc are NOT shared, so bind-mounting /etc/dokploy* fails
# with "statfs … no such file or directory".
#
# All persistent directories that previously lived under /etc/dokploy* are
# replaced with named volumes, which Podman manages entirely inside the VM.
# The traefik.yml static config is seeded into a named volume using a
# short-lived Alpine container so the file never needs to touch the host.

# IP address Dokploy advertises to Traefik for routing.
# Override at the CLI if your machine has a non-loopback address:
#   make start ADVERTISE_ADDR=192.168.1.10
ADVERTISE_ADDR ?= 127.0.0.1

# Absolute path to this Makefile's directory — used to locate traefik.yml.
INFRA_DIR := $(dir $(abspath $(lastword $(MAKEFILE_LIST))))

# Default target — show help
.DEFAULT_GOAL := help

.PHONY: help
help: ## Show this help message
	@echo "rsvr - Local Infrastructure (Dokploy via plain podman)"
	@echo ""
	@echo "Usage: make [target]"
	@echo ""
	@echo "Available targets:"
	@awk 'BEGIN {FS = ":.*##"; printf ""} /^[a-zA-Z_-]+:.*?##/ { printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2 } /^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) } ' $(MAKEFILE_LIST)

##@ Lifecycle

.PHONY: start
start: ## Start the Dokploy stack (Podman must be running)
	@PODMAN_SOCK=$$(podman info --format '{{.Host.RemoteSocket.Path}}' 2>/dev/null | sed 's|unix://||'); \
	if [ -z "$$PODMAN_SOCK" ]; then \
		echo "Could not detect Podman socket. Is Podman running?"; \
		exit 1; \
	fi; \
	\
	# ------------------------------------------------------------------ \
	# Named volumes                                                        \
	# All volumes are managed by Podman inside the Linux VM.              \
	# No host paths under /etc are used — those are not visible to the VM.\
	# ------------------------------------------------------------------ \
	podman volume exists dokploy-postgres 2>/dev/null || \
		podman volume create dokploy-postgres; \
	podman volume exists dokploy-redis 2>/dev/null || \
		podman volume create dokploy-redis; \
	# dokploy-home  →  /root/.docker inside the dokploy container \
	podman volume exists dokploy-home 2>/dev/null || \
		podman volume create dokploy-home; \
	# dokploy-config  →  /etc/dokploy inside the dokploy container \
	podman volume exists dokploy-config 2>/dev/null || \
		podman volume create dokploy-config; \
	# dokploy-traefik-config  →  /etc/traefik inside the traefik container \
	# Seed traefik.yml into the volume using a short-lived Alpine container. \
	# The -c flag passes a shell command string; cat writes the heredoc content. \
	podman volume exists dokploy-traefik-config 2>/dev/null || { \
		podman volume create dokploy-traefik-config; \
		podman run --rm \
			--volume dokploy-traefik-config:/etc/traefik \
			--volume "$(INFRA_DIR)traefik.yml:/tmp/traefik.yml:ro" \
			docker.io/library/alpine:3.21 \
			sh -c "cp /tmp/traefik.yml /etc/traefik/traefik.yml"; \
	}; \
	# dokploy-traefik-dynamic  →  /etc/dokploy/traefik/dynamic inside traefik \
	podman volume exists dokploy-traefik-dynamic 2>/dev/null || \
		podman volume create dokploy-traefik-dynamic; \
	\
	# ------------------------------------------------------------------ \
	# Network                                                              \
	# ------------------------------------------------------------------ \
	podman network exists dokploy-network 2>/dev/null || \
		podman network create --driver bridge dokploy-network; \
	\
	# ------------------------------------------------------------------ \
	# Containers                                                           \
	# Start existing containers; create and run them if they don't exist. \
	# ------------------------------------------------------------------ \
	if podman container exists dokploy-postgres 2>/dev/null; then \
		podman start dokploy-postgres; \
	else \
		podman run --detach \
			--restart=always \
			--name dokploy-postgres \
			--network dokploy-network \
			--env POSTGRES_USER=dokploy \
			--env POSTGRES_DB=dokploy \
			--env POSTGRES_PASSWORD=amukds4wi9001583845717ad2 \
			--volume dokploy-postgres:/var/lib/postgresql/data \
			docker.io/library/postgres:16; \
	fi; \
	if podman container exists dokploy-redis 2>/dev/null; then \
		podman start dokploy-redis; \
	else \
		podman run --detach \
			--restart=always \
			--name dokploy-redis \
			--network dokploy-network \
			--volume dokploy-redis:/data:Z \
			docker.io/library/redis:7; \
	fi; \
	if podman container exists dokploy 2>/dev/null; then \
		podman start dokploy; \
	else \
		podman run --detach \
			--restart=always \
			--name dokploy \
			--network dokploy-network \
			--publish 3000:3000 \
			--env ADVERTISE_ADDR=$(ADVERTISE_ADDR) \
			--env DOCKER_HOST=unix:///var/run/docker.sock \
			--volume "$$PODMAN_SOCK":/var/run/docker.sock \
			--volume dokploy-config:/etc/dokploy \
			--volume dokploy-home:/root/.docker \
			docker.io/dokploy/dokploy:latest; \
	fi; \
	if podman container exists dokploy-traefik 2>/dev/null; then \
		podman start dokploy-traefik; \
	else \
		podman run --detach \
			--restart=always \
			--name dokploy-traefik \
			--network dokploy-network \
			--publish 8080:8080/tcp \
			--publish 3001:80/tcp \
			--publish 3002:443/tcp \
			--publish 3002:443/udp \
			--env DOCKER_HOST=unix:///var/run/docker.sock \
			--volume dokploy-traefik-config:/etc/traefik \
			--volume dokploy-traefik-dynamic:/etc/dokploy/traefik/dynamic \
			--volume "$$PODMAN_SOCK":/var/run/docker.sock \
			docker.io/library/traefik:v3.6.1; \
	fi
	@echo "Dokploy starting at http://localhost:3000"

.PHONY: stop
stop: ## Stop the Dokploy stack
	@podman stop dokploy-traefik dokploy dokploy-redis dokploy-postgres

.PHONY: restart
restart: ## Restart the Dokploy stack
	@podman restart dokploy-traefik dokploy dokploy-redis dokploy-postgres

.PHONY: logs
logs: ## Tail logs from all containers
	@podman logs --follow dokploy-postgres & \
	podman logs --follow dokploy-redis & \
	podman logs --follow dokploy & \
	podman logs --follow dokploy-traefik & \
	wait

##@ Removal

.PHONY: delete
delete: ## Destroy the stack and permanently delete ALL Dokploy data
	@echo "WARNING: This will permanently remove all Dokploy containers and volumes."
	@echo "ALL data will be lost: databases, services, and configuration."
	@echo ""
	@printf "Type 'yes' to confirm: "; \
	read CONFIRM; \
	if [ "$$CONFIRM" != "yes" ]; then \
		echo "Aborted. Nothing was removed."; \
		exit 1; \
	fi
	@echo ""
	@podman stop dokploy-traefik dokploy dokploy-redis dokploy-postgres 2>/dev/null || true
	@podman rm dokploy-traefik dokploy dokploy-redis dokploy-postgres 2>/dev/null || true
	@podman volume rm \
		dokploy-postgres \
		dokploy-redis \
		dokploy-home \
		dokploy-config \
		dokploy-traefik-config \
		dokploy-traefik-dynamic \
		2>/dev/null || true
	@podman network rm dokploy-network 2>/dev/null || true
