/** Compress + crop images for profile / web-friendly delivery. */

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

/**
 * Crop a square region from the source image and compress to profile size.
 * crop is in natural image coordinates (x, y, size).
 */
export async function cropAndCompress(
  src: string,
  crop: CropRect,
  outSize = PROFILE_SIZE,
  quality = JPEG_QUALITY,
): Promise<string> {
  const img = await loadImage(src)
  const canvas = document.createElement('canvas')
  canvas.width = outSize
  canvas.height = outSize
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  const sx = Math.max(0, Math.min(crop.x, img.naturalWidth - 1))
  const sy = Math.max(0, Math.min(crop.y, img.naturalHeight - 1))
  const ss = Math.max(1, Math.min(crop.size, img.naturalWidth - sx, img.naturalHeight - sy))
  ctx.drawImage(img, sx, sy, ss, ss, 0, 0, outSize, outSize)
  return canvas.toDataURL('image/jpeg', quality)
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
  const img = await loadImage(src)
  const crop = defaultCenterCrop(img.naturalWidth, img.naturalHeight)
  return cropAndCompress(src, crop)
}

const CHAT_MAX_EDGE = 1600
const CHAT_JPEG_QUALITY = 0.78

/**
 * Compress an image for chat/web without cropping.
 * Scales down so the longest edge is at most CHAT_MAX_EDGE, keeps aspect ratio.
 */
export async function compressForWeb(
  file: File,
  maxEdge = CHAT_MAX_EDGE,
  quality = CHAT_JPEG_QUALITY,
): Promise<string> {
  const src = await fileToDataUrl(file)
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
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, outW, outH)
  return canvas.toDataURL('image/jpeg', quality)
}
