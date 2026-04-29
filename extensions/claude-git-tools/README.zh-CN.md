# Claude Git Tools

基于 Claude Code CLI 的 Raycast 扩展，将日常 git 操作变为一键工作流。选择仓库、选择命令，Claude 会处理暂存、提交、推送、创建 PR 和代码审查 — 全程无需离开 Raycast。

## 环境要求

| 依赖 | 必需 | 说明 |
|------|------|------|
| [Raycast](https://raycast.com) | 是 | macOS 启动器，承载扩展运行 |
| [Node.js](https://nodejs.org) + npm | 是 | 构建和运行扩展 |
| `git` | 是 | 版本控制操作 |
| [`claude`](https://docs.anthropic.com/en/docs/claude-code) | 是 | Claude Code CLI，需支持 `--output-format stream-json` |
| [`gh`](https://cli.github.com) | 推荐 | GitHub CLI — Create PR 和 Review PR 命令必需 |
| [`terminal-notifier`](https://github.com/julienXX/terminal-notifier) | 可选 | 任务完成时发送 macOS 通知 |

所有 CLI 工具需在 PATH 中可用。

## 使用指南

### 1. 安装扩展

```bash
cd extensions/claude-git-tools
npm install
npm run dev    # 打开 Raycast 开发环境
```

### 2. 配置扫描目录

打开 Raycast 运行 **Manage Folders & Skills**：

- 按 Enter 选择 "Add Folder"，添加包含 git 仓库的父目录（如 `~/git`）
- 扩展会向下扫描最多 3 层目录寻找 `.git`
- 如果仓库分散在不同位置，可添加多个目录

### 3. 配置 Skill 文件（可选）

在同一个 **Manage Folders & Skills** 面板中，"Skills" 区域列出了每个命令（Git Push、Create PR、Review PR）。可以为每个命令绑定一个 `.md` skill 文件作为系统提示词，精细控制 Claude 的行为。

如果未配置 skill 文件，扩展会回退到内置的 slash 命令（`/git-push-changes`、`/create-pr`、`/pr-review`）。

### 4. 执行命令

| 命令 | 流程 |
|------|------|
| **Git Push** | 选择仓库 → Claude 暂存、提交并推送 → 任务详情面板 |
| **Create PR** | 选择仓库 → 选择/输入目标分支 → Claude 创建 PR → 任务详情面板 |
| **Review PR** | 选择仓库 → PR 列表（open + closed）→ 选择 PR 审查 → 任务详情面板 |

每个命令启动一个后台 Claude 进程。**任务详情面板**以格式化 Markdown 实时流式展示输出。关闭 Raycast 窗口后任务仍会继续运行。

### 5. 监控任务

运行 **View Tasks** 查看所有运行中和已完成的任务。点击任意任务查看输出、提取的 PR/commit URL 和状态。

### 6. 选择模型

运行 **Manage Model** 切换 Claude 模型（Haiku / Sonnet / Opus）。

## Claude CLI 权限

扩展通过 `--allowedTools` 参数调用 `claude`，仅预授权 git 操作所需的工具，避免后台进程中出现交互式权限确认。

### 授权工具列表

| 工具 | 用途 |
|------|------|
| `Bash(git:*)` | 所有 git 操作 — add、commit、push、diff、log、branch、merge、rebase 等 |
| `Bash(gh:*)` | GitHub CLI — 创建 PR（`gh pr create`）、列出/审查/合并/关闭 PR |
| `Bash(ls:*)` | 列出目录内容，探索仓库结构 |
| `Bash(cat:*)` | 读取文件内容，用于 diff 上下文和提交信息生成 |
| `Bash(find:*)` | 在仓库中查找文件和目录 |
| `Bash(grep:*)` | 搜索文件内容中的模式，用于代码审查 |
| `Bash(mkdir:*)` | git 操作需要时创建目录 |
| `Bash(cp:*)` | 分支或合并操作时复制文件 |
| `Bash(wc:*)` | 统计行数/字数，用于变更摘要 |
| `Read` | Claude 内置文件读取工具 |
| `Write` | Claude 内置文件写入工具 |
| `Edit` | Claude 内置文件编辑工具 |
| `Grep` | Claude 内置内容搜索工具 |
| `Glob` | Claude 内置文件模式匹配工具 |

## Skill 文件格式

使用自定义 skill 文件（`.md`）替代内置 slash 命令时，扩展通过 `$ARGUMENTS=<value>` 将用户输入传递给 Claude。Skill 必须正确处理该输入并产出特定格式的输出，否则会影响使用体验。

### 参数格式

| 命令 | `$ARGUMENTS` 值 | 说明 |
|------|-----------------|------|
| **git-push** | _（无）_ | 无参数，提示词为固定指令 |
| **create-pr** | `<branch>` | 用户输入的目标分支。支持两种格式：单分支（`main`）或空格分隔的源和目标分支（`dev main`）。Skill 应在两个值时解析为 `{branchFrom} {branchTo}`，单个值时作为目标分支 |
| **review-pr** | `<pr-url>` | 完整的 GitHub PR URL（如 `https://github.com/owner/repo/pull/123`） |

Create PR 的分支输入来自分支选择器 UI，用户可以输入新分支或从历史记录中选择。原始文本直接作为 `$ARGUMENTS` 传递。

### 必需输出：Git URL

扩展从 Claude 输出中提取 URL，用于可点击的通知跳转（通过 `terminal-notifier`）和应用内链接操作。如果 skill 未输出预期的 URL，通知仍会触发但无法点击跳转。

| 命令 | 输出中需包含的 URL | 示例 |
|------|-------------------|------|
| **git-push** | Commit URL | `https://github.com/owner/repo/commit/abc1234` |
| **create-pr** | Pull Request URL | `https://github.com/owner/repo/pull/42` |
| **review-pr** | Pull Request URL | `https://github.com/owner/repo/pull/42` |

支持的托管平台：GitHub、GitLab、Bitbucket。SSH 远程地址（`git@github.com:...`）会自动转换为 HTTPS。

### 示例：create-pr skill

```markdown
创建 Pull Request。

解析 `$ARGUMENTS` 作为分支输入：
- 如果是空格分隔的两个值（如 `dev main`）：第一个为源分支，第二个为目标分支
- 如果是单个值（如 `main`）：以当前分支为源，该值为目标分支

步骤：
1. 暂存并提交未提交的更改
2. 推送源分支到远程
3. 使用 `gh pr create` 从源分支向目标分支创建 PR
4. 输出 PR URL（如 https://github.com/owner/repo/pull/123）
```

## 命令

| 命令 | 说明 |
|------|------|
| **Git Push** | 通过 Claude 暂存、提交并推送更改 |
| **Create PR** | 创建 Pull Request，AI 自动生成描述，支持分支选择 |
| **Review PR** | 使用 Claude 审查 PR，可直接在 Raycast 中合并/关闭 |
| **View Tasks** | 实时监控运行中和已完成的任务 |
| **Manage Folders & Skills** | 配置仓库扫描目录，为每个命令绑定 skill 文件 |
| **Manage Model** | 切换 Claude 模型（Haiku / Sonnet / Opus） |

## 开发

```bash
npm install
npm run build       # ray build
npm run dev         # ray develop（监听模式）
npm run lint        # ray lint
npm run fix-lint    # ray lint --fix
```

## 许可证

MIT
