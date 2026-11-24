import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { homedir } from 'node:os'
import { delimiter, dirname, join, relative, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { setTimeout } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { chromium } from 'playwright-core'
import pkg from '../package.json' with { type: 'json' }
import { startCodexFixture, verifyCodexTurnChanges } from './codex-fixture.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const runtime = join(root, '.runtime')
const command = promisify(execFile)
const dsh = process.env.DSH_SIMPLIFY_PATH_DSH_BIN ?? 'dsh'
const chromiumPath = process.env.DSH_SIMPLIFY_PATH_CHROMIUM
const codexPack = process.env.DSH_SIMPLIFY_PATH_CODEX_PACK
const pack = resolve(process.argv[2] ?? join(root, 'artifacts', `${pkg.name}-${pkg.version}.tgz`))
await mkdir(runtime, { recursive: true })
const home = await mkdtemp(join(runtime, 'web-'))
const alpha = join(home, 'alpha')
const beta = join(home, 'beta')
const betaWorkspace = join(beta, 'nested')
const textFile = join(alpha, 'lines.txt')
const changedFile = join(alpha, 'changes.txt')
const secondChangedFile = join(alpha, 'nested', 'name with spaces.txt')
const wslPath = '/mnt/c/Fixture Drive/report.txt'
const plainWslPath = '/mnt/d/report.txt'
const logs = []
const git = (...args) => command('git', args, { cwd: alpha, env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' } })

async function seedWorkspaces() {
  await mkdir(alpha)
  await writeFile(textFile, Array.from({ length: 70 }, (_, index) => `Fixture line ${index + 1}`).join('\n') + '\n')
  await writeFile(changedFile, 'Before the change\n')
  await mkdir(join(alpha, 'nested'))
  await writeFile(join(alpha, 'nested', 'linked.txt'), 'Before the worktree change\n')
  await writeFile(secondChangedFile, 'Before the second change\n')
  await git('init', '--initial-branch=main')
  await git('add', 'lines.txt', 'changes.txt', 'nested/linked.txt', 'nested/name with spaces.txt')
  await git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'Fixture')
  // Forge 的本地分支审阅从默认分支的合并基点计算差异。只用本机引用，无需 fetch。
  await git('remote', 'add', 'origin', alpha)
  await git('update-ref', 'refs/remotes/origin/main', 'HEAD')
  await git('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main')
  await git('worktree', 'add', '-b', 'beta', beta)
  await writeFile(join(betaWorkspace, 'linked.txt'), 'After the worktree change\n')
  const now = new Date().toISOString()
  const workspaces = Object.fromEntries([
    ['Alpha', alpha], ['Beta', betaWorkspace], ['Windows paths', '/mnt/c/Fixture Drive'],
  ].map(([title, path]) => [randomUUID(), { path, title, sessionIds: [], createdAt: now, updatedAt: now }]))
  const workspaceIds = Object.keys(workspaces)
  await mkdir(join(home, 'storages'))
  await writeFile(join(home, 'storages', 'workspace.json'), JSON.stringify({
    unit: { name: 'workspace', version: 2 },
    global: { initialized: true, workspaceIds, archivedSessionIds: [], pinnedSessionIds: [], defaultWorkspaceId: workspaceIds[0] },
    tables: { workspaces },
  }))
}

/** 在隔离的 Web profile 中用同一个本地模型夹具生成真实的 DSH 工具调用及聊天消息。 */
async function startModel() {
  const server = createServer(async (request, response) => {
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const payload = JSON.parse(Buffer.concat(chunks).toString() || '{}')
    const toolTurn = payload.messages?.some(message => JSON.stringify(message.content).includes('Write a fixture change'))
      && !payload.messages?.some(message => message.content?.some?.(block => block.type === 'tool_result'))
      && payload.tools?.some(tool => tool.name === 'write')
    const text = [
      `Navigate to [${textFile}:42](${textFile}#L42).`,
      `Inline path \`${wslPath}\`.`,
      `Bare path ${plainWslPath}.`,
      `Read [the fixture](${textFile}).`,
      `\`\`\`text\n${wslPath}\n\`\`\``,
      'Fixture response complete.',
    ].join('\n\n')
    const blocks = toolTurn ? [changedFile, secondChangedFile].map((file, index) => ({
      block: { type: 'tool_use', id: `toolu_fixture_write_${index}`, name: 'write', input: {} },
      delta: { type: 'input_json_delta', partial_json: JSON.stringify({ file_path: file, content: 'After the change\n' }) },
    })) : [{ block: { type: 'text', text: '' }, delta: { type: 'text_delta', text } }]
    const message = { id: `msg_${randomUUID().replaceAll('-', '')}`, model: 'deepseek-v4-flash', usage: { input_tokens: 24, output_tokens: 0 } }
    if (!payload.stream) {
      response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({
        ...message, type: 'message', role: 'assistant', content: [{ type: 'text', text: 'Fixture title' }], stop_reason: 'end_turn',
      }))
      return
    }
    const events = [
      { type: 'message_start', message },
      ...blocks.flatMap(({ block, delta }, index) => [
        { type: 'content_block_start', index, content_block: block },
        { type: 'content_block_delta', index, delta },
        { type: 'content_block_stop', index },
      ]),
      { type: 'message_delta', delta: { stop_reason: toolTurn ? 'tool_use' : 'end_turn' }, usage: { output_tokens: 150 } },
      { type: 'message_stop' },
    ]
    response.writeHead(200, { 'content-type': 'text/event-stream' })
    response.end(events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''))
  }).listen(0, '127.0.0.1')
  await once(server, 'listening')
  return server
}

function startWeb(environment) {
  const host = spawn(dsh, ['web', '--no-open', '--port', '0'], { cwd: root, env: environment, stdio: ['ignore', 'pipe', 'pipe'] })
  const url = new Promise((accept, reject) => {
    createInterface({ input: host.stdout }).on('line', line => {
      if (line.startsWith('dsh web: ')) accept(line.slice('dsh web: '.length))
      else logs.push(line)
    })
    createInterface({ input: host.stderr }).on('line', line => logs.push(line))
    host.once('error', reject)
    host.once('exit', code => reject(new Error(`DSH 启动失败（${code}）`)))
  })
  return { host, url: Promise.race([url, setTimeout(25_000, undefined, { ref: false }).then(() => { throw new Error('DSH 启动超时') })]) }
}

let model
let codex
let host
let browser
let page
try {
  await seedWorkspaces()
  await mkdir(join(home, 'tmp'))
  process.env.TMPDIR = join(home, 'tmp')
  model = await startModel()
  if (codexPack) codex = await startCodexFixture(home, alpha)
  const environment = {
    ...process.env,
    PATH: `${dirname(dsh)}${delimiter}${process.env.PATH}`,
    DSH_HOME: home,
    TMPDIR: join(home, 'tmp'),
    npm_config_cache: join(runtime, 'npm-cache'),
    DEEPSEEK_API_KEY: 'simplify-path-fixture',
    DEEPSEEK_BASE_URL: `http://127.0.0.1:${model.address().port}`,
    ...(codex && { DSH_CODEX_SOCKET: codex.socketPath }),
  }
  const packages = codex ? [pack, resolve(codexPack)] : [pack]
  const installed = await command(dsh, ['plugin', '--profile', 'web', 'add', ...packages, '--store-dir', join(runtime, 'pnpm-store')], {
    cwd: root, env: environment, timeout: 180_000,
  })
  logs.push(installed.stdout, installed.stderr)
  const running = startWeb(environment)
  host = running.host
  const url = await running.url

  browser = await chromium.launch({ executablePath: chromiumPath, headless: true, env: { ...process.env, TMPDIR: join(home, 'tmp') } })
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: 'en-US', permissions: ['clipboard-read', 'clipboard-write'] })
  page = await context.newPage()
  page.setDefaultTimeout(14_000)
  const pageErrors = []
  page.on('pageerror', error => pageErrors.push(error.message))
  page.on('console', message => {
    if (message.type() === 'error' || message.type() === 'warning') logs.push(message.text())
  })
  const origin = new URL(url).origin
  await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort())
  await page.goto(url)
  const welcome = page.getByRole('button', { name: 'Continue', exact: true })
  await welcome.click()
  if (codex) {
    const native = new URL(page.url())
    native.searchParams.set('mode', 'dsh')
    const codexUrl = new URL(native)
    codexUrl.searchParams.set('mode', 'codex')
    await page.goto(codexUrl.href)
    await verifyCodexTurnChanges(page, codex.literalCode)
    await page.goto(native.href)
    console.log('通过 dsh-codex 的历史文件变更列表、差异标题、展开更多文件和工作树选择器。')
  }
  const tree = page.getByRole('tree')
  const alphaRow = tree.getByText('Alpha', { exact: true })
  await tree.getByText('Windows paths', { exact: true }).hover()
  await page.getByText('C:/Fixture Drive', { exact: true }).waitFor()
  await alphaRow.hover()
  await page.getByRole('button', { name: 'New session in Alpha', exact: true }).click()
  const chat = page.locator('[data-chat-flow]:visible')
  const draft = page.locator('[data-slot="main"] [contenteditable="true"]:visible')
  const send = page.getByRole('button', { name: 'Send message', exact: true })
  await draft.fill('Show the path fixtures')
  await send.click()
  await chat.getByText('Fixture response complete.', { exact: true }).waitFor()
  await chat.getByText('C:/Fixture Drive/report.txt', { exact: true }).waitFor()
  await chat.getByText('Bare path D:/report.txt.', { exact: true }).waitFor()
  await chat.locator('pre').getByText(wslPath, { exact: true }).waitFor()
  await chat.getByText('the fixture', { exact: true }).waitFor()
  const workspaceLocation = `~/${relative(homedir(), alpha)}`
  await page.getByRole('button', { name: 'Open right sidebar', exact: true }).click()
  await page.getByRole('button', { name: /Workspace files/ }).click()
  const filesRoot = page.locator(`[data-files-page] [data-path-label][title="${workspaceLocation}"]:visible`)
  await filesRoot.waitFor()
  assert.equal(await filesRoot.textContent(), workspaceLocation)
  await filesRoot.click({ button: 'right' })
  await page.getByText('Copy simplified path', { exact: true }).click()
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), workspaceLocation)

  const link = chat.getByRole('button', { name: './lines.txt:42', exact: true })
  await link.click()
  const filePath = page.locator('[data-textpreview-path][title="./lines.txt"]:visible')
  await filePath.waitFor()
  assert.equal(await filePath.textContent(), './lines.txt')
  await page.locator('[data-textpreview-target="42"]').waitFor()
  await link.click({ button: 'right' })
  await page.getByText('Copy simplified path', { exact: true }).click()
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), './lines.txt')
  await link.click({ button: 'right' })
  await page.getByText('Copy file path', { exact: true }).click()
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), textFile)
  const treeFile = page.locator('[data-files-body]:visible').getByText('changes.txt', { exact: true })
  if ((await treeFile.count()) === 0) await page.locator('[data-files-navigator-toggle]:visible').click()
  await treeFile.first().waitFor()
  console.log('通过 Workspace、聊天路径、行号跳转、Files 和两种复制方式。')

  const plugins = page.getByRole('button', { name: 'Plugins', exact: true })
  const openSettings = async () => {
    await plugins.click()
    await page.locator('[data-plugin-package="dsh-simplify-path"]').getByText('Simplify paths', { exact: true }).click()
  }
  await openSettings()
  const convertWsl = page.getByRole('switch', { name: 'Convert WSL drive paths', exact: true })
  const backslashes = page.getByRole('switch', { name: 'Use backslashes in Windows drive paths', exact: true })
  const copySimplified = page.getByRole('switch', { name: 'Allow copying simplified paths', exact: true })
  const nativeSwitch = page.getByRole('switch', { name: 'Enable Simplify paths', exact: true })
  const switchAppearance = element => {
    const { width, height, borderRadius, backgroundColor } = getComputedStyle(element)
    return { width, height, borderRadius, backgroundColor }
  }
  assert.deepEqual(await convertWsl.evaluate(switchAppearance), await nativeSwitch.evaluate(switchAppearance))
  assert.deepEqual(await copySimplified.evaluate(switchAppearance), await nativeSwitch.evaluate(switchAppearance))
  assert.equal(await convertWsl.isChecked(), true)
  assert.equal(await backslashes.isChecked(), false)
  assert.equal(await copySimplified.isChecked(), true)
  await page.getByText('Use backslashes in Windows drive paths', { exact: true }).click()
  await page.getByRole('switch', { name: 'Use backslashes in Windows drive paths', checked: true, exact: true }).waitFor()
  await copySimplified.click()
  await page.getByRole('switch', { name: 'Allow copying simplified paths', checked: false, exact: true }).waitFor()
  const alphaSession = tree.locator('[data-row-key^="session:"]').first()
  await alphaSession.click()
  await chat.getByText('C:\\Fixture Drive\\report.txt', { exact: true }).waitFor()
  await link.click({ button: 'right' })
  await page.getByText('Copy file path', { exact: true }).waitFor()
  assert.equal(await page.getByText('Copy simplified path', { exact: true }).count(), 0)
  await page.keyboard.press('Escape')
  await openSettings()
  await convertWsl.click()
  await page.getByRole('switch', { name: 'Convert WSL drive paths', checked: false, exact: true }).waitFor()
  await alphaSession.click()
  await chat.getByText('Bare path /mnt/d/report.txt.', { exact: true }).waitFor()
  console.log('通过三个插件配置开关及实时更新。')

  await draft.fill('Write a fixture change')
  await send.click()
  await chat.getByText('Fixture response complete.', { exact: true }).nth(1).waitFor()
  const changes = page.locator('[data-changed-files]:visible')
  await changes.waitFor()
  await changes.getByText('Edited 2 files', { exact: true }).waitFor()
  await changes.getByText('./changes.txt', { exact: true }).waitFor()
  await changes.getByText('./nested/name with spaces.txt', { exact: true }).waitFor()
  const reviewChanges = changes.getByRole('button', { name: /\.\/changes\.txt/ }).first()
  await reviewChanges.hover()
  await page.locator('[data-changes-preview-path]').getByText('./changes.txt', { exact: true }).waitFor()
  await reviewChanges.click()
  const review = page.locator('[data-changes-review]:visible')
  await review.locator('[data-path-label][title="./changes.txt"]').waitFor()
  await review.locator('[data-review-file]').click()
  await page.getByRole('menu').getByText('./nested/name with spaces.txt', { exact: true }).click()
  await review.locator('[data-path-label][title="./nested/name with spaces.txt"]').waitFor()
  console.log('通过 File changes 卡片、悬浮预览及审阅面板。')

  await plugins.click()
  const forge = page.getByRole('switch', { name: 'Enable Change requests & worktrees', exact: true })
  if ((await forge.getAttribute('aria-checked')) !== 'true') await forge.click()
  await page.waitForFunction(() => [...document.querySelectorAll('[role="switch"]')]
    .some(node => node.getAttribute('aria-label') === 'Enable Change requests & worktrees' && node.getAttribute('aria-checked') === 'true'))
  await tree.getByText('Beta', { exact: true }).hover()
  await page.getByRole('button', { name: 'New session in Beta', exact: true }).click()
  await draft.fill('Show the path fixtures in the linked worktree')
  await send.click()
  await chat.getByRole('button', { name: `~/${relative(homedir(), textFile)}:42`, exact: true }).waitFor()
  const panel = page.locator('[data-session-panel-toggle]:visible')
  if ((await panel.getAttribute('aria-expanded')) !== 'true') await panel.click()
  await page.locator('[data-session-panel]:visible').waitFor()
  const checkout = page.locator('[data-forge-checkout]:not([data-failed]):visible')
  await page.locator('[data-session-panel-project]:visible').getByText('nested', { exact: true }).hover()
  await page.getByRole('tooltip').filter({ hasText: `~/${relative(homedir(), betaWorkspace)}` }).waitFor()
  await checkout.getByText('beta', { exact: true }).hover()
  await page.getByRole('tooltip').getByText(`Worktree: ~/${relative(homedir(), beta)}`, { exact: true }).waitFor()
  await page.locator('[data-forge-local]:visible button[data-row-part="body"]').click()
  const forgeFile = page.locator('[data-forge-diff-file="nested/linked.txt"] [data-forge-file-label]')
  await forgeFile.hover()
  await page.getByRole('tooltip').getByText('nested/linked.txt', { exact: true }).waitFor()
  console.log('通过真实 Git Worktree 的路径标签和双会话上下文。')

  await page.reload()
  await alphaSession.click()
  await changes.getByText('./changes.txt', { exact: true }).waitFor()
  await changes.getByText('./nested/name with spaces.txt', { exact: true }).waitFor()
  await openSettings()
  await page.getByRole('switch', { name: 'Convert WSL drive paths', checked: false, exact: true }).waitFor()
  assert.equal(await backslashes.isChecked(), true)
  assert.equal(await copySimplified.isChecked(), false)
  await nativeSwitch.click()
  await page.getByRole('switch', { name: 'Enable Simplify paths', checked: false, exact: true }).waitFor()
  await alphaSession.click()
  await chat.getByRole('button', { name: `${textFile}:42`, exact: true }).nth(1).waitFor()
  console.log('通过配置持久化和停用后的原始路径恢复。')
  assert.deepEqual(pageErrors, [])
} catch (error) {
  if (process.env.DSH_SIMPLIFY_PATH_DEBUG) {
    if (page) {
      console.error((await page.locator('body').innerText()).slice(0, 3600))
      console.error(await page.evaluate(() => ({
        paths: [...document.querySelectorAll('[class*="hoverPath"]')].map(node => node.outerHTML),
        pluginEntries: window.__DSH_BOOT__?.entries?.filter(row => JSON.stringify(row).includes('simplify-path')),
      })))
    }
    console.error(logs.slice(-30).join('\n'))
  }
  throw error
} finally {
  await browser?.close()
  if (host && host.exitCode === null && host.signalCode === null) {
    const exited = once(host, 'close')
    host.kill()
    await exited
  }
  model?.close()
  await codex?.close()
  await rm(home, { recursive: true, force: true })
}
