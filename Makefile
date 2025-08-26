# Short Video Maker - Project Makefile
# Provides convenient commands for development, building, and deployment

.PHONY: help install build test clean lint format docker-build docker-run deploy optimize

# Default target
.DEFAULT_GOAL := help

# Variables
NODE_VERSION := 20
PROJECT_NAME := short-video-maker
REGISTRY := gyoridavid
VERSION := $(shell node -p "require('./package.json').version")
GIT_COMMIT := $(shell git rev-parse --short HEAD)

# Colors for output
GREEN := \033[0;32m
YELLOW := \033[1;33m
BLUE := \033[0;34m
NC := \033[0m # No Color

help: ## Display this help message
	@echo "$(BLUE)Short Video Maker - Available Commands$(NC)"
	@echo ""
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "$(GREEN)%-20s$(NC) %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: ## Install project dependencies
	@echo "$(BLUE)Installing dependencies...$(NC)"
	npm ci
	@echo "$(GREEN)Dependencies installed successfully!$(NC)"

install-dev: ## Install development dependencies
	@echo "$(BLUE)Installing development dependencies...$(NC)"
	npm install
	@echo "$(GREEN)Development dependencies installed successfully!$(NC)"

build: ## Build the project
	@echo "$(BLUE)Building project...$(NC)"
	npm run build
	@echo "$(GREEN)Build completed successfully!$(NC)"

dev: ## Start development server
	@echo "$(BLUE)Starting development server...$(NC)"
	npm run dev

test: ## Run tests
	@echo "$(BLUE)Running tests...$(NC)"
	npm test

test-watch: ## Run tests in watch mode
	@echo "$(BLUE)Running tests in watch mode...$(NC)"
	npm run test -- --watch

clean: ## Clean temporary files and build artifacts
	@echo "$(BLUE)Cleaning project...$(NC)"
	./scripts/clean-project.sh
	@echo "$(GREEN)Project cleaned successfully!$(NC)"

lint: ## Run ESLint
	@echo "$(BLUE)Running ESLint...$(NC)"
	npx eslint src/**/*.{ts,tsx}

lint-fix: ## Run ESLint with auto-fix
	@echo "$(BLUE)Running ESLint with auto-fix...$(NC)"
	npx eslint src/**/*.{ts,tsx} --fix
	@echo "$(GREEN)Linting completed!$(NC)"

format: ## Format code with Prettier
	@echo "$(BLUE)Formatting code...$(NC)"
	npx prettier --write "src/**/*.{ts,tsx,js,jsx,json,md}"
	@echo "$(GREEN)Code formatted successfully!$(NC)"

type-check: ## Run TypeScript type checking
	@echo "$(BLUE)Running TypeScript type checking...$(NC)"
	npx tsc --noEmit
	@echo "$(GREEN)Type checking completed!$(NC)"

optimize: ## Run full project optimization
	@echo "$(BLUE)Optimizing project...$(NC)"
	./scripts/optimize-project.sh
	@echo "$(GREEN)Project optimized successfully!$(NC)"

# Docker commands
docker-build: ## Build Docker images locally
	@echo "$(BLUE)Building Docker images...$(NC)"
	./scripts/docker-build-optimized.sh
	@echo "$(GREEN)Docker images built successfully!$(NC)"

docker-build-push: ## Build and push Docker images
	@echo "$(BLUE)Building and pushing Docker images...$(NC)"
	./scripts/docker-build-optimized.sh --push
	@echo "$(GREEN)Docker images built and pushed successfully!$(NC)"

docker-run: ## Run the application with Docker Compose
	@echo "$(BLUE)Starting application with Docker Compose...$(NC)"
	docker-compose -f docker-compose.optimization.yml up

docker-run-detached: ## Run the application with Docker Compose in background
	@echo "$(BLUE)Starting application with Docker Compose (detached)...$(NC)"
	docker-compose -f docker-compose.optimization.yml up -d
	@echo "$(GREEN)Application started in background!$(NC)"

docker-stop: ## Stop Docker Compose services
	@echo "$(BLUE)Stopping Docker Compose services...$(NC)"
	docker-compose -f docker-compose.optimization.yml down
	@echo "$(GREEN)Services stopped!$(NC)"

docker-logs: ## View Docker Compose logs
	docker-compose -f docker-compose.optimization.yml logs -f

docker-clean: ## Clean Docker images and containers
	@echo "$(BLUE)Cleaning Docker resources...$(NC)"
	docker system prune -f
	docker image prune -f
	@echo "$(GREEN)Docker resources cleaned!$(NC)"

# TTS commands
tts-setup: ## Set up TTS providers
	@echo "$(BLUE)Setting up TTS providers...$(NC)"
	npm run setup:tts
	@echo "$(GREEN)TTS setup completed!$(NC)"

tts-test: ## Test TTS quality
	@echo "$(BLUE)Testing TTS quality...$(NC)"
	npm run test:tts:quality
	@echo "$(GREEN)TTS testing completed!$(NC)"

# Video generation commands
video-test: ## Run video generation tests
	@echo "$(BLUE)Running video generation tests...$(NC)"
	npm run test -- src/tests/
	@echo "$(GREEN)Video generation tests completed!$(NC)"

# Quality assurance
qa: lint type-check test ## Run complete quality assurance pipeline
	@echo "$(GREEN)Quality assurance completed successfully!$(NC)"

# CI/CD simulation
ci: install qa build ## Simulate CI pipeline
	@echo "$(GREEN)CI pipeline simulation completed!$(NC)"

# Development workflow
dev-setup: install-dev tts-setup ## Complete development environment setup
	@echo "$(GREEN)Development environment setup completed!$(NC)"

# Production deployment
deploy-staging: build docker-build ## Deploy to staging environment
	@echo "$(YELLOW)Staging deployment not configured$(NC)"
	@echo "Add your staging deployment commands here"

deploy-production: qa build docker-build-push ## Deploy to production environment
	@echo "$(YELLOW)Production deployment not configured$(NC)"
	@echo "Add your production deployment commands here"

# Monitoring and maintenance
health-check: ## Check application health
	@echo "$(BLUE)Checking application health...$(NC)"
	curl -f http://localhost:3001/health || echo "$(YELLOW)Application not running$(NC)"

logs: ## View application logs
	@echo "$(BLUE)Viewing recent logs...$(NC)"
	tail -n 100 logs/app.log 2>/dev/null || echo "$(YELLOW)No log file found$(NC)"

# Database operations
db-backup: ## Backup hive-mind database
	@echo "$(BLUE)Backing up hive-mind database...$(NC)"
	cp .hive-mind/hive.db .hive-mind/hive.db.backup.$(shell date +%Y%m%d_%H%M%S)
	@echo "$(GREEN)Database backup completed!$(NC)"

db-restore: ## Restore hive-mind database from latest backup
	@echo "$(BLUE)Restoring hive-mind database...$(NC)"
	@latest_backup=$$(ls -t .hive-mind/hive.db.backup.* 2>/dev/null | head -1); \
	if [ -n "$$latest_backup" ]; then \
		cp "$$latest_backup" .hive-mind/hive.db; \
		echo "$(GREEN)Database restored from $$latest_backup$(NC)"; \
	else \
		echo "$(YELLOW)No backup files found$(NC)"; \
	fi

# Project information
info: ## Display project information
	@echo "$(BLUE)Project Information:$(NC)"
	@echo "Name: $(PROJECT_NAME)"
	@echo "Version: $(VERSION)"
	@echo "Git Commit: $(GIT_COMMIT)"
	@echo "Node Version Required: $(NODE_VERSION)"
	@echo "Registry: $(REGISTRY)"
	@echo ""
	@echo "$(BLUE)Services:$(NC)"
	@ls -la src/services/ | grep -E "\.ts$$" | awk '{print "- " $$9}' | sed 's/\.ts//'
	@echo ""
	@echo "$(BLUE)Docker Images:$(NC)"
	@echo "- $(REGISTRY)/$(PROJECT_NAME):latest"
	@echo "- $(REGISTRY)/$(PROJECT_NAME):latest-cuda"
	@echo "- $(REGISTRY)/$(PROJECT_NAME):latest-tiny"

# Quick commands
quick-start: install build docker-run ## Quick start for new developers
	@echo "$(GREEN)Quick start completed! Application should be running on http://localhost:3001$(NC)"

quick-test: lint type-check test ## Quick test pipeline
	@echo "$(GREEN)Quick test pipeline completed!$(NC)"

# Maintenance
update-deps: ## Update project dependencies
	@echo "$(BLUE)Updating dependencies...$(NC)"
	npm update
	npm audit fix
	@echo "$(GREEN)Dependencies updated!$(NC)"

security-audit: ## Run security audit
	@echo "$(BLUE)Running security audit...$(NC)"
	npm audit
	@echo "$(GREEN)Security audit completed!$(NC)"