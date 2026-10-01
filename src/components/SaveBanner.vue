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
      <button class="sb-primary" @click="emit('retry')">重试保存</button>
      <button @click="emit('saveAs')">另存为副本</button>
      <button class="sb-ghost" title="允许切换到其他文档,这份未保存的改动会丢失" @click="emit('discard')">
        仍要切换(丢弃)
      </button>
    </span>
  </div>
</template>

<style scoped>
/* 浮在画布上方的圆角提示条:不参与布局,免得画布尺寸变了要重排 */
.save-banner {
  position: absolute;
  top: 10px;
  left: 10px;
  right: 10px;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px;
  background: var(--danger-bg);
  border: 1px solid var(--danger-line);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-pop);
  color: var(--danger-fg);
  font-size: var(--fs-sm);
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
  border: 1px solid var(--danger-line);
  background: transparent;
  color: var(--danger-fg);
  border-radius: var(--r-md);
  padding: 3px 10px;
  cursor: pointer;
  font-size: var(--fs-sm);
}
.sb-actions button:hover {
  background: var(--hover);
}
.sb-primary {
  border-color: var(--danger) !important;
  background: var(--danger) !important;
  color: #fff !important;
  font-weight: 600;
}
.sb-primary:hover {
  filter: brightness(0.92);
}
.sb-ghost {
  border-color: transparent !important;
  opacity: 0.75;
}
</style>
