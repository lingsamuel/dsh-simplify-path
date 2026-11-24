# dsh-simplify-path

简化 DeepSeek Harness Web 中的文件路径。规则按以下顺序匹配。

1. 项目内文件显示为 `./src/app.ts`。
2. 主目录下的路径显示为 `~/Projects/my-app`。
3. WSL 盘符路径默认显示为 `C:/Projects/my-app`。

支持聊天、工具卡片、Workspace、Files、文件变更和 Worktree，也支持 `dsh-codex` 的历史变更卡片与工作树选择器。

已在 DSH Web `0.2.3-alpha.2` 验证。

[安装、设置与使用](manual/安装指南.md)

Nightly 包可在 GitHub Actions 的运行记录中下载。
