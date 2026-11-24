import { sessionDirectory } from '@deepseek-ai/dsh-api-session-controller/client/directories'
import { resolveWorkspacePath } from '@deepseek-ai/dsh-util-workspace-path'
import { observePathLabels } from './labels.js'
import { formatPath } from './path.js'
import { defaults } from './preferences.js'
import { Preferences, dictionaries } from './settings.js'

const name = 'dsh-simplify-path'
const fields = Object.keys(defaults)

export const inject = ['sessions', 'workspaces', 'slots', 'remote', 'locale']

/** 接入宿主会话上下文。显示和复制共享路径规则，各自读取所属的会话。 */
export function apply(ctx, config) {
  const getOptions = () => Object.fromEntries(fields.map(field => [field, config?.[field]?.get() ?? defaults[field]]))
  const getHome = () => ctx.remote.$host?.home
  const directoryOf = id => id === undefined ? undefined : sessionDirectory(ctx.sessions, id)
  const projectOf = id => id === undefined ? undefined
    : ctx.workspaces.list.getSnapshot().items.find(workspace => workspace.sessionIds.includes(id))?.path
      ?? ctx.sessions.list.getSnapshot().byId[id]?.cwd

  ctx.effect(() => ctx.locale.register(name, dictionaries), 'simplify-path: locale')
  ctx.effect(() => {
    const labels = observePathLabels(document, projectOf, directoryOf, getHome, getOptions)
    const subscriptions = [
      ctx.sessions.list.subscribe(labels.refresh),
      ctx.workspaces.list.subscribe(labels.refresh),
      ctx.on('connection/reset', labels.refresh),
      ...fields.map(field => config?.[field]?.subscribe(labels.refresh)),
    ]
    return () => {
      for (const dispose of subscriptions) dispose?.()
      labels.dispose()
    }
  }, 'simplify-path: display')

  ctx.inject(['contextMenus'], child => {
    const t = child.locale.bind(name)
    for (const target of ['file', 'directory', 'workspace']) {
      child.effect(() => child.contextMenus.register({
        id: `${name}.${target}`,
        target,
        order: 110,
        resolve({ sessionId, path }) {
          if (!getOptions().copySimplifiedPath) return []
          return [{
            id: 'copySimplifiedPath', label: t('copy'), failureLabel: t('copyFailed'),
            async run() {
              const resolved = resolveWorkspacePath(directoryOf(sessionId), path)
              const options = { ...getOptions(), preserveProjectRoot: target === 'directory' }
              await navigator.clipboard.writeText(formatPath(resolved, projectOf(sessionId), getHome(), options))
              child.contextMenus.notify(t('copied'), true)
            },
          }]
        },
        observe: () => config?.copySimplifiedPath ? [config.copySimplifiedPath] : [],
      }), 'simplify-path: path clipboard menu')
    }
  })

  ctx.inject(['configForms'], child => {
    const form = child.configForms.get(name)
    child.slots.inject('plugins.bundle.config', () => child.slots.register({
      name: 'plugins.bundle.config', key: name, locale: name,
      inject: () => ({
        hooks: { preferences: form },
        setPreference: (field, value) => form.set(field, value),
      }),
    }, Preferences))
  })
}
