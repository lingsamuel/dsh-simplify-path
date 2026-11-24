import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import pkg from '../package.json' with { type: 'json' }

const root = fileURLToPath(new URL('..', import.meta.url))
const require = createRequire(import.meta.url)

// 与 DSH 自带的客户端插件一样，发布可由 ModuleLoader 实例化的工厂。
await build({
  absWorkingDir: root,
  entryPoints: ['src/client.js'],
  outfile: 'dist/client.js',
  bundle: true,
  platform: 'browser',
  format: 'cjs',
  external: pkg.dsh.client.external,
  banner: { js: `window.__ModuleLoader__.load({ id: ${JSON.stringify(pkg.name)}, factory: (require) => { const module = { exports: {} };` },
  footer: { js: 'return module.exports; } });' },
})

const bundled = ['@deepseek-ai/dsh-api-session-controller', '@deepseek-ai/dsh-util-workspace-path']
const notices = await Promise.all(bundled.map(async name => {
  const directory = dirname(require.resolve(`${name}/package.json`))
  return `${name}\n\n${await readFile(join(directory, 'LICENSE'), 'utf8')}`
}))
await writeFile(join(root, 'dist', 'THIRD-PARTY-LICENSES.txt'), notices.join('\n'))
