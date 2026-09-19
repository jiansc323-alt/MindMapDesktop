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
  height: 44px;
  padding: 0 12px;
  border-bottom: 1px solid #e5e5e5;
  background: #fafafa;
  flex-shrink: 0;
}
.left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.icon-btn {
  border: 1px solid #d0d0d0;
  background: #fff;
  border-radius: 4px;
  cursor: pointer;
  color: #666;
  font-size: 13px;
  line-height: 1;
  padding: 5px 8px;
}
.icon-btn:hover {
  border-color: #409eff;
  color: #409eff;
}
.file-name {
  font-size: 13px;
  color: #333;
  display: flex;
  align-items: center;
  gap: 6px;
}
.dot {
  color: #f5a623;
  font-style: normal;
  font-size: 10px;
}
.actions {
  display: flex;
  gap: 8px;
  align-items: center;
}
.theme-select {
  font-size: 13px;
  padding: 5px 8px;
  border: 1px solid #d0d0d0;
  background: #fff;
  border-radius: 4px;
  cursor: pointer;
  color: #333;
}
.theme-select:hover {
  border-color: #409eff;
}
button {
  font-size: 13px;
  padding: 5px 12px;
  border: 1px solid #d0d0d0;
  background: #fff;
  border-radius: 4px;
  cursor: pointer;
}
button:hover {
  border-color: #409eff;
  color: #409eff;
}
button.active {
  border-color: #409eff;
  color: #409eff;
  background: #eef5ff;
}
.tb-pop {
  position: relative;
}
.pop-menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 30;
  min-width: 150px;
  margin: 0;
  padding: 4px 0;
  list-style: none;
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);
}
.pop-menu li {
  padding: 6px 12px;
  font-size: 13px;
  color: #333;
  cursor: pointer;
  white-space: nowrap;
}
.pop-menu li:hover {
  background: #eef5ff;
  color: #409eff;
}
.pop-panel {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 30;
}
</style>
