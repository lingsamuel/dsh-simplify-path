import { abbreviateHomePath, relativizeToCwd, resolveWorkspacePath } from '@deepseek-ai/dsh-util-workspace-path'
import { defaults } from './preferences.js'

const drive = /^[a-z]:[/\\]/i
const networkShare = /^(?:\\\\|\/\/)[^/\\]+[/\\][^/\\]+(?:[/\\]|$)/
const wslDrive = /^\/mnt\/([a-zA-Z])(?:\/|$)/
const location = /(?::\d+(?::\d+|-\d+)?|#L\d+(?:-L\d+)?)$/i

function absolutePath(value) {
  if (typeof value !== 'string') return undefined
  const windows = drive.test(value) || networkShare.test(value)
  if (!windows && (!value.startsWith('/') || value.startsWith('//'))) return undefined
  return { windows, path: windows ? value.replaceAll('\\', '/') : value }
}

function inside(path, directory) {
  const root = absolutePath(directory)
  if (root === undefined || root.windows !== path.windows) return undefined
  const candidate = path.windows ? path.path.toLowerCase() : path.path
  const comparableRoot = root.windows ? root.path.toLowerCase() : root.path
  const base = comparableRoot.replace(/\/+$/, '')
  if (candidate.replace(/\/+$/, '') === base) return ''
  if (!candidate.startsWith(`${base}/`)) return undefined
  // 只改写前缀，保留相对路径的点段。路径经过符号链接时，折叠点段可能改变它指向的位置。
  const relative = relativizeToCwd(candidate, comparableRoot).replace(/^\/+/, '')
  // Windows 比较忽略大小写，保留原始路径段可避免 Unicode 大小写折叠改变切片长度。
  return path.windows ? path.path.split('/').slice(-relative.split('/').length).join('/') : relative
}

/** 根据所属项目、Host 主目录和用户选项生成可见路径。调用方保留原始目标用于文件操作。 */
export function formatPath(value, project, home, options = defaults) {
  if (typeof value !== 'string') return value
  if (value === '~' || value.startsWith('~/')) {
    const expanded = value === '~' ? home : resolveWorkspacePath(home, value.slice(2))
    const path = absolutePath(expanded)
    return path === undefined ? value : (inside(path, project) ?? value) || '.'
  }
  const normalized = absolutePath(value)
  if (normalized === undefined) return value
  const relative = inside(normalized, project)
  if (relative !== undefined) return relative || '.'

  if (normalized.windows) {
    const fromHome = inside(normalized, home)
    if (fromHome !== undefined) return fromHome === '' ? '~' : `~/${fromHome}`
  } else {
    const homeRoot = absolutePath(home)
    const abbreviated = abbreviateHomePath(normalized.path, homeRoot?.path)
    if (abbreviated !== normalized.path) return abbreviated
  }

  const mountedDrive = (options.convertWslPaths ?? defaults.convertWslPaths) && wslDrive.exec(normalized.path)
  const windows = drive.test(value) ? normalized.path : mountedDrive
    ? `${mountedDrive[1].toUpperCase()}:/${normalized.path.slice(mountedDrive[0].length).replace(/^\/+/, '')}` : undefined
  if (windows === undefined) return value
  return options.windowsBackslashes ? windows.replaceAll('/', '\\') : windows
}

/** 可见文件引用的行号或范围跟随路径显示，实际路径的调用方使用 formatPath。 */
export function formatPathLabel(value, project, home, options) {
  const suffix = location.exec(value)
  if (suffix === null) return formatPath(value, project, home, options)
  return formatPath(value.slice(0, suffix.index), project, home, options) + suffix[0]
}

const pathStart = String.raw`(?:~?\/(?!\/)|[a-z]:[/\\]|\\\\)`
const pathInText = new RegExp(
  String.raw`(?<url>\b[a-z][a-z\d+.-]*:\/\/[^\s<>"'“”‘’「」『』]+)|(?<quote>["'“‘「『])(?<quoted>${pathStart}[^\r\n"'“”‘’「」『』]+)(?<close>["'”’」』])|(?<prefix>^|[\s=(\[{（【，：；])(?<bare>${pathStart}[^\s<>"'“”‘’「」『』,;!?()\[\]{}，。；！？（）【】]+)`,
  'giu',
)

/** 简化正文中的路径字面量。带空格的路径由引用符或宿主路径标签确定边界。 */
export function formatPathText(text, project, home, options) {
  return text.replace(pathInText, (match, ...parts) => {
    const { url, prefix, quote, quoted, close, bare } = parts.at(-1)
    if (url !== undefined) return match
    if (quoted !== undefined) return `${quote}${formatPathLabel(quoted, project, home, options)}${close}`
    const path = /[/\\]\.{1,2}$/.test(bare) ? bare : bare.replace(/\.+$/, '')
    return `${prefix}${formatPathLabel(path, project, home, options)}${bare.slice(path.length)}`
  })
}
