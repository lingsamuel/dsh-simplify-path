# DeepSeek Harness 路径简化实现计划

**目标** 交付可安装的 DSH Web 插件，在已确认的界面入口简化路径，并提供三个可持久化的开关。

**结构** `src/path.js` 复用 DSH 的路径工具，实现统一转换。`src/labels.js` 处理显示入口的 DOM 生命周期。`src/client.js` 读取 DSH Host、工作区和会话状态，注册配置与菜单。`src/host.js` 声明同步配置。

## 路径规则

- [x] 在 `test/path.test.js` 用实际输入输出覆盖三条优先级、目录边界、根路径、行号、Windows 分隔符和开关组合。运行 `node --test test/path.test.js`，确认当前缺少实现。
- [x] 在 `src/path.js` 使用 `relativizeToCwd`、`abbreviateHomePath`，实现 `formatPath(path, project, home, options)`。添加文本入口，复用相同的转换函数处理可识别的路径和定位后缀。

## DSH 接入

- [x] 在 `package.json`、`src/host.js` 和 `cordis.patch.yml` 声明 Web bundle、三个可同步的布尔值及插件元信息。由 `scripts/build.mjs` 生成 DSH ModuleLoader 工厂。
- [x] 在 `src/labels.js` 从已验证的 DSH 标记读取显示路径，跟踪改写前的文本。连接工作区、会话和浮层，按变动刷新路径标签。恢复文本时只写回插件仍拥有的显示值。
- [x] 在 `src/client.js` 使用 DSH 的会话和工作区快照选择路径根，订阅配置和 Host 主目录，注册设置页和路径复制菜单。菜单使用捕获的目标路径，导航回调由 DSH 处理。

## 验证与交付

- [x] 编写 `test/web.mjs`，用有本地模型回放的隔离 DSH 实例验证插件安装、消息、文件预览、复制、设置，以及 Workspace、Files、File changes 和 Worktree 路径显示。可用 `DSH_SIMPLIFY_PATH_DSH_BIN` 和 `DSH_SIMPLIFY_PATH_CHROMIUM` 指定可执行文件。
- [x] 添加 `manual/使用手册.md`，使用 `npm test`、`npm run package:plugin` 和 `npm run test:web` 验证并生成可安装包，确认发行包内容。
- [x] 复核设计、文档和实现一起提交为 `feat: path display: 添加 DeepSeek Harness 路径简化插件`。
