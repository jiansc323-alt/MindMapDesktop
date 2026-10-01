<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { themePresets } from '../composables/themes'
import FormatPanel from './FormatPanel.vue'

defineProps<{
  title: string
  dirty: boolean
  sidebarVisible: boolean
  theme: string
  noteVisible: boolean
  mindMap: any
  nodes: any[]
}>()
const emit = defineEmits<{
  (e: 'open'): void
  (e: 'save'): void
  (e: 'saveAs'): void
  (e: 'toggleSidebar'): void
  (e: 'toggleNote'): void
  (e: 'theme', name: string): void
  (e: 'import', kind: string): void
  (e: 'export', kind: string): void
}>()

const IMPORT_ITEMS = [
  { kind: 'md', label: 'Markdown (.md)' },
  { kind: 'xmind', label: 'XMind (.xmind)' },
  { kind: 'opml', label: 'OPML (.opml)' },
]
const EXPORT_ITEMS = [
  { kind: 'png', label: 'PNG 图片' },
  { kind: 'jpg', label: 'JPG 图片' },
  { kind: 'svg', label: 'SVG 矢量图' },
  { kind: 'pdf', label: 'PDF(A4 自动缩放）' },
  { kind: 'md', label: 'Markdown' },
  { kind: 'xmind', label: 'XMind' },
  { kind: 'opml', label: 'OPML' },
]

const openMenu = ref<'' | 'import' | 'export' | 'format'>('')

function toggle(name: typeof openMenu.value) {
  openMenu.value = openMenu.value === name ? '' : name
}

function onDocMousedown(e: MouseEvent) {
  if (!openMenu.value) return
  // 格式面板是跟着画布选中状态实时联动的编辑器:点节点(含 Ctrl 多选)不该关掉它
  if (openMenu.value === 'format') return
  const el = e.target as HTMLElement | null
  if (el?.closest?.('.tb-pop')) return
  openMenu.value = ''
}

function onThemeChange(e: Event) {
  emit('theme', (e.target as HTMLSelectElement).value)
}

function pickImport(kind: string) {
  openMenu.value = ''
  emit('import', kind)
}

function pickExport(kind: string) {
  openMenu.value = ''
  emit('export', kind)
}

onMounted(() => window.addEventListener('mousedown', onDocMousedown, true))
onBeforeUnmount(() => window.removeEventListener('mousedown', onDocMousedown, true))
</script>

<template>
  <div class="toolbar">
    <div class="left">
      <button
        class="icon-btn"
        :title="sidebarVisible ? '隐藏侧边栏' : '显示侧边栏'"
        @click="emit('toggleSidebar')"
      >
        {{ sidebarVisible ? '«' : '»' }}
      </button>
      <button
        class="icon-btn"
        :title="noteVisible ? '隐藏备注栏' : '显示备注栏'"
        @click="emit('toggleNote')"
      >
        备注
      </button>
      <span class="file-name">{{ title }}<i v-if="dirty" class="dot">●</i></span>
    </div>
    <div class="actions">
      <div class="tb-pop">
        <button
          :class="{ active: openMenu === 'format' }"
          title="编辑选中节点的字体、颜色等样式"
          @click="toggle('format')"
        >
          格式
        </button>
        <div v-if="openMenu === 'format'" class="pop-panel">
          <FormatPanel :mind-map="mindMap" :nodes="nodes" @close="openMenu = ''" />
        </div>
      </div>
      <select class="theme-select" :value="theme" title="主题" @change="onThemeChange">
        <option v-if="theme === 'custom'" value="custom">自定义(来自文件)</option>
        <option v-for="p in themePresets" :key="p.name" :value="p.name">
          {{ p.label }}
        </option>
      </select>
      <button @click="emit('open')">打开</button>
      <button @click="emit('save')">保存</button>
      <button @click="emit('saveAs')">另存为</button>
      <div class="tb-pop">
        <button :class="{ active: openMenu === 'import' }" @click="toggle('import')">
          导入 ▾
        </button>
        <ul v-if="openMenu === 'import'" class="pop-menu">
          <li v-for="i in IMPORT_ITEMS" :key="i.kind" @click="pickImport(i.kind)">{{ i.label }}</li>
        </ul>
      </div>
      <div class="tb-pop">
        <button :class="{ active: openMenu === 'export' }" @click="toggle('export')">
          导出 ▾
        </button>
        <ul v-if="openMenu === 'export'" class="pop-menu">
          <li v-for="i in EXPORT_ITEMS" :key="i.kind" @click="pickExport(i.kind)">{{ i.label }}</li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 46px;
  padding: 0 12px;
  border-bottom: 1px solid var(--hairline);
  background: var(--bar);
  flex-shrink: 0;
}
.left {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.actions {
  display: flex;
  gap: 4px;
  align-items: center;
}
/* mac 工具栏:控件不带描边,靠悬停底色表态 */
button,
.icon-btn {
  font-size: var(--fs-md);
  padding: 5px 11px;
  border: 1px solid transparent;
  border-radius: var(--r-md);
  background: transparent;
  color: var(--text);
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}
.icon-btn {
  padding: 5px 9px;
  color: var(--text2);
}
button:hover,
.icon-btn:hover {
  background: var(--hover);
}
button:active,
.icon-btn:active {
  background: var(--pressed);
}
button:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: -2px;
}
button.active {
  background: var(--tint);
  color: var(--accent);
}
.file-name {
  margin-left: 4px;
  font-size: var(--fs-md);
  font-weight: 600;
  color: var(--text);
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}
.dot {
  color: #f5a623;
  font-style: normal;
  font-size: 10px;
}
.theme-select {
  font-size: var(--fs-md);
  padding: 5px 8px;
  border: 1px solid var(--hairline);
  background: var(--elev);
  border-radius: var(--r-md);
  cursor: pointer;
  color: var(--text);
}
.theme-select:hover {
  border-color: var(--text2);
}
.theme-select:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: -2px;
}
.tb-pop {
  position: relative;
}
.pop-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 30;
  min-width: 168px;
  margin: 0;
  padding: 5px;
  list-style: none;
  background: var(--elev);
  border: 1px solid var(--hairline-soft);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-pop);
}
.pop-menu li {
  padding: 6px 10px;
  font-size: var(--fs-md);
  color: var(--text);
  border-radius: var(--r-sm);
  cursor: pointer;
  white-space: nowrap;
}
/* 菜单项整行高亮成主题色,是 mac 菜单最明显的特征 */
.pop-menu li:hover {
  background: var(--accent);
  color: #fff;
}
.pop-panel {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 30;
}
</style>
