[English](README.md) | [中文](README.zh-CN.md)

# Code Open

Open saved project folders in Zed from Raycast.

## Commands

### Code Open

- Shows every saved project folder.
- Uses Raycast list search for fuzzy filtering.
- When no folders are saved, the empty list prompts you to press `Cmd+N`.
- Press `Enter` to open the selected project in Zed and focus the Project Panel.
- Press `Cmd+Enter` to open the selected project in Zed and focus the Git Panel.
- If a matching Zed project window is already open, the command focuses that window instead of launching a new one.
- Press `Cmd+N` from the list to directly choose and add one or more folders or `.APP` bundles.
- Newly added folders move to the top of the list. Opened folders move to the top after Zed opens.
- After a project opens, the Raycast panel closes and returns to the root search.
- Press `Cmd+X` on a saved folder to remove it after confirmation.

## Zed Integration

The extension uses the installed Zed CLI from `/usr/local/bin/zed` when available, then falls back to Zed's bundled CLI from `/Applications/Zed.app/Contents/MacOS/cli`, then `zed` on `PATH`. Opening or switching to a project is handled with `zed <project-folder>`.

Icon: Tabler Icons `folder-bolt` (MIT).
