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
/* mac 源列表:行是带圆角的胶囊,不贴边 */
.sidebar {
  width: 224px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--hairline);
  background: var(--bar);
  overflow: hidden;
}
.sidebar-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 38px;
  padding: 0 8px 0 12px;
  font-size: var(--fs-sm);
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--text2);
  flex-shrink: 0;
}
.hide-btn {
  border: none;
  background: none;
  cursor: pointer;
  color: var(--text3);
  font-size: 14px;
  line-height: 1;
  padding: 3px 6px;
  border-radius: var(--r-sm);
}
.hide-btn:hover {
  background: var(--hover);
  color: var(--text);
}
.recent-list {
  list-style: none;
  margin: 0;
  padding: 0 7px 8px;
  overflow-y: auto;
  flex: 1;
}
.recent-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 8px;
  margin-bottom: 2px;
  border-radius: var(--r-sm);
  cursor: pointer;
  user-select: none;
}
.recent-item:hover {
  background: var(--hover);
}
.recent-item:active {
  background: var(--pressed);
}
.recent-item .name {
  font-size: var(--fs-md);
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.recent-item .dir {
  font-size: var(--fs-xs);
  color: var(--text3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.empty {
  padding: 16px 12px;
  font-size: var(--fs-sm);
  color: var(--text3);
}
</style>
