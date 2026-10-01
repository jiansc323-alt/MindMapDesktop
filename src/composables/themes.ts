// 核心库仅内置 default 主题模板,其余主题通过自定义主题配置(setThemeConfig)实现。
// 配置键与 simple-mind-map/src/theme/default.js 一致。
export interface ThemePreset {
  name: string
  label: string
  config: Record<string, any>
}

// 节点间距。库默认 node.marginY 为 0,三级及以下节点上下几乎贴在一起,
// 所以由本客户端统一加大。实测净间距 = marginY + hoverRectPadding*2(默认 4):
// 二级 52px、三级及以下 24px(库默认为 44px / 8px)。
export const nodeSpacing = {
  second: { marginX: 100, marginY: 48 },
  node: { marginX: 50, marginY: 20 },
  generalization: { marginX: 100, marginY: 48 },
}

function mergeGroup(...groups: Record<string, any>[]) {
  const out: Record<string, any> = {}
  for (const g of groups) Object.assign(out, g || {})
  return out
}

// 把间距套到任意主题配置上(打开旧文件时也用它覆盖文件里存的小间距)
export function withNodeSpacing(config: Record<string, any>): Record<string, any> {
  return {
    ...config,
    second: mergeGroup(config.second, nodeSpacing.second),
    node: mergeGroup(config.node, nodeSpacing.node),
    generalization: mergeGroup(config.generalization, nodeSpacing.generalization),
  }
}

const preset = (name: string, label: string, config: Record<string, any>): ThemePreset => ({
  name,
  label,
  config: withNodeSpacing(config),
})

// mac 观感的两个预设共用一套"形状"参数:曲线连线、更大的节点圆角、更宽的内边距。
// 描边与连线取深灰近黑,比纯黑柔和,在浅色画布上仍是明确的线条。
const macShape = {
  lineStyle: 'curve',
  lineWidth: 1,
  paddingX: 14,
  paddingY: 6,
}
const macNodeRadius = { borderRadius: 8, hoverRectRadius: 8 }

export const themePresets: ThemePreset[] = [
  preset(
    'default',
    '默认(浅)',
    {
      ...macShape,
      backgroundColor: '#f5f5f7',
      lineColor: '#3a3a3c',
      generalizationLineColor: '#3a3a3c',
      root: {
        ...macNodeRadius,
        fillColor: '#ffffff',
        color: '#1d1d1f',
        // 根节点不加粗是本客户端的固定要求
        fontWeight: 'normal',
        fontSize: 18,
        borderColor: '#3a3a3c',
        borderWidth: 1,
      },
      second: {
        ...macNodeRadius,
        fillColor: '#ffffff',
        color: '#3a3a3c',
        fontSize: 16,
        borderColor: '#3a3a3c',
        borderWidth: 1,
      },
      // 三级及以下同样带边框,不能只靠连线区分层级
      node: {
        ...macNodeRadius,
        fillColor: '#ffffff',
        color: '#3a3a3c',
        fontSize: 14,
        borderColor: '#3a3a3c',
        borderWidth: 1,
      },
    },
  ),
  preset(
    'dark',
    '默认(深)',
    {
      ...macShape,
      backgroundColor: '#1e1f24',
      lineColor: '#98989d',
      generalizationLineColor: '#98989d',
      root: {
        ...macNodeRadius,
        fillColor: '#2c2d33',
        color: '#f5f5f7',
        fontWeight: 'normal',
        fontSize: 18,
        borderColor: '#98989d',
        borderWidth: 1,
      },
      second: {
        ...macNodeRadius,
        fillColor: '#2c2d33',
        color: '#e4e4e9',
        fontSize: 16,
        borderColor: '#636368',
        borderWidth: 1,
      },
      node: {
        ...macNodeRadius,
        fillColor: '#26272c',
        color: '#c7c7cc',
        fontSize: 14,
        borderColor: '#636368',
        borderWidth: 1,
      },
    },
  ),
  preset(
    'classic',
    '经典蓝',
    {
      backgroundColor: '#ffffff',
      lineColor: '#1a73e8',
      root: { fillColor: '#1a73e8', color: '#ffffff', borderColor: 'transparent', borderWidth: 0 },
      second: { fillColor: '#ffffff', color: '#1a73e8', borderColor: '#1a73e8', borderWidth: 1 },
      node: { color: '#5f6368' },
    },
  ),
  preset(
    'fresh',
    '清新绿',
    {
      backgroundColor: '#f0f7f4',
      lineColor: '#2e8b57',
      root: { fillColor: '#2e8b57', color: '#ffffff', borderColor: 'transparent', borderWidth: 0 },
      second: { fillColor: '#ffffff', color: '#2e8b57', borderColor: '#2e8b57', borderWidth: 1 },
      node: { color: '#55705f' },
    },
  ),
]

// 新建文档、以及 theme.config 为空的旧文件按系统深浅挑默认预设:
// 外壳是 CSS 媒体查询自动跟随的,画布是 JS 主题,只能在"选文档"这一刻决定。
export function systemIsDark(): boolean {
  return !!window.matchMedia?.('(prefers-color-scheme: dark)').matches
}

export function preferredPreset(): ThemePreset {
  return themePresets.find((p) => p.name === (systemIsDark() ? 'dark' : 'default')) ?? themePresets[0]
}
