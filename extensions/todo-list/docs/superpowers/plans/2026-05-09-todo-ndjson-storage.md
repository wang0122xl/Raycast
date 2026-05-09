# Todo NDJSON Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single JSON todo store with segmented NDJSON event files plus a fast current-state file, while preserving permanent completed-task search history.

**Architecture:** Keep the existing `TodoSections` UI shape, but move persistence into `src/storage.ts`. Main list reads `todo-current.ndjson`; search reads the replayed state from all `todo-events-*.ndjson` files. Mutations append compact state events and rewrite current-state snapshots.

**Tech Stack:** Raycast API, React, Jotai, TypeScript, Node `fs`/`path`, NDJSON files in `environment.supportPath`.

---

### Task 1: Storage Layer

**Files:**
- Create: `src/storage.ts`
- Modify: `src/config.ts`
- Modify: `src/atoms.ts`

- [ ] Add storage paths for `todo-manifest.json`, `todo-current.ndjson`, and segmented `todo-events-000001.ndjson`.
- [ ] Implement legacy migration from `todo.json` into event and current files without deleting the legacy file.
- [ ] Implement `loadTodoState()` and `saveTodoSections()` to preserve existing component usage.
- [ ] Ensure completed deletions become soft-deleted records and incomplete deletions become hard-delete events.

### Task 2: Mutation Semantics

**Files:**
- Modify: `src/hooks/useTodo.ts`
- Modify: `src/list_actions.tsx`
- Modify: `src/clear_completed.tsx`
- Modify: `src/mark_all_incomplete.tsx`

- [ ] Add stable IDs on creation and migration.
- [ ] Set `completedAt` when marking complete and clear it when marking incomplete.
- [ ] Keep UI actions working when search renders records from the searchable projection.

### Task 3: List and Search Rendering

**Files:**
- Modify: `src/index.tsx`
- Modify: `src/todo_section.tsx`
- Modify: `src/list_tags.tsx`

- [ ] Main list renders only non-deleted records, with completed records limited to the last 15 days.
- [ ] Search renders two sections: `Incomplete` then `Completed`.
- [ ] Search scans title, tag, created date, due date, completed date, deleted date, and year tokens.

### Task 4: Date Display

**Files:**
- Modify: `src/utils.ts`
- Modify: `src/todo_item.tsx`

- [ ] Add shared date formatting: `YYYY-MM-DD`, or `MM-DD` for the current year.
- [ ] Use that format for due dates and completed-on accessories.
- [ ] Add `completed on {date}` to the far-right accessories for completed items.

### Task 5: Verification

**Commands:**
- `npm run lint`
- `npm run build`

- [ ] Fix TypeScript and lint issues.
- [ ] Review changed files for accidental hard deletion of completed records.
