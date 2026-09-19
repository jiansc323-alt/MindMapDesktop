<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import Toolbar from './components/Toolbar.vue'
import Sidebar from './components/Sidebar.vue'
import NoteSidebar from './components/NoteSidebar.vue'
import ContextMenu from './components/ContextMenu.vue'
import SaveBanner from './components/SaveBanner.vue'
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
// 写失败多半是瞬时的文件锁(杀软扫描、别的程序正打开着这份),先自己重试再打扰用户
const SAVE_RETRY_TIMES = 2
const SAVE_RETRY_DELAY = 400
let autosaveTimer: ReturnType<typeof setTimeout> | null = null
// 所有写盘串到一条链上:防抖写、Ctrl+S、切文档前的 flush 不能互相插队
let saveChain: Promise<unknown> = Promise.resolve()
// 未命名文档的"另存为"被取消后置真:没有路径就静默放弃,不再反复弹框
let autosavePaused = false
// 只放行一次"明知没存上仍要切走",由提示条上的按钮显式触发
let allowDiscardOnce = false
type SaveStatus = 'ok' | 'clean' | 'canceled' | 'failed'
const saveProblem = ref<{ path: string; error: string } | null>(null)

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

// 把"输入中"的东西收进数据模型:
// 1) 库把正在编辑的节点文字留在 contenteditable 里,只有画布点击/回车等事件才提交,
//    而原生菜单、Ctrl+O、拖拽这些切文档的方式不会产生 DOM 点击,不收口就连改动都看不到;
// 2) 备注有自己的 250ms 防抖,不先落回节点,快照里就没有这笔改动。
// 提交会让库把一次渲染排到下一个宏任务,切换文档前得等它画完,否则那一帧会把旧文档的
// 节点叠到新文档上(两份图同时出现在画布上)。inputJustCommitted 就是给调用方判断用的。
let inputJustCommitted = false

function commitPendingInput() {
  const te = mindMap.value?.renderer?.textEdit
  const editing = !!te?.isShowTextEdit?.()
  const hadNote = !!pendingNote
  if (editing) te.hideEditTextBox()
  flushNote()
  // 只置真,由消费方(切换文档时)清掉:flushAutosave 与写盘里各收口一次,
  // 第二次调用看不到在编辑了,把标记擦掉就会漏掉等渲染。
  if (editing || hadNote) inputJustCommitted = true
}

// 立即落盘:防抖到点、切换文档、关窗前都走这里
async function flushAutosave(): Promise<SaveStatus> {
  cancelAutosaveTimer()
  if (!mindMap.value) return 'clean'
  commitPendingInput()
  // 这个标记只对"还没有路径的文档"有意义,有路径的文档没有理由跳过保存
  if (autosavePaused && !filePath.value) return 'canceled'
  let status: SaveStatus = 'clean'
  // 写完再比一次:库把 data_change 节流了 100ms,排不上防抖的改动只能靠这里兜住;
  // 也可能是"边写边改",这一轮写完还剩新改动。
  for (let round = 0; round < SAVE_RETRY_TIMES + 2; round++) {
    syncDirty()
    if (!dirty.value) return status
    const pickingPath = !filePath.value
    // 未命名文档没有路径,只能让用户选一次位置(选完之后就再不打扰了)
    status = await handleSave(pickingPath)
    if (status === 'failed') return 'failed'
    if (status === 'canceled') {
      if (pickingPath) autosavePaused = true
      return 'canceled'
    }
  }
  return status
}

// 换文档/新建之前:先把这一份落盘。写不进去就不要继续了 —— 一旦 setData 换了文档,
// 内存里这份未落盘的改动就再也找不回来,只能让用户在提示条上明确决定。
async function ensureSavedBeforeSwitch(): Promise<boolean> {
  const st = await flushAutosave()
  if (st === 'failed' && !allowDiscardOnce) return false
  if (st === 'failed' && allowDiscardOnce) {
    allowDiscardOnce = false
    saveProblem.value = null
  }
  if (inputJustCommitted) {
    inputJustCommitted = false
    await settleRender()
  }
  return true
}

// 等库把"刚提交的那笔改动"渲染完再换文档。渲染是 setTimeout(0) 排队的,且 _render 期间
// 会改写节点缓存;在飞的时候 setData 会让两次渲染交错,上一份文档的节点不被销毁,
// 画布上就出现两份导图重叠。
function settleRender(): Promise<void> {
  const mm = mindMap.value
  const renderer = mm?.renderer
  if (!mm || !renderer) return Promise.resolve()
  return new Promise((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      mm.off('node_tree_render_end', finish)
      clearTimeout(guard)
      resolve()
    }
    const guard = setTimeout(finish, 1500)
    // 先放行一个宏任务,让排队的渲染真正开始,否则 isRendering 还是 false 会漏等
    setTimeout(() => {
      if (renderer.isRendering) mm.on('node_tree_render_end', finish)
      else finish()
    }, 0)
  })
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
  if (!(await ensureSavedBeforeSwitch())) return
  try {
    const { buffer } = await desktop.readFile(p)
    // .smm/.json 走原生格式(可原路径保存),其余走导入通道
    if (isSmm(p)) {
      applyParsed(JSON.parse(new TextDecoder('utf-8').decode(buffer)))
      filePath.value = p
    } else {
      await applyImported(ext, buffer, docTitle(p))
      filePath.value = null
    }
    // 换文档后一切重新开始算:上一份文档的状态不该继续影响这一份
    autosavePaused = false
    saveProblem.value = null
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
  if (!(await ensureSavedBeforeSwitch())) return
  mm.setData(JSON.parse(JSON.stringify(defaultData)))
  mm.setLayout('logicalStructure')
  applyDefaultTheme()
  filePath.value = null
  title.value = '未命名'
  autosavePaused = false
  saveProblem.value = null
  markSaved()
}

// 排进写盘链:自动保存的写、Ctrl+S、切文档前的 flush 依次执行,不互相插队
function handleSave(as: boolean): Promise<SaveStatus> {
  const run = () => writeSave(as)
  saveChain = saveChain.then(run, run)
  return saveChain as Promise<SaveStatus>
}

async function writeSave(as: boolean): Promise<SaveStatus> {
  const mm = mindMap.value
  if (!desktop || !mm) return 'failed'
  cancelAutosaveTimer()
  // 备注防抖与编辑框里的文字要先落回数据,否则这一次快照里没有它们
  commitPendingInput()
  let target: string | null = as ? null : filePath.value
  const { full, base } = currentSnapshot()
  let res: { canceled: boolean; filePath?: string; error?: string } = { canceled: true }
  for (let i = 0; ; i++) {
    res = await desktop.saveFile({
      filePath: target,
      data: full,
      encoding: 'utf8',
      defaultName: `${title.value}.smm`,
    })
    // "另存为"对话框已经选过位置了,重试不该再弹一次
    if (res.filePath) target = res.filePath
    if (!res.error || i >= SAVE_RETRY_TIMES) break
    await new Promise((r) => setTimeout(r, SAVE_RETRY_DELAY))
  }
  if (res.error) {
    saveProblem.value = { path: target || title.value, error: res.error }
    return 'failed'
  }
  if (res.canceled || !res.filePath) return 'canceled'
  const moved = res.filePath !== filePath.value
  filePath.value = res.filePath
  title.value = docTitle(res.filePath)
  autosavePaused = false
  saveProblem.value = null
  // 基线用刚写出去的那份数据,而不是写完再取一次:await 期间的改动才不会被判为已保存
  markSaved(base)
  // 自动保存很频繁,路径没变就不必反复刷最近列表
  if (moved) desktop.notifyOpen(res.filePath)
  return 'ok'
}

// 提示条:重试当前路径 / 换地方存一份 / 明确允许丢弃后切换
async function retryFailedSave() {
  if ((await flushAutosave()) !== 'failed') saveProblem.value = null
}

async function saveFailedCopyElsewhere() {
  if ((await handleSave(true)) === 'ok') saveProblem.value = null
}

function discardFailedSave() {
  allowDiscardOnce = true
  saveProblem.value = null
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
  // 编辑框里的文字与备注防抖都还没进数据,先收口,否则导出的是上一版
  commitPendingInput()
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
  commitPendingInput()
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
      <SaveBanner
        v-if="saveProblem"
        :path="saveProblem.path"
        :error="saveProblem.error"
        @retry="retryFailedSave"
        @save-as="saveFailedCopyElsewhere"
        @discard="discardFailedSave"
      />
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
