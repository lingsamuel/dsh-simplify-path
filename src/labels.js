import { pathPartsOf } from '@deepseek-ai/dsh-util-workspace-path'
import { formatFilePath, formatPath, formatPathLabel, formatPathText } from './path.js'

const panelId = 'dsh-session-panel-'
const sessionScope = `[data-conversation-session], [data-sidebar-right-session], [data-row-key^="session:"], [data-session-panel][id^="${panelId}"]`
// DSH 的 CSS Modules 构建名在不同发行线会把散列放在类名前或后。
const cssClass = name => `:is([class$="_${name}"], [class*="_${name} "], [class*="_${name}_"])`
const pickerPath = `${cssClass('disambiguated')}[title]`
const workspacePath = `${cssClass('hoverPath')}, ${pickerPath}`
const projectRow = '[data-session-panel-project]'
const pathLabel = '[data-path-label]'
const filesRoot = `${pathLabel}[data-files-path]`
const environmentLocation = `${projectRow}, [data-forge-checkout]`
const changedPath = `[data-changed-files] ${cssClass('path')}`
const reviewItemPath = cssClass('itemPath')
const reviewFile = '[data-review-file]'
const turnTail = '[data-slot="conversation.chat.turnTail"]'
const composerDirectory = '[data-slot="conversation.input.left"] button[aria-haspopup="menu"][title]'
const pathButton = `button:is(${cssClass('fileLink')}, ${cssClass('fileMention')}, ${cssClass('fileTargetLink')})`
const toolSummary = `[data-tool] :is(${cssClass('summary')}, ${cssClass('summarySuffix')})`
const pathText = [
  '[data-changes-preview-path]', changedPath,
  reviewItemPath, `[data-files-view="search"] ${cssClass('parent')}`,
  `[data-tool] ${cssClass('imageMeta')} > div:first-child`,
  `[data-search="matches"] ${cssClass('filePath')}`, `[data-search="paths"] ${cssClass('line')}`,
  // Codex 等轮次尾部插件可用 DisclosureRow、DiffBlock 或图注显示文件路径。
  `${turnTail} [data-disclosure-row] ${cssClass('title')}`,
  `${turnTail} [data-diff] ${cssClass('path')}`, `${turnTail} figure > figcaption`,
  '[data-forge-file-label]', toolSummary,
].join(', ')
const prose = `[data-chat-flow] :is(${cssClass('markdown')}, [data-markdown-variant], [data-text-interaction-source])`
const hint = [
  ':is([data-forge-checkout], [data-session-panel-project], [data-forge-creation], [data-forge-missing]) [role="tooltip"]',
  '[data-forge-creation] [role="status"]',
].join(', ')
const titleOnly = [
  reviewFile, '[data-files-path] > div > button[title]', '[data-presented-file] button[title]',
  `[data-read] [data-code-block-banner] ${cssClass('title')}[title]`, composerDirectory,
].join(', ')
const targets = [workspacePath, projectRow, pathLabel, pathButton, pathText, prose, hint, titleOnly].join(', ')
const scopeAttributes = ['data-conversation-session', 'data-sidebar-right-session', 'data-row-key']
const rawContent = 'pre, [contenteditable], [data-code-block-content], [data-textpreview-body], svg, script, style'
const directorySuffix = /(^|[\s：])((?:~?\/(?!\/)|[a-z]:[/\\])[^\n]+)$/i

function sessionId(element) {
  const anchor = element?.closest(sessionScope)
  return anchor?.getAttribute('data-conversation-session')
    ?? anchor?.getAttribute('data-sidebar-right-session')
    ?? anchor?.getAttribute('data-row-key')?.slice('session:'.length)
    ?? anchor?.id.slice(panelId.length)
}

function textNodes(element) {
  const reader = element.ownerDocument.createTreeWalker(element, 4)
  const nodes = []
  while (reader.nextNode()) nodes.push(reader.currentNode)
  return nodes
}

/** 更新 DSH 的路径文字节点。保留节点身份，交由 React 继续渲染和响应文件操作。 */
export function observePathLabels(document, projectOf, directoryOf, getHome, getOptions) {
  const window = document.defaultView
  const changed = new Map()
  const pending = new Set()
  const portalOwners = new WeakMap()
  let portalAnchor
  let removed = false
  let queued = false
  let stopped = false

  function original(node) {
    const previous = changed.get(node)
    return previous?.displayed === node.nodeValue ? previous.value : node.nodeValue
  }

  function update(node, displayed) {
    const value = original(node)
    if (value === displayed) changed.delete(node)
    else changed.set(node, { value, displayed })
    if (node.nodeValue !== displayed) node.nodeValue = displayed
  }

  function restore(node) {
    const patch = changed.get(node)
    if (patch !== undefined && node.nodeValue === patch.displayed) node.nodeValue = patch.value
  }

  function updateAttribute(element, name, format) {
    const node = element.getAttributeNode(name)
    if (node !== null) update(node, format(original(node)))
  }

  function updateText(element, format, filter = () => true) {
    for (const node of textNodes(element)) {
      if (filter(node.parentElement)) update(node, format(original(node)))
    }
  }

  function updatePathLabel(element, format) {
    const title = element.getAttributeNode('title')
    const parts = element.firstElementChild?.children
    if (title === null || !parts?.length) return
    const displayed = format(original(title))
    const { directory } = pathPartsOf(displayed)
    update(title, displayed)
    updateText(parts[parts.length - 1], () => parts.length === 1 ? displayed : displayed.slice(directory.length))
    if (parts.length > 1) updateText(parts[0], () => directory)
  }

  function updateProjectRow(element, format, id) {
    const name = element.querySelector(`${cssClass('folder')} ${cssClass('name')}`)
    const parent = element.querySelector(`${cssClass('folder')} ${cssClass('parent')}`)
    const path = directoryOf(id)
    if (name === null || path === undefined) return
    const displayed = format(path)
    const { directory } = pathPartsOf(displayed)
    updateText(name, () => parent === null ? displayed : displayed.slice(directory.length))
    if (parent !== null) {
      const label = /^(?:\/|[a-z]:[/\\])$/i.test(directory) ? directory : directory.replace(/[/\\]$/, '')
      updateText(parent, () => label)
    }
  }

  function updateElement(element, home, options) {
    const hover = element.matches(workspacePath)
    const owner = sessionId(element)
    if (owner === undefined && (hover || element.matches(hint) || element.matches(pathText)) && !portalOwners.has(element)) {
      // 浮层可能越过会话的 DOM 边界。以浮层出现时的触发节点为准，随后鼠标移动不会改变归属。
      const anchor = portalAnchor?.isConnected ? portalAnchor : undefined
      portalOwners.set(element, {
        id: sessionId(anchor),
        workspace: Boolean(anchor?.closest('[data-row-key^="workspace:"]')),
      })
    }
    const portal = portalOwners.get(element)
    const workspace = element.matches(pickerPath) || (hover && portal?.workspace)
    const id = workspace ? undefined : owner ?? portal?.id
    const project = projectOf(id)
    const preserveProjectRoot = element.matches(`${filesRoot}, ${composerDirectory}`) || element.closest(environmentLocation) !== null
    const displayOptions = preserveProjectRoot ? { ...options, preserveProjectRoot } : options
    const format = value => formatPath(value, project, home, displayOptions)
    const formatFile = value => formatFilePath(value, project, home, displayOptions)
    const formatLabel = value => formatPathLabel(value, project, home, displayOptions)
    const formatText = value => formatPathText(value, project, home, displayOptions)
    const outsideRaw = parent => !parent.closest(rawContent)

    if (element.matches(pathLabel)) {
      updatePathLabel(element, formatFile)
    } else if (element.matches(projectRow)) {
      updateProjectRow(element, format, id)
    } else if (element.matches(changedPath)) {
      const row = element.closest('button')
      // 这个隐藏说明保存的是历史轮次的绝对路径，不能用会话现在的 cwd 推算。
      const description = row?.getAttribute('aria-describedby')
      const recorded = description ? document.getElementById(description)?.textContent : undefined
      const label = textNodes(element).map(original).join('')
      const displayed = formatFile(recorded || label)
      updateText(element, () => displayed, outsideRaw)
      if (row !== null && label !== '') updateAttribute(row, 'aria-label', value => value.replace(label, () => displayed))
    } else if (element.matches(titleOnly) || element.matches(pickerPath)) {
      updateAttribute(element, 'title', element.matches(reviewFile) ? formatFile : format)
    } else if (element.matches(pathButton) || hover || (element.matches(pathText) && !element.matches(toolSummary))) {
      updateAttribute(element, 'title', format)
      updateAttribute(element, 'aria-label', formatText)
      const rendered = element.matches(reviewItemPath) || (element.matches(pathButton) && element.closest('[data-tool]'))
        ? formatFile : element.matches(pathButton) ? formatLabel : format
      updateText(element, rendered, outsideRaw)
    } else if (element.matches(prose)) {
      for (const node of textNodes(element)) {
        const parent = node.parentElement
        if (parent.closest(`${rawContent}, a, button, ${pathLabel}`)) continue
        update(node, (parent.closest('code') ? formatLabel : formatText)(original(node)))
      }
    } else if (element.matches(toolSummary)) {
      updateText(element, value => {
        const path = format(value)
        return path === value ? formatText(value) : path
      }, outsideRaw)
    } else if (element.closest(environmentLocation)) {
      updateText(element, value => value.replace(directorySuffix, (_match, prefix, directory) => prefix + format(directory)), outsideRaw)
    } else {
      updateText(element, formatText, parent => !parent.closest(`${rawContent}, a, button`))
    }
  }

  function scan(node) {
    const element = node.nodeType === 1 ? node : node.parentElement
    if (!element) return
    const owner = element.closest(targets)
    if (owner !== null) pending.add(owner)
    if (node === element) {
      for (const label of element.querySelectorAll(targets)) pending.add(label)
    }
  }

  function flush() {
    queued = false
    if (stopped) return
    collect(observer.takeRecords())
    const home = getHome()
    const options = getOptions()
    for (const element of pending) if (element.isConnected) updateElement(element, home, options)
    pending.clear()
    if (removed) {
      removed = false
      for (const node of changed.keys()) {
        const owner = node.nodeType === 2 ? node.ownerElement : node
        if (owner?.isConnected !== true) {
          restore(node)
          changed.delete(node)
        }
      }
    }
    // 同步写入前先处理宿主排队的变更，此处丢弃的记录只来自本次显示更新。
    observer.takeRecords()
  }

  function schedule() {
    if (!queued && (pending.size > 0 || removed)) {
      queued = true
      window.queueMicrotask(flush)
    }
  }

  function collect(records) {
    for (const { target, addedNodes, removedNodes, attributeName } of records) {
      if (scopeAttributes.includes(attributeName)) scan(target)
      const element = target.nodeType === 1 ? target : target.parentElement
      if (target.nodeType === 3) changed.delete(target)
      if (attributeName !== null) changed.delete(element?.getAttributeNode(attributeName))
      const owner = element?.closest(targets)
      if (owner) pending.add(owner)
      for (const added of addedNodes) scan(added)
      removed ||= removedNodes.length > 0 || (attributeName !== null && !element?.hasAttribute(attributeName))
    }
  }

  const observer = new window.MutationObserver(records => {
    collect(records)
    schedule()
  })
  observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true,
    attributeFilter: ['title', 'aria-label', ...scopeAttributes] })

  const captureAnchor = event => {
    const element = event.target
    if (element.closest?.(sessionScope) || element.closest?.('[data-row-key]')) portalAnchor = element
  }
  for (const event of ['pointerover', 'focusin', 'pointerdown']) document.addEventListener(event, captureAnchor, true)
  const refresh = () => { scan(document.documentElement); schedule() }
  refresh()

  return {
    refresh,
    dispose() {
      stopped = true
      observer.disconnect()
      pending.clear()
      for (const event of ['pointerover', 'focusin', 'pointerdown']) document.removeEventListener(event, captureAnchor, true)
      for (const node of changed.keys()) restore(node)
      changed.clear()
    },
  }
}
