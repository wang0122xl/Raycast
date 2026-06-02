[English](README.md) | [中文](README.zh-CN.md)

# Finder Command

Raycast AI tools for operating on the folder shown in the front Finder window.

## Usage

Use this extension from Raycast AI with `@finder-command`, for example:

```text
@finder-command find files containing search-results in the front Finder folder and move them to Trash
```

At the start of each `@finder-command` request, Raycast AI locks the target folder by reading the front Finder window path with:

```bash
osascript -e 'tell application "Finder" to POSIX path of (target of front window as alias)'
```

## AI Tools

- `get-front-finder-folder`: locks the target Finder folder for the current request.
- `list-folder-files`: lists files in the locked Finder folder and returns extension counts for generic matching.
- `copy-folder-items`: copies files or folders within the locked Finder folder, with explicit paths or filters such as `fileExtension` and `pattern`.
- `move-folder-items`: moves files or folders within the locked Finder folder, with explicit paths or filters such as `fileExtension` and `pattern`.
- `rename-folder-item`: renames one file or folder in the locked Finder folder, without overwriting existing targets.
- `number-folder-files`: renames matching files to sequential names, preserving the selected extension.
- `trash-folder-items`: moves files under the locked Finder folder to Trash, with explicit paths or filters such as `fileExtension` and `pattern`.
- `run-folder-shell-command`: runs a read-only shell command in the locked Finder folder.
- `undo-last-folder-operation`: restores the file state before the latest reversible operation.

Operations inside the locked folder and its subfolders run without extra confirmation. Reads outside that folder do not require confirmation; writes or destructive operations outside that folder require explicit user approval.

Finder Command keeps one undo snapshot per normal request. Multiple file changes in the same request share the same snapshot, so undo restores the state from before the first file change in that request. The next normal `@finder-command` request replaces the previous snapshot. Undo requests should call `undo-last-folder-operation` directly.

No third-party CLI agent is launched. Raycast AI stays in its own panel and calls these extension tools directly.

Raycast does not expose an extension API for forcing the AI panel's thinking section to be collapsed by default. The extension prompt asks Raycast AI to answer in Chinese and never output `<think>` blocks or visible reasoning.

Raycast's extension manifest currently requires at least one command. This extension keeps a disabled-by-default `Finder Command` no-view placeholder only for manifest compatibility; normal usage is through `@finder-command`.
