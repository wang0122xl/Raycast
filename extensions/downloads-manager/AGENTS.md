# Repository Guidelines

## Project Structure & Module Organization

This directory is a standalone Raycast extension for managing downloaded files. Command entry points live in `src/*.tsx`, for example `src/manage-downloads.tsx` and `src/open-latest-download.tsx`. Shared filesystem, preference, deletion, preview, and permission logic is centralized in `src/utils.tsx`. AI tool handlers live in `src/tools/*.ts` and are declared in the `tools` section of `package.json`.

Static extension assets are in `assets/`; Raycast Store screenshots are in `metadata/`. Build output goes to `dist/` via the Raycast CLI and should not be edited manually.

## Build, Test, and Development Commands

- `npm install`: install Raycast, TypeScript, ESLint, and runtime dependencies.
- `npm run dev`: start `ray develop` for local Raycast testing.
- `npm run lint`: run `ray lint` with the Raycast ESLint config.
- `npm run fix-lint`: run automatic Raycast lint fixes.
- `npm run build`: run `ray build -e dist` for production validation.
- `npm run publish`: publish through the Raycast CLI.

No unit test script is configured. Treat `npm run lint` as the default fast check, and run `npm run build` before changes that affect command registration, packaging, or tool metadata.

## Coding Style & Naming Conventions

Use TypeScript with strict mode. Prefer small, focused changes that follow the existing Raycast React patterns. Components use PascalCase, functions and variables use camelCase, and command files use kebab-case names matching `package.json` command names.

Formatting is handled by Prettier with `printWidth: 120` and double quotes. Use `async/await`, optional chaining, and nullish coalescing where appropriate. Keep Raycast preferences and command/tool declarations synchronized with the implementation.

## Testing Guidelines

There is no dedicated test framework or coverage target. Validate UI changes in Raycast with `npm run dev`. For no-view commands and tool handlers, verify the relevant command path manually and run `npm run lint`. When changing destructive behavior, confirm Raycast alerts and deletion modes still match `README.md`.

## Commit & Pull Request Guidelines

Recent history mostly uses concise conventional-style messages such as `feat: ...`, `fix: ...`, and `style: ...`; follow that pattern. Keep commits scoped to this extension unless a broader repository change is intentional.

Pull requests should include a short description, the affected commands or tools, verification steps run, and screenshots or screen recordings for visible UI changes. Call out permission, filesystem, or deletion-behavior changes explicitly.
