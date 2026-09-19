import xmindParser from 'simple-mind-map/src/parse/xmind.js'
import markdownParser from 'simple-mind-map/src/parse/markdown.js'
import { buildOpml, opmlTitle, parseOpml } from './opml'

export interface NodeData {
  data: Record<string, any>
  children: NodeData[]
}

export const SMM_EXTENSIONS = ['smm', 'json']
export const IMPORT_EXTENSIONS = [...SMM_EXTENSIONS, 'md', 'xmind', 'opml']

export function extOf(p: string): string {
  return (p.replace(/\\/g, '/').split('/').pop() || '').split('.').pop()?.toLowerCase() || ''
}

export function isSmm(p: string): boolean {
  return SMM_EXTENSIONS.includes(extOf(p))
}

export function docTitle(p: string): string {
  const name = p.replace(/\\/g, '/').split('/').pop() || '未命名'
  return name.replace(/\.[^.]+$/, '')
}

// 一个 .smm 只能有一个根节点,多个顶层时补一个虚拟根,避免静默丢内容
function mergeRoots(roots: NodeData[], title: string): NodeData {
  const list = roots.filter(Boolean)
  if (!list.length) throw new Error('文件里没有可识别的节点')
  if (list.length === 1) return list[0]
  return { data: { text: title }, children: list }
}

// 核心库建节点时会把缺省的 expand 补成 true(MindMapNode)。md/xmind 的转换结果
// 不带 expand,补全发生在 setData 之后的渲染里,会被当成一次用户改动:
// 刚导入就判脏,接着自动保存又要弹"另存为"。所以在这里先把树补成最终形态。
export function withExpand(node: NodeData): NodeData {
  node.data = { expand: true, ...node.data }
  node.children = (node.children || []).filter(Boolean).map(withExpand)
  return node
}

const HEADING = /^(#{1,6})(\s+)/
const FENCE = /^\s*(```|~~~)/

// 统计顶层标题(# 一级)的数量,setext 式(=== 下划线)也算,用来判断是否已有单根
function countH1(lines: string[]): number {
  let inFence = false
  let count = 0
  for (const line of lines) {
    if (FENCE.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    if (/^#\s+[^#]/.test(line)) count++
    else if (/^={3,}\s*$/.test(line)) count++
  }
  return count
}

// 已有唯一 H1 就原样交给库;否则整体降一级并补一个虚拟根
function normalizeMarkdown(md: string, title: string): string {
  const lines = md.replace(/\r\n?/g, '\n').split('\n')
  if (countH1(lines) === 1) return lines.join('\n')
  let inFence = false
  const demoted = lines.map((line) => {
    if (FENCE.test(line)) {
      inFence = !inFence
      return line
    }
    if (inFence) return line
    // setext 的 === 已是最低可表达层级,不降级,靠虚拟根兜住
    return line.replace(HEADING, (m, hashes: string) => (hashes.length >= 6 ? m : '#' + m))
  })
  return `# ${title}\n\n${demoted.join('\n')}`
}

export function rootFromMarkdown(md: string, title: string): NodeData {
  const root = markdownParser.transformMarkdownTo(normalizeMarkdown(md, title))
  if (!root || !root.data) throw new Error('Markdown 里没有可识别的标题或列表')
  return withExpand(root)
}

export function markdownFromRoot(root: NodeData): string {
  return markdownParser.transformToMarkdown(root)
}

export async function rootFromXmind(buf: Uint8Array, title: string): Promise<NodeData> {
  // IPC 给出的是 Uint8Array<ArrayBufferLike>,Blob 只接受明确持有 ArrayBuffer 的视图
  const bytes = new Uint8Array(buf.byteLength)
  bytes.set(buf)
  // 多画布时把各画布的根主题并到一个虚拟主题下,parseXmindFile 只认单张画布
  const content = await xmindParser.parseXmindFile(new Blob([bytes]), (list: any[]) => ({
    rootTopic: {
      title,
      children: { attached: list.map((item) => item.rootTopic) },
    },
  }))
  const root = typeof content === 'string' ? JSON.parse(content) : content
  if (!root || !root.data) throw new Error('XMind 文件里没有可识别的主题')
  return withExpand(root)
}

export function rootFromOpml(xml: string, title: string): NodeData {
  return withExpand(mergeRoots(parseOpml(xml), title || opmlTitle(xml) || 'OPML 导入'))
}

export function opmlFromRoot(root: NodeData, title: string): string {
  return buildOpml(root, title)
}

// mindMap.export() 内部用 FileReader.readAsDataURL,统一剥掉前缀拿 base64
export function dataUrlToBase64(dataUrl: string): string {
  if (typeof dataUrl === 'string' && dataUrl.startsWith('data:')) {
    return dataUrl.slice(dataUrl.indexOf(',') + 1)
  }
  return dataUrl
}
