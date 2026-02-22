# Makefile for rsvr project
# TypeScript + Bun reservation system (WhatsApp/Telegram)

# Tool paths
BUN := bun
BIOME := bunx biome
JEST := bunx jest
VERSION_CHECK_SCRIPT := ./scripts/check_bun_version.sh
UPDATES_CHECK_SCRIPT := ./scripts/check_updates.sh

# Directories
SRC_DIR := src
TEST_DIR := tests
DATA_DIR := data
DIST_DIR := dist

# Files
ENTRY_POINT := $(SRC_DIR)/index.ts
DB_FILE := $(DATA_DIR)/rsvr.db

# Jest configuration for ESM mode
export NODE_OPTIONS := --experimental-vm-modules

# Default target - show help
.DEFAULT_GOAL := help

.PHONY: help
help: ## Show this help message
	@echo "rsvr - Reservation System via WhatsApp/Telegram"
	@echo ""
	@echo "Usage: make [target]"
	@echo ""
	@echo "Available targets:"
	@awk 'BEGIN {FS = ":.*##"; printf ""} /^[a-zA-Z_-]+:.*?##/ { printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2 } /^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) } ' $(MAKEFILE_LIST)

##@ Setup

.PHONY: check-version
check-version: ## Check that installed Bun version matches .bun-version
	@echo "Checking Bun version..."
	@$(VERSION_CHECK_SCRIPT)

.PHONY: install
install: ## Install dependencies using bun
	@echo "Installing dependencies..."
	@$(BUN) install

.PHONY: setup
setup: check-version install ## Full project setup (check version + install deps)
	@echo "Setup complete!"

##@ Development

.PHONY: dev
dev: ## Start development server with watch mode
	@echo "Starting development server with watch mode..."
	@$(BUN) --watch run $(ENTRY_POINT)

.PHONY: start
start: ## Start the server
	@echo "Starting server..."
	@$(BUN) run $(ENTRY_POINT)

##@ Testing & Quality

.PHONY: test
test: ## Run Jest tests (with ESM support)
	@echo "Running tests..."
	@$(JEST)

.PHONY: lint
lint: ## Run Biome linter on src/ and tests/
	@echo "Running Biome linter..."
	@$(BIOME) check $(SRC_DIR)/
	@if [ -d "$(TEST_DIR)" ]; then \
		$(BIOME) check $(TEST_DIR)/; \
	fi

.PHONY: format
format: ## Auto-format code with Biome in src/ and tests/
	@echo "Formatting code..."
	@$(BIOME) check --write $(SRC_DIR)/
	@if [ -d "$(TEST_DIR)" ]; then \
		$(BIOME) check --write $(TEST_DIR)/; \
	fi

.PHONY: check
check: lint test ## Run lint and test together
	@echo "All checks passed!"

##@ Updates

.PHONY: updates
updates: ## Check for dependency and Bun version updates
	@$(UPDATES_CHECK_SCRIPT)

.PHONY: updates-changelog
updates-changelog: ## Check updates with changelogs for outdated packages
	@$(UPDATES_CHECK_SCRIPT) --changelog

##@ Cleanup

.PHONY: clean
clean: ## Remove node_modules, *.db, data/, dist/
	@echo "Cleaning up..."
	@rm -rf node_modules
	@rm -f *.db
	@rm -rf $(DATA_DIR)
	@rm -rf $(DIST_DIR)
	@echo "Clean complete!"

.PHONY: clean-all
clean-all: clean ## Clean everything including bun lockfile
	@rm -f bun.lockb
	@echo "Deep clean complete!"
