.PHONY: run install

PORT ?= 3000

.DEFAULT_GOAL := run

install:
	npm install

node_modules:
	npm install

run: node_modules
	PORT=$(PORT) npm start
