<script setup lang="ts">
defineProps<{ path: string; error: string }>()
const emit = defineEmits<{ (e: 'retry'): void; (e: 'saveAs'): void; (e: 'discard'): void }>()
</script>

<template>
  <div class="save-banner">
    <span class="sb-text">
      <b>{{ path }}</b> 没能保存:{{ error }}。改动仍在内存里,这份文档不会被切换掉。
    </span>
    <span class="sb-actions">
      <button @click="emit('retry')">重试保存</button>
      <button @click="emit('saveAs')">另存为副本</button>
      <button class="sb-ghost" title="允许切换到其他文档,这份未保存的改动会丢失" @click="emit('discard')">
        仍要切换(丢弃)
      </button>
    </span>
  </div>
</template>

<style scoped>
/* 浮在画布上方,不参与布局,免得画布尺寸变了要重排 */
.save-banner {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 12px;
  background: #fdecec;
  border-bottom: 1px solid #f0b9b9;
  color: #a12622;
  font-size: 12.5px;
}
.sb-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sb-actions {
  display: flex;
  gap: 6px;
  flex: none;
}
.sb-actions button {
  border: 1px solid #d98b86;
  background: #fff;
  color: #a12622;
  border-radius: 4px;
  padding: 2px 8px;
  cursor: pointer;
  font-size: 12.5px;
}
.sb-actions button:hover {
  background: #fbe0df;
}
.sb-ghost {
  border-color: #e0c5c4 !important;
  color: #8a6b68 !important;
}
</style>
