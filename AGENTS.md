# AGENTS.md

- Bun-only runtime (`src/index.tsx` exits under Node). Run via `just`, not raw `bun` (see `justfile`).
- No `createEffect`. Setup/cleanup in `onSettled`; keep state sync in event handlers/store actions.
- `console.log` breaks the TUI. Use `console.error` or file logging.
- Wrap major sections in `Errored` to avoid crash-to-shell (see `Root` in `src/index.tsx`).
- Verify with `just check`, `just test`, `just lint`, `just fmt-check`.
