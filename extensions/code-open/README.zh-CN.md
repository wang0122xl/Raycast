[English](README.md) | [中文](README.zh-CN.md)

# Code Open

在 Raycast 中快速用 Zed 打开已保存的项目目录。

## 命令

### Code Open

- 展示所有已保存项目目录。
- 使用 Raycast 列表搜索做模糊过滤。
- 没有已保存目录时，空列表提示按 `Cmd+N` 选择目录。
- 按 `Enter` 用 Zed 打开选中的项目，并聚焦 Zed Project Panel（目录面板）。
- 按 `Cmd+Enter` 用 Zed 打开选中的项目，并聚焦 Zed Git Panel。
- 如果对应项目已经在 Zed 中打开，会优先定位到已有 Zed 窗口，而不是新开窗口。
- 在列表中按 `Cmd+N` 直接选择并添加一个或多个目录或 `.APP` bundle。
- 新添加的目录会移动到列表顶部。打开目录后，该目录会移动到列表顶部。
- 项目打开后，Raycast 面板会关闭并退回首页搜索。
- 在某个已保存目录上按 `Cmd+X`，确认后移除。

## Zed 集成

扩展会优先使用 `/usr/local/bin/zed` 中已安装的 Zed CLI，其次回退到 `/Applications/Zed.app/Contents/MacOS/cli`，最后回退到 `PATH` 中的 `zed`。打开或切换项目通过 `zed <project-folder>` 完成。

图标：Tabler Icons `folder-bolt`（MIT）。
