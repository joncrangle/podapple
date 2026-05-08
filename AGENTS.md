# Agentic Development Guidelines: Pod Repository

This document serves as a comprehensive guide for AI coding assistants and autonomous agents working within the `pod` repository. It outlines the technical stack, architectural patterns, and stylistic preferences to ensure consistency and high-quality contributions.

---

## 1. Environment & Setup

The project is built on **Bun** and uses **TypeScript** with **SolidJS** for the TUI (`@opentui/solid`). We use **Just** as a command runner.

### Prerequisites

- **Runtime**: Bun (latest stable)
- **Language**: TypeScript 5+
- **Framework**: SolidJS 1.9+
- **UI Library**: `@opentui/solid`
- **Tooling**: Oxlint/Oxfmt (Linting & Formatting), Just (Command Runner)

### Initialization

```bash
bun install
```

---

## 2. Build & Test Commands

We use `just` for task automation. See `justfile` for all commands.

### Running the Application

The app is a TUI requiring a specific preload script.

- **Start (Dev)**: `just start` (or `just s`)
  - Runs: `bun run --watch src/index.tsx`
- **Debug**: `just debug` (or `just d`)
  - Runs with `DEBUG=true`

### Testing

Tests are in `src/__tests__/`. Use `just test` (or `just t`).

- **Run All Tests**:
  ```bash
  just test
  ```
- **Run Specific Test File**:
  ```bash
  just test src/__tests__/drive.test.ts
  ```
- **Run Specific Test Case**:
  ```bash
  just test -t "should render drive list"
  ```
- **Watch Mode**:
  ```bash
  just test-watch
  ```

### Linting & Formatting

- **Check**: `just check` (or `just c`) - Runs `tsc --noEmit`
- **Lint**: `just lint` (or `just l`)
- **Format**: `just fmt` (or `just f`)
- **Full Check**: `just full-check` (or `just fc`) - Runs check + test

---

## 3. Code Style Guidelines

Enforced by `.oxlintrc.json`, `.oxfmt.json`, and `tsconfig.json`.

### Naming Conventions

- **Components**: `PascalCase` (e.g., `DriveItem.tsx`).
- **Functions**: `camelCase` (e.g., `fetchPodcasts`).
- **Variables**: `camelCase`; `UPPER_SNAKE_CASE` for constants.
- **Types/Interfaces**: `PascalCase`. No `I` prefix.

### TypeScript

- **Strict Mode**: Enabled.
- **No Any**: Avoid `any`. Use explicit types.
- **Return Types**: Explicitly annotate public function return types.
- **Path Aliases**: Use `@/` for `src/` (e.g., `import { theme } from "@/theme"`).

### Import Order

1. Built-in (fs, path)
2. External (solid-js, @opentui/\*)
3. Internal Alias (@/components/\*)
4. Relative (./utils)

---

## 4. Component Design (SolidJS + TUI)

### Reactive State

- **Signals**: `createSignal` for primitives.
- **Stores**: `createStore` for objects/arrays (e.g., file lists).
- **Effects**: `createEffect` for side effects (logging, file I/O).

### TUI Constraints

- **Rendering**: Use `@opentui/solid` components (Box, Text).
- **Layout**: Flexbox-like. Use `flexDirection="column"` for stacks.
- **Input**: Handle `onKeyPress` events. Manage focus manually if needed.
- **No DOM**: There is no HTML DOM. Do not use `div`, `span`, or web APIs.

---

## 5. Error Handling & Debugging

- **No Console Log**: `console.log` breaks the TUI. Use `console.error` (redirected) or file logging.
- **Error Boundaries**: Wrap major sections in `ErrorBoundary` to prevent crash-to-shell.
- **Debug Mode**: Use `just debug` to enable verbose logging to file.

---

## 6. Directory Structure

```
src/
├── __tests__/      # Unit tests
├── components/     # UI Components (DriveList, Header)
├── data/           # Mock data
├── hooks/          # Custom SolidJS hooks
├── services/       # Core logic (fs, podcasts)
├── theme/          # Colors and styles
├── types/          # TS Interfaces
├── utils/          # Helpers (formatting, math)
└── index.tsx       # Entry point
```

---

## 7. Instructions for Agents

1. **Discovery**: Use `ls` and `grep` to find relevant files. Read `AGENTS.md` first.
2. **Task Runner**: Always prefer `just` commands over raw `bun` commands.
3. **Verification**:
   - Run `just lint` to fix formatting.
   - Run `just test` to ensure no regressions.
   - Run `just check` to verify types.
4. **Implementation**:
   - Write small, testable functions.
   - Follow the "No DOM" rule strictly.
5. **Commits**: Write semantic commit messages (e.g., `feat: add drive selection`).

---
