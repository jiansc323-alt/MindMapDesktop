<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ x: number; y: number; done: boolean }>()
const emit = defineEmits<{
  (e: 'toggle'): void
  (e: 'close'): void
}>()

// 靠近视口右/下边缘时收进来,避免菜单弹到屏幕外
const MENU_W = 150
const MENU_H = 44
const left = computed(() => Math.max(4, Math.min(props.x, window.innerWidth - MENU_W)))
const top = computed(() => Math.max(4, Math.min(props.y, window.innerHeight - MENU_H)))
</script>

<template>
  <div class="ctx-menu" :style="{ left: left + 'px', top: top + 'px' }">
    <button class="ctx-item" @click="emit('toggle')">
      {{ done ? '取消完成标记' : '标记为已完成' }}
    </button>
  </div>
</template>

<style scoped>
.ctx-menu {
  position: fixed;
  z-index: 1000;
  min-width: 150px;
  padding: 5px;
  background: var(--elev);
  border: 1px solid var(--hairline-soft);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-pop);
}
.ctx-item {
  display: block;
  width: 100%;
  padding: 6px 10px;
  font-size: var(--fs-md);
  text-align: left;
  color: var(--text);
  background: none;
  border: none;
  border-radius: var(--r-sm);
  cursor: pointer;
}
.ctx-item:hover {
  background: var(--accent);
  color: #fff;
}
</style>
