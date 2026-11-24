import z from '@deepseek-ai/schemastery'
import { defaults } from './preferences.js'

/** 由 DSH 保存并同步给各个 Web 客户端。 */
export const Config = z.object(Object.fromEntries(Object.entries(defaults).map(([key, value]) => [
  key, z.boolean().default(value).volatile(),
])))

export function apply() {}
