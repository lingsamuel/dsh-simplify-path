# 构建与发布

在项目根目录运行 `npm ci`、`npm test` 和 `npm run package:plugin`，可安装的 `.tgz` 会出现在 `artifacts/`。

GitHub Actions 在每次推送时运行同样的命令。分支推送上传 Nightly 包。推送与 `package.json` 版本匹配的 `v<版本>` 标签时，工作流把同一个包发布到 npm 和 GitHub Release。

npm 首次发布使用仓库的 `NPM_TOKEN` secret，令牌需有发布权限并允许绕过发布时的 2FA。包创建后，可在 npm 为 `build.yml` 配置 Trusted Publishing，允许直接发布，再移除令牌。npm 发布命令禁用了 provenance，因为包清单未指定 GitHub 仓库地址。 [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/)
