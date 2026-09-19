// OPML 读写。simple-mind-map 不带 OPML,这里按 OPML 2.0 的最小骨架自实现:
// 只认 <outline text>...<outline> 的层级嵌套,忽略来源里的图标/状态等扩展属性。
import type { NodeData } from './transfer'

const esc = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

function outlineToNode(el: Element): NodeData {
  const text = el.getAttribute('text') ?? el.getAttribute('title') ?? ''
  const note = el.getAttribute('_note')
  const children: NodeData[] = []
  for (const child of Array.from(el.children)) {
    if (child.tagName.toLowerCase() === 'outline') children.push(outlineToNode(child))
  }
  const data: Record<string, any> = { text, expand: true }
  if (note) data.note = note
  return { data, children }
}

// 返回 body 下的所有顶层节点;OPML 允许多个,由调用方决定怎么并成单根
export function parseOpml(xml: string): NodeData[] {
  const doc = new DOMParser().parseFromString(xml, 'text/xml')
  const err = doc.querySelector('parsererror')
  if (err) throw new Error('OPML 解析失败:XML 格式不正确')
  const body = doc.querySelector('body')
  if (!body) throw new Error('OPML 解析失败:缺少 body 节点')
  return Array.from(body.children)
    .filter((el) => el.tagName.toLowerCase() === 'outline')
    .map(outlineToNode)
}

export function opmlTitle(xml: string): string {
  const doc = new DOMParser().parseFromString(xml, 'text/xml')
  return doc.querySelector('head > title')?.textContent?.trim() || ''
}

function nodeToOutline(node: NodeData, indent: number): string {
  const pad = '  '.repeat(indent)
  const attrs = [`text="${esc(String(node.data?.text ?? ''))}"`]
  if (node.data?.note) attrs.push(`_note="${esc(String(node.data.note))}"`)
  const children = (node.children || []).filter((c) => c && c.data)
  if (!children.length) return `${pad}<outline ${attrs.join(' ')} />\n`
  const inner = children.map((c) => nodeToOutline(c, indent + 1)).join('')
  return `${pad}<outline ${attrs.join(' ')}>\n${inner}${pad}</outline>\n`
}

export function buildOpml(root: NodeData, title: string): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<opml version="2.0">\n' +
    `  <head><title>${esc(title)}</title></head>\n` +
    '  <body>\n' +
    nodeToOutline(root, 2) +
    '  </body>\n' +
    '</opml>\n'
  )
}
