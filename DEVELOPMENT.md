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
│  ├─ App.vue            # 渲染层主控:状态、文件操作、导入/导出编排、菜单动作分发、拖拽
│  ├─ style.css          # 全局布局样式
│  ├─ vite-env.d.ts      # 类型声明(含 simple-mind-map 模块声明)
│  ├─ components/
│  │  ├─ Toolbar.vue     # 顶部工具栏(侧边栏/备注栏/格式开关、主题下拉、打开/保存/导入▾/导出▾、文件名+脏标记)
│  │  ├─ Sidebar.vue     # 左侧"最近打开"侧边栏,可隐藏,双击打开
│  │  ├─ NoteSidebar.vue # 右侧"节点备注"侧边栏,可隐藏,编辑当前选中节点备注
│  │  ├─ FormatPanel.vue # 格式面板:选中节点的字体/字号/颜色/填充/边框编辑(支持多选批量)
│  │  ├─ SaveBanner.vue  # 写盘失败提示条(重试保存 / 另存为副本 / 明确丢弃后切换)
│  │  └─ ContextMenu.vue # 节点右键菜单(标记/取消"已完成")
│  └─ composables/
│     ├─ useMindMap.ts   # MindMap 实例封装、插件注册、备注图标/节点后置内容选项、默认数据
│     ├─ themes.ts       # 主题预设 + 统一节点间距(nodeSpacing/withNodeSpacing)
│     ├─ transfer.ts     # 导入/导出转换:markdown/xmind/opml ↔ 根节点树、.smm 判定、expand 补全
│     ├─ opml.ts         # OPML 序列化与解析(自建,核心库不含 OPML 通道)
│     └─ rasterExport.ts # JPG 光栅化 + PDF(A4 页面由 pdf-lib 直接产出)
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
| 文件 | 导入 ▾ | Markdown / XMind / OPML | — | `import:md` / `import:xmind` / `import:opml` |
| 文件 | 保存 | Ctrl+S | `save` |
| 文件 | 另存为 | Ctrl+Shift+S | `saveAs` |
| 文件 | 导出为 ▾ | PNG / JPG / SVG / PDF / Markdown / XMind / OPML | PNG 为 Ctrl+E | `export:png` … `export:opml` |
| 文件 | 最近打开 | — | 子菜单,点击打开对应文件 |
| 文件 | 打开快照文件夹 | — | `shell.openPath(userData/snapshots)` |
| 编辑 | 撤销 / 重做 | Ctrl+Z / Ctrl+Y | `undo` / `redo` |
| 编辑 | 添加/编辑备注 | Ctrl+T | `addNote`(打开右侧备注栏) |
| 视图 | 适应画布 / 放大 / 缩小 / 重置 | Ctrl+0 / Ctrl+= / Ctrl+- | `fit` / `zoomIn` / `zoomOut` / `reset` |
| 帮助 | 关于 | — | 信息对话框 |

菜单项统一通过 `win.webContents.send('menu:action', action)` 派发给渲染层;
导入/导出用 **`import:<kind>` / `export:<kind>` 前缀动作**,`IMPORT_KINDS` / `EXPORT_KINDS` 两张表同时驱动菜单构建与渲染层 `runAction` 分发。

### 2.3 状态持久化(最近文件 / 上次文件)
- 存储位置:`app.getPath('userData')/state.json`,结构 `{ recent: string[], lastPath: string|null }`。
- `recent` 最多保留 10 条,去重后前置;每次 `app:notify-open` 更新并 `buildMenu()` 重建"最近打开"子菜单。
- 启动恢复:`webContents.once('did-finish-load')` 后向渲染层发送 `app:open-path(lastPath)`。

### 2.4 文件 IPC(主进程侧)
- `dialog:open`(invoke):打开对话框,可选传入 `filters`(导入入口按 `.md/.xmind/.opml` 过滤;不传则用 `OPEN_FILTERS`,含 `smm/json/md/xmind/opml/所有文件`),返回 `{ canceled, filePath, buffer }`。
- `file:read`(invoke):按路径读文件,返回 `{ filePath, buffer }`(供最近打开/启动恢复/拖拽/导入复用)。
- `file:save`(invoke):`filePath` 为空时弹保存对话框(标题/默认名/`filters` 由渲染层给出);按 `encoding`(`utf8` | `base64`)写盘。
  返回三态:成功 `{ canceled:false, filePath }`、用户取消 `{ canceled:true }`、**写不进去 `{ canceled:false, filePath, error }`**
  —— 失败必须与"取消"可区分,否则渲染层会把写失败当成"用户不想存"而静默丢改动;失败也带 `filePath`,重试不必再弹框。
- **快照**:上面第一种(渲染层直接给出 `filePath`、且不带 `filters` 的文档保存)成功后,把同一份内容再写一份到
  `userData/snapshots/<路径 sha1 前 12 位>/<ISO 时间戳>.smm`,按字典序(即时间序)只保留最近 20 份;
  `file:save-sync` 走同步版。两者都整段 try/catch,快照失败只记日志,不影响保存结果。
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
| `openFile(filters?)` | invoke `dialog:open` | 打开对话框(可指定扩展名过滤) |
| `readFile(path)` | invoke `file:read` | 按路径读 |
| `saveFile(payload)` | invoke `file:save` | 保存/导出写盘(payload 可带 `filters`);返回 `{canceled, filePath?, error?}` |
| `saveFileSync({filePath,data})` | sendSync `file:save-sync` | 关窗前最后一次落盘(同步) |
| `notifyOpen(path)` | send `app:notify-open` | 上报打开/保存路径(更新最近文件) |
| `setTitle({title,dirty})` | send `app:set-title` | 同步窗口标题与脏标记 |
| `getRecent()` | invoke `app:get-recent` | 获取最近文件列表 |
| `onRecentChanged(cb)` | on `app:recent-changed` | 订阅最近列表变化 |
| `onMenuAction(cb)` | on `menu:action` | 接收菜单动作 |
| `onOpenPath(cb)` | on `app:open-path` | 接收"打开指定路径"(最近/恢复) |

同时导出 `DesktopApi`、`MenuAction` 等类型供渲染层复用(`MenuAction` 用 `` `export:${string}` `` / `` `import:${string}` `` 模板字面量联合,新增格式不必改类型)。

---

## 4. 模块:渲染层主控(`src/App.vue`)

职责:思维导图状态、文件读写编排、自动保存、菜单动作分发、拖拽打开、脏标记判定。

### 4.1 状态
- `filePath` / `title` / `dirty`;`savedSnapshot` 保存"上次落盘的数据快照"。
- `recent`(最近文件)、`sidebarVisible`(左侧栏)、`noteVisible`(右侧备注栏)。格式面板的显隐在 `Toolbar` 内部(`openMenu`),`App.vue` 只把 `mindMap` 与 `activeNodes` 传下去。
- `currentTheme`(当前主题名)、`activeNode`(当前选中节点,`shallowRef`)、`activeNodes`(多选节点数组,喂给格式面板)、`currentNote`(备注栏文本)、`noteTimer`(备注防抖句柄)。
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
- **`commitTextEdit()` 只在"这份内容马上会被覆盖/销毁"的路径上调用**(切文档、新建、导出、关窗)。
  **平时自动保存绝不能调它**:v0.2.1 把它放进了 `flushAutosave`/`writeSave`,于是"回车新建节点 → `data_change` → 800ms 防抖到点 →
  强制 `hideEditTextBox()`",用户字还没敲完编辑框就被关掉(实测:约 510ms 时 `display:none`,只提交了"完整的节"四个字)。
  现在的分工:`flushAutosave('auto')` 只做 `flushNote()`;`flushAutosave('switch')` 才 `commitTextEdit() + flushNote()`。
- **`commitPendingInput()` = `commitTextEdit() + flushNote()`**,给上面那些破坏性路径用:
  - 库把正在编辑的节点文字留在 `div.smm-node-edit-wrap` 里,只有 `draw_click` / `body_click` / `svg_mousedown` /
    `before_node_active` / `mousewheel` / Enter / Tab 才会 `execCommand('SET_NODE_TEXT')` 提交,**没有 blur 兜底**。
    原生菜单切换、Ctrl+O、拖拽进窗口这些方式不产生 DOM 点击,所以必须主动调
    `mindMap.renderer.textEdit.hideEditTextBox()` 收口,否则改动压根没进模型,自动保存"看起来没东西要存"。
  - 备注另有 **250ms** 应用侧防抖(`pendingNote` + `noteTimer`),`flushNote()` 必须在比较脏标记之前跑。
  - 因此 `flushAutosave()` 的顺序是:`cancelAutosaveTimer → (switch: 提交编辑框) → flushNote → syncDirty → 写盘`。
    (顺序反了就退化成"备注没进快照 → 不判脏 → 直接 return → 改动写进已销毁的节点",v0.2.0 就是这样丢的。)
- `flushAutosave(): Promise<SaveStatus>`(`'ok' | 'clean' | 'canceled' | 'failed'`):
  - 循环"比快照 → 写",写完再比一次,消掉两种竞态:库把 `addHistory`/`data_change` 节流 100ms 所以防抖没排上,以及"边写边改"。
  - 未命名文档 → `handleSave(true)` **弹一次"另存为"选位置**;用户取消 → `autosavePaused = true`。
    **这个暂停只作用于"还没有路径的文档"**(`autosavePaused && !filePath.value` 才跳过),并且每次换文档/新建都复位;
    v0.2.0 里它会残留,导致"取消过一次另存为之后,所有已命名文档都不再自动保存"。
- `handleSave(as)`:所有写盘都串到 `saveChain`(`saveChain.then(run, run)`),防抖写、Ctrl+S、切文档前的 flush 不互相插队;
  快照在真正执行写的那一刻取,所以排队期间的新改动也会被带上。
  实际写盘在 `writeSave(as)`:`commitPendingInput()` → `currentSnapshot()` → `file:save`;
  成功后用**写出去的那份数据**作脏基线(`markSaved(base)`),路径变化时才 `notifyOpen`。
- **写盘失败不再静默**(v0.2.1):
  - `file:save` 区分"用户在对话框里取消"(`{canceled:true}`)与"写不进去"(`{canceled:false, error, filePath}`),
    失败时带上路径,重试不会再弹一次"另存为"。
  - `writeSave` 自动重试 **2 次(间隔 400ms)** —— 多数失败是杀软/其他程序瞬时占着文件。
  - 仍失败 → `saveProblem = { path, error }`,画布上方浮一条 `SaveBanner`(不占布局、非模态):
    **重试保存 / 另存为副本 / 仍要切换(丢弃)**;`ensureSavedBeforeSwitch()` 在 `failed` 且未点"仍要切换"时**中止这次切换**,
    因为 `setData` 一换文档,内存里那份没落盘的改动就再也拿不回来了。成功后 `saveProblem` 自动清空。
  - `saveProblem` 挂着时每 **5s** 自动再试一次(`armSavePoll`),文件解除占用后无需点按钮就能补上,实测解锁后自动写成功、
    提示条自行消失;任何一次成功保存都会清空 `saveProblem` 从而停止轮询。
- **切换文档前要等渲染落定**:`settleRender()` —— 刚提交的编辑会触发一次渲染(`Render.render` 是 `setTimeout(0)` 排队,
  `_render` 期间会换掉 `nodeCache`/`lastNodeCache`);在它没画完时 `setData(新文档)`,两次渲染交错,旧文档的节点不会被销毁,
  画布上出现**两份导图重叠**(实测:START→START→END,n=5)。所以 `commitPendingInput()` 若真的提交了东西
  (`inputJustCommitted`,只置真、由消费方清),切换前多等一个"渲染结束"。
- `onBeforeUnload()`:`commitPendingInput()` → `syncDirty()` → `desktop.saveFileSync(...)` 同步落盘,覆盖防抖还没到点就关窗的最后 800ms。
- `loadFromPath(p)`:先 `ensureSavedBeforeSwitch()`(可能因写盘失败而中止)→ 按扩展名分流(`.smm/.json` 走原生格式、可原路径保存;
  `md/xmind/opml` 走导入通道 4.11,落为**未命名文档**)→ `readFile` → 解析 → `setData`/`applyParsed` → 更新标题/路径 →
  `autosavePaused = false` + `saveProblem = null` + `markSaved` → `centerOnOpen` → `notifyOpen`。
  - 若 `mindMap` 还没创建好(启动恢复的 IPC 常早于 ResizeObserver 首帧),路径存入 `pendingOpenPath` 排队,
    等**首次 `node_tree_render_end`**(初始模板渲染完毕)后再补打开。
    早于该时机 `setData` 会与首帧渲染交错,导致默认模板的节点和文档内容同时出现在画布上(重叠)。
  - 不认识的后缀直接 `alert('无法打开 .xxx 文件')`,不再"按 JSON 试一把"。
- `centerOnOpen()`:注册一次性 `node_tree_render_end` → `view.fit()`,把整张图搬到画布中央(内容超出画布时顺带缩小,小于画布则保持 100% 并居中)。
  必须等渲染结束,否则 `draw.rbox()` 拿到的还是上一份数据的包围盒。
- `handleOpen()`:对话框选文件后走 `loadFromPath`。
- `handleNew()`:先 `ensureSavedBeforeSwitch()`,再重置为 `defaultData`,并**一并复位 layout(`logicalStructure`)、主题与 `currentTheme`**,
  清空路径、标题"未命名"、`autosavePaused = false`、`saveProblem = null`。
- **快照兜底**:每次"有路径的文档保存"成功后,主进程把同一份内容静默写入
  `%APPDATA%\mind-map-desktop\snapshots\<目标路径 sha1 前 12 位>\<ISO 时间戳>.smm`,每个文件保留最近 **20** 份;
  关窗前那次同步保存也有快照。导出产物(带 `filters`)不写快照,快照失败也绝不把一次成功的保存报成失败。
  菜单「文件 ▸ 打开快照文件夹」直接开目录。

### 4.4 数据格式适配(关键)
- `.smm` 文件为**外层包装**:`{ layout, root, theme:{template,config}, view }`。
- 但构造函数与 `setData()` 只接受**根节点树**(`{ data:{text}, children }`)。
- `applyParsed()`:`setData(withExpand(parsed.root ?? parsed))`,再 `setLayout / setTheme / setThemeConfig` 套用配置。
- 保存用 `getData(true)` 输出完整包装,保证与官方格式互通。
- **`withExpand()` 不能省**(在 `transfer.ts`):核心库建节点时把缺省的 `data.expand` 补成 `true`
  (`MindMapNode` 构造函数),而这一步发生在 `setData` 之后的异步渲染里。md/xmind/opml 转出来的树不带 `expand`,
  于是"补齐"会被 `addHistory` 当成一次用户改动 → `data_change` → 刚导入就判脏 → 800ms 后自动保存又要弹"另存为"。
  在交给 `setData` 之前先把树补成最终形态,脏基线才是干净的。

### 4.5 菜单动作分发 `runAction(action)`
`new/open/save/saveAs` 走上述文件操作;
`undo/redo` → `execCommand('BACK'/'FORWARD')`;
`fit/zoomIn/zoomOut/reset` → `view.fit()/enlarge()/narrow()/reset()`;
`addNote` → `noteVisible = true`(打开右侧备注栏);
`export:<kind>` → `handleExport(kind)`(4.12);`import:<kind>` → `handleImport(kind)`(4.11)。

### 4.6 拖拽打开
- `window` 上 `dragover` 阻止默认;`drop` 取首个文件的 Electron `file.path` 走 `loadFromPath`
  (因此拖 `.md/.xmind/.opml` 进来等同于导入)。

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

### 4.11 导入通道(md / xmind / opml)
- 三个入口汇到同一处:工具栏「导入 ▾」、原生菜单「文件 ▸ 导入 ▸」、以及「打开」/拖拽
  (`loadFromPath` 按扩展名自动分流,`isSmm()` 与 `IMPORT_EXTENSIONS` 在 `transfer.ts` 里定义)。
- `handleImport(kind)`:`desktop.openFile([该格式过滤, 所有文件])` 选文件 → `loadFromPath`。
- `applyImported(ext, buffer, name)` 做三件事:按扩展名调转换器 → `mm.setData(root)` →
  **复位 layout 为 `logicalStructure` 并套用应用默认主题**(导入格式没有对应的写回路径,不该沿用上一份文档的主题)。
- 转换器集中在 `src/composables/transfer.ts`,直接 import 核心库的 `src/parse/markdown.js`、`src/parse/xmind.js` 子路径;OPML 自建(`src/composables/opml.ts`,库无该通道)。
  - **Markdown**:库的 `transformMarkdownTo` **只取第一个 H1 的子树**,多顶层或无 H1 会静默丢内容。
    `normalizeMarkdown()` 先数顶层 `#`(跳过代码围栏,`setext` 的 `===` 也计入),数量 ≠ 1 时整体降一级并在开头补 `# 文件名` 虚拟根。
  - **XMind**:`parseXmindFile(blob, handleMultiCanvas)`,回调必须返回一张画布;多画布时把各画布的 `rootTopic`
    并到一个虚拟主题下。产出只带 `text/note/hyperlink/tag`,**不带原文件样式**(库本身如此,不额外解读主题 XML)。
  - **OPML**:outline 树 → 节点树,多个顶层 outline 同样补虚拟根;文档标题取 `<head><title>`。
  - 共同约束:**任何情况下不静默丢内容**,一个 `.smm` 只容得下一个根,所以多顶层一律套虚拟根。
- 导入结果是**未命名文档**(`filePath = null`):首次改动按 4.3 的规则弹一次"另存为"选位置,之后静默自动保存为 `.smm`。
- 解析失败(`文件里没有可识别的节点` 等)由 `loadFromPath` 的 `catch` 统一 `alert('文件解析失败:…')`,当前文档不受影响。

### 4.12 导出通道(png / jpg / svg / pdf / md / xmind / opml)
- 入口同样是工具栏「导出 ▾」+ 原生菜单「文件 ▸ 导出为 ▸」(PNG 带 Ctrl+E)。
- `EXPORT_CONF` 表决定"扩展名 / 对话框标签 / 是否二进制";动手前先 `flushNote()`(备注还在防抖里)。
- 产物有四条来源:
  1. **核心库 Export 插件**:`png` / `svg` / `xmind`(`mm.export(kind, false, name)`),内部用 `FileReader.readAsDataURL`,统一用 `dataUrlToBase64()` 剥前缀。
  2. **自建 JPG**(`rasterExport.exportJpeg`):库把 jpg 交给 `canvas.toDataURL('image/jpg')`,而 **Chromium 不认这个 MIME,会静默返回 PNG 字节**
     (导出的 `.jpg` 其实是 PNG)。所以先取库的 PNG,再画到同尺寸 canvas 上铺白底、`toDataURL('image/jpeg', 0.92)`。
  3. **自建 PDF**(`rasterExport.exportPdf` + `pdf-lib`):库的 `ExportPDF` 用 `page.setSize(图片像素宽高)`,
     页面比例对但**物理尺寸变成几十英寸**。改为拿 PNG 后按 A4 建页(宽>高时自动用 A4 横向)、四边留 24pt 等比缩放居中,
     实测页面正好 841.89×595.28 pt。
  4. **自序列化文本**:`md`(`transformToMarkdown`)、`opml`(`buildOpml`)。
- 写盘统一走 `desktop.saveFile({ filePath:null, data, encoding, defaultName, filters })` → 原生保存对话框;取消即静默返回。
- 位图/SVG 是整张画布的光栅化,清晰度由库的 `minExportImgCanvasScale: 2` 兜底(dpr 至少 2 倍)。
- md / opml / xmind **可回环**:导出的文件重新导入得到同一棵树(已实测 9 节点一致、且不判脏)。

### 4.13 格式面板(选中节点的样式编辑)
- 组件 `src/components/FormatPanel.vue`,由 `Toolbar` 的「格式」按钮以 popover 形式承载,`App.vue` 传 `mindMap` 与 `activeNodes`。
- 回显用 `node.getStyle(prop)`(自定义样式 > 层级默认 > 主题的**合并生效值**),所以打开面板看到的就是节点当前的真实样子。
- 写入一律 `execCommand('SET_NODE_STYLE', node, prop, value)`;该命令**只接受单个节点**,多选时循环下发(底部显示"已选 N 个节点")。
  「恢复默认样式」用 `REMOVE_CUSTOM_STYLES` 清掉自定义层,回到主题/层级默认。
- 支持:加粗、斜体、字号(8–96,步进 ±1)、字体(9 个常用中文字体 + 自定义输入框)、文字色、填充色、边框色、边框宽(0/1/2/3/5)。
  **刻意不含下划线/删除线**。
- 三处非显然的实现约束:
  - 取色器绑 `@change` 而不是 `@input`:`SET_NODE_STYLE` 每次调用进一条撤销记录,拖动取色面板会连发上百条中间值灌满撤销栈。
  - 改边框色时若宽度为 0 自动补 1px:三级及以下节点默认 `borderWidth: 0`,只改颜色看起来"没反应"。
  - `Toolbar` 的"点外部关闭"对 `format` 直接放行:格式面板是跟着画布选中状态联动的编辑器,
    点节点/Ctrl 多选不该把它关掉(否则没法批量设置)。
- 面板 `watch` 选中节点并监听 `data_change` / `back_forward` 重读,撤销或右键改动后数值能跟上。
- `<input type=color>` 只接受 `#rrggbb`,主题值可能是 `#fff`/`transparent`/`rgb()` → `toHex()` 统一兜底。

---

## 5. 模块:思维导图封装(`src/composables/useMindMap.ts`)

- 插件注册(按需,控制体积):**Export、ExportXMind、Select、Drag、KeyboardNavigation**。
  - **不注册 `ExportPDF`**:页面尺寸由图片像素决定,不满足 A4 需求,PDF 由 `composables/rasterExport.ts` 用 `pdf-lib` 直接产出(见 4.12)。
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
- 右侧:**格式**(popover 承载 `FormatPanel`,见 6.5)、主题下拉(`<select>`,选项来自 `themePresets`)、打开 / 保存 / 另存为 / **导入 ▾** / **导出 ▾**。
- 下拉菜单由单个 `openMenu`(`'' | 'import' | 'export' | 'format'`)互斥控制;`IMPORT_ITEMS`/`EXPORT_ITEMS` 两张表决定子项文案与 `import:`/`export:` 动作。
- 格式面板挂在工具栏按钮下方的 `.tb-pop` 里(见 6.5),`window` 捕获阶段 `mousedown` 负责点外部关闭,**但 `format` 例外**(否则点节点就关面板)。
- props:`title / dirty / sidebarVisible / theme / noteVisible / mindMap / nodes`;
  事件:`toggleSidebar / toggleNote / theme(name) / open / save / saveAs / import(kind) / export(kind)`,统一上抛给 `App.vue`。

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

### 6.5 FormatPanel(`src/components/FormatPanel.vue`)
- 260px 宽的浮层面板,由工具栏「格式」按钮通过 `.tb-pop > .pop-panel` 承载(不在画布内,避免被 SVG 裁剪),右上 `×` 关闭。
- 分组:**文本**(加粗 / 斜体 / 字号步进器 / 字体下拉 / 文字色)、**节点**(填充色 / 边框色 / 边框宽度)、底部「恢复默认样式」+ 多选计数。
- 未选中节点时显示空态提示("请先在画布上选择一个节点",并提示 Ctrl 多选可批量)。
- props:`mindMap / nodes`(节点数组,来自 `App.vue` 的 `activeNodes`);事件:`close`。
- 行为细节与实现约束见 4.13。

### 6.6 SaveBanner(`src/components/SaveBanner.vue`)
- 写盘失败时浮在画布顶部(`position:absolute`,不占布局,免得触发画布 resize),红底一行 + 三个动作。
- props:`path / error`;事件:`retry`(重试当前路径)、`saveAs`(另存为副本,成功即视为脱离困境)、`discard`(置 `allowDiscardOnce`,明确允许下一次切换丢弃未保存改动)。
- 只在 `saveProblem` 非空时由 `App.vue` 用 `v-if` 挂出;任何一次成功保存都会把它清空,不需要用户点"关闭"。
- 它是**非模态**的:不拦编辑操作,只拦"换文档"(见 4.3 的 `ensureSavedBeforeSwitch`)。

---

## 7. 模块:构建与打包

- `vite.config.mts`:`base: './'`(保证 Electron `loadFile` 相对路径可用);`vite-plugin-electron/simple` 编排 main/preload;渲染产物 `dist/`,主进程/preload 产物 `dist-electron/`。
- `electron-builder.yml`:`win.target: portable` → 单个免安装 exe;产物 `release/MindMapDesktop-portable-<version>.exe`。
  - `extraResources` 随包附带 `LICENSE` 与 `THIRD-PARTY-NOTICES.md`(解包后位于 `resources/`),履行 MIT 归属义务。
  - `copyright` / `package.json.author` 已设置,避免 builder 告警。
- `.npmrc`:Electron 二进制与 builder 二进制走 npmmirror 镜像(本机直连 GitHub releases 会失败)。
- 运行时依赖只有三个:`simple-mind-map`(核心)、`vue`、**`pdf-lib`**(PDF 页面装配,见 4.12;只打进渲染层,主进程不引)。
  - 导入/解析用的 `markdown.js` / `xmind.js` 是**按需 import 核心库的 `src/parse/*` 子路径**,不额外引第三方解析器。
- 脚本:`npm run dev`(开发,自动起 Electron)、`npm run build`、`npm run dist`(打包 portable)、`npm run typecheck`。
- 渲染产物约 1.08 MB(gzip 约 375 KB),Vite 的 "chunk 大于 500 kB" 告警是预期的:核心库 + pdf-lib 全在单个 `index-*.js` 里,
  Electron 从本地 `loadFile` 加载,分包不会带来网络收益,反而 `base:'./'` 下的相对路径更好维护。
- **版本约束**:`typescript` 锁在 `^5.9`;`typescript@7`(原生预览版)不再导出 `./lib/tsc`,会让 `vue-tsc` 直接崩溃,
  表现是"`npm run typecheck` 看起来跑了其实什么都没检查"(`.vue` 完全不被裸 `tsc` 覆盖)。
- 打包注意:Windows 上偶发 `EPERM: rename win-unpacked.tmp -> win-unpacked`(多为 Defender 实时扫描锁住刚解出的 `electron.exe`)。
  处理:关闭占用 `release/` 的进程/资源管理器窗口、删除残留 `release/win-unpacked.tmp` 后重跑 `npx electron-builder --win portable` 即可。
  **别并发跑两次打包**:第二次会因 `release/win-unpacked` 被第一次占着而报 `EBUSY: resource busy or locked, rmdir`,产物目录还可能被误删。

---

## 8. IPC 通道一览

| 通道 | 类型 | 方向 | 用途 |
|---|---|---|---|
| `dialog:open` | invoke | 渲染→主 | 打开对话框(可带 `filters`) |
| `file:read` | invoke | 渲染→主 | 按路径读文件 |
| `file:save` | invoke | 渲染→主 | 保存/导出写盘(原子写;区分 canceled / error;文档保存成功后写快照) |
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
- [x] 导出 PNG / JPG / SVG / PDF / Markdown / XMind / OPML(工具栏「导出 ▾」+ 原生菜单「导出为 ▸」,PNG 保留 Ctrl+E)
- [x] 导入 Markdown / XMind / OPML(工具栏「导入 ▾」+ 原生菜单「导入 ▸」+「打开」/拖拽同扩展名文件)
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
- [x] 格式面板:选中节点的加粗/斜体/字号/字体/文字色/填充色/边框色/边框宽,Ctrl 多选批量,「恢复默认样式」一键清除自定义
- [x] 导入后不判脏(`withExpand` 补齐 `expand`,避免库渲染期的隐式改动触发"另存为"弹窗)
- [x] PDF 导出为 A4 页面并自动等比缩放居中(横图自动转横向);JPG 走自建编码(修正库回落成 PNG 的问题)
- [x] 渲染层加固:sandbox、拦截新窗口(超链接走系统浏览器)、阻止导航、读写路径校验
- [x] 切换文档前统一收口"输入中"的内容(编辑框里的节点文字 + 备注防抖),再比较脏标记再落盘
- [x] 写盘失败不再静默:自动重试 2 次 → 非模态提示条(重试 / 另存为副本 / 明确丢弃)+ 拦住这次切换
- [x] 自动快照:每次成功保存留一份到 `userData/snapshots/`,每个文件保留最近 20 份,菜单可直达该目录
- [x] 写盘失败期间每 5s 自动重试,锁释放后自己补写并收起提示条(不用用户回来点按钮)
- [x] 修回归:自动保存不再强制关闭节点文字编辑框(v0.2.1 会在用户敲到一半时退出编辑)
- [x] `autosavePaused` 只约束未命名文档,且换文档/新建一律复位(修:取消过一次"另存为"后所有文档都不再自动保存)

## 10. 已知限制 / 待办

- 导入是**结构导入**,不是保真导入:md/xmind/opml 只带出文本、备注、超链接、标签,原文件的主题/样式/形状不进 `.smm`;
  导入后一律套用客户端默认主题(这些格式没有对应的写回路径,沿用旧主题会误导)。
- 导出为图片/PDF/SVG 是**整张画布**的快照:导图很大时仍在单页 A4 上等比缩放,字会变小;未做多页拼接。
- Markdown 往返会丢节点样式与"已完成"对勾(md 表达不了);OPML 同理只保留文本层级。
- 图片/PDF 导出用的是**当前画布尺寸下的渲染结果**,导出不额外提高 `minExportImgCanvasScale`(默认 2 倍)。
- 备注泡泡位置为 CSS 近似(固定 `translateY(-9px)` 上移),多行/大字号节点未必精确贴到角上;库未提供将备注图标钉到节点角的选项。
- 打开文件时**不恢复文件里存的 view**(缩放/平移),每次打开都重新 `view.fit()` 居中;想固定视图位置需要改回读取 `view`。
- 自动保存按"最后写入者胜出",**未做冲突检测**:同一文件被两个窗口(或官方版 web)同时编辑时,后落盘的一方会覆盖另一方;也没有监听外部修改。
- 未命名文档若首次改动的"另存为"被取消,该文档后续改动不再自动保存(有路径的文档不受影响;换文档/新建即复位)。
- 写盘一直失败时**不会自动退出或强存**:切换文档会被提示条拦住(每 5s 自动重试一次),但直接杀进程/关窗(同步保存也失败)仍会丢掉最后一次改动,
  此时只能去 `userData/snapshots/` 取上一份快照。
- 快照只在"保存成功"时产生,所以最多回退到**上一次成功落盘**的版本;它不是版本历史浏览器,没有对比/回滚 UI。
- 启动恢复与"最近打开"**不校验文件是否仍存在**:上次打开的文件被删掉或移走后,冷启动会弹一次"文件解析失败:…ENOENT"。
- 未注册 RichText(富文本)/ Formula(公式)/ MiniMap 等插件。
- portable 版配置仍写在 `%APPDATA%`(userData),非完全"绿色随 exe 走"。
- 未做代码签名,分发时 Windows SmartScreen 会警告。
- 未设置应用图标(打包日志:`default Electron icon is used`),exe/任务栏仍是 Electron 默认图标。
- `index.html` 未加 CSP 元标签;主进程未做单实例锁(portable exe 可多开)。
- "已完成"对勾写的是自定义节点字段 `data.data.done`,**官方 web 版不认这个字段**,同一文件在官方版里打开不会显示对勾(数据不丢,回到本客户端仍生效)。
- 仓库根目录留有测试数据 `123.smm`、`12345.smm`(本地个人内容,已在 `.gitignore` 里排除,不入库)。
- 已发布:`https://github.com/jiansc323-alt/MindMapDesktop`(public,`main` 分支),首个 Release **v0.1.0** 附 portable exe。
- 免安装单 exe:`release/MindMapDesktop-portable-0.1.0.exe`(101.6 MiB / sha256 `b65a6ae1…e6c307`,内含 Electron 运行时),已包含自动保存 + 打开自动居中、右键完成标记、加大间距;合规文件(`LICENSE`、`THIRD-PARTY-NOTICES.md`)随包附带于 `resources/`。
- **v0.2.0**(格式面板 + 导入/导出 md/xmind/opml + png/jpg/svg/pdf 导出):Release 已发布
  `https://github.com/jiansc323-alt/MindMapDesktop/releases/tag/v0.2.0`(标记为 Latest),附件
  `MindMapDesktop-portable-0.2.0.exe`(106,651,099 B / sha256 `24f550da…01da57`,与本地产物一致)。
  发布前用 CDP 对**打包产物**复验:冷启动渲染正常、无异常,拖入 md/opml/xmind 五份样例均正确建树且不判脏。
- **v0.2.1**(自动保存不再丢改动):Release 已发布 `https://github.com/jiansc323-alt/MindMapDesktop/releases/tag/v0.2.1`
  (Latest),附件 `MindMapDesktop-portable-0.2.1.exe`(106,652,134 B / sha256 `95addf52…aa257648`)。收口"输入中"的节点文字与备注 → 再比较脏标记 → 再落盘;写盘失败区分"取消/错误"、自动重试并浮出提示条且拦住切换;`autosavePaused` 只约束未命名文档并随切换复位;每次成功保存留快照到 `userData/snapshots/`。
  回归用例(全部跑在打包产物 + 隔离 profile 上):编辑中切文档保住、备注 30ms 内切走保住、文件被锁时切换被拦住且解锁后自动补写成功、快速来回切换不串档、导入五份样例仍不判脏、两份图不再重叠。
- **v0.2.2**(修 v0.2.1 的回归):自动保存不再强制关闭正在输入的节点文字编辑框(收口只在切文档/新建/导出/关窗做),写失败提示条挂着时每 5s 自动重试。
  Release `https://github.com/jiansc323-alt/MindMapDesktop/releases/tag/v0.2.2`,附件 `MindMapDesktop-portable-0.2.2.exe`(106,653,877 B / sha256 `7e3c110f…556ac35c`)。
  用 CDP 真实按键事件在**两个版本的打包产物**上对照过:0.2.1 回车后约 1s 编辑框消失、输入全丢;0.2.2 连续输入 4s 全程在编辑,提交后文字完整。
