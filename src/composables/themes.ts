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

export const themePresets: ThemePreset[] = [
  preset(
    'default',
    '默认(浅)',
    {
      backgroundColor: '#fafafa',
      lineColor: '#000000',
      generalizationLineColor: '#000000',
      root: {
        fillColor: '#ffffff',
        color: '#000000',
        fontWeight: 'normal',
        fontSize: 18,
        borderColor: '#000000',
        borderWidth: 1,
      },
      second: {
        fillColor: '#ffffff',
        color: '#333333',
        fontSize: 16,
        borderColor: '#000000',
        borderWidth: 1,
      },
      node: {
        fillColor: '#ffffff',
        color: '#333333',
        fontSize: 14,
        borderColor: '#000000',
        borderWidth: 1,
      },
    },
  ),
  preset(
    'dark',
    '深色',
    {
      backgroundColor: '#1e1e1e',
      lineColor: '#4a90d9',
      root: { fillColor: '#2d2d2d', color: '#e8e8e8', borderColor: '#4a90d9', borderWidth: 1 },
      second: { fillColor: '#2d2d2d', color: '#cfcfcf', borderColor: '#4a4a4a', borderWidth: 1 },
      node: { color: '#b5b5b5' },
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
