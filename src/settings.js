import { Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import { createElement as h, Fragment, useState } from 'react'
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

  const disabled = snapshot.status !== 'ready' || !snapshot.writable || saving
  return h(Fragment, null,
    Object.entries(defaults).map(([field, initial]) => {
      const label = t(field)
      return h('label', { key: field }, h(Switch, {
        label, checked: snapshot.value?.[field] ?? initial, disabled,
        onChange: value => { void change(field, value) },
      }), ' ', label)
    }),
    failed ? h('p', { role: 'alert' }, t('saveFailed')) : null,
  )
}
