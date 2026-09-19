<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import Toolbar from './components/Toolbar.vue'
import Sidebar from './components/Sidebar.vue'
import NoteSidebar from './components/NoteSidebar.vue'
import ContextMenu from './components/ContextMenu.vue'
import { useMindMap, defaultData } from './composables/useMindMap'
import { themePresets, withNodeSpacing } from './composables/themes'
import { exportJpeg, exportPdf } from './composables/rasterExport'
import {
  dataUrlToBase64,
  docTitle,
  extOf,
  isSmm,
  markdownFromRoot,
  opmlFromRoot,
  rootFromMarkdown,
  rootFromOpml,
  rootFromXmind,
  withExpand,
} from './composables/transfer'
import type { MenuAction } from '../electron/preload'

const el = ref<HTMLElement>()
const { mindMap } = useMindMap(el)

const filePath = ref<string | null>(null)
const title = ref('未命名')
const dirty = ref(false)
const recent = ref<string[]>([])
const sidebarVisible = ref(true)
const currentTheme = ref('default')
const noteVisible = ref(false)
const currentNote = ref('')
const activeNode = shallowRef<any>(null)
// 格式面板需要整组选中节点(Ctrl+点多选)
const activeNodes = shallowRef<any[]>([])
let noteTimer: ReturnType<typeof setTimeout> | null = null
// 备注输入时的目标节点,防止切换节点后把文本写错地方
let pendingNote: { node: any; text: string } | null = null
// MindMap 尚未就绪时到达的"打开路径"请求
let pendingOpenPath: string | null = null
// 节点右键菜单
const ctxMenu = ref<{ x: number; y: number; done: boolean } | null>(null)
let ctxNode: any = null
let savedSnapshot = ''

const desktop = window.desktop

// 脏比对基线不含 view:平移/缩放不算内容改动,否则"打开时居中"自己就会触发一次保存
function snapshot() {
  if (!mindMap.value) return ''
  const { view, ...rest } = mindMap.value.getData(true)
  return JSON.stringify(rest)
}

// 写盘用完整数据(含 view),同时给出对应的脏比对基线
function currentSnapshot() {
  const data = mindMap.value!.getData(true)
  const { view, ...rest } = data
  return { full: JSON.stringify(data), base: JSON.stringify(rest) }
}

function markSaved(saved?: string) {
  savedSnapshot = saved ?? snapshot()
  dirty.value = false
}

function syncDirty() {
  dirty.value = snapshot() !== savedSnapshot
}

watch(mindMap, (mm) => {
  if (!mm) return
  let ready = false
  mm.on('data_change', () => {
    if (!ready) return
    syncDirty()
    scheduleAutosave()
  })
  mm.on('back_forward', () => {
    if (!ready) return
    syncDirty()
    scheduleAutosave()
  })
  mm.on('node_tree_render_end', () => {
    if (ready) return
    ready = true
    markSaved()
    // 启动恢复的"打开路径"可能早于实例创建;必须等首帧渲染结束再套用,
    // 否则会和初始模板的渲染交错,出现两棵树重叠
    if (pendingOpenPath) {
      const p = pendingOpenPath
      pendingOpenPath = null
      loadFromPath(p)
    }
  })
  mm.on('node_active', (...args: any[]) => {
    // 切换选中前先落盘上一条备注,避免丢失或写错节点
    flushNote()
    const list = args.find((a) => Array.isArray(a))
    const node = list ? list[0] : args[0]
    activeNode.value = node || null
    activeNodes.value = list || (node ? [node] : [])
    currentNote.value = node ? node.getData('note') || '' : ''
  })
  mm.on('node_note_click', (node: any) => {
    flushNote()
    activeNode.value = node
    currentNote.value = node.getData('note') || ''
    noteVisible.value = true
  })
  mm.on('node_contextmenu', (e: MouseEvent, node: any) => {
    e.preventDefault()
    ctxNode = node
    ctxMenu.value = { x: e.clientX, y: e.clientY, done: !!node.getData('done') }
  })
})

watch([title, dirty], ([t, d]) => {
  desktop?.setTitle({ title: t, dirty: d })
})

// 侧边栏显隐会改变画布宽度,需让 MindMap 重算尺寸
watch([sidebarVisible, noteVisible], () => {
  nextTick(() => mindMap.value?.resize())
})

// 只比对预设里出现的键:文件里的 theme.config 是"库默认 + 预设"深合并后的完整对象
function matchesPreset(preset: Record<string, any>, config: Record<string, any>): boolean {
  for (const key of Object.keys(preset)) {
    const want = preset[key]
    const got = config?.[key]
    if (want && typeof want === 'object') {
      for (const k of Object.keys(want)) {
        if (JSON.stringify(want[k]) !== JSON.stringify(got?.[k])) return false
      }
    } else if (JSON.stringify(want) !== JSON.stringify(got)) {
      return false
    }
  }
  return true
}

function matchPresetName(config: Record<string, any>): string {
  return themePresets.find((p) => matchesPreset(p.config, config))?.name || 'custom'
}

// 预设 config 里已含节点间距,可直接下发
function applyPresetTheme(name: string) {
  const mm = mindMap.value
  const preset = themePresets.find((p) => p.name === name)
  if (!mm || !preset) return
  mm.setTheme('default')
  mm.setThemeConfig(preset.config)
  currentTheme.value = name
}

function applyDefaultTheme() {
  applyPresetTheme(themePresets[0].name)
}

function applyParsed(parsed: any) {
  const mm = mindMap.value
  if (!mm) return
  const root = parsed.root ?? parsed
  mm.setData(withExpand(root))
  if (parsed.layout) mm.setLayout(parsed.layout)
  mm.setTheme(parsed.theme?.template || 'default')
  const cfg = parsed.theme?.config
  // 旧文件 theme.config 为空,代表"未自定义",应套用应用默认预设而非库内置样式
  const effective = cfg && Object.keys(cfg).length > 0 ? cfg : themePresets[0].config
  // 间距由本客户端统管:文件里存的是当时生效的(可能是库默认的)小间距
  const spaced = withNodeSpacing(effective)
  mm.setThemeConfig(spaced)
  currentTheme.value = matchPresetName(spaced)
}

// ---------- 自动保存 ----------
const AUTOSAVE_DELAY = 800
let autosaveTimer: ReturnType<typeof setTimeout> | null = null
let saving: Promise<boolean> | null = null
// 未命名文档的"另存为"被取消后置真:没有路径就静默放弃,不再反复弹框
let autosavePaused = false

function cancelAutosaveTimer() {
  if (autosaveTimer) {
    clearTimeout(autosaveTimer)
    autosaveTimer = null
  }
}

function scheduleAutosave() {
  if (autosavePaused || !mindMap.value) return
  cancelAutosaveTimer()
  autosaveTimer = setTimeout(flushAutosave, AUTOSAVE_DELAY)
}

// 立即落盘:防抖到点、切换文档、关窗前都走这里
async function flushAutosave(): Promise<boolean> {
  cancelAutosaveTimer()
  const mm = mindMap.value
  if (!mm || autosavePaused) return true
  // data_change 可能还没派发,自己比一次快照,别把刚发生的改动漏掉
  syncDirty()
  if (!dirty.value) return true
  // 未命名文档没有路径,只能让用户选一次位置(选完之后就再不打扰了)
  const pickingPath = !filePath.value
  if (saving) return saving
  saving = handleSave(pickingPath).finally(() => {
    saving = null
  })
  const ok = await saving
  if (!ok && pickingPath) autosavePaused = true
  return ok
}

// 打开文件后把整张图搬到画布中央(超出画布会顺带缩小)
// 必须等渲染结束,否则拿到的还是上一份数据的包围盒
function centerOnOpen() {
  const mm = mindMap.value
  if (!mm) return
  const done = () => {
    mm.off('node_tree_render_end', done)
    mm.view.fit()
  }
  mm.on('node_tree_render_end', done)
}

// 导入的格式没有对应的写回路径,一律按新文档套用默认主题
async function applyImported(ext: string, buffer: Uint8Array, name: string) {
  const mm = mindMap.value
  if (!mm) return
  const text = () => new TextDecoder('utf-8').decode(buffer)
  let root: any = null
  if (ext === 'md' || ext === 'markdown') root = rootFromMarkdown(text(), name)
  else if (ext === 'xmind') root = await rootFromXmind(buffer, name)
  else if (ext === 'opml') root = rootFromOpml(text(), name)
  else throw new Error(`不支持的格式:.${ext || '?'}`)
  mm.setData(root)
  mm.setLayout('logicalStructure')
  applyDefaultTheme()
}

const IMPORT_KINDS = ['md', 'markdown', 'xmind', 'opml']

async function loadFromPath(p: string) {
  if (!desktop) return
  // 启动恢复的 IPC 可能早于 MindMap 创建(等 ResizeObserver 首帧),先排队
  if (!mindMap.value) {
    pendingOpenPath = p
    return
  }
  const ext = extOf(p)
  if (!isSmm(p) && !IMPORT_KINDS.includes(ext)) {
    alert(`无法打开 .${ext} 文件`)
    return
  }
  await flushAutosave()
  try {
    const { buffer } = await desktop.readFile(p)
    // .smm/.json 走原生格式(可原路径保存),其余走导入通道
    if (isSmm(p)) {
      applyParsed(JSON.parse(new TextDecoder('utf-8').decode(buffer)))
      filePath.value = p
    } else {
      await applyImported(ext, buffer, docTitle(p))
      // 换文档后重新计时:上一份文档若取消了"另存为",不该继续拖累这份
      autosavePaused = false
      filePath.value = null
    }
    title.value = docTitle(p)
    markSaved()
    centerOnOpen()
    desktop.notifyOpen(p)
  } catch (err) {
    alert('文件解析失败:' + (err as Error).message)
  }
}

async function handleOpen() {
  if (!desktop) return
  const res = await desktop.openFile()
  if (res.canceled || !res.filePath) return
  await loadFromPath(res.filePath)
}

const IMPORT_FILTERS: Record<string, { name: string; extensions: string[] }> = {
  md: { name: 'Markdown', extensions: ['md', 'markdown'] },
  xmind: { name: 'XMind 导图', extensions: ['xmind'] },
  opml: { name: 'OPML 大纲', extensions: ['opml'] },
}

async function handleImport(kind: string) {
  if (!desktop) return
  const filter = IMPORT_FILTERS[kind]
  if (!filter) return
  const res = await desktop.openFile([filter, { name: '所有文件', extensions: ['*'] }])
  if (res.canceled || !res.filePath) return
  await loadFromPath(res.filePath)
}

async function handleNew() {
  const mm = mindMap.value
  if (!mm) return
  await flushAutosave()
  mm.setData(JSON.parse(JSON.stringify(defaultData)))
  mm.setLayout('logicalStructure')
  applyDefaultTheme()
  filePath.value = null
  title.value = '未命名'
  autosavePaused = false
  markSaved()
}

async function handleSave(as: boolean): Promise<boolean> {
  const mm = mindMap.value
  if (!desktop || !mm) return false
  cancelAutosaveTimer()
  // 先落盘输入中的备注,否则最后一次编辑可能没进快照
  flushNote()
  const { full, base } = currentSnapshot()
  const res = await desktop.saveFile({
    filePath: as ? null : filePath.value,
    data: full,
    encoding: 'utf8',
    defaultName: `${title.value}.smm`,
  })
  if (res.canceled || !res.filePath) return false
  const moved = res.filePath !== filePath.value
  filePath.value = res.filePath
  title.value = docTitle(res.filePath)
  autosavePaused = false
  // 基线用刚写出去的那份数据,而不是写完再取一次:await 期间的改动才不会被判为已保存
  markSaved(base)
  // 自动保存很频繁,路径没变就不必反复刷最近列表
  if (moved) desktop.notifyOpen(res.filePath)
  return true
}

// png/jpg/svg/pdf/xmind 由核心库产出 data URL,md/opml 是自己序列化的文本
const EXPORT_CONF: Record<
  string,
  { ext: string; label: string; binary: boolean }
> = {
  png: { ext: 'png', label: 'PNG 图片', binary: true },
  jpg: { ext: 'jpg', label: 'JPG 图片', binary: true },
  svg: { ext: 'svg', label: 'SVG 矢量图', binary: true },
  pdf: { ext: 'pdf', label: 'PDF 文档', binary: true },
  md: { ext: 'md', label: 'Markdown', binary: false },
  xmind: { ext: 'xmind', label: 'XMind 导图', binary: true },
  opml: { ext: 'opml', label: 'OPML 大纲', binary: false },
}

async function handleExport(kind: string) {
  const mm = mindMap.value
  const conf = EXPORT_CONF[kind]
  if (!desktop || !mm || !conf) return
  // 备注输入框里的内容还在防抖中,先落回节点再取快照
  flushNote()
  try {
    let data = ''
    if (kind === 'pdf') data = await exportPdf(mm, title.value)
    else if (kind === 'jpg') data = await exportJpeg(mm, title.value)
    else if (kind === 'md') data = markdownFromRoot(mm.getData())
    else if (kind === 'opml') data = opmlFromRoot(mm.getData(), title.value)
    else data = dataUrlToBase64(await mm.export(kind, false, title.value))
    await desktop.saveFile({
      filePath: null,
      data,
      encoding: conf.binary ? 'base64' : 'utf8',
      defaultName: `${title.value}.${conf.ext}`,
      filters: [{ name: conf.label, extensions: [conf.ext] }],
    })
  } catch (err) {
    alert('导出失败:' + (err as Error).message)
  }
}

const activeNodeName = computed(() => activeNode.value?.getData('text') || '')

function setNoteText(text: string) {
  currentNote.value = text
  // 目标节点在输入这一刻确定,不能等防抖触发时再看当前选中
  pendingNote = { node: activeNode.value, text }
  if (noteTimer) clearTimeout(noteTimer)
  noteTimer = setTimeout(flushNote, 250)
}

function flushNote() {
  if (noteTimer) {
    clearTimeout(noteTimer)
    noteTimer = null
  }
  if (!pendingNote) return
  const { node, text } = pendingNote
  pendingNote = null
  if (node) node.setNote(text)
}

function closeCtxMenu() {
  ctxMenu.value = null
}

// 菜单是固定定位的,画布滚动/缩放后位置就对不上了,所以滚轮也关闭
function onDocMousedown(e: MouseEvent) {
  if (!ctxMenu.value) return
  const el = e.target as HTMLElement | null
  if (el?.closest?.('.ctx-menu')) return
  closeCtxMenu()
}
function onDocKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') closeCtxMenu()
}

// 关窗前最后一次落盘:窗口正在销毁,异步 IPC 可能来不及送达,只能用同步的
function onBeforeUnload() {
  const mm = mindMap.value
  if (!desktop || !mm || !filePath.value) return
  cancelAutosaveTimer()
  flushNote()
  // 同样不等 data_change 派发了,直接比快照
  syncDirty()
  if (!dirty.value) return
  const { full, base } = currentSnapshot()
  if (desktop.saveFileSync({ filePath: filePath.value, data: full })?.ok) markSaved(base)
}

// 完成标记存在节点数据的自定义字段 done 上,由 createNodePostfixContent 渲染成对勾
function toggleDoneMark() {
  const mm = mindMap.value
  if (!mm || !ctxNode) return
  const next = !ctxNode.getData('done')
  // SET_NODE_DATA 是可撤销命令,并会经 addHistory 触发 data_change(脏标记)
  mm.execCommand('SET_NODE_DATA', ctxNode, { done: next })
  mm.render()
  closeCtxMenu()
}

watch(noteVisible, (v) => {
  if (v) nextTick(() => (document.querySelector('.note-input') as HTMLTextAreaElement | null)?.focus())
})

function runAction(action: MenuAction) {
  const mm = mindMap.value
  if (action.startsWith('export:')) {
    handleExport(action.slice(7))
    return
  }
  if (action.startsWith('import:')) {
    handleImport(action.slice(7))
    return
  }
  switch (action) {
    case 'new':
      handleNew()
      break
    case 'open':
      handleOpen()
      break
    case 'save':
      handleSave(false)
      break
    case 'saveAs':
      handleSave(true)
      break
    case 'addNote':
      noteVisible.value = true
      break
    case 'undo':
      mm?.execCommand('BACK')
      break
    case 'redo':
      mm?.execCommand('FORWARD')
      break
    case 'fit':
      mm?.view.fit()
      break
    case 'zoomIn':
      mm?.view.enlarge()
      break
    case 'zoomOut':
      mm?.view.narrow()
      break
    case 'reset':
      mm?.view.reset()
      break
  }
}

onMounted(() => {
  if (!desktop) return
  desktop.onMenuAction(runAction)
  desktop.onOpenPath(loadFromPath)
  desktop.onRecentChanged((list) => (recent.value = list))
  desktop.getRecent().then((list) => (recent.value = list))

  const onDrop = async (e: DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer?.files?.[0]
    const p = (file as any)?.path as string | undefined
    if (p) await loadFromPath(p)
  }
  window.addEventListener('dragover', (e) => e.preventDefault())
  window.addEventListener('drop', onDrop)

  // 捕获阶段监听:画布上的滚轮/按下事件会被库的处理函数 stopPropagation,
  // 冒泡阶段的窗口监听收不到
  window.addEventListener('mousedown', onDocMousedown, true)
  window.addEventListener('wheel', closeCtxMenu, { capture: true, passive: true })
  window.addEventListener('keydown', onDocKeydown)
  window.addEventListener('beforeunload', onBeforeUnload)
})

onBeforeUnmount(() => {
  cancelAutosaveTimer()
  window.removeEventListener('mousedown', onDocMousedown, true)
  window.removeEventListener('wheel', closeCtxMenu, { capture: true })
  window.removeEventListener('keydown', onDocKeydown)
  window.removeEventListener('beforeunload', onBeforeUnload)
})
</script>

<template>
  <div class="app">
    <Toolbar
      :title="title"
      :dirty="dirty"
      :sidebar-visible="sidebarVisible"
      :theme="currentTheme"
      :note-visible="noteVisible"
      :mind-map="mindMap"
      :nodes="activeNodes"
      @toggle-sidebar="sidebarVisible = !sidebarVisible"
      @toggle-note="noteVisible = !noteVisible"
      @theme="applyPresetTheme"
      @open="handleOpen"
      @save="handleSave(false)"
      @save-as="handleSave(true)"
      @import="handleImport"
      @export="handleExport"
    />
    <div class="body">
      <Sidebar
        v-if="sidebarVisible"
        :items="recent"
        @open="loadFromPath"
        @hide="sidebarVisible = false"
      />
      <div class="canvas-wrap">
        <div ref="el" class="smm-container"></div>
      </div>
      <NoteSidebar
        v-if="noteVisible"
        :note="currentNote"
        :node-name="activeNodeName"
        :has-node="!!activeNode"
        @input="setNoteText"
        @hide="noteVisible = false"
      />
    </div>
    <ContextMenu
      v-if="ctxMenu"
      :x="ctxMenu.x"
      :y="ctxMenu.y"
      :done="ctxMenu.done"
      @toggle="toggleDoneMark"
      @close="closeCtxMenu"
    />
  </div>
</template>
