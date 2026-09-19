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
  width: 260px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-left: 1px solid #e5e5e5;
  background: #fafafa;
  overflow: hidden;
}
.note-head {
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
.note-input {
  flex: 1;
  margin: 8px;
  padding: 8px;
  font-size: 13px;
  line-height: 1.6;
  border: 1px solid #ddd;
  border-radius: 4px;
  resize: none;
  outline: none;
  font-family: inherit;
  color: #333;
  background: #fff;
}
.note-input:focus {
  border-color: #409eff;
}
.empty {
  padding: 16px 10px;
  font-size: 12px;
  color: #bbb;
}
</style>
