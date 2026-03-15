.PHONY: dev build clean lint test build-all generate docs deps

dev:
	wails dev

build:
	wails build

build-all:
	wails build -platform darwin/amd64,darwin/arm64,windows/amd64,linux/amd64

clean:
	rm -rf build/bin frontend/dist

generate:
	wails generate module

lint:
	golangci-lint run ./...
	cd frontend && npm run lint

test:
	go test ./... -v -race -cover
	cd frontend && npm test -- --passWithNoTests

docs:
	swag init -g main.go -o docs/swagger

deps:
	go mod tidy
	go mod verify
	cd frontend && npm audit
