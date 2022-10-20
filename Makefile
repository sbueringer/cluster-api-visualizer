## --------------------------------------
## Variables
## --------------------------------------

VUE_DIR := web
NODE_MODULES := ./$(VUE_DIR)/node_modules
DIST_FOLDER := ./$(VUE_DIR)/dist
GO_BIN_OUT := main

TAG ?= latest
REGISTRY ?= ghcr.io/jont828
IMAGE_NAME ?= cluster-api-visualizer
DOCKER_IMAGE ?= $(REGISTRY)/$(IMAGE_NAME)

## --------------------------------------
## All
## --------------------------------------

# Default target is to build and run the app
.PHONY: all
all: npm-install build run

.PHONY: build
build: build-web build-go

.PHONY: clean
clean:
	rm -rf $(DIST_FOLDER) $(NODE_MODULES) $(GO_BIN_OUT) tmp

## --------------------------------------
## Vue and Node
## --------------------------------------

.PHONY: npm-install
npm-install: $(VUE_DIR)/package.json
	npm install --prefix ./$(VUE_DIR)

.PHONY: build-web
build-web: $(NODE_MODULES)
	npm run --prefix ./$(VUE_DIR) build

.PHONY: npm-serve
serve: $(VUE_DIR)/package.json $(NODE_MODULES)
	npm run --prefix ./$(VUE_DIR) serve

.PHONY: clean-dist
clean-dist:
	rm -rf $(DIST_FOLDER)

## --------------------------------------
## Go
## --------------------------------------

.PHONY: build-go
build-go:
	go build -o $(GO_BIN_OUT)

.PHONY: run
run: $(GO_BIN_OUT) $(DIST_FOLDER)
	./$(GO_BIN_OUT)

.PHONY: go-run
go-run: $(DIST_FOLDER)
	go run main.go

.PHONY: air
air: .air.toml
	air

.PHONY: go-mod-tidy
go-mod-tidy:
	go mod tidy

.PHONY: go-vet
go-vet:
	go vet ./...

.PHONY: go-fmt
go-fmt:
	go fmt ./...

## --------------------------------------
## Docker
## --------------------------------------

ALL_ARCH = amd64 arm arm64

.PHONY: docker-build
docker-build:
	docker build --build-arg ARCH=amd64 -t $(DOCKER_IMAGE)-amd64:$(TAG)  .
	docker build --build-arg ARCH=arm -t $(DOCKER_IMAGE)-arm:$(TAG)  .
	docker build --build-arg ARCH=arm64 -t $(DOCKER_IMAGE)-arm64:$(TAG)  .

.PHONY: docker-push
docker-push:
	docker push $(DOCKER_IMAGE)-amd64:$(TAG)
	docker push $(DOCKER_IMAGE)-arm:$(TAG)
	docker push $(DOCKER_IMAGE)-arm64:$(TAG)
	docker manifest create --amend $(DOCKER_IMAGE):$(TAG) $(shell echo $(ALL_ARCH) | sed -e "s~[^ ]*~$(DOCKER_IMAGE)\-&:$(TAG)~g")
	@for arch in $(ALL_ARCH); do docker manifest annotate --arch $${arch} ${DOCKER_IMAGE}:${TAG} ${DOCKER_IMAGE}-$${arch}:${TAG}; done
	docker manifest push --purge $(DOCKER_IMAGE):$(TAG)

## --------------------------------------
## Helm
## --------------------------------------

.PHONY: update-helm
update-helm:
	./hack/update-helm-repo.sh
