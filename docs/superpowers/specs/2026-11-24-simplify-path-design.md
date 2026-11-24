# DeepSeek Harness 路径简化设计

`dsh-simplify-path` 是一个 DSH Web 插件。聊天、Workspace、File changes、Files 和 Worktree 使用同一套路径显示规则。首个验证环境为本机的 DSH 0.2.3-alpha.2。

## 显示规则

按顺序匹配完整的目录段。

| 条件 | 示例 | 默认显示 |
| --- | --- | --- |
| 位于当前项目内 | `/home/me/project/src/app.ts:42` | `./src/app.ts:42` |
| 等于当前项目根目录 | `/home/me/project` | `.` |
| 环境或 Files 中的项目根目录 | `/home/me/project` | `~/project` |
| 位于 DSH Host 的 `$HOME` 内 | `/home/me/.config/example.json` | `~/.config/example.json` |
| 等于 DSH Host 的 `$HOME` | `/home/me` | `~` |
| 位于 WSL 盘符挂载目录内 | `/mnt/c/Users/me/report.txt` | `C:/Users/me/report.txt` |
| 等于 WSL 盘符挂载根目录 | `/mnt/c` | `C:/` |

项目内路径优先。例如项目位于 `/mnt/c/Projects/my-app` 时，该项目的 `src/app.ts` 显示为 `./src/app.ts`。环境和 Files 的目录标签在目标等于工作区根目录时继续匹配主目录和盘符规则，以便标识实际位置。`/mnt/cache` 和 `/home/me-other` 按各自的实际目录边界处理。显示路径保留文件名、空格和行号定位。项目相对路径的目录分隔符统一使用 `/`，已有的 `./` 或 `../` 前缀保留。

会话内使用该会话所属的 Workspace 根目录，缺少 Workspace 时使用会话创建目录。独立的 Worktree 检出视图使用该视图的检出根目录。Workspace 选择器和左侧列表中的工作区位置用于识别目录，显示其 `~`、盘符或绝对路径写法。工作区名称、树节点文件名和标签自定义名称沿用 DSH 提供的名称。

## 文件打开与行号定位

DSH 的文件预览使用会话解析出的资源地址，行号作为独立的导航参数。插件简化点击入口、预览标题和定位提示里可见的路径，并保留文本上已有的行号或范围。例如链接显示为 `./src/app.ts:42`，激活时由 DSH 打开实际文件并定位到第 42 行。工具执行、原生打开、拖拽和工作区操作使用 DSH 提供的文件目标。 [聊天中的文件与行号定位](https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/client/ui-chat#reference-previews) · [右侧栏资源与导航](https://deepseek-harness.github.io/deepseek-harness/reference/subsystems/sidebar-right)

## 插件选项

在 DSH 插件详情页提供三个独立保存的开关，使用 DSH 的配置持久化和 Host 到 Client 的配置同步。 [配置与客户端模块](https://deepseek-harness.github.io/deepseek-harness/reference/subsystems/client-modules) · [插件详情配置扩展点](https://deepseek-harness.github.io/deepseek-harness/reference/subsystems/slots)

- **转换 WSL 盘符路径**，默认开启。关闭后，项目相对路径和 `~` 规则照常匹配，其余 `/mnt/c/...` 路径显示为原来的挂载目录形式。
- **Windows 盘符使用反斜杠**，默认关闭。盘符路径默认显示为 `C:/Users/me/report.txt`，开启后显示为 `C:\Users\me\report.txt`。这个选项适用于原生盘符路径和由 WSL 挂载路径转换得出的盘符路径。
- **允许复制简化路径**，默认开启。在 DSH 的文件、目录和 Workspace 上下文菜单中提供「复制简化路径」。以菜单所属的会话或工作区为准，使用与界面相同的规则生成剪贴板文本。路径菜单复制文件或目录地址，例如可见链接 `./src/app.ts:42` 对应的简化路径为 `./src/app.ts`。工作区根目录的目录菜单复制带 `~` 或盘符的目录位置。需要绝对路径时可使用 DSH 原有的复制命令。关闭开关后，菜单移除「复制简化路径」。 [官方路径复制行为](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-open-in-app/README.md)

保存设置后，当前界面已有的路径标签随之刷新。关闭并重新启用 WSL 转换时，沿用已保存的分隔符选项。

## 覆盖范围

| 界面 | 路径显示入口 |
| --- | --- |
| 聊天与工具卡片 | 路径形式的 Markdown 链接文字、行内路径、可明确识别的正文裸路径、工具卡片与交付项的路径标签。描述性链接文字沿用作者用词。 |
| Workspace | 工作区列表及选择器中的目录位置、会话项目目录标签和相关提示。 |
| File changes | 变更卡片的文件路径、悬浮预览标题、审阅面板的路径列表和 diff 标题。多文件卡片使用历史轮次记录的实际路径。 |
| Files | 文件树根目录、搜索结果的上级路径、文件预览路径及相关提示。 |
| Worktree | 官方 Change requests & worktrees 插件可见的检出目录、工作树路径提示和变更文件路径。 |

代码块、终端输出、搜索输入和文件正文按原始内容呈现。Worktree 变更文件菜单原本复制仓库相对路径，与该视图的简化结果一致。

## 接入与验证

路径转换集中在一个格式化函数，复用 DSH 的工作区相对路径和主目录简化工具。Web 客户端从 DSH 获取各会话的 Workspace 及 Host 主目录信息，用同一个格式化器处理已识别的路径标签和简化路径复制命令。PathLabel 和其他已确认的界面标记用于定位显示文本，复制命令通过 DSH 上下文菜单注册并从菜单目标读取路径。每个挂载的会话使用其自己的工作区上下文，懒加载、流式消息、悬浮预览和配置变化都重新计算相关标签。插件停用时释放订阅并恢复其处理过的显示文本。

交付内容包括可本地安装的插件包和使用说明。验证包括目录边界、规则优先级、路径内空格和带行号链接。在隔离的 DSH Web profile 中使用实际浏览器检查五类界面、三个开关和多会话切换。验证缩短后的链接打开正确文件及行号，复制命令写入预期路径，关闭复制开关后菜单更新。Worktree 使用本地 Git 检出验证，复用 DSH 的原生入口。 [右侧 Files 与预览](https://deepseek-harness.github.io/deepseek-harness/reference/subsystems/sidebar-right) · [官方 Worktree 插件](https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/experimental/forge-bundle)
