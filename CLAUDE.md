# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A local Raycast project containing extensions, scripts, and commands for developer workflow automation. Each subdirectory is an independent module — extensions live under `extensions/`, shell-based script commands live under `scripts/`.

## Project Structure

```
extensions/          # Raycast extensions (each subdirectory is a standalone extension)
scripts/             # Raycast Script Commands (standalone shell scripts)
```

Each module has its own README (EN + CN). See root `README.md` for navigation links.

## Build & Development

Extensions use the Raycast CLI toolchain:

```bash
cd extensions/<name> && npm install

npm run build       # ray build
npm run dev         # ray develop (watch mode)
npm run lint        # ray lint
npm run fix-lint    # ray lint --fix
```

No test framework is configured.

## Code Conventions

### TypeScript

- Strict mode enabled (`"strict": true`, target ES2022)
- Prefer `interface` for object shapes, `type` for unions and simple aliases
- Use explicit `import type` for type-only imports
- Use `async/await` over `.then()` chains
- Use `??` for nullish coalescing, `?.` for optional chaining

### State Management

- Centralize state access behind a dedicated storage module wrapping Raycast `LocalStorage`
- UI components must not call `LocalStorage` directly
- Immutable updates only — spread to create new objects, never mutate in place

### Components

- PascalCase for components, camelCase for functions and variables
- One entry-point file per Raycast command (e.g. `git-push.tsx`)
- Extract shared UI into reusable components (pickers, detail views)
- Use `isLoading` state with Raycast's `<List isLoading />` / `<Detail isLoading />`
- Use `confirmAlert()` before destructive actions (delete, merge, stop)

### Error Handling

- Wrap async operations in try-catch; return null/empty on failure rather than throwing into UI
- Use `showToast()` for user feedback: `Animated` during operations, `Success`/`Failure` on completion
- Degrade gracefully when optional CLI tools are missing — don't crash

### Process Spawning

- Long-running tasks: `spawn()` with `detached: true` + `child.unref()`
- Track processes via PID files; implement cleanup with SIGTERM → wait → SIGKILL
- Escape shell arguments with a dedicated `shellQuote()` utility

### Shell Scripts (scripts/)

- Include Raycast metadata headers (`@raycast.schemaVersion`, `@raycast.title`, `@raycast.mode`, `@raycast.argument*`)
- Use `nohup bash -c "..." > /dev/null 2>&1 &` for detached execution
- Support `zoxide` for fuzzy path resolution with fallback to literal paths
- Send macOS notifications via `terminal-notifier` on completion

### Constants & Configuration

- Define constants at module top level (e.g. `TASK_DIR`, `STALE_TASK_MAX_AGE_MS`)
- Use `Record<K, V>` for label/config maps
- Keep defaults explicit and named (e.g. `DEFAULT_MODEL = "sonnet"`)

## Dependencies

- Raycast CLI (`ray build`, `ray develop`, `ray lint`)
- ESLint with `@raycast/eslint-config`, Prettier
- `@raycast/api`, `@raycast/utils`
- TypeScript 5.8+ in strict mode
