// 位图类导出(PDF / JPG)。核心库自带的 PDF 实现把页面尺寸设成图片的像素尺寸,
// 导图一大就生成几十英寸的"超大单页";jpg 则因为 canvas.toDataURL 不认
// image/jpg 这个 MIME,Chromium 会退回 PNG,得到扩展名为 .jpg 的 PNG 文件。
// 两者都在这里自己产出,顺带少一次栅格化。
import { PDFDocument } from 'pdf-lib'
import { dataUrlToBase64 } from './transfer'

const A4_PT = { width: 595.28, height: 841.89 }
const MARGIN_PT = 24
const JPEG_QUALITY = 0.92

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('导图位图加载失败'))
    img.src = src
  })
}

function base64ToBytes(base64: string): Uint8Array {
  const bin = atob(base64)
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

// 分块转二进制:btoa 的入参太长会爆栈
function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(bin)
}

// A4 页面 + 页边距内等比居中。图片按原生分辨率嵌入,缩放发生在 PDF 里,不重采样
export async function exportPdf(mindMap: any, name: string): Promise<string> {
  const png = await mindMap.export('png', false, name)
  const doc = await PDFDocument.create()
  const embedded = await doc.embedPng(base64ToBytes(dataUrlToBase64(png)))
  // 横图用横向 A4,竖图/方图用纵向
  const landscape = embedded.width > embedded.height
  const pageW = landscape ? A4_PT.height : A4_PT.width
  const pageH = landscape ? A4_PT.width : A4_PT.height
  const page = doc.addPage([pageW, pageH])
  const scale = Math.min(
    (pageW - MARGIN_PT * 2) / embedded.width,
    (pageH - MARGIN_PT * 2) / embedded.height
  )
  const w = embedded.width * scale
  const h = embedded.height * scale
  page.drawImage(embedded, { x: (pageW - w) / 2, y: (pageH - h) / 2, width: w, height: h })
  return bytesToBase64(await doc.save())
}

export async function exportJpeg(mindMap: any, name: string): Promise<string> {
  const png = await mindMap.export('png', false, name)
  const img = await loadImage(png)
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建画布')
  // JPEG 没有透明通道,先铺白底(导图本身带背景色,这里只是兜底)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0)
  return dataUrlToBase64(canvas.toDataURL('image/jpeg', JPEG_QUALITY))
}
