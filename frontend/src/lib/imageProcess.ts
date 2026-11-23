/** Compress + crop images for profile / web-friendly delivery.
 * GIFs are never rasterized (keeps animation).
 * PNG / WebP with alpha are exported as PNG (keeps transparency).
 */

export type CropRect = { x: number; y: number; size: number }

const PROFILE_SIZE = 512
const JPEG_QUALITY = 0.82

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not load image'))
    img.src = src
  })
}

/** Read a File as a data URL. */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = reject
    r.readAsDataURL(file)
  })
}

export function isGifFile(file: File): boolean {
  return file.type === 'image/gif' || /\.gif$/i.test(file.name || '')
}

export function isGifDataUrl(src: string): boolean {
  return /^data:image\/gif/i.test(src) || /\.gif(?:$|\?)/i.test(src)
}

/**
 * Rasterize the first frame of an image (including GIF) to a still PNG data URL.
 * Used so Pro users store/display a non-animated profile photo.
 */
export async function stillFrameDataUrl(src: string): Promise<string> {
  const img = await loadImage(src)
  const w = img.naturalWidth || img.width || 1
  const h = img.naturalHeight || img.height || 1
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')
  ctx.clearRect(0, 0, w, h)
  ctx.drawImage(img, 0, 0)
  return canvas.toDataURL('image/png')
}

function mimeFromDataUrl(src: string): string {
  const m = /^data:([^;,]+)/i.exec(src)
  return (m?.[1] || '').toLowerCase()
}

/** Prefer PNG when source has alpha or is already PNG/WebP; else JPEG. */
function exportCanvas(canvas: HTMLCanvasElement, src: string, quality = JPEG_QUALITY): string {
  const mime = mimeFromDataUrl(src)
  if (mime === 'image/png' || mime === 'image/webp' || mime === 'image/gif') {
    return canvas.toDataURL('image/png')
  }
  return canvas.toDataURL('image/jpeg', quality)
}

/**
 * Crop a square region from the source image and compress to profile size.
 * GIFs are returned unchanged so animation is preserved.
 */
export async function cropAndCompress(
  src: string,
  crop: CropRect,
  outSize = PROFILE_SIZE,
  quality = JPEG_QUALITY,
): Promise<string> {
  // Never flatten animated GIFs
  if (isGifDataUrl(src)) return src

  const img = await loadImage(src)
  const canvas = document.createElement('canvas')
  canvas.width = outSize
  canvas.height = outSize
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')
  // Clear to transparent so PNG alpha is preserved
  ctx.clearRect(0, 0, outSize, outSize)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  const sx = Math.max(0, Math.min(crop.x, img.naturalWidth - 1))
  const sy = Math.max(0, Math.min(crop.y, img.naturalHeight - 1))
  const ss = Math.max(1, Math.min(crop.size, img.naturalWidth - sx, img.naturalHeight - sy))
  ctx.drawImage(img, sx, sy, ss, ss, 0, 0, outSize, outSize)
  return exportCanvas(canvas, src, quality)
}

/** Default centered square crop covering the max square in the image. */
export function defaultCenterCrop(naturalW: number, naturalH: number): CropRect {
  const size = Math.min(naturalW, naturalH)
  return {
    x: Math.floor((naturalW - size) / 2),
    y: Math.floor((naturalH - size) / 2),
    size,
  }
}

/** Quick path: center-crop + compress without UI (fallback). */
export async function compressProfileImage(file: File): Promise<string> {
  const src = await fileToDataUrl(file)
  if (isGifFile(file) || isGifDataUrl(src)) return src
  const img = await loadImage(src)
  const crop = defaultCenterCrop(img.naturalWidth, img.naturalHeight)
  return cropAndCompress(src, crop)
}

const CHAT_MAX_EDGE = 1600
const CHAT_JPEG_QUALITY = 0.78

/**
 * Compress an image for chat/web without cropping.
 * GIFs are returned as the original data URL (animation + transparency intact).
 * PNG/WebP keep transparency via PNG export.
 */
export async function compressForWeb(
  file: File,
  maxEdge = CHAT_MAX_EDGE,
  quality = CHAT_JPEG_QUALITY,
): Promise<string> {
  const src = await fileToDataUrl(file)
  if (isGifFile(file) || isGifDataUrl(src)) return src

  const img = await loadImage(src)
  const w = img.naturalWidth
  const h = img.naturalHeight
  const scale = Math.min(1, maxEdge / Math.max(w, h))
  const outW = Math.max(1, Math.round(w * scale))
  const outH = Math.max(1, Math.round(h * scale))
  const canvas = document.createElement('canvas')
  canvas.width = outW
  canvas.height = outH
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')
  ctx.clearRect(0, 0, outW, outH)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, outW, outH)
  return exportCanvas(canvas, src, quality)
}
