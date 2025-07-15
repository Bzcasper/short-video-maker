.PHONY: all fmt lint test

all: fmt lint test

fmt:
	npx prettier --write .

lint:
	npx eslint .

test:
	npx jest .
