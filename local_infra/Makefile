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
#
# Podman socket — how it is exposed to containers
# -----------------------------------------------
# The Podman daemon socket lives at /run/podman/podman.sock inside the Linux
# VM. Bind-mount paths in 'podman run --volume' are resolved inside the VM,
# so /run/podman/podman.sock is the correct source path.
#
# Two separate access controls gate socket access from inside a container:
#
#   1. DAC (Unix permissions): the socket is owned root:root 0660.
#      Containers run as root (uid=0) inside the VM, so DAC passes.
#
#   2. SELinux (Podman Machine uses a CoreOS / RHEL-based VM with enforcing
#      SELinux): the socket carries label system_u:object_r:var_run_t:s0 and
#      the Podman daemon process runs as container_runtime_t. The SELinux
#      policy does NOT allow container_t (the label given to container
#      processes) to { connectto } a peer running as container_runtime_t,
#      nor to { write } a sock_file labelled var_run_t.
#
#      Root cause confirmed via /var/log/audit/audit.log inside the VM:
#        avc: denied { connectto } scontext=container_t tcontext=container_runtime_t
#        avc: denied { write }     scontext=container_t tcontext=var_run_t sock_file
#
#      Fix: --security-opt label=disable on the containers that need socket
#      access (dokploy, dokploy-traefik). This disables SELinux confinement
#      for those containers, allowing them to access the Podman socket.
#      This is the standard documented approach for Docker-in-Podman setups.
#
# Dokploy API targets
# -------------------
# Prerequisites:
#   - Dokploy running  (make start)
#
# Quick-start:
#   1. http://localhost:3000 > Settings > Profile > API/CLI — generate a token.
#   2. Create a project + Compose service in the Dokploy UI.
#   3. Run:
#        make deploy
#   4. Check progress:
#        make api_status

# IP address Dokploy advertises to Traefik for routing.
# Override at the CLI if your machine has a non-loopback address:
#   make start ADVERTISE_ADDR=192.168.1.10
ADVERTISE_ADDR ?= 127.0.0.1

# Absolute path to this Makefile's directory — used to locate traefik.yml.
INFRA_DIR := $(dir $(abspath $(lastword $(MAKEFILE_LIST))))

# -----------------------------------------------------------------------
# Dokploy API variables
# -----------------------------------------------------------------------

# Base URL of the Dokploy instance API.
# Change this if Dokploy is running on a remote server.
DOKPLOY_URL ?= http://localhost:3000/api

# Path to the docker-compose.dokploy.yml pushed to Dokploy on deploy.
# This file uses pre-built images instead of build: blocks.
COMPOSE_FILE ?= $(INFRA_DIR)dokploy_compose_local.yml

# Docker image names (must match the image: references in docker-compose.dokploy.yml)
RSVR_IMAGE ?= rsvr:latest
WHAP_IMAGE ?= whap:latest

# Repository root (parent directory of local_infra/)
REPO_ROOT := $(dir $(INFRA_DIR))..

# Default target — show help
.DEFAULT_GOAL := help

.PHONY: help
help: ## Show this help message
	@echo "rsvr - Local Infrastructure (Dokploy via plain podman)"
	@echo ""
	@echo "Usage: make [target]"
	@echo ""
	@echo "Available targets:"
	@awk 'BEGIN {FS = ":.*##"; printf ""} /^[a-zA-Z_-]+:.*?##/ { printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2 } /^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) } ' $(MAKEFILE_LIST)

##@ Lifecycle

.PHONY: start
start: ## Start the Dokploy stack (Podman must be running)
	@# ------------------------------------------------------------------ \
	@# Named volumes                                                        \
	@# All volumes are managed by Podman inside the Linux VM.              \
	@# No host paths under /etc are used — those are not visible to the VM.\
	@# ------------------------------------------------------------------ \
	@podman volume exists dokploy-postgres 2>/dev/null || \
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
	#                                                                      \
	# Socket mount: /run/podman/podman.sock is the Podman daemon socket   \
	# inside the Linux VM. Bind-mount paths resolve inside the VM, so     \
	# this is the correct source path — not $DOCKER_HOST, which is the    \
	# macOS-side relay socket and is not accessible from within the VM.   \
	#                                                                      \
	# --security-opt label=disable: the Podman Machine VM runs with       \
	# enforcing SELinux. Without this flag, SELinux blocks the            \
	# container_t process from connecting to the container_runtime_t      \
	# peer (the Podman daemon). This is the documented approach for       \
	# containers that need direct Podman/Docker socket access.            \
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
			--security-opt label=disable \
			--env ADVERTISE_ADDR=$(ADVERTISE_ADDR) \
			--env DOCKER_HOST=unix:///var/run/docker.sock \
			--volume /run/podman/podman.sock:/var/run/docker.sock \
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
			--security-opt label=disable \
			--env DOCKER_HOST=unix:///var/run/docker.sock \
			--volume dokploy-traefik-config:/etc/traefik \
			--volume dokploy-traefik-dynamic:/etc/dokploy/traefik/dynamic \
			--volume /run/podman/podman.sock:/var/run/docker.sock \
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

##@ Docker Image Build

.PHONY: build_images
build_images: ## Build rsvr and whap Docker images locally
	@echo "Building Docker images..."
	podman build \
		--file $(INFRA_DIR)Dockerfile \
		--tag $(RSVR_IMAGE) \
		$(REPO_ROOT)
	@echo "Built $(RSVR_IMAGE)"
	podman build \
		--file $(INFRA_DIR)Dockerfile_whap \
		--tag $(WHAP_IMAGE) \
		$(REPO_ROOT)
	@echo "Built $(WHAP_IMAGE)"

##@ Dokploy API

# Local dev API key — hardcoded, no security concerns (local Dokploy instance only).
# Generate at: http://localhost:3000 > Settings > Profile > API/CLI
DOKPLOY_DEV_AK = QijsEsUKjjDfOgaRqJqMiDwKJBEHuQbknlCzXlGsPRiLgpvSNeLAjPKJiFFneWJA

# Compose ID of the rsvr service in Dokploy.
# Find it in the Dokploy UI under the Compose service details.
COMPOSE_ID = 8QN5h7nSk92SSSgWCJGlO

.PHONY: deploy
deploy: build_images ## Build Docker images locally, then deploy to Dokploy
	@if [ -z "$(COMPOSE_ID)" ]; then echo "Error: COMPOSE_ID is not set."; exit 1; fi
	@echo "Pushing $(COMPOSE_FILE) to compose service $(COMPOSE_ID)..."
	@COMPOSE_CONTENT=$$(cat "$(COMPOSE_FILE)" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))"); \
	curl --silent --fail \
		--request POST \
		--header "x-api-key: $(DOKPLOY_DEV_AK)" \
		--header "Content-Type: application/json" \
		--data "{\"composeId\": \"$(COMPOSE_ID)\", \"composeFile\": $$COMPOSE_CONTENT}" \
		"$(DOKPLOY_URL)/compose.update" \
		--output /dev/null
	@echo "Triggering redeploy..."
	@curl --silent --fail \
		--request POST \
		--header "x-api-key: $(DOKPLOY_DEV_AK)" \
		--header "Content-Type: application/json" \
		--data "{\"composeId\": \"$(COMPOSE_ID)\"}" \
		"$(DOKPLOY_URL)/compose.redeploy" \
		--output /dev/null
	@echo "Deployed. Check progress with:  make api_status"

.PHONY: api_status
api_status: ## Show recent deployments for the rsvr compose service
	@if [ -z "$(COMPOSE_ID)" ]; then echo "Error: COMPOSE_ID is not set."; exit 1; fi
	@curl --silent --fail \
		--header "x-api-key: $(DOKPLOY_DEV_AK)" \
		"$(DOKPLOY_URL)/deployment.allByCompose?composeId=$(COMPOSE_ID)"
