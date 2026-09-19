import { onBeforeUnmount, onMounted, shallowRef, type Ref } from 'vue'
import MindMap from 'simple-mind-map'
import Export from 'simple-mind-map/src/plugins/Export.js'
import Select from 'simple-mind-map/src/plugins/Select.js'
import Drag from 'simple-mind-map/src/plugins/Drag.js'
import KeyboardNavigation from 'simple-mind-map/src/plugins/KeyboardNavigation.js'
import { themePresets } from './themes'

MindMap.usePlugin(Export)
  .usePlugin(Select)
  .usePlugin(Drag)
  .usePlugin(KeyboardNavigation)

// 构造函数与 setData 期望的是"根节点树",而非 {layout,root,theme,view} 外层包装
export const defaultData = {
  data: { text: '根节点', expand: true },
  children: [
    {
      data: { text: '二级节点1', expand: true },
      children: [
        { data: { text: '三级节点1', expand: true }, children: [] },
        { data: { text: '三级节点2', expand: true }, children: [] },
      ],
    },
    { data: { text: '二级节点2', expand: true }, children: [] },
  ],
}

// 完成标记的尺寸。库内置图标只会排在文本*之前*,所以"节点后方的对勾"
// 只能用 createNodePostfixContent(后置内容)自己画。
const DONE_MARK_SIZE = 16
// 行内样式:导出 PNG/SVG 时不会带上应用样式表,写在 class 里的样式会丢
const DONE_MARK_STYLE = [
  `width:${DONE_MARK_SIZE}px`,
  `height:${DONE_MARK_SIZE}px`,
  'display:flex',
  'align-items:center',
  'justify-content:center',
  'box-sizing:border-box',
  'border-radius:50%',
  'background:#22c55e',
  'color:#ffffff',
  'font-size:11px',
  'line-height:1',
  "font-family:'Segoe UI Symbol','Microsoft YaHei',sans-serif",
  'pointer-events:none',
].join(';')

function createDoneMark() {
  const el = document.createElement('div')
  el.className = 'smm-done-mark'
  el.setAttribute('style', DONE_MARK_STYLE)
  el.textContent = '✓'
  return { el, width: DONE_MARK_SIZE, height: DONE_MARK_SIZE }
}

export function useMindMap(el: Ref<HTMLElement | undefined>) {
  const mindMap = shallowRef<any>(null)
  let observer: ResizeObserver | null = null

  onMounted(() => {
    const node = el.value
    if (!node) return
    // 样式表可能晚于模块脚本生效,此时容器尺寸为 0,
    // MindMap 构造会抛"宽高不能为0"。等容器真正有尺寸再初始化。
    observer = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect
      if (mindMap.value || rect.width === 0 || rect.height === 0) return
      mindMap.value = new MindMap({
        el: node,
        data: defaultData,
        // 备注泡泡:缩小图标,配合 CSS 固定到节点右上角
        noteIcon: { style: { size: 12, color: '#f5a623' } },
        // 节点后置内容:右键标记"已完成"的节点,在文本后方显示对勾
        createNodePostfixContent: (node: any) =>
          node.getData('done') ? createDoneMark() : null,
      })
      // 启动即应用"默认(浅)"预设,而非库内置的绿/加粗样式
      mindMap.value.setTheme('default')
      mindMap.value.setThemeConfig(themePresets[0].config)
      observer?.disconnect()
      observer = null
    })
    observer.observe(node)
  })

  onBeforeUnmount(() => {
    observer?.disconnect()
    observer = null
    mindMap.value?.destroy()
    mindMap.value = null
  })

  return { mindMap }
}
