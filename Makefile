# Dünner Wrapper um Taskfile.yml (wails3 + task müssen installiert sein).
.PHONY: run dev build test

run: build
	task run

dev:
	task dev

build:
	task build

test:
	go test ./...
	cd frontend && bun run test
