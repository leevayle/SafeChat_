import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Check, X, ZoomIn, ZoomOut } from 'lucide-react'
import { cropAndCompress, defaultCenterCrop, type CropRect } from '../lib/imageProcess'

type Props = {
  src: string
  onCancel: () => void
  onDone: (dataUrl: string) => void
  title?: string
}

/**
 * Circular profile cropper — pan + zoom, exports compressed JPEG.
 */
export function ImageCropper({ src, onCancel, onDone, title = 'Adjust photo' }: Props) {
  const [natural, setNatural] = useState({ w: 0, h: 0 })
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [busy, setBusy] = useState(false)
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)
  const viewSize = 280

  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      setNatural({ w: img.naturalWidth, h: img.naturalHeight })
      setZoom(1)
      setOffset({ x: 0, y: 0 })
    }
    img.src = src
  }, [src])

  const baseScale =
    natural.w && natural.h ? viewSize / Math.min(natural.w, natural.h) : 1
  const scale = baseScale * zoom
  const dispW = natural.w * scale
  const dispH = natural.h * scale

  // Image is centered then offset
  const imgLeft = (viewSize - dispW) / 2 + offset.x
  const imgTop = (viewSize - dispH) / 2 + offset.y

  const clampOffset = (ox: number, oy: number, z: number) => {
    const s = baseScale * z
    const dw = natural.w * s
    const dh = natural.h * s
    // Keep the crop circle fully covered by the image
    const minX = viewSize / 2 - dw + viewSize / 2
    const maxX = dw / 2 - viewSize / 2
    const minY = viewSize / 2 - dh + viewSize / 2
    const maxY = dh / 2 - viewSize / 2
    // Simpler clamp: image edges must not leave the circle empty
    const half = viewSize / 2
    const nx = Math.min(half, Math.max(-half + (viewSize - dw), ox))
    const ny = Math.min(half, Math.max(-half + (viewSize - dh), oy))
    // When image larger than view, allow full pan range
    if (dw >= viewSize) {
      const maxOffX = (dw - viewSize) / 2
      const maxOffY = (dh - viewSize) / 2
      return {
        x: Math.max(-maxOffX, Math.min(maxOffX, ox)),
        y: Math.max(-maxOffY, Math.min(maxOffY, oy)),
      }
    }
    return { x: nx, y: ny }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return
    const dx = e.clientX - drag.current.x
    const dy = e.clientY - drag.current.y
    setOffset(clampOffset(drag.current.ox + dx, drag.current.oy + dy, zoom))
  }
  const onPointerUp = () => {
    drag.current = null
  }

  const changeZoom = (next: number) => {
    const z = Math.max(1, Math.min(3, next))
    setZoom(z)
    setOffset((o) => clampOffset(o.x, o.y, z))
  }

  /** Map the visible circle back to natural image crop rect. */
  const toCropRect = (): CropRect => {
    if (!natural.w) return defaultCenterCrop(1, 1)
    // Circle covers the full viewSize box
    const s = baseScale * zoom
    // Top-left of image in view coords
    const left = (viewSize - natural.w * s) / 2 + offset.x
    const top = (viewSize - natural.h * s) / 2 + offset.y
    // Crop window in view = 0..viewSize
    const cropX = (0 - left) / s
    const cropY = (0 - top) / s
    const cropSize = viewSize / s
    return {
      x: Math.max(0, cropX),
      y: Math.max(0, cropY),
      size: Math.min(cropSize, natural.w, natural.h),
    }
  }

  const confirm = async () => {
    setBusy(true)
    try {
      const dataUrl = await cropAndCompress(src, toCropRect())
      onDone(dataUrl)
    } catch {
      onCancel()
    } finally {
      setBusy(false)
    }
  }

  return (
    <motion.div
      className="fixed inset-0 z-[200] flex flex-col bg-black/90"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <header className="flex items-center justify-between px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={onCancel}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white"
          aria-label="Cancel"
        >
          <X size={20} />
        </button>
        <p className="text-sm font-extrabold text-white">{title}</p>
        <button
          type="button"
          onClick={confirm}
          disabled={busy || !natural.w}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-purple text-white disabled:opacity-50"
          aria-label="Done"
        >
          <Check size={20} />
        </button>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <p className="mb-4 text-center text-xs font-semibold text-white/60">
          Drag to reposition · pinch-free zoom below
        </p>
        <div
          className="relative overflow-hidden rounded-full bg-gray-800 shadow-2xl ring-2 ring-white/30"
          style={{ width: viewSize, height: viewSize, touchAction: 'none' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {natural.w > 0 && (
            <img
              src={src}
              alt=""
              draggable={false}
              className="absolute max-w-none select-none"
              style={{
                width: dispW,
                height: dispH,
                left: imgLeft,
                top: imgTop,
              }}
            />
          )}
        </div>

        <div className="mt-6 flex items-center gap-4">
          <button
            type="button"
            onClick={() => changeZoom(zoom - 0.2)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white"
            aria-label="Zoom out"
          >
            <ZoomOut size={18} />
          </button>
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(e) => changeZoom(Number(e.target.value))}
            className="w-40 accent-[#7B2CBF]"
          />
          <button
            type="button"
            onClick={() => changeZoom(zoom + 0.2)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white"
            aria-label="Zoom in"
          >
            <ZoomIn size={18} />
          </button>
        </div>
      </div>

      <p className="pb-[max(1rem,env(safe-area-inset-bottom))] text-center text-[11px] font-semibold text-white/45">
        Saved at 512×512 · optimized for the web
      </p>
    </motion.div>
  )
}
