[English](README.md) | [中文](README.zh-CN.md)

# 脚本

基于 Claude Code CLI 的 Raycast 脚本命令，用于快速执行 git 操作。这些是轻量级 shell 脚本，作为 [Raycast Script Commands](https://github.com/raycast/script-commands) 运行，无需构建扩展。

## 脚本列表

### git-push.sh

一键 git push。使用 Claude 的 `/git-push-changes` skill 对目标仓库执行暂存、提交和推送。

| 参数 | 类型 | 说明 |
|------|------|------|
| `directory path` | text | git 仓库路径（支持 [zoxide](https://github.com/ajeetdsouza/zoxide) 模糊匹配） |

行为：
- 通过 zoxide 解析目录路径（不可用时回退到原始路径）
- 启动完全分离的 Claude 进程，Raycast 立即返回
- 通过 `terminal-notifier` 发送 macOS 通知（成功/失败）
- 维护历史记录文件（`.claude-git-push-history`，保留最近 20 条）

### create-pr.sh

一键创建 PR。使用 Claude 的 `/create-pr` skill 从当前分支向指定目标分支创建 Pull Request。

| 参数 | 类型 | 说明 |
|------|------|------|
| `directory path` | text | git 仓库路径（支持 zoxide） |
| `target branch` | text | 目标分支（如 `dev`、`main`） |

行为：
- 与 `git-push.sh` 相同的路径解析和分离执行方式
- 从 Claude 输出中提取 GitHub PR URL
- 通知包含可点击的 PR 链接
- 与 `git-push.sh` 共享同一历史记录文件

### curl-convert.sh

将剪贴板中的 `curl` 命令作为 `curlie` 执行，并在 Raycast 中显示执行结果。

行为：
- 从剪贴板读取 curl 命令
- 只将开头的 `curl` 命令词替换为 `curlie --pretty`
- 当 curl 命令没有显式 method 或 body 时自动补 `GET`，避免 `curlie` 将 stdin 当作 POST body
- 在响应结果前显示实际发出的 `curlie` 命令
- 在 zsh shell 中执行转换后的命令
- 在 Raycast full output 模式中显示 stdout 和 stderr
- 拒绝不以 `curl` 开头的输入

## 依赖

- `claude` CLI（`~/.local/bin/claude`）
- `git`
- `curlie`
- `terminal-notifier`（仅用于 `git-push.sh` 和 `create-pr.sh` 的 macOS 通知）
- 可选：`zoxide`（模糊目录匹配）
- 可选：`gh` CLI（Claude 内部用于创建 PR）
