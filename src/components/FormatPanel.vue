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
  width: 264px;
  padding: 0 0 10px;
  background: var(--elev);
  border: 1px solid var(--hairline-soft);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-pop);
  font-size: var(--fs-md);
  color: var(--text);
}
.fp-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 12px;
  border-bottom: 1px solid var(--hairline-soft);
  font-weight: 600;
}
.fp-close {
  border: none;
  background: none;
  cursor: pointer;
  color: var(--text3);
  font-size: 17px;
  line-height: 1;
  padding: 0 4px;
  border-radius: var(--r-sm);
}
.fp-close:hover {
  background: var(--hover);
  color: var(--text);
}
.fp-empty {
  padding: 20px 14px;
  color: var(--text2);
  line-height: 1.7;
  text-align: center;
}
.fp-empty small {
  color: var(--text3);
  font-size: var(--fs-sm);
}
.fp-group {
  padding: 9px 12px;
  border-bottom: 1px solid var(--hairline-soft);
}
.fp-label {
  color: var(--text2);
  font-size: var(--fs-sm);
  font-weight: 600;
  letter-spacing: 0.02em;
  margin-bottom: 7px;
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
  height: 28px;
  border: 1px solid var(--hairline);
  background: var(--elev);
  border-radius: var(--r-sm);
  cursor: pointer;
  font-size: var(--fs-md);
  color: var(--text);
}
.fp-tog:hover {
  background: var(--hover);
}
.fp-tog.on {
  border-color: var(--accent);
  background: var(--tint);
  color: var(--accent);
}
.fp-stepper {
  display: flex;
  align-items: center;
  margin-left: auto;
  border: 1px solid var(--hairline);
  border-radius: var(--r-md);
  overflow: hidden;
}
.fp-stepper button {
  width: 24px;
  height: 26px;
  border: none;
  background: transparent;
  color: var(--text2);
  cursor: pointer;
  font-size: var(--fs-md);
}
.fp-stepper button:hover {
  background: var(--hover);
  color: var(--text);
}
.fp-stepper input {
  width: 44px;
  height: 26px;
  border: none;
  border-left: 1px solid var(--hairline-soft);
  border-right: 1px solid var(--hairline-soft);
  text-align: center;
  font-size: var(--fs-md);
  color: var(--text);
  background: transparent;
  outline: none;
}
.fp-font,
.fp-width,
.fp-text {
  border: 1px solid var(--hairline);
  border-radius: var(--r-md);
  background: var(--elev);
  font-size: var(--fs-md);
  padding: 4px 7px;
  color: var(--text);
}
.fp-font:focus-visible,
.fp-width:focus-visible,
.fp-text:focus-visible,
.fp-stepper input:focus-visible {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--tint);
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
  gap: 5px;
  cursor: pointer;
  color: var(--text2);
}
.fp-color input[type='color'] {
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid var(--hairline);
  border-radius: var(--r-sm);
  background: var(--elev);
  cursor: pointer;
}
.fp-color input[type='color']::-webkit-color-swatch-wrapper {
  padding: 2px;
}
.fp-color input[type='color']::-webkit-color-swatch {
  border: none;
  border-radius: 4px;
}
.fp-sub {
  color: var(--text2);
  font-size: var(--fs-sm);
}
.fp-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 12px 0;
}
.fp-foot button {
  border: 1px solid var(--hairline);
  background: var(--elev);
  color: var(--text);
  border-radius: var(--r-md);
  padding: 4px 10px;
  font-size: var(--fs-md);
  cursor: pointer;
}
.fp-foot button:hover {
  background: var(--hover);
}
.fp-count {
  color: var(--accent);
  font-size: var(--fs-sm);
}
</style>
