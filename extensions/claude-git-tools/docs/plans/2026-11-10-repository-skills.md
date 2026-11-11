# Repository Skills Implementation Plan

**Goal:** Bind a skill to a Git repository and command through ⌘E in Manage Folders & Skills, with root-level fallback.

**Architecture:** Reuse the existing repository and skill file pickers. Store bindings in Raycast LocalStorage through `storage.ts`, keyed by command and normalized repository path. Resolve the selected repository's skill before continuing the command and refresh that resolution when launching a task, including review reruns.

**Tech Stack:** TypeScript, React, Raycast API, existing Node assertion tests.

## Scope

- A binding applies only to the selected repository and command.
- Missing bindings fall back to the existing root-level skill.
- Repository-only configuration works without a root-level skill.
- Canceling either picker leaves skill settings unchanged.
- Existing agent/model settings and task execution behavior remain intact.

## Implementation and verification

1. Add focused tests in `tests/repository-skills.cjs` for persistence, per-command isolation, path normalization, fallback, and task launch skill resolution. Run them before implementation to establish the missing behavior.
2. Extend `src/storage.ts` skill access with an optional repository path, preserving existing root keys.
3. Add the ⌘E action in `src/manage-folders.tsx`, using `RepoPicker` followed by `pickSkillFile` and saving only after both selections.
4. Update `src/skill-picker.tsx` and the three command entry points to resolve skills after repository selection, preserving the missing-skill prompt.
5. Make `src/task-manager.ts` resolve the latest repository binding when launching any task so review reruns use the same precedence.
6. Update the English and Chinese README configuration instructions.
7. Run `node tests/repository-skills.cjs`, the existing `tests/*.cjs` checks, `npm run build`, and `npm run lint`. Inspect the diff and request code review; fix relevant findings without unrelated reformatting.

Native picker/shortcut interaction requires a manual Raycast smoke test; mocked tests must never launch a real Git or agent operation.
