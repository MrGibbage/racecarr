APP_IMAGE?=racecarr:dev

.PHONY: dev build test fmt

dev:
	docker-compose up --build

build:
	docker build -t $(APP_IMAGE) .

test:
	docker-compose run --rm app pytest

fmt:
	@echo "Add formatter commands here (black/ruff/prettier)"
