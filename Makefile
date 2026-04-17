# Makefile for rsvr project
# TypeScript + Bun reservation system (WhatsApp/Telegram)

# Tool paths
BUN := bun
BIOME := bunx biome
VERSION_CHECK_SCRIPT := ./scripts/check_bun_version.sh
UPDATES_CHECK_SCRIPT := ./scripts/check_updates.sh

# Directories
SRC_DIR := src
DATA_DIR := data
DIST_DIR := dist

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

.PHONY: check_version
check_version: ## Check that installed Bun version matches .bun-version
	@echo "Checking Bun version..."
	@$(VERSION_CHECK_SCRIPT)

.PHONY: install
install: ## Install dependencies using bun
	@echo "Installing dependencies..."
	@$(BUN) install

.PHONY: setup
setup: check_version install ## Full project setup (check version + install deps)
	@echo "Setup complete!"

##@ Testing & Quality

.PHONY: ci_test
ci_test: ## Run tests with Bun native test runner (e.g. make test test_name)
	@echo "Running tests..."
	@$(BUN) test $(if $(filter-out ci_test,$(MAKECMDGOALS)),--test-name-pattern=$(filter-out ci_test,$(MAKECMDGOALS))) $(SRC_DIR)/

.PHONY: test_debug
test_debug: ## Run tests with debugger (e.g., make test_debug test_name)
	@echo "Running tests..."
	@$(BUN) test --inspect-wait $(if $(filter-out test_debug,$(MAKECMDGOALS)),--test-name-pattern=$(filter-out test_debug,$(MAKECMDGOALS))) $(SRC_DIR)/

.PHONY: lint
lint: ## Run Biome linter on src/
	@echo "Running Biome linter..."
	@$(BIOME) check $(SRC_DIR)/

.PHONY: format
format: ## Fix formatting, linting (safe fixes), and import sorting with Biome
	@echo "Fixing formatting, linting, and import sorting..."
	@$(BIOME) check --write $(SRC_DIR)/

.PHONY: check
check: lint ci_test ## Run lint and test together
	@echo "All checks passed!"

##@ CI

.PHONY: ci_check
ci_check: ## Check formatting, import sorting, and linting (read-only, fails on violations)
	@echo "Running CI checks (format + imports + lint)..."
	@$(BIOME) ci $(SRC_DIR)/

.PHONY: ci_build
ci_build: ## Compile src/ with Bun without storing output (checks code is runnable)
	@echo "Checking compilation..."
	@BUILD_TMP=$$(mktemp -d); $(BUN) build $(SRC_DIR)/index.ts --target bun --outdir $$BUILD_TMP; EXIT=$$?; rm -rf $$BUILD_TMP; exit $$EXIT

.PHONY: ci_sec
ci_sec: ## Audit production dependencies for known vulnerabilities (bun audit --prod)
	@echo "Running security audit (production deps)..."
	@$(BUN) audit --prod

.PHONY: ci_fast
ci_fast: check_version ci_check ci_build ci_sec ## Run ci-check, ci-build, ci-test, and ci-sec in order
	make ci_test
	@echo "All CI checks passed!"

##@ Updates

.PHONY: updates
updates: ## Check for dependency and Bun version updates
	@$(UPDATES_CHECK_SCRIPT)

.PHONY: updates_changelog
updates_changelog: ## Check updates with changelogs for outdated packages
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

.PHONY: clean_all
clean_all: clean ## Clean everything including bun lockfile
	@rm -f bun.lockb
	@echo "Deep clean complete!"
