set shell := ["bash", "-euo", "pipefail", "-c"]

# Show available commands
default:
    @just --list

# Install dependencies
install:
    bun install

# Run the TUI application
start:
    bun run dev
alias s := start

# Run the TUI application in debug mode
debug:
    DEBUG=true bun run dev
alias d := debug

# Build
build:
    bun run build

# Run tests
test *args:
    bun test {{args}}
alias t := test

# Run tests in watch mode
test-watch:
    bun test --watch

# Type check
check:
    bun run tsc --noEmit
alias c := check

# Lint code
lint:
    bun run lint
alias l := lint

# Format code
fmt:
    bun run format
alias f := fmt

# Clean build artifacts
clean:
    rm -rf node_modules/.cache

# Run type check and tests
full-check:
    just check && just test
alias fc := full-check

# Create a demo with vhs
vhs:
    HAS_NERDFONT=false vhs assets/demo.tape
