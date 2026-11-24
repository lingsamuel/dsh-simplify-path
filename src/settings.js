import { Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import { createElement as h, useState } from 'react'
import { defaults } from './preferences.js'

// 沿用 DSH Worktree 设置页的行布局，开关外观由 DSH 的 Switch 自身绘制。
const preferenceRowStyle = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, padding: '12px 0',
  fontSize: 13, fontWeight: 500, lineHeight: 1.5, color: 'var(--dsw-alias-label-primary)',
}

export const dictionaries = {
  zh: {
    convertWslPaths: '转换 WSL 盘符路径',
    windowsBackslashes: 'Windows 盘符使用反斜杠',
    copySimplifiedPath: '允许复制简化路径',
    copy: '复制简化路径',
    copied: '已复制简化路径',
    copyFailed: '无法复制简化路径',
    saveFailed: '无法保存路径显示设置',
  },
  en: {
    convertWslPaths: 'Convert WSL drive paths',
    windowsBackslashes: 'Use backslashes in Windows drive paths',
    copySimplifiedPath: 'Allow copying simplified paths',
    copy: 'Copy simplified path',
    copied: 'Simplified path copied',
    copyFailed: 'Could not copy simplified path',
    saveFailed: 'Could not save path display settings',
  },
}

export function Preferences({ t, usePreferences, setPreference }) {
  const snapshot = usePreferences(state => state)
  const [failed, setFailed] = useState(false)
  const [saving, setSaving] = useState(false)

  async function change(field, value) {
    setSaving(true)
    setFailed(false)
    try {
      setFailed(!await setPreference(field, value))
    } catch {
      setFailed(true)
    } finally {
      setSaving(false)
    }
  }

  const disabled = snapshot.status !== 'ready' || !snapshot.writable || saving
  return h('div', null,
    Object.entries(defaults).map(([field, initial]) => {
      const label = t(field)
      return h('label', { key: field, style: preferenceRowStyle },
        h('span', null, label),
        h(Switch, {
          label, checked: snapshot.value?.[field] ?? initial, disabled,
          onChange: value => { void change(field, value) },
        }),
      )
    }),
    failed ? h('p', { role: 'alert' }, t('saveFailed')) : null,
  )
}
