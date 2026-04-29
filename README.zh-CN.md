[English](README.md) | [中文](README.zh-CN.md)

# Claude Git Tools for Raycast

一个 Raycast 扩展，基于 Claude Code 将日常 git 操作变为一键工作流。选择仓库、选择命令，Claude 会处理暂存、提交、推送、创建 PR 和代码审查 — 全程无需离开 Raycast。

## 文档导航

| 目录 | EN | 中文 |
|------|----|----|
| `extensions/claude-git-tools/` | [README](extensions/claude-git-tools/README.md) | [中文](extensions/claude-git-tools/README.zh-CN.md) |
| `scripts/` | [README](scripts/README.md) | [中文](scripts/README.zh-CN.md) |

## 为什么

在终端、浏览器和 IDE 之间切换只为推送代码或创建 PR，会打断工作流。这个扩展让你留在 Raycast 中：选择仓库、触发命令，Claude 负责暂存、提交、编写 PR 描述，甚至审查 diff。你保持专注，繁琐的工作在后台完成。

## 命令

| 命令 | 说明 |
|------|------|
| Git Push | 通过 Claude 暂存、提交并推送更改 |
| Create PR | 创建 Pull Request，AI 自动生成描述，支持分支选择 |
| Review PR | 使用 Claude 审查 PR，可直接在 Raycast 中合并/关闭 |
| View Tasks | 实时监控运行中和已完成的任务 |
| Manage Folders & Skills | 配置仓库扫描目录，绑定 skill 文件 |
| Manage Model | 切换 Claude 模型（Haiku / Sonnet / Opus） |

## 依赖

- macOS + [Raycast](https://raycast.com)
- Node.js 和 npm
- `git`
- `claude` CLI（支持 `--output-format stream-json`）

### 可选

- [`gh`](https://cli.github.com) — PR 创建和审查
- [`terminal-notifier`](https://github.com/julienXX/terminal-notifier) — 任务完成时的 macOS 通知

## 快速开始

```bash
git clone https://github.com/wang0122xl/claude-git-tools-raycast.git
cd claude-git-tools-raycast/claude-git-tools
npm install
npm run build
```

然后打开 Raycast 搜索上述任意命令。

### 开发

```bash
cd claude-git-tools
npm run dev       # 监听模式
npm run lint      # 检查 lint
npm run fix-lint  # 自动修复 lint
```

## 工作原理

1. 从配置的扫描目录中选择一个 git 仓库
2. 扩展在后台启动一个分离的 Claude 进程
3. Claude 的流式 JSON 输出被格式化为可读的 Markdown
4. 任务进度在 Raycast 中实时显示
5. 完成后发送 macOS 通知，附带 PR 或 commit 链接

任务在关闭 Raycast 窗口后仍会继续运行 — 它们是独立的后台进程。

### Skill 文件

每个命令可以选择性地使用 `.md` skill 文件作为系统提示词，精细控制 Claude 在该操作中的行为。通过 "Manage Folders & Skills" 命令配置。

## 许可证

MIT
