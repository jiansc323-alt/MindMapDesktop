<script setup lang="ts">
defineProps<{ items: string[] }>()
const emit = defineEmits<{
  (e: 'open', path: string): void
  (e: 'hide'): void
}>()

function baseName(p: string) {
  const name = p.replace(/\\/g, '/').split('/').pop() || p
  return name.replace(/\.(smm|json)$/i, '')
}

function dirName(p: string) {
  const parts = p.replace(/\\/g, '/').split('/')
  parts.pop()
  return parts.join('/')
}
</script>

<template>
  <aside class="sidebar">
    <div class="sidebar-head">
      <span>最近打开</span>
      <button class="hide-btn" title="隐藏侧边栏" @click="emit('hide')">«</button>
    </div>
    <ul v-if="items.length" class="recent-list">
      <li
        v-for="p in items"
        :key="p"
        class="recent-item"
        :title="p"
        @dblclick="emit('open', p)"
      >
        <span class="name">{{ baseName(p) }}</span>
        <span class="dir">{{ dirName(p) }}</span>
      </li>
    </ul>
    <div v-else class="empty">暂无最近文件</div>
  </aside>
</template>

<style scoped>
.sidebar {
  width: 220px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid #e5e5e5;
  background: #fafafa;
  overflow: hidden;
}
.sidebar-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 36px;
  padding: 0 10px;
  font-size: 13px;
  color: #666;
  border-bottom: 1px solid #eee;
  flex-shrink: 0;
}
.hide-btn {
  border: none;
  background: none;
  cursor: pointer;
  color: #999;
  font-size: 14px;
  line-height: 1;
  padding: 2px 4px;
}
.hide-btn:hover {
  color: #409eff;
}
.recent-list {
  list-style: none;
  margin: 0;
  padding: 6px 0;
  overflow-y: auto;
  flex: 1;
}
.recent-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 10px;
  cursor: pointer;
  user-select: none;
}
.recent-item:hover {
  background: #eef5ff;
}
.recent-item .name {
  font-size: 13px;
  color: #333;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.recent-item .dir {
  font-size: 11px;
  color: #aaa;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.empty {
  padding: 16px 10px;
  font-size: 12px;
  color: #bbb;
}
</style>
