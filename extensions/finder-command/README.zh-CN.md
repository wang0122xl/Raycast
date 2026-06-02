[English](README.md) | [中文](README.zh-CN.md)

# Finder Command

针对 Finder 当前最前窗口所在目录提供 Raycast AI tools。

## 用法

在 Raycast AI 中使用 `@finder-command`，例如：

```text
@finder-command 找到 Finder 当前目录下包含 search-results 的文件并移动到废纸篓
```

每次 `@finder-command` 请求开始时，Raycast AI 会用下面的 AppleScript 锁定 Finder 当前目录：

```bash
osascript -e 'tell application "Finder" to POSIX path of (target of front window as alias)'
```

## AI Tools

- `get-front-finder-folder`：锁定本次请求的 Finder 目标目录。
- `list-folder-files`：列出锁定目录中的文件，并返回扩展名统计用于通用匹配。
- `copy-folder-items`：在锁定目录内复制文件或文件夹，支持显式路径或 `fileExtension`、`pattern` 过滤条件。
- `move-folder-items`：在锁定目录内移动文件或文件夹，支持显式路径或 `fileExtension`、`pattern` 过滤条件。
- `rename-folder-item`：重命名锁定目录内的单个文件或文件夹，不覆盖已有目标。
- `number-folder-files`：将匹配文件批量重命名为连续编号名称，并保留选中的扩展名。
- `trash-folder-items`：将锁定目录下的文件或文件夹移动到废纸篓，支持显式路径或 `fileExtension`、`pattern` 过滤条件。
- `run-folder-shell-command`：在锁定目录下执行只读 shell 命令。
- `undo-last-folder-operation`：恢复最近一次可回退操作执行前的文件状态。

锁定目录及其子目录内的操作不需要额外确认。读取锁定目录外的路径不需要确认；写入、移动、删除或其他有副作用的目录外操作需要用户明确授权。

Finder Command 对每轮普通请求只保留一份撤回快照。同一轮请求中的多次文件变更共享这份快照，因此撤回会恢复到本轮第一次文件变更之前的状态。下一轮普通 `@finder-command` 请求会覆盖上一轮快照。撤回请求应直接调用 `undo-last-folder-operation`。

不会启动 `claude`、`codex`、`opencode`、`gemini` 等第三方 CLI agent。Raycast AI 会留在自己的面板中直接调用这些 extension tools。

Raycast 目前没有给 extension 暴露“默认收起思考内容”的面板控制 API。本扩展会在 AI prompt 中要求使用中文回复，且禁止输出 `<think>` 或可见推理过程。

Raycast extension manifest 目前要求至少保留一个 command。本扩展只保留一个 disabled-by-default 的 `Finder Command` no-view 占位命令用于通过校验；正常使用路径是 `@finder-command`。
