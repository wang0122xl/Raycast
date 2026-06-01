[English](README.md) | [中文](README.zh-CN.md)

# Folder Command

针对 Finder 当前最前窗口所在目录提供 Raycast AI tools。

## 用法

在 Raycast AI 中使用 `@folder-command`，例如：

```text
@folder-command 找到 Finder 当前目录下包含 search-results 的文件并移动到废纸篓
```

每个 tool 都会在内部用下面的 AppleScript 读取 Finder 当前目录：

```bash
osascript -e 'tell application "Finder" to POSIX path of (target of front window as alias)'
```

## AI Tools

- `get-front-finder-folder`：返回 Finder 当前窗口目录。
- `list-folder-files`：列出 Finder 当前目录中的文件。
- `copy-folder-items`：经过 Raycast 确认后，在 Finder 当前目录内复制文件或文件夹，不覆盖已有目标。
- `move-folder-items`：经过 Raycast 确认后，在 Finder 当前目录内移动文件或文件夹，不覆盖已有目标。
- `rename-folder-item`：经过 Raycast 确认后，重命名 Finder 当前目录内的单个文件或文件夹，不覆盖已有目标。
- `trash-folder-items`：经过 Raycast 确认后，将 Finder 当前目录下的文件或文件夹移动到废纸篓。
- `run-folder-shell-command`：经过 Raycast 确认后，在 Finder 当前目录下执行 shell 命令。

不会启动 `claude`、`codex`、`opencode`、`gemini` 等第三方 CLI agent。Raycast AI 会留在自己的面板中直接调用这些 extension tools。

Raycast 目前没有给 extension 暴露“默认收起思考内容”的面板控制 API。本扩展会在 AI prompt 中要求使用中文回复，且禁止输出 `<think>` 或可见推理过程。

Raycast extension manifest 目前要求至少保留一个 command。本扩展只保留一个 disabled-by-default 的 `Folder Command` no-view 占位命令用于通过校验；正常使用路径是 `@folder-command`。
