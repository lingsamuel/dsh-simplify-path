import { createElement as h, useState } from 'react'
import { defaults } from './preferences.js'

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

  return h('div', { style: { display: 'grid', gap: '0.75rem' } },
    Object.entries(defaults).map(([field, initial]) => h('label', {
      key: field, style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' },
    }, t(field), h('input', {
      type: 'checkbox', role: 'switch', checked: snapshot.value?.[field] ?? initial,
      disabled: snapshot.status !== 'ready' || !snapshot.writable || saving,
      onChange: event => { void change(field, event.currentTarget.checked) },
    }))),
    failed ? h('p', { role: 'alert' }, t('saveFailed')) : null,
  )
}
