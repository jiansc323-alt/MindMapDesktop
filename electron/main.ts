import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron'
import path from 'node:path'
import fs from 'node:fs/promises'
import syncFs from 'node:fs'
import { createHash } from 'node:crypto'

process.env.DIST = path.join(__dirname, '../dist')
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

let win: BrowserWindow | null = null

interface AppState {
  recent: string[]
  lastPath: string | null
}
let state: AppState = { recent: [], lastPath: null }

function stateFile() {
  return path.join(app.getPath('userData'), 'state.json')
}

async function loadState() {
  try {
    const raw = await fs.readFile(stateFile(), 'utf8')
    state = { recent: [], lastPath: null, ...JSON.parse(raw) }
  } catch {
    state = { recent: [], lastPath: null }
  }
}

async function saveState() {
  try {
    await fs.writeFile(stateFile(), JSON.stringify(state), 'utf8')
  } catch {
    /* 状态写入失败不影响主流程 */
  }
}

function send(action: string) {
  win?.webContents.send('menu:action', action)
}

// [菜单项, 动作后缀, 快捷键]
const IMPORT_KINDS: [string, string, string?][] = [
  ['Markdown (.md)', 'md'],
  ['XMind (.xmind)', 'xmind'],
  ['OPML (.opml)', 'opml'],
]
const EXPORT_KINDS: [string, string, string?][] = [
  ['PNG 图片', 'png', 'CmdOrCtrl+E'],
  ['JPG 图片', 'jpg'],
  ['SVG 矢量图', 'svg'],
  ['PDF(A4 自动缩放)', 'pdf'],
  ['Markdown', 'md'],
  ['XMind', 'xmind'],
  ['OPML', 'opml'],
]

function buildMenu() {
  const recentSubmenu: Electron.MenuItemConstructorOptions[] = state.recent.length
    ? state.recent.map((p) => ({
        label: p,
        click: () => win?.webContents.send('app:open-path', p),
      }))
    : [{ label: '(无最近文件)', enabled: false }]

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: '文件',
      submenu: [
        { label: '新建', accelerator: 'CmdOrCtrl+N', click: () => send('new') },
        { label: '打开', accelerator: 'CmdOrCtrl+O', click: () => send('open') },
        {
          label: '导入',
          submenu: IMPORT_KINDS.map(([label, kind, accel]) => ({
            label,
            ...(accel ? { accelerator: accel } : {}),
            click: () => send(`import:${kind}`),
          })),
        },
        { type: 'separator' },
        { label: '保存', accelerator: 'CmdOrCtrl+S', click: () => send('save') },
        { label: '另存为', accelerator: 'CmdOrCtrl+Shift+S', click: () => send('saveAs') },
        {
          label: '导出为',
          submenu: EXPORT_KINDS.map(([label, kind, accel]) => ({
            label,
            ...(accel ? { accelerator: accel } : {}),
            click: () => send(`export:${kind}`),
          })),
        },
        { type: 'separator' },
        { label: '最近打开', submenu: recentSubmenu },
        { label: '打开快照文件夹', click: () => shell.openPath(snapshotRoot()) },
        { type: 'separator' },
        { role: 'quit', label: '退出' },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { label: '撤销', accelerator: 'CmdOrCtrl+Z', click: () => send('undo') },
        { label: '重做', accelerator: 'CmdOrCtrl+Y', click: () => send('redo') },
        { type: 'separator' },
        { label: '添加/编辑备注', accelerator: 'CmdOrCtrl+T', click: () => send('addNote') },
      ],
    },
    {
      label: '视图',
      submenu: [
        { label: '适应画布', accelerator: 'CmdOrCtrl+0', click: () => send('fit') },
        { label: '放大', accelerator: 'CmdOrCtrl+=', click: () => send('zoomIn') },
        { label: '缩小', accelerator: 'CmdOrCtrl+-', click: () => send('zoomOut') },
        { label: '重置', click: () => send('reset') },
      ],
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '关于',
          click: () => {
            if (!win) return
            dialog.showMessageBox(win, {
              type: 'info',
              title: '关于',
              message: 'MindMap Desktop',
              detail: '基于开源 simple-mind-map 核心库的 Windows 免安装思维导图客户端。',
            })
          },
        },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 800,
    minHeight: 600,
    title: '思维导图',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  // 节点超链接是 <a target="_blank">,交给系统浏览器,禁止在应用内开新窗口
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  // 阻止渲染层把当前页面导航走(拖拽/链接误点等)
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win?.webContents.getURL()) e.preventDefault()
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(process.env.DIST!, 'index.html'))
  }

  win.webContents.once('did-finish-load', () => {
    if (state.lastPath) win?.webContents.send('app:open-path', state.lastPath)
  })

  // 关闭不再拦截:渲染层自动保存,并在 beforeunload 里同步落盘
  win.on('closed', () => {
    win = null
  })
}

const OPEN_FILTERS: Electron.FileFilter[] = [
  { name: '思维导图 / 大纲', extensions: ['smm', 'json', 'md', 'xmind', 'opml'] },
  { name: '思维导图', extensions: ['smm', 'json'] },
  { name: 'Markdown', extensions: ['md'] },
  { name: 'XMind', extensions: ['xmind'] },
  { name: 'OPML', extensions: ['opml'] },
  { name: '所有文件', extensions: ['*'] },
]

// 渲染层给的读写路径必须是绝对路径,避免相对路径落到不可预期的目录
function assertAbsolutePath(p: unknown, label: string): string {
  if (typeof p !== 'string' || p.includes('\0') || !path.isAbsolute(p)) {
    throw new Error(`${label}:非法文件路径`)
  }
  return p
}

// 原子写:先写 .tmp 再改名覆盖,进程中途被杀不会留下半截文件
async function writeAtomic(target: string, buf: Buffer) {
  const tmp = `${target}.tmp`
  try {
    await fs.writeFile(tmp, buf)
    await fs.rename(tmp, target)
  } catch (err) {
    await fs.rm(tmp, { force: true }).catch(() => {})
    throw err
  }
}

function writeAtomicSync(target: string, buf: Buffer) {
  const tmp = `${target}.tmp`
  try {
    syncFs.writeFileSync(tmp, buf)
    syncFs.renameSync(tmp, target)
  } catch (err) {
    try {
      syncFs.rmSync(tmp, { force: true })
    } catch {
      /* 清理失败不掩盖原始错误 */
    }
    throw err
  }
}

// ---------- 自动快照(兜底:写失败的锁通常是瞬时的,但被覆盖的内容要能找回) ----------
const SNAPSHOT_KEEP = 20

function snapshotRoot() {
  return path.join(app.getPath('userData'), 'snapshots')
}

// 按目标路径分目录,文件名带时间戳,字典序即时间序
function snapshotDirFor(target: string) {
  const hash = createHash('sha1').update(path.resolve(target).toLowerCase()).digest('hex').slice(0, 12)
  return path.join(snapshotRoot(), hash)
}

async function writeSnapshot(target: string, buf: Buffer) {
  try {
    const dir = snapshotDirFor(target)
    await fs.mkdir(dir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    await fs.writeFile(path.join(dir, `${stamp}.smm`), buf)
    const names = (await fs.readdir(dir)).sort()
    if (names.length > SNAPSHOT_KEEP) {
      for (const n of names.slice(0, names.length - SNAPSHOT_KEEP)) {
        await fs.rm(path.join(dir, n), { force: true }).catch(() => {})
      }
    }
  } catch (err) {
    // 快照失败只影响兜底能力,不能把一次成功的保存报成失败
    console.error('快照失败:', (err as Error).message)
  }
}

// 关窗前那次是同步 IPC,只能配同步版快照
function writeSnapshotSync(target: string, buf: Buffer) {
  try {
    const dir = snapshotDirFor(target)
    syncFs.mkdirSync(dir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    syncFs.writeFileSync(path.join(dir, `${stamp}.smm`), buf)
    const names = syncFs.readdirSync(dir).sort()
    if (names.length > SNAPSHOT_KEEP) {
      for (const n of names.slice(0, names.length - SNAPSHOT_KEEP)) {
        try {
          syncFs.rmSync(path.join(dir, n), { force: true })
        } catch {
          /* 清不掉就留给下次 */
        }
      }
    }
  } catch (err) {
    console.error('快照失败:', (err as Error).message)
  }
}

ipcMain.handle('dialog:open', async (_e, filters?: Electron.FileFilter[]) => {
  if (!win) return { canceled: true }
  const res = await dialog.showOpenDialog(win, {
    title: '打开思维导图',
    filters: filters?.length ? filters : OPEN_FILTERS,
    properties: ['openFile'],
  })
  if (res.canceled || res.filePaths.length === 0) return { canceled: true }
  const filePath = res.filePaths[0]
  const buffer = await fs.readFile(filePath)
  return { canceled: false, filePath, buffer }
})

ipcMain.handle('file:read', async (_e, filePath: string) => {
  const buffer = await fs.readFile(assertAbsolutePath(filePath, '读取'))
  return { filePath, buffer }
})

ipcMain.handle('app:get-recent', () => state.recent)

interface SavePayload {
  filePath?: string | null
  data: string
  encoding?: 'utf8' | 'base64'
  defaultName?: string
  filters?: Electron.FileFilter[]
}

ipcMain.handle('file:save', async (_e, payload: SavePayload) => {
  if (!win) return { canceled: true }
  // 渲染层给了路径就是"保存当前文档"(自动保存/保存),没给才弹"另存为"
  const knownPath = !!payload.filePath
  let target = knownPath ? assertAbsolutePath(payload.filePath, '保存') : null
  if (!target) {
    const res = await dialog.showSaveDialog(win, {
      title: '保存',
      defaultPath: payload.defaultName || '未命名.smm',
      filters: payload.filters || [{ name: '思维导图', extensions: ['smm'] }],
    })
    if (res.canceled || !res.filePath) return { canceled: true }
    target = res.filePath
  }
  const buf =
    payload.encoding === 'base64'
      ? Buffer.from(payload.data, 'base64')
      : Buffer.from(payload.data, 'utf8')
  try {
    await writeAtomic(target, buf)
  } catch (err) {
    const msg = (err as Error).message
    console.error('保存失败:', target, msg)
    // 不能回报成"用户取消":那样渲染层会把一次写失败当成"用户不想存"静默丢弃改动。
    // 带上 target,渲染层重试时就不必再弹一次"另存为"。
    return { canceled: false, filePath: target, error: msg }
  }
  // 只对文档保存留快照;导出产物(带 filters)不进快照
  if (knownPath && !payload.filters) await writeSnapshot(target, buf)
  return { canceled: false, filePath: target }
})

// 关闭前渲染层的最后一次落盘:窗口销毁后异步 IPC 收不到,只能同步
ipcMain.on('file:save-sync', (e, payload: SavePayload) => {
  try {
    const target = assertAbsolutePath(payload.filePath, '自动保存')
    const buf = Buffer.from(payload.data || '', 'utf8')
    writeAtomicSync(target, buf)
    writeSnapshotSync(target, buf)
    e.returnValue = { ok: true }
  } catch (err) {
    console.error('自动保存失败:', (err as Error).message)
    e.returnValue = { ok: false, error: (err as Error).message }
  }
})

ipcMain.on('app:notify-open', (_e, filePath: string) => {
  state.recent = [filePath, ...state.recent.filter((p) => p !== filePath)].slice(0, 10)
  state.lastPath = filePath
  saveState()
  buildMenu()
  win?.webContents.send('app:recent-changed', state.recent)
})

ipcMain.on('app:set-title', (_e, payload: { title: string; dirty: boolean }) => {
  win?.setTitle(payload.dirty ? `${payload.title} *` : payload.title)
})

app.whenReady().then(async () => {
  await loadState()
  buildMenu()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
