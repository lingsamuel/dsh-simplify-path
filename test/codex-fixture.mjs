import { once } from 'node:events'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { WebSocketServer } from 'ws'

const sessionName = 'Codex change fixture'
const worktreeSessionName = 'Codex worktree fixture'
const wslProject = '/mnt/c/Other Project'
const wslFile = `${wslProject}/second.txt`
const localFile = 'test/name with spaces.mjs'
const lastFile = 'src/hidden-until-expanded.js'

/** 通过本地 RPC 回放一个已完成的 Codex 轮次，Web 端由实际的 dsh-codex 插件渲染。 */
export async function startCodexFixture(home, workspace) {
  const socketPath = join(home, 'codex.sock')
  const now = Math.floor(Date.now() / 1000)
  const thread = {
    id: 'codex-path-fixture', name: sessionName, cwd: workspace, source: 'cli', status: { type: 'notLoaded' },
    historyMode: 'rollout', createdAt: now, updatedAt: now, preview: 'Check file changes',
  }
  const worktreeThread = { ...thread, id: 'codex-worktree-fixture', name: worktreeSessionName, cwd: wslProject }
  const literalCode = join(workspace, 'literal-in-patch.txt')
  const turn = { id: 'fixture-turn', status: 'completed', items: [
    { id: 'fixture-input', type: 'userMessage', content: [{ type: 'text', text: 'Check file changes' }] },
    { id: 'fixture-files', type: 'fileChange', status: 'completed', changes: [
      { path: join(workspace, localFile), kind: { type: 'add' }, diff: `${literalCode}\n` },
      { path: wslFile, kind: { type: 'update' }, diff: 'Opaque patch fixture' },
      ...['src/third.js', 'src/fourth.js', lastFile].map(file => ({
        path: join(workspace, file), kind: { type: 'add' }, diff: 'New content\n',
      })),
    ] },
    { id: 'fixture-response', type: 'agentMessage', text: 'Codex changes complete.' },
  ] }
  const emptyPage = { data: [], nextCursor: null }
  const methods = {
    initialize: () => ({ userAgent: 'Codex fixture', codexHome: home }),
    'project/list': () => emptyPage,
    'thread/list': params => params?.archived || params?.parentThreadId ? emptyPage : { ...emptyPage, data: [thread, worktreeThread] },
    'thread/loaded/list': () => emptyPage,
    'thread/read': params => {
      const selected = params?.threadId === worktreeThread.id ? worktreeThread : thread
      return { thread: params?.includeTurns ? { ...selected, turns: [turn] } : selected }
    },
    'thread/turns/list': () => ({ ...emptyPage, data: [turn] }),
    'thread/queue/list': () => emptyPage,
    'model/list': () => emptyPage,
  }
  const server = createServer()
  const socket = new WebSocketServer({ server })
  socket.on('connection', client => client.on('message', bytes => {
    const { id, method, params } = JSON.parse(bytes.toString())
    if (id === undefined) return
    const result = methods[method]?.(params)
    client.send(JSON.stringify({ id, ...(result === undefined ? { error: { code: -32601, message: 'Method not found' } } : { result }) }))
  }))
  server.listen(socketPath)
  await once(server, 'listening')
  return {
    socketPath, literalCode,
    async close() {
      for (const client of socket.clients) client.terminate()
      socket.close()
      await new Promise(resolve => server.close(resolve))
    },
  }
}

export async function verifyCodexTurnChanges(page, literalCode) {
  await page.getByRole('tree').getByText(sessionName, { exact: true }).click()
  const tail = page.locator('[data-slot="conversation.chat.turnTail"]')
  await tail.getByRole('button', { name: '5 files changed', exact: true }).click()
  const local = tail.getByRole('button', { name: `./${localFile}`, exact: true })
  await local.click()
  await tail.locator('[data-diff]').getByText(`./${localFile}`, { exact: true }).waitFor()
  await tail.locator('[data-diff]').getByText(literalCode, { exact: true }).waitFor()
  await tail.getByRole('button', { name: 'C:/Other Project/second.txt', exact: true }).click()
  await tail.locator('figcaption').getByText('C:/Other Project/second.txt', { exact: true }).waitFor()
  await tail.getByRole('button', { name: 'Show all 5 files', exact: true }).click()
  await tail.getByRole('button', { name: `./${lastFile}`, exact: true }).waitFor()

  // 使用 Codex 的实际工作树选择器，工作树目录数据来自隔离的夹具。
  await page.route(url => url.pathname === '/api/codex/worktrees' && url.searchParams.get('cwd') === wslProject,
    route => route.fulfill({ json: {
      local: { path: wslProject, branchLabel: 'main' }, branches: [],
      worktrees: [{ path: `${wslProject}/trees/review`, branchLabel: 'review' }, { path: '/mnt/d/Other checkout', branchLabel: 'other' }],
    } }))
  const tree = page.getByRole('tree')
  const worktreeSession = tree.getByText(worktreeSessionName, { exact: true })
  if (!(await worktreeSession.isVisible())) await tree.getByText('Other Project', { exact: true }).click()
  await worktreeSession.click()
  const picker = page.getByRole('button', { name: 'Working directory', exact: true })
    .and(page.locator('[title="C:/Other Project"]'))
  await picker.click()
  const menu = page.getByRole('menu')
  await menu.locator('[data-path-label][title="./trees/review"]').waitFor()
  await menu.locator('[data-path-label][title="D:/Other checkout"]').waitFor()
  await page.keyboard.press('Escape')
}
