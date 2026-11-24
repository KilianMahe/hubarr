# SPDX-License-Identifier: AGPL-3.0-or-later
# Point d'entrée unique du projet. Tout s'exécute dans Docker :
# seuls Docker Engine et Docker Compose v2 sont requis sur la machine.
# `make help` liste les cibles.

SHELL := /bin/sh
.DEFAULT_GOAL := help

# Fichiers générés par les conteneurs : propriété de l'utilisateur de l'hôte.
export HOST_UID ?= $(shell id -u)
export HOST_GID ?= $(shell id -g)

COMPOSE := docker compose -f compose.dev.yml
PROD    := docker compose -f docker-compose.yml
# Commande ponctuelle dans le conteneur `server` (après installation des dépendances).
RUN     := $(COMPOSE) run --rm server

# Version inscrite dans l'image (HUBARR_VERSION) ; `make release` la fixe.
VERSION ?= 0.0.0-local+$(shell git rev-parse --short HEAD 2>/dev/null || echo unknown)
IMAGE   ?= hubarr:local

# Points de montage créés d'avance, sinon Docker les crée au nom de root.
MOUNTS  := data-dev node_modules apps/server/node_modules apps/web/node_modules \
           packages/shared/node_modules e2e/mocks/node_modules e2e/playwright/node_modules \
           docs/node_modules

.PHONY: help dev stack down logs ps image install sh lint lint-files lint-fix \
        format typecheck test test-watch check outdated clean hooks build prod \
        prod-down prod-logs db-generate db-migrate openapi docs e2e \
        screenshots check-fast scan release smoke-arm64 publish publish-github github-release dockerhub-description

help: ## Affiche cette aide
	@grep -E '^[a-z][a-z-]+:.*## ' $(MAKEFILE_LIST) \
	  | awk 'BEGIN {FS = ":.*## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

$(MOUNTS):
	@mkdir -p $@

## --- Environnement de développement ---

dev: $(MOUNTS) ## Lance server (7070), web (5173), mocks (7171) et docs (5174) en hot reload
	$(COMPOSE) up --build

stack: $(MOUNTS) ## Comme dev, avec la vraie stack *arr (Radarr, Sonarr, Prowlarr, qBittorrent, SABnzbd)
	mkdir -p data-dev/stack
	$(COMPOSE) --profile stack up --build

down: ## Arrête l'environnement de développement
	$(COMPOSE) --profile stack down

logs: ## Suit les logs des services
	$(COMPOSE) logs -f

ps: ## État des conteneurs
	$(COMPOSE) --profile stack ps

image: ## (Re)construit l'image de développement
	$(COMPOSE) build deps

install: $(MOUNTS) ## Installe les dépendances (pnpm install)
	$(COMPOSE) run --rm deps

sh: $(MOUNTS) ## Shell dans le conteneur server
	$(RUN) bash

## --- Qualité ---

lint: $(MOUNTS) ## ESLint + Prettier
	$(RUN) pnpm lint

lint-files: $(MOUNTS) ## ESLint + Prettier sur FILES="a.ts b.vue"
	@test -n "$(FILES)" || { echo 'FILES est vide'; exit 2; }
	$(RUN) sh -c 'pnpm exec eslint --no-warn-ignored -- "$$@" && pnpm exec prettier --check --ignore-unknown -- "$$@"' lint-files $(FILES)

lint-fix: $(MOUNTS) ## Corrige ce qui peut l'être (ESLint --fix, Prettier --write)
	$(RUN) pnpm lint:fix

format: $(MOUNTS) ## Formate le code avec Prettier
	$(RUN) pnpm format

typecheck: $(MOUNTS) ## Vérification des types (tsc, vue-tsc)
	$(RUN) pnpm typecheck

test: $(MOUNTS) ## Tests unitaires (Vitest)
	$(RUN) pnpm test

test-watch: $(MOUNTS) ## Tests unitaires en mode watch
	$(RUN) pnpm -r --parallel exec vitest

e2e: $(MOUNTS) build ## Tests E2E Playwright (mobile + desktop) sur l'image de prod et les faux upstreams (GREP=motif)
	@status=0; \
	$(COMPOSE) --profile e2e run --rm --build e2e \
	  ./node_modules/.bin/playwright test $(if $(GREP),--grep "$(GREP)") || status=$$?; \
	$(COMPOSE) --profile e2e rm -sf e2e-app e2e-app-prefix e2e-mocks >/dev/null 2>&1; \
	exit $$status

screenshots: $(MOUNTS) build ## Captures de présentation (README, doc) dans docs/public/screenshots
	@status=0; \
	$(COMPOSE) --profile e2e run --rm --build -e E2E_SHOWCASE=1 e2e \
	  ./node_modules/.bin/playwright test specs/showcase.spec.ts || status=$$?; \
	$(COMPOSE) --profile e2e rm -sf e2e-app e2e-app-prefix e2e-mocks >/dev/null 2>&1; \
	exit $$status

check-fast: $(MOUNTS) ## lint + typecheck (hook pre-commit)
	$(RUN) sh -c 'pnpm lint && pnpm typecheck'

check: $(MOUNTS) ## lint + typecheck + test + licences (à la demande)
	$(RUN) pnpm check

outdated: $(MOUNTS) ## Dépendances à mettre à jour
	$(RUN) pnpm -r outdated

hooks: ## Installe le hook git pre-commit (make check-fast)
	git config core.hooksPath .githooks
	@echo 'Hook actif : .githooks/pre-commit (make check-fast)'

## --- Base de données ---

db-generate: $(MOUNTS) ## Écrit la migration SQL des changements de src/db/schema.ts (NAME=nom_court)
	@test -n "$(NAME)" || { echo 'NAME est requis, par exemple : make db-generate NAME=add_foo'; exit 2; }
	$(RUN) pnpm --filter @hubarr/server db:generate --name $(NAME)

db-migrate: $(MOUNTS) ## Applique les migrations en attente à data-dev/hubarr.db (fait aussi au démarrage)
	$(RUN) pnpm --filter @hubarr/server db:migrate

## --- Types des services (OpenAPI) ---

openapi: $(MOUNTS) ## Régénère les types d'un service depuis sa spec OpenAPI (SERVICE=radarr ; FETCH=1 retélécharge la version épinglée)
	@test -n "$(SERVICE)" || { echo 'SERVICE est requis, par exemple : make openapi SERVICE=radarr'; exit 2; }
	$(RUN) sh -c 'node tools/generate-openapi-types.js $(SERVICE) $(if $(FETCH),--fetch) && pnpm exec prettier --write apps/server/src/integrations/$(SERVICE)/openapi.ts'

## --- Documentation ---

docs: $(MOUNTS) ## Construit la documentation VitePress (docs/.vitepress/dist, servie sur /docs par l'image)
	$(RUN) pnpm --filter @hubarr/docs build

## --- Image de production ---

build: ## Construit l'image de prod hubarr:local (binaires natifs vérifiés pendant le build)
	docker build -f docker/Dockerfile --target runtime \
	  --build-arg HUBARR_VERSION=$(VERSION) -t $(IMAGE) .
	@docker image ls $(IMAGE)

# À garder aligné sur TRIVY_VERSION dans .forgejo/workflows/security.yml.
TRIVY_VERSION ?= 0.76.2
TRIVY := docker run --rm -v "$(CURDIR)":/src:ro -w /src -v hubarr-trivy-cache:/root/.cache \
         -e TRIVY_NO_PROGRESS=true aquasec/trivy:$(TRIVY_VERSION)

scan: build ## Analyse Trivy à la demande (dépendances + image hubarr:local), comme la CI ; jamais lancée automatiquement
	$(TRIVY) fs --skip-dirs '**/node_modules' --skip-dirs data-dev .
	docker save -o .trivy-image.tar $(IMAGE)
	$(TRIVY) image --input .trivy-image.tar; status=$$?; rm -f .trivy-image.tar; exit $$status

smoke-arm64: ## Test de fumée de l'image sur arm64 par émulation (prérequis : binfmt arm64, voir tools/smoke-arm64.sh)
	./tools/smoke-arm64.sh $(VERSION)

DOCKER_REPO ?= naroner/hubarr
# Node des scripts de publication : le conteneur de dev en local ; la CI de
# publication (`.forgejo/workflows/release.yml`) passe `PUBLISH_NODE=node`.
PUBLISH_NODE ?= $(COMPOSE) run --rm --no-deps -e GITHUB_TOKEN -e DOCKERHUB_TOKEN \
                -e DOCKERHUB_USERNAME -e DOCKER_REPO -e DRY_RUN server node

publish: ## Pousse l'image d'une version sur Docker Hub (VERSION=x.y.z ; DOCKER_REPO, naroner/hubarr par défaut ; pas latest pour une préversion)
	@test -n "$(filter-out 0.0.0-local+%,$(VERSION))" || { echo 'VERSION est requis, par exemple : make publish VERSION=1.0.0'; exit 2; }
	docker push $(DOCKER_REPO):$(VERSION)
	@# Préversion (x.y.z-rc.1) : `latest` reste sur la dernière version stable.
	@case "$(VERSION)" in *-*) echo "Préversion : $(DOCKER_REPO):latest inchangé." ;; \
	  *) docker push $(DOCKER_REPO):latest ;; esac

publish-github: ## Publie une version sur GitHub (VERSION=x.y.z) : historique public sans CLAUDE.md, PLAN, MEMOIRE, design/ (DRY_RUN=1 : essai)
	@test -n "$(filter-out 0.0.0-local+%,$(VERSION))" || { echo 'VERSION est requis, par exemple : make publish-github VERSION=1.0.0'; exit 2; }
	./tools/publish-github.sh $(VERSION)

github-release: ## Page de release GitHub d'une version (VERSION=x.y.z, jeton dans GITHUB_TOKEN)
	@test -n "$(filter-out 0.0.0-local+%,$(VERSION))" || { echo 'VERSION est requis, par exemple : make github-release VERSION=1.0.0'; exit 2; }
	$(PUBLISH_NODE) tools/publish-notes.js github-release $(VERSION)

dockerhub-description: ## Description du dépôt Docker Hub depuis docker/DOCKERHUB.md (jeton dans DOCKERHUB_TOKEN)
	$(PUBLISH_NODE) tools/publish-notes.js dockerhub

release: ## Publication locale (VERSION=x.y.z) : contrôles, e2e, CHANGELOG, commit et tag, images hubarr:x.y.z et hubarr:local
	@test -n "$(filter-out 0.0.0-local+%,$(VERSION))" || { echo 'VERSION est requis, par exemple : make release VERSION=1.0.0'; exit 2; }
	DOCKER_REPO=$(DOCKER_REPO) ./tools/release.sh $(VERSION)

prod: build ## Lance l'image locale comme un utilisateur final (port 7070, volume hubarr_data)
	$(PROD) up -d --no-build
	$(PROD) ps

prod-down: ## Arrête l'image de prod locale (garde le volume de données)
	$(PROD) down

prod-logs: ## Suit les logs de l'image de prod locale
	$(PROD) logs -f

## --- Maintenance ---

clean: ## Supprime conteneurs et volumes de dev (node_modules, store pnpm), garde data-dev/
	$(COMPOSE) --profile stack down --volumes --remove-orphans
