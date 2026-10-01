<script setup lang="ts">
defineProps<{ note: string; nodeName: string; hasNode: boolean }>()
const emit = defineEmits<{
  (e: 'input', text: string): void
  (e: 'hide'): void
}>()

function onInput(e: Event) {
  emit('input', (e.target as HTMLTextAreaElement).value)
}
</script>

<template>
  <aside class="note-sidebar">
    <div class="note-head">
      <span>备注{{ nodeName ? ' · ' + nodeName : '' }}</span>
      <button class="hide-btn" title="隐藏备注栏" @click="emit('hide')">»</button>
    </div>
    <textarea
      v-if="hasNode"
      class="note-input"
      :value="note"
      placeholder="输入备注内容,清空则移除备注"
      @input="onInput"
    ></textarea>
    <div v-else class="empty">请先选中一个节点</div>
  </aside>
</template>

<style scoped>
.note-sidebar {
  width: 268px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--hairline);
  background: var(--bar);
  overflow: hidden;
}
.note-head {
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
  overflow: hidden;
  white-space: nowrap;
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
  flex: none;
}
.hide-btn:hover {
  background: var(--hover);
  color: var(--text);
}
.note-input {
  flex: 1;
  margin: 0 10px 10px;
  padding: 8px 10px;
  font-size: var(--fs-md);
  line-height: 1.6;
  border: 1px solid var(--hairline);
  border-radius: var(--r-md);
  resize: none;
  outline: none;
  color: var(--text);
  background: var(--elev);
  caret-color: var(--accent);
}
.note-input::placeholder {
  color: var(--text3);
}
.note-input:focus-visible {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--tint);
}
.empty {
  padding: 16px 12px;
  font-size: var(--fs-sm);
  color: var(--text3);
}
</style>
