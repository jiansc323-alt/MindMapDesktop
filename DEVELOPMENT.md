# MindMap Desktop 开发文档

基于开源核心库 [simple-mind-map](https://github.com/wanglin2/mind-map)(MIT)自建的 **Windows 免安装**思维导图客户端。
官方桌面客户端闭源;本项目只使用其开源核心库与文档,不复制任何闭源代码/资源。

- 壳:Electron + electron-builder(`win.portable` → 单个免安装 exe)
- 渲染层:Vite + Vue 3 + TypeScript
- 核心:`simple-mind-map`(框架无关)

---

## 1. 目录结构

```
├─ electron/
│  ├─ main.ts            # 主进程:窗口、原生菜单、最近文件、原子写文件 IPC
│  └─ preload.ts         # contextBridge 安全桥接,暴露 desktop API 与类型
├─ src/
│  ├─ main.ts            # Vue 应用入口
│  ├─ App.vue            # 渲染层主控:状态、文件操作、菜单动作分发、拖拽
│  ├─ style.css          # 全局布局样式
│  ├─ vite-env.d.ts      # 类型声明(含 simple-mind-map 模块声明)
│  ├─ components/
│  │  ├─ Toolbar.vue     # 顶部工具栏(侧边栏/备注栏开关、主题下拉、打开/保存/另存为/导出PNG、文件名+脏标记)
│  │  ├─ Sidebar.vue     # 左侧"最近打开"侧边栏,可隐藏,双击打开
│  │  ├─ NoteSidebar.vue # 右侧"节点备注"侧边栏,可隐藏,编辑当前选中节点备注
│  │  └─ ContextMenu.vue # 节点右键菜单(标记/取消"已完成")
│  └─ composables/
│     ├─ useMindMap.ts   # MindMap 实例封装、插件注册、备注图标/节点后置内容选项、默认数据
│     └─ themes.ts       # 主题预设 + 统一节点间距(nodeSpacing/withNodeSpacing)
├─ index.html
├─ vite.config.mts       # Vite + vue + vite-plugin-electron/simple;base='./'
├─ electron-builder.yml  # portable 打包配置
├─ .npmrc                # Electron 二进制国内镜像
├─ tsconfig.json
└─ package.json
```

---

## 2. 模块:Electron 主进程(`electron/main.ts`)

职责:窗口生命周期、原生菜单与快捷键、最近文件/上次文件持久化、原生文件对话框与原子读写。

### 2.1 窗口
- `createWindow()`:1280x820,最小 800x600;`contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`,通过 `preload.js` 桥接。
- dev 加载 `VITE_DEV_SERVER_URL`,生产加载 `dist/index.html`。
- `setWindowOpenHandler`:一律 `deny`,http(s) 链接转交 `shell.openExternal`(节点超链接在库里是 `<a target="_blank">`)。
- `will-navigate`:阻止渲染层发起的页面导航(仅允许停留在当前 URL)。

### 2.2 原生菜单与快捷键
`buildMenu()` 构建应用菜单,快捷键通过菜单 accelerator 实现(不在渲染层重复绑定,避免双触发):

| 菜单 | 项 | 快捷键 | 动作 |
|---|---|---|---|
| 文件 | 新建 | Ctrl+N | `new` |
| 文件 | 打开 | Ctrl+O | `open` |
| 文件 | 保存 | Ctrl+S | `save` |
| 文件 | 另存为 | Ctrl+Shift+S | `saveAs` |
| 文件 | 导出 PNG | Ctrl+E | `exportPng` |
| 文件 | 最近打开 | — | 子菜单,点击打开对应文件 |
| 编辑 | 撤销 / 重做 | Ctrl+Z / Ctrl+Y | `undo` / `redo` |
| 编辑 | 添加/编辑备注 | Ctrl+T | `addNote`(打开右侧备注栏) |
| 视图 | 适应画布 / 放大 / 缩小 / 重置 | Ctrl+0 / Ctrl+= / Ctrl+- | `fit` / `zoomIn` / `zoomOut` / `reset` |
| 帮助 | 关于 | — | 信息对话框 |

菜单项统一通过 `win.webContents.send('menu:action', action)` 派发给渲染层。

### 2.3 状态持久化(最近文件 / 上次文件)
- 存储位置:`app.getPath('userData')/state.json`,结构 `{ recent: string[], lastPath: string|null }`。
- `recent` 最多保留 10 条,去重后前置;每次 `app:notify-open` 更新并 `buildMenu()` 重建"最近打开"子菜单。
- 启动恢复:`webContents.once('did-finish-load')` 后向渲染层发送 `app:open-path(lastPath)`。

### 2.4 文件 IPC(主进程侧)
- `dialog:open`(invoke):打开对话框(过滤 `.smm/.json`),返回 `{ canceled, filePath, buffer }`。
- `file:read`(invoke):按路径读文件,返回 `{ filePath, buffer }`(供最近打开/启动恢复/拖拽复用)。
- `file:save`(invoke):`filePath` 为空时弹保存对话框;按 `encoding`(`utf8` | `base64`)写盘,返回 `{ canceled, filePath }`。
- `file:save-sync`(sendSync):关窗前渲染层的最后一次落盘(窗口销毁后异步 IPC 收不到),只支持 `utf8`,返回 `{ ok, error? }`。
- **原子写**:`file:save` / `file:save-sync` 都走 `writeAtomic`(先写 `目标.tmp` 再 `rename` 覆盖),
  进程中途被杀不会留下半截 `.smm`;失败时清理 `.tmp` 并返回 `canceled/ok:false`。
- **路径校验**:`file:read` 与渲染层传入的 `file:save`、`file:save-sync` 目标路径统一过 `assertAbsolutePath`
  (必须为绝对路径、不含 `\0`);对话框返回的路径不校验(本身可信)。

### 2.5 标题与脏标记同步
- `app:set-title { title, dirty }`:设置窗口标题为 `标题` 或 `标题 *`(脏标记只用于提示"还有改动没落盘",主进程不再据此拦截关闭)。

### 2.6 关闭
- 主进程**不再拦截 `close`、不弹任何保存提示**:渲染层自动保存,并在 `beforeunload` 里用 `file:save-sync` 补最后一次性改动。
- 窗口全部关闭 → `window-all-closed` → `app.quit()`。

---

## 3. 模块:preload 桥接(`electron/preload.ts`)

通过 `contextBridge.exposeInMainWorld('desktop', api)` 暴露最小安全 API,渲染层不接触 Node:

| API | 方向 | 说明 |
|---|---|---|
| `openFile()` | invoke `dialog:open` | 打开对话框 |
| `readFile(path)` | invoke `file:read` | 按路径读 |
| `saveFile(payload)` | invoke `file:save` | 保存/导出写盘(payload 可带 `filters`) |
| `saveFileSync({filePath,data})` | sendSync `file:save-sync` | 关窗前最后一次落盘(同步) |
| `notifyOpen(path)` | send `app:notify-open` | 上报打开/保存路径(更新最近文件) |
| `setTitle({title,dirty})` | send `app:set-title` | 同步窗口标题与脏标记 |
| `getRecent()` | invoke `app:get-recent` | 获取最近文件列表 |
| `onRecentChanged(cb)` | on `app:recent-changed` | 订阅最近列表变化 |
| `onMenuAction(cb)` | on `menu:action` | 接收菜单动作 |
| `onOpenPath(cb)` | on `app:open-path` | 接收"打开指定路径"(最近/恢复) |

同时导出 `DesktopApi`、`MenuAction` 等类型供渲染层复用。

---

## 4. 模块:渲染层主控(`src/App.vue`)

职责:思维导图状态、文件读写编排、自动保存、菜单动作分发、拖拽打开、脏标记判定。

### 4.1 状态
- `filePath` / `title` / `dirty`;`savedSnapshot` 保存"上次落盘的数据快照"。
- `recent`(最近文件)、`sidebarVisible`(左侧栏)、`noteVisible`(右侧备注栏)。
- `currentTheme`(当前主题名)、`activeNode`(当前选中节点,`shallowRef`)、`currentNote`(备注栏文本)、`noteTimer`(备注防抖句柄)。
- `ctxMenu`(右键菜单 `{x,y,done}` 或 `null`)、`ctxNode`(菜单对应的节点,普通变量,不进响应式)。
- 自动保存:`autosaveTimer`(防抖句柄)、`saving`(在飞的写 Promise,用于串行)、`autosavePaused`(见 4.3)。

### 4.2 脏标记判定(快照对比,不依赖事件时序)
- `snapshot()` = `getData(true)` 去掉 `view` 后序列化。**排除 view 是刻意的**:平移/缩放不算内容改动,
  否则"打开时自动居中"自己就会把文档标脏并多写一次盘;写盘时仍用含 `view` 的完整数据(`currentSnapshot()`)。
- `syncDirty()` = 当前快照 ≠ `savedSnapshot`。
- 监听 `data_change` / `back_forward` → `syncDirty()` + `scheduleAutosave()`;首次 `node_tree_render_end` 时 `markSaved()` 建立基线(初始化期间的变更不计脏)。
- 该方式同时能正确处理"撤销回到已保存状态 → 不脏"。
- **事件有延迟**:`data_change` 在重渲染之后才派发,所以"立即落盘"的路径(切文档、关窗)会先主动 `syncDirty()` 再判断,不依赖事件。

### 4.3 自动保存与文件操作
- **没有任何"保不保存"弹窗**:改动由 `scheduleAutosave()` 防抖 **800ms** 静默写回当前文件;`dirty` 圆点仅表示"还有改动没落盘"。
- `flushAutosave()`:立即落盘,用于防抖到点、`loadFromPath`/`handleNew` 之前(防止把旧内容写进新文件)、以及关窗前。
  - 已有路径 → `handleSave(false)` 静默写;未命名文档 → `handleSave(true)` **弹一次"另存为"选位置**(选的是路径,不是问保不保存)。
  - 用户取消该次"另存为" → `autosavePaused = true`,本文档不再自动弹(标题圆点仍在),直到成功保存过一次才恢复。
  - 写操作经 `saving` 串行,避免两次自动保存交错覆盖。
- `handleSave(as)`:`flushNote()`(未落盘的备注编辑要进快照)→ `currentSnapshot()` → `file:save`;
  成功后用**写出去的那份数据**作脏基线(`markSaved(base)`,而不是写完再取一次),路径变化时才 `notifyOpen`(免得自动保存频繁刷最近列表)。
- `onBeforeUnload()`:`flushNote()` → `syncDirty()` → `desktop.saveFileSync(...)` 同步落盘,覆盖防抖还没到点就关窗的最后 800ms。
- `loadFromPath(p)`:先 `flushAutosave()` → `readFile` → 解析 → `applyParsed` → 更新标题/路径 → `markSaved` → `centerOnOpen` → `notifyOpen`。
  - 若 `mindMap` 还没创建好(启动恢复的 IPC 常早于 ResizeObserver 首帧),路径存入 `pendingOpenPath` 排队,
    等**首次 `node_tree_render_end`**(初始模板渲染完毕)后再补打开。
    早于该时机 `setData` 会与首帧渲染交错,导致默认模板的节点和文档内容同时出现在画布上(重叠)。
- `centerOnOpen()`:注册一次性 `node_tree_render_end` → `view.fit()`,把整张图搬到画布中央(内容超出画布时顺带缩小,小于画布则保持 100% 并居中)。
  必须等渲染结束,否则 `draw.rbox()` 拿到的还是上一份数据的包围盒。
- `handleOpen()`:对话框选文件后走 `loadFromPath`。
- `handleNew()`:先 `flushAutosave()`,再重置为 `defaultData`,并**一并复位 layout(`logicalStructure`)、主题与 `currentTheme`**,清空路径、标题"未命名"、`autosavePaused = false`。
- `handleExportPng()`:先 `flushNote()`;Export 插件取 base64(去掉 `data:` 前缀)→ `saveFile(encoding:'base64')`。

### 4.4 数据格式适配(关键)
- `.smm` 文件为**外层包装**:`{ layout, root, theme:{template,config}, view }`。
- 但构造函数与 `setData()` 只接受**根节点树**(`{ data:{text}, children }`)。
- `applyParsed()`:`setData(parsed.root ?? parsed)`,再 `setLayout / setTheme / setThemeConfig` 套用配置。
- 保存用 `getData(true)` 输出完整包装,保证与官方格式互通。

### 4.5 菜单动作分发 `runAction(action)`
`new/open/save/saveAs/exportPng` 走上述文件操作;
`undo/redo` → `execCommand('BACK'/'FORWARD')`;
`fit/zoomIn/zoomOut/reset` → `view.fit()/enlarge()/narrow()/reset()`;
`addNote` → `noteVisible = true`(打开右侧备注栏)。

### 4.6 拖拽打开
- `window` 上 `dragover` 阻止默认;`drop` 取首个文件的 Electron `file.path` 走 `loadFromPath`。

### 4.7 标题同步
- `watch([title, dirty])` → `desktop.setTitle(...)`:窗口标题带 `*`、工具栏文件名后带圆点,含义是"有改动还没落盘"(自动保存后约 1s 内消失)。

### 4.8 主题切换
- 预设集中在 `src/composables/themes.ts`(见第 5 节),`Toolbar` 下拉切换。
- `applyTheme(name)`:`setTheme('default')` + `setThemeConfig(preset.config)`,并更新 `currentTheme`。
  - 核心库仅内置 `default` 主题模板,故所有"主题"都是同一模板 + 不同自定义配置实现。
- 打开文件时(`applyParsed`):若文件带非空 `theme.config` 则沿用,否则回退到应用默认预设 `themePresets[0].config`
  (修复:旧文件 `theme.config` 为空导致仍显示库内置绿色/加粗样式)。
- **下拉回显**:按"预设里出现的键"去比对文件 config(`matchesPreset`,忽略库默认补齐的其余键),
  命中则选中对应预设,命不中则显示额外项 **自定义(来自文件)**(`currentTheme = 'custom'`)。

### 4.9 节点备注(右侧栏 + 节点泡泡)
- 选中节点:监听 `node_active`,把节点存入 `activeNode`,并把 `node.getData('note')` 同步到 `currentNote`。
- 点击节点上的备注泡泡:监听 `node_note_click`,设置 `activeNode/currentNote` 并 `noteVisible = true`。
- 编辑:`NoteSidebar` 输入 → `setNoteText(text)` 防抖 250ms 后 `setNote(text)`(可撤销,清空即移除备注)。
  - **目标节点在输入这一刻捕获**(`pendingNote = { node, text }`),不是防抖触发时的选中节点;
    否则快速切节点会把上一段文字写进新节点。
  - `flushNote()` 在以下时机立即落盘:切换选中(`node_active`)、点泡泡、保存、导出 PNG。
- 备注栏显隐与侧边栏一样会改变画布宽度,`watch([sidebarVisible, noteVisible])` → `nextTick` 调 `mindMap.resize()`。
- 泡泡样式:见第 5 节(缩小图标)与 `style.css`(`.smm-node-note` 上移到节点右上角)。

### 4.10 节点"已完成"标记(右键菜单)
- 监听库的 `node_contextmenu(e, node)`(`MindMapNode` 在节点组上派发):`e.preventDefault()` 屏蔽默认菜单,
  记下 `ctxNode` 并置 `ctxMenu = { x: e.clientX, y: e.clientY, done }` → 渲染 `ContextMenu`。
- `toggleDoneMark()`:`execCommand('SET_NODE_DATA', ctxNode, { done: !当前值 })` + `mindMap.render()`。
  - `done` 是写在节点数据里的**自定义字段**(库未占用该键),因此随 `.smm` 一起保存/加载,
    且 `SET_NODE_DATA` 走命令系统 → 可撤销、会经 `addHistory` 触发 `data_change`(脏标记正确)。
- 渲染方式见 5.3:用**节点后置内容**把对勾画在文本之后;菜单项文案随当前状态在"标记为已完成 / 取消完成标记"间切换。
- 关闭菜单:`window` **捕获阶段**的 `mousedown`(点菜单外部)、`Escape`、`wheel`。
  画布上的滚轮/按下会被库的处理函数 `stopPropagation`,所以必须用捕获阶段监听,否则收不到事件。

---

## 5. 模块:思维导图封装(`src/composables/useMindMap.ts`)

- 插件注册(按需,控制体积):**Export、Select、Drag、KeyboardNavigation**。
  - 刻意**不注册** Cooperate(协作依赖 WebSocket,单机版不需要)、RichText/Formula(quill/katex 体积大,暂不需要)。
- `defaultData`:根节点树示例数据。
- `useMindMap(el)`:
  - 用 **ResizeObserver** 等容器真正有非零尺寸后再 `new MindMap(...)`,规避"CSS 晚于模块脚本生效导致容器 0 尺寸"的竞态(否则构造抛"容器元素el的宽高不能为0")。
  - 构造选项 `noteIcon: { style: { size: 12, color: '#f5a623' } }`:把备注泡泡图标从主题默认 `iconSize`(20)缩小到 12px 并着琥珀色。
  - 初始化即 `setTheme('default') + setThemeConfig(themePresets[0].config)`,避免库内置绿色/加粗样式。
  - 实例用 `shallowRef` 持有,避免 Vue 深度响应式代理大对象。
  - 卸载时 `destroy()`。

### 5.1 主题预设(`src/composables/themes.ts`)
- 导出 `themePresets: ThemePreset[]`,每项 `{ name, label, config }`;`config` 键与 `simple-mind-map/src/theme/default.js` 一致。
- 现有预设:**默认(浅)**、深色、经典蓝、清新绿。
- "默认(浅)"按需求定制:根节点不加粗但字号更大(18)、二/三级节点均有黑色边框、连线与背景为浅色、连接线为黑色。
- 因核心库只内置 `default` 模板,切换主题实为 `setTheme('default') + setThemeConfig(预设 config)`。
- **节点间距由 `nodeSpacing` 统一提供**:`second.marginY 48` / `node.marginY 20`(库默认 40 / **0**,三级及以下节点上下几乎贴在一起)。
  - 实测净间距 = `marginY + hoverRectPadding*2`(默认 `hoverRectPadding` 为 2)→ 二级约 52px、三级及以下约 24px。
  - 每个预设 config 在定义时经 `withNodeSpacing()` 包一层;`applyParsed` 打开文件时也套一层
    (`setThemeConfig` 是**整体替换**而非合并,且旧文件里存的是当时生效的小间距,不覆盖就看不到新间距)。

### 5.2 备注泡泡样式(`src/style.css`)
- 库把备注图标**内联**排在节点文字右侧、垂直居中,无法通过选项直接钉到角上。
- 用 CSS `.smm-container .smm-node-note { transform: translateY(-9px) }` 将其上移到节点右上角;尺寸/颜色由第 5 节的 `noteIcon` 选项控制。

### 5.3 节点后置内容 = 完成对勾
- 构造选项 `createNodePostfixContent: (node) => node.getData('done') ? { el, width: 16, height: 16 } : null`。
  - 库内置的 `icon` 内容排在文本**之前**,不满足"标记加在节点后方";后置内容会被 `nodeLayout` 用
    `createForeignObjectNode` 包成 `<foreignObject>`,排在备注/附件之后(即节点内容最右侧),并自动垂直居中、参与节点宽高计算。
  - 对勾是 16×16 的绿色圆底白字 `div.smm-done-mark`,**样式全部写在行内**:导出 PNG/SVG 时不会带上应用样式表,
    写在 class 里的样式会丢。已实测导出位图里对勾可见。
  - `pointer-events:none`,不干扰节点自身的点选/拖拽。

---

## 6. 模块:UI 组件

### 6.1 Toolbar(`src/components/Toolbar.vue`)
- 左侧:侧边栏开关按钮(`«`/`»`)、备注栏开关按钮("备注")、文件名 + 未保存圆点(`dirty`)。
- 右侧:主题下拉(`<select>`,选项来自 `themePresets`)、打开 / 保存 / 另存为 / 导出 PNG。
- props:`title / dirty / sidebarVisible / theme / noteVisible`;事件:`toggleSidebar / toggleNote / theme(name) / open / save / saveAs / exportPng`,统一上抛给 `App.vue`。

### 6.2 Sidebar(`src/components/Sidebar.vue`)
- 左侧固定宽 220px 面板,标题"最近打开",右上"«"隐藏按钮。
- 列表项显示文件名 + 所在目录(完整路径作 tooltip);**双击**触发 `open(path)` 打开对应思维导图。
- 空态显示"暂无最近文件"。
- 数据来自 `App.vue` 的 `recent`(主进程最近列表),隐藏由 `App.vue` 的 `sidebarVisible` 控制(`v-if`)。
- 侧边栏显隐改变画布宽度,`App.vue` 监听 `sidebarVisible` 并在 `nextTick` 调 `mindMap.resize()` 重算尺寸。

### 6.3 NoteSidebar(`src/components/NoteSidebar.vue`)
- 右侧固定宽 260px 面板,标题"备注 · 节点名",右上"»"隐藏按钮。
- 有选中节点时显示 `<textarea>`(受控,`:value="note"` + `@input`),placeholder 提示"清空则移除备注";无选中节点显示空态"请先选中一个节点"。
- props:`note / nodeName / hasNode`;事件:`input(text)`(→ `App.setNoteText` 防抖写回节点)、`hide`。
- 显隐由 `App.vue` 的 `noteVisible` 控制(`v-if`);打开时 `App.vue` 在 `nextTick` 聚焦 `.note-input`。

### 6.4 ContextMenu(`src/components/ContextMenu.vue`)
- 节点右键菜单(见 4.10),`position: fixed` + `z-index`,由 `App.vue` 用 `v-if="ctxMenu"` 挂到 `.app` 根下(不能挂在画布内,否则被 SVG 裁剪)。
- props:`x / y / done`;事件:`toggle`(点菜单项 → `App.toggleDoneMark`)、`close`。
- 只有一个菜单项,文案按 `done` 在 **标记为已完成 / 取消完成标记** 间切换。
- 自身不做"点外部关闭",统一交给 `App.vue` 的窗口级监听;靠近视口右/下边缘时用 `MENU_W/MENU_H` 夹取坐标,避免弹出屏幕外。

---

## 7. 模块:构建与打包

- `vite.config.mts`:`base: './'`(保证 Electron `loadFile` 相对路径可用);`vite-plugin-electron/simple` 编排 main/preload;渲染产物 `dist/`,主进程/preload 产物 `dist-electron/`。
- `electron-builder.yml`:`win.target: portable` → 单个免安装 exe;产物 `release/MindMapDesktop-portable-<version>.exe`。
  - `extraResources` 随包附带 `LICENSE` 与 `THIRD-PARTY-NOTICES.md`(解包后位于 `resources/`),履行 MIT 归属义务。
  - `copyright` / `package.json.author` 已设置,避免 builder 告警。
- `.npmrc`:Electron 二进制与 builder 二进制走 npmmirror 镜像(本机直连 GitHub releases 会失败)。
- 脚本:`npm run dev`(开发,自动起 Electron)、`npm run build`、`npm run dist`(打包 portable)、`npm run typecheck`。
- **版本约束**:`typescript` 锁在 `^5.9`;`typescript@7`(原生预览版)不再导出 `./lib/tsc`,会让 `vue-tsc` 直接崩溃,
  表现是"`npm run typecheck` 看起来跑了其实什么都没检查"(`.vue` 完全不被裸 `tsc` 覆盖)。
- 打包注意:Windows 上偶发 `EPERM: rename win-unpacked.tmp -> win-unpacked`(多为 Defender 实时扫描锁住刚解出的 `electron.exe`)。
  处理:关闭占用 `release/` 的进程/资源管理器窗口、删除残留 `release/win-unpacked.tmp` 后重跑 `npx electron-builder --win portable` 即可。

---

## 8. IPC 通道一览

| 通道 | 类型 | 方向 | 用途 |
|---|---|---|---|
| `dialog:open` | invoke | 渲染→主 | 打开对话框 |
| `file:read` | invoke | 渲染→主 | 按路径读文件 |
| `file:save` | invoke | 渲染→主 | 保存/导出写盘(原子写) |
| `app:notify-open` | send | 渲染→主 | 更新最近文件/上次文件 |
| `app:set-title` | send | 渲染→主 | 窗口标题 + 脏标记 |
| `file:save-sync` | sendSync | 渲染→主 | 关窗前最后一次落盘(原子写) |
| `app:get-recent` | invoke | 渲染→主 | 获取最近文件列表 |
| `app:recent-changed` | send | 主→渲染 | 最近列表变化广播(刷新侧边栏) |
| `menu:action` | send | 主→渲染 | 菜单/快捷键动作 |
| `app:open-path` | send | 主→渲染 | 打开指定路径(最近/启动恢复) |

---

## 9. 已实现功能清单

- [x] 思维导图渲染与编辑(节点增删改、拖拽、框选、键盘导航)
- [x] 打开 / 保存 / 另存为 `.smm`(与官方格式互通)
- [x] 导出 PNG
- [x] 撤销 / 重做
- [x] 视图:适应画布 / 放大 / 缩小 / 重置
- [x] 原生菜单 + 快捷键
- [x] 最近打开(10 条)+ 启动自动恢复上次文件
- [x] 窗口标题显示文件名与"还没落盘"圆点
- [x] 拖拽 `.smm` 文件打开
- [x] 左侧"最近打开"侧边栏:双击打开,可隐藏/显示,列表随打开/保存实时刷新
- [x] 主题切换(工具栏下拉):默认(浅)/深色/经典蓝/清新绿;打开文件按 `theme.config` 套用,缺省回退默认预设
- [x] 右侧节点备注栏:Ctrl+T 或点击节点泡泡打开,编辑当前选中节点备注(防抖写回、可撤销)
- [x] 节点备注泡泡:缩小图标并固定到节点右上角,点击直达备注栏
- [x] 脏标记基于快照对比,撤销回已保存状态自动取消脏标记
- [x] 自动保存:改动后防抖 800ms 落盘(原子写),关窗前同步补写一次;全流程无"是否保存"弹窗
- [x] 未命名文档首次改动弹一次"另存为"选位置,之后全自动;取消则本文档静默跳过自动保存
- [x] 打开/新建/拖拽/最近打开前自动落盘当前文档,不再静默覆盖
- [x] 备注归属正确(防抖绑定输入时节点 + 切节点/保存/导出前 flush)
- [x] 启动恢复上次文件带排队兜底,不受 MindMap 创建时序影响(修复:默认模板与上次打开的导图重叠)
- [x] 打开任意导图后自动 `view.fit()` 居中(超出画布时顺带缩小),不误判为脏改动
- [x] 节点右键菜单:标记/取消"已完成",对勾画在节点文本后方,随 `.smm` 保存、可撤销、导出 PNG 可见
- [x] 节点上下间距由客户端统一加大(二级约 52px、三级及以下约 24px;库默认 44px / 4px)
- [x] 渲染层加固:sandbox、拦截新窗口(超链接走系统浏览器)、阻止导航、读写路径校验

## 10. 已知限制 / 待办

- 打开仅支持 `.smm/.json`;**xmind / markdown 导入导出未实现**。
- 备注泡泡位置为 CSS 近似(固定 `translateY(-9px)` 上移),多行/大字号节点未必精确贴到角上;库未提供将备注图标钉到节点角的选项。
- 打开文件时**不恢复文件里存的 view**(缩放/平移),每次打开都重新 `view.fit()` 居中;想固定视图位置需要改回读取 `view`。
- 自动保存按"最后写入者胜出",**未做冲突检测**:同一文件被两个窗口(或官方版 web)同时编辑时,后落盘的一方会覆盖另一方;也没有监听外部修改。
- 未命名文档若首次改动的"另存为"被取消,本文档后续改动不再提示、也不自动保存(新建/重新打开文档会恢复)。
- 未注册 RichText(富文本)/ Formula(公式)/ MiniMap 等插件。
- portable 版配置仍写在 `%APPDATA%`(userData),非完全"绿色随 exe 走"。
- 未做代码签名,分发时 Windows SmartScreen 会警告。
- 未设置应用图标(打包日志:`default Electron icon is used`),exe/任务栏仍是 Electron 默认图标。
- `index.html` 未加 CSP 元标签;主进程未做单实例锁(portable exe 可多开)。
- "已完成"对勾写的是自定义节点字段 `data.data.done`,**官方 web 版不认这个字段**,同一文件在官方版里打开不会显示对勾(数据不丢,回到本客户端仍生效)。
- 仓库根目录留有测试数据 `123.smm`、`12345.smm`(本地个人内容,已在 `.gitignore` 里排除,不入库)。
- 已发布:`https://github.com/jiansc323-alt/MindMapDesktop`(public,`main` 分支),首个 Release **v0.1.0** 附 portable exe。
- 免安装单 exe:`release/MindMapDesktop-portable-0.1.0.exe`(101.6 MiB / sha256 `b65a6ae1…e6c307`,内含 Electron 运行时),已包含自动保存 + 打开自动居中、右键完成标记、加大间距;合规文件(`LICENSE`、`THIRD-PARTY-NOTICES.md`)随包附带于 `resources/`。
