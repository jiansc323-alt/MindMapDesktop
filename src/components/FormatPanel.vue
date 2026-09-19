<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{ mindMap: any; nodes: any[] }>()
const emit = defineEmits<{ (e: 'close'): void }>()

// 库把每个样式键直接写在节点数据上,主题里 fontFamily 用的是"中文, 英文"双名格式
const FONTS = [
  '微软雅黑, Microsoft YaHei',
  '宋体, SimSun',
  '黑体, SimHei',
  '楷体, KaiTi',
  'Arial',
  'Times New Roman',
  'Verdana',
  'Consolas',
  'Courier New',
]
const BORDER_WIDTHS = [0, 1, 2, 3, 5]

const style = ref<Record<string, any>>({})
const hasNode = computed(() => props.nodes.length > 0)
const multi = computed(() => props.nodes.length > 1)

function read() {
  const node = props.nodes[0]
  if (!node) {
    style.value = {}
    return
  }
  style.value = {
    fontWeight: node.getStyle('fontWeight') || 'normal',
    fontStyle: node.getStyle('fontStyle') || 'normal',
    fontSize: Number(node.getStyle('fontSize')) || 14,
    fontFamily: node.getStyle('fontFamily') || '',
    color: node.getStyle('color') || '',
    fillColor: node.getStyle('fillColor') || '',
    borderColor: node.getStyle('borderColor') || '',
    borderWidth: Number(node.getStyle('borderWidth')) || 0,
  }
}

// SET_NODE_STYLE 每调一次进一条撤销记录,所以取色器绑定 change 而非 input:
// 后者在取色面板里拖动会连发,撤销栈会被上百条中间值灌满
function apply(prop: string, value: any) {
  const mm = props.mindMap
  if (!mm) return
  // SET_NODE_STYLE 只接受单个节点,多选时逐个下发
  for (const node of props.nodes) mm.execCommand('SET_NODE_STYLE', node, prop, value)
  read()
}

// 三级及以下节点默认边框宽度为 0,只改颜色会"看不出效果"
function applyBorderColor(value: string) {
  apply('borderColor', value)
  if (value && !style.value.borderWidth) apply('borderWidth', 1)
}

function stepFontSize(delta: number) {
  const next = Math.min(96, Math.max(8, (Number(style.value.fontSize) || 14) + delta))
  apply('fontSize', next)
}

function resetStyles() {
  const mm = props.mindMap
  if (!mm) return
  for (const node of props.nodes) mm.execCommand('REMOVE_CUSTOM_STYLES', node)
  read()
}

// <input type=color> 只接受 #rrggbb,主题里的值可能是 #fff / transparent / rgb()
function toHex(value: string, fallback: string): string {
  const v = String(value || '').trim().toLowerCase()
  if (/^#[0-9a-f]{6}$/.test(v)) return v
  if (/^#[0-9a-f]{3}$/.test(v)) {
    return '#' + v.slice(1).split('').map((c) => c + c).join('')
  }
  const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(v)
  if (m) {
    return '#' + [1, 2, 3].map((i) => Number(m[i]).toString(16).padStart(2, '0')).join('')
  }
  return fallback
}

const pickers = computed(() => ({
  color: toHex(style.value.color, '#333333'),
  fillColor: toHex(style.value.fillColor, '#ffffff'),
  borderColor: toHex(style.value.borderColor, '#549688'),
}))

function toggle(prop: string, onValue: string) {
  apply(prop, style.value[prop] === onValue ? 'normal' : onValue)
}

watch(() => props.nodes, read)
onMounted(() => {
  read()
  const mm = props.mindMap
  // 撤销/重做或右键改动后回显要跟上
  mm?.on('data_change', read)
  mm?.on('back_forward', read)
})
onBeforeUnmount(() => {
  const mm = props.mindMap
  mm?.off('data_change', read)
  mm?.off('back_forward', read)
})
</script>

<template>
  <div class="format-panel">
    <div class="fp-head">
      <span>格式</span>
      <button class="fp-close" title="关闭" @click="emit('close')">×</button>
    </div>

    <div v-if="!hasNode" class="fp-empty">
      请先在画布上选择一个节点<br />
      <small>按住 Ctrl 点击可多选,改动会批量应用</small>
    </div>

    <template v-else>
      <div class="fp-group">
        <div class="fp-label">文本</div>
        <div class="fp-row">
          <button
            class="fp-tog"
            :class="{ on: style.fontWeight === 'bold' }"
            title="加粗"
            @click="toggle('fontWeight', 'bold')"
          >
            <b>B</b>
          </button>
          <button
            class="fp-tog"
            :class="{ on: style.fontStyle === 'italic' }"
            title="斜体"
            @click="toggle('fontStyle', 'italic')"
          >
            <i>I</i>
          </button>
          <div class="fp-stepper">
            <button title="减小字号" @click="stepFontSize(-1)">−</button>
            <input
              type="number"
              min="8"
              max="96"
              :value="style.fontSize"
              @change="apply('fontSize', Number(($event.target as HTMLInputElement).value) || 14)"
            />
            <button title="增大字号" @click="stepFontSize(1)">+</button>
          </div>
        </div>
        <div class="fp-row">
          <select
            class="fp-font"
            :value="FONTS.includes(style.fontFamily) ? style.fontFamily : 'custom'"
            @change="
              ($event.target as HTMLSelectElement).value !== 'custom' &&
              apply('fontFamily', ($event.target as HTMLSelectElement).value)
            "
          >
            <option v-for="f in FONTS" :key="f" :value="f">{{ f.split(',')[0] }}</option>
            <option value="custom">自定义…</option>
          </select>
          <label class="fp-color">
            <input type="color" :value="pickers.color" @change="apply('color', ($event.target as HTMLInputElement).value)" />
            <span>文字色</span>
          </label>
        </div>
        <input
          v-if="!FONTS.includes(style.fontFamily)"
          class="fp-text"
          placeholder="字体名,如 华文中宋, STZhongsong"
          :value="style.fontFamily"
          @change="apply('fontFamily', ($event.target as HTMLInputElement).value)"
        />
      </div>

      <div class="fp-group">
        <div class="fp-label">节点</div>
        <div class="fp-row">
          <label class="fp-color">
            <input type="color" :value="pickers.fillColor" @change="apply('fillColor', ($event.target as HTMLInputElement).value)" />
            <span>填充色</span>
          </label>
          <label class="fp-color">
            <input type="color" :value="pickers.borderColor" @change="applyBorderColor(($event.target as HTMLInputElement).value)" />
            <span>边框色</span>
          </label>
        </div>
        <div class="fp-row">
          <span class="fp-sub">边框宽度</span>
          <select
            class="fp-width"
            :value="style.borderWidth"
            @change="apply('borderWidth', Number(($event.target as HTMLSelectElement).value))"
          >
            <option v-for="w in BORDER_WIDTHS" :key="w" :value="w">{{ w }}</option>
          </select>
        </div>
      </div>

      <div class="fp-foot">
        <button @click="resetStyles">恢复默认样式</button>
        <span v-if="multi" class="fp-count">已选 {{ nodes.length }} 个节点</span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.format-panel {
  width: 260px;
  padding: 0 0 10px;
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);
  font-size: 13px;
  color: #333;
}
.fp-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-bottom: 1px solid #f0f0f0;
  font-weight: 600;
}
.fp-close {
  border: none;
  background: none;
  cursor: pointer;
  color: #999;
  font-size: 16px;
  line-height: 1;
  padding: 0 2px;
}
.fp-close:hover {
  color: #409eff;
}
.fp-empty {
  padding: 18px 12px;
  color: #999;
  line-height: 1.7;
  text-align: center;
}
.fp-group {
  padding: 8px 10px;
  border-bottom: 1px solid #f5f5f5;
}
.fp-label {
  color: #999;
  font-size: 12px;
  margin-bottom: 6px;
}
.fp-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  flex-wrap: wrap;
}
.fp-row:last-child {
  margin-bottom: 0;
}
.fp-tog {
  width: 30px;
  height: 26px;
  border: 1px solid #d8d8d8;
  background: #fff;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
}
.fp-tog.on {
  border-color: #409eff;
  background: #eef5ff;
  color: #409eff;
}
.fp-stepper {
  display: flex;
  align-items: center;
  margin-left: auto;
}
.fp-stepper button {
  width: 24px;
  height: 26px;
  border: 1px solid #d8d8d8;
  background: #fff;
  cursor: pointer;
  border-radius: 0;
}
.fp-stepper button:first-child {
  border-radius: 4px 0 0 4px;
}
.fp-stepper button:last-child {
  border-radius: 0 4px 4px 0;
}
.fp-stepper input {
  width: 44px;
  height: 26px;
  border: 1px solid #d8d8d8;
  border-left: none;
  border-right: none;
  text-align: center;
  font-size: 13px;
}
.fp-font,
.fp-width,
.fp-text {
  border: 1px solid #d8d8d8;
  border-radius: 4px;
  background: #fff;
  font-size: 13px;
  padding: 4px 6px;
  color: #333;
}
.fp-font {
  flex: 1;
  min-width: 0;
}
.fp-text {
  width: 100%;
  margin-top: 6px;
  box-sizing: border-box;
}
.fp-color {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  color: #666;
}
.fp-color input[type='color'] {
  width: 26px;
  height: 26px;
  padding: 0;
  border: 1px solid #d8d8d8;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
}
.fp-sub {
  color: #999;
  font-size: 12px;
}
.fp-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px 0;
}
.fp-count {
  color: #409eff;
  font-size: 12px;
}
</style>
