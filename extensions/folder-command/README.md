[English](README.md) | [中文](README.zh-CN.md)

# Folder Command

Raycast AI tools for operating on the folder shown in the front Finder window.

## Usage

Use this extension from Raycast AI with `@folder-command`, for example:

```text
@folder-command find files containing search-results in the front Finder folder and move them to Trash
```

Each tool reads the front Finder window path internally with:

```bash
osascript -e 'tell application "Finder" to POSIX path of (target of front window as alias)'
```

## AI Tools

- `get-front-finder-folder`: returns the front Finder folder path.
- `list-folder-files`: lists files in the front Finder folder.
- `trash-folder-items`: moves files under the front Finder folder to Trash after Raycast confirmation.
- `run-folder-shell-command`: runs a shell command in the front Finder folder after Raycast confirmation.

No third-party CLI agent is launched. Raycast AI stays in its own panel and calls these extension tools directly.

Raycast does not expose an extension API for forcing the AI panel's thinking section to be collapsed by default. The extension prompt asks Raycast AI to answer in Chinese and never output `<think>` blocks or visible reasoning.

Raycast's extension manifest currently requires at least one command. This extension keeps a disabled-by-default `Folder Command` no-view placeholder only for manifest compatibility; normal usage is through `@folder-command`.
