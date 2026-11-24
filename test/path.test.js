import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatPath, formatPathLabel, formatPathText } from '../src/path.js'

test('优先使用项目相对路径，并保留行号和文件名中的空格', () => {
  assert.equal(formatPath('/home/me/repo/src/my file.ts:42:8', '/home/me/repo', '/home/me'), 'src/my file.ts:42:8')
  assert.equal(formatPath('/mnt/c/repo/src/app.ts', '/mnt/c/repo', '/home/me'), 'src/app.ts')
  assert.equal(formatPath('/home/me/repo/', '/home/me/repo', '/home/me'), '.')
  assert.equal(formatPath('/home/me/repo-next/file.ts', '/home/me/repo', '/home/me'), '~/repo-next/file.ts')
  assert.equal(formatPath('/home/me/repo/link/../other/file.ts', '/home/me/repo', '/home/me'), 'link/../other/file.ts')
  assert.equal(formatPath('/home/me/repo//file.ts', '/home/me/repo', '/home/me'), 'file.ts')
  assert.equal(formatPath('\\\\server\\share\\repo\\src\\file.ts', '//server/share/repo'), 'src/file.ts')
})

test('主目录缩写按完整路径段匹配', () => {
  assert.equal(formatPath('/home/me/', undefined, '/home/me'), '~')
  assert.equal(formatPath('/home/me-next/file.ts', undefined, '/home/me'), '/home/me-next/file.ts')
  assert.equal(formatPath('C:\\Users\\Me\\config.json', undefined, 'c:/Users/me'), '~/config.json')
  assert.equal(formatPath('C:/Users/İ/STUFF', 'C:/Users/İ'), 'STUFF')
})

test('WSL 盘符转换和 Windows 分隔符由各自的开关控制', () => {
  assert.equal(formatPath('/mnt/c/Users/me/report.txt'), 'C:/Users/me/report.txt')
  assert.equal(formatPath('/mnt/d/'), 'D:/')
  assert.equal(formatPath('/mnt/cache/report.txt'), '/mnt/cache/report.txt')
  assert.equal(formatPath('/mnt/c/report.txt', undefined, undefined, { windowsBackslashes: true }), 'C:\\report.txt')
  assert.equal(formatPath('/mnt/c/report.txt', undefined, undefined, { convertWslPaths: false, windowsBackslashes: true }), '/mnt/c/report.txt')
  assert.equal(formatPath('C:\\Users\\me\\report.txt', undefined, undefined, { convertWslPaths: false }), 'C:/Users/me/report.txt')
  assert.equal(formatPath('c:\\REPO\\src\\file.ts#L3-L5', 'C:/repo'), 'src/file.ts#L3-L5')
})

test('相对路径、普通标签和网址保留原有文本', () => {
  for (const value of ['src/main.ts', '~/readme.md', 'Read this file', 'https://example.com/mnt/c/file.txt', '/etc/config']) {
    assert.equal(formatPath(value, '/home/me/repo', '/home/me'), value)
  }
})

test('可见引用的定位后缀与文件名分开处理', () => {
  assert.equal(formatPathLabel('/home/me/repo:42', '/home/me/repo', '/home/me'), '.:42')
  assert.equal(formatPathLabel('/mnt/c#L3-L5'), 'C:/#L3-L5')
  assert.equal(formatPath('/home/me/repo:42', '/home/me/repo', '/home/me'), '~/repo:42')
})

test('正文中的明确路径使用相同规则，保留上下文和标点', () => {
  const text = '文件（/mnt/c/data/test.txt:42），或「/home/me/repo/my file.ts」。网址 https://example.com/mnt/c/help。'
  assert.equal(formatPathText(text, '/home/me/repo', '/home/me'),
    '文件（C:/data/test.txt:42），或「my file.ts」。网址 https://example.com/mnt/c/help。')
  assert.equal(formatPathText('See /home/me/repo/src/file.ts, /mnt/d/log.txt. Use --prefix=/home/me/.config.' , '/home/me/repo', '/home/me'),
    'See src/file.ts, D:/log.txt. Use --prefix=~/.config.')
  assert.equal(formatPathText('See /home/me/repo/..', '/home/me/repo', '/home/me'), 'See ..')
})
