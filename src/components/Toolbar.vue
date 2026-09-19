<script setup lang="ts">
import { themePresets } from '../composables/themes'

defineProps<{
  title: string
  dirty: boolean
  sidebarVisible: boolean
  theme: string
  noteVisible: boolean
}>()
const emit = defineEmits<{
  (e: 'open'): void
  (e: 'save'): void
  (e: 'saveAs'): void
  (e: 'exportPng'): void
  (e: 'toggleSidebar'): void
  (e: 'toggleNote'): void
  (e: 'theme', name: string): void
}>()

function onThemeChange(e: Event) {
  emit('theme', (e.target as HTMLSelectElement).value)
}
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
      <select class="theme-select" :value="theme" title="主题" @change="onThemeChange">
        <option v-if="theme === 'custom'" value="custom">自定义(来自文件)</option>
        <option v-for="p in themePresets" :key="p.name" :value="p.name">
          {{ p.label }}
        </option>
      </select>
      <button @click="emit('open')">打开</button>
      <button @click="emit('save')">保存</button>
      <button @click="emit('saveAs')">另存为</button>
      <button @click="emit('exportPng')">导出 PNG</button>
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
</style>
