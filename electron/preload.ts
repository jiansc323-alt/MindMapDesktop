import { contextBridge, ipcRenderer } from 'electron'

export interface OpenResult {
  canceled: boolean
  filePath?: string
  buffer?: Uint8Array
}

export interface SavePayload {
  filePath?: string | null
  data: string
  encoding?: 'utf8' | 'base64'
  defaultName?: string
  filters?: Electron.FileFilter[]
}

export interface SaveResult {
  canceled: boolean
  filePath?: string
  // 写盘失败时给出原因;不能和"用户在对话框里取消"混成一回事
  error?: string
}

export interface AutosavePayload {
  filePath: string
  data: string
}

export interface AutosaveResult {
  ok: boolean
  error?: string
}

export type MenuAction =
  | 'new'
  | 'open'
  | 'save'
  | 'saveAs'
  | 'undo'
  | 'redo'
  | 'addNote'
  | 'fit'
  | 'zoomIn'
  | 'zoomOut'
  | 'reset'
  | `export:${string}`
  | `import:${string}`

const api = {
  openFile: (filters?: Electron.FileFilter[]): Promise<OpenResult> =>
    ipcRenderer.invoke('dialog:open', filters),
  readFile: (filePath: string): Promise<{ filePath: string; buffer: Uint8Array }> =>
    ipcRenderer.invoke('file:read', filePath),
  saveFile: (payload: SavePayload): Promise<SaveResult> =>
    ipcRenderer.invoke('file:save', payload),
  // 关闭前落盘用同步 IPC:窗口销毁后异步 IPC 就发不出去了
  saveFileSync: (payload: AutosavePayload): AutosaveResult =>
    ipcRenderer.sendSync('file:save-sync', payload),
  notifyOpen: (filePath: string) => ipcRenderer.send('app:notify-open', filePath),
  setTitle: (payload: { title: string; dirty: boolean }) =>
    ipcRenderer.send('app:set-title', payload),
  getRecent: (): Promise<string[]> => ipcRenderer.invoke('app:get-recent'),
  onRecentChanged: (cb: (list: string[]) => void) => {
    ipcRenderer.on('app:recent-changed', (_e, list: string[]) => cb(list))
  },
  onMenuAction: (cb: (action: MenuAction) => void) => {
    ipcRenderer.on('menu:action', (_e, action: MenuAction) => cb(action))
  },
  onOpenPath: (cb: (filePath: string) => void) => {
    ipcRenderer.on('app:open-path', (_e, filePath: string) => cb(filePath))
  },
}

contextBridge.exposeInMainWorld('desktop', api)

export type DesktopApi = typeof api
