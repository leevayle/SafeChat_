import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Check, X } from 'lucide-react'

type Props = {
  src: string
  onCancel: () => void
  onDone: (dataUrl: string) => void
  title?: string
}

/**
 * Rectangular inbox cropper — drag the image, resize the crop frame from sides.
 * Not circular (profile cropper stays circular).
 */
export function ChatImageCropper({ src, onCancel, onDone, title = 'Crop photo' }: Props) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [natural, setNatural] = useState({ w: 0, h: 0 })
  const [busy, setBusy] = useState(false)
  // Crop rect in view coordinates (relative to the display box)
  const [crop, setCrop] = useState({ x: 20, y: 40, w: 240, h: 180 })
  const [imgOffset, setImgOffset] = useState({ x: 0, y: 0 })
  const [zoom] = useState(1)
  const drag = useRef<null | { mode: 'move' | 'img' | 'l' | 'r' | 't' | 'b'; x: number; y: number; ox: number; oy: number; ow: number; oh: number; ix: number; iy: number }>(null)

  const VIEW_W = 300
  const VIEW_H = 360

  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      setNatural({ w: img.naturalWidth, h: img.naturalHeight })
      const aspect = img.naturalWidth / Math.max(1, img.naturalHeight)
      let cw = VIEW_W - 40
      let ch = cw / Math.max(0.5, Math.min(2, aspect))
      if (ch > VIEW_H - 80) {
        ch = VIEW_H - 80
        cw = ch * Math.max(0.5, Math.min(2, aspect))
      }
      setCrop({
        x: (VIEW_W - cw) / 2,
        y: (VIEW_H - ch) / 2,
        w: cw,
        h: ch,
      })
      setImgOffset({ x: 0, y: 0 })
    }
    img.src = src
  }, [src])

  const baseScale =
    natural.w && natural.h
      ? Math.max(VIEW_W / natural.w, VIEW_H / natural.h) * zoom
      : 1
  const dispW = natural.w * baseScale
  const dispH = natural.h * baseScale
  const imgLeft = (VIEW_W - dispW) / 2 + imgOffset.x
  const imgTop = (VIEW_H - dispH) / 2 + imgOffset.y

  const onPointerDown = (mode: 'move' | 'img' | 'l' | 'r' | 't' | 'b') => (e: ReactPointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    drag.current = {
      mode,
      x: e.clientX,
      y: e.clientY,
      ox: crop.x,
      oy: crop.y,
      ow: crop.w,
      oh: crop.h,
      ix: imgOffset.x,
      iy: imgOffset.y,
    }
  }

  const onPointerMove = (e: ReactPointerEvent) => {
    if (!drag.current) return
    const d = drag.current
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    const minW = 80
    const minH = 80
    if (d.mode === 'img') {
      setImgOffset({ x: d.ix + dx, y: d.iy + dy })
      return
    }
    if (d.mode === 'move') {
      setCrop({
        x: Math.max(0, Math.min(VIEW_W - d.ow, d.ox + dx)),
        y: Math.max(0, Math.min(VIEW_H - d.oh, d.oy + dy)),
        w: d.ow,
        h: d.oh,
      })
      return
    }
    let { x, y, w, h } = { x: d.ox, y: d.oy, w: d.ow, h: d.oh }
    if (d.mode === 'l') {
      const nx = Math.max(0, Math.min(d.ox + d.ow - minW, d.ox + dx))
      w = d.ow - (nx - d.ox)
      x = nx
    } else if (d.mode === 'r') {
      w = Math.max(minW, Math.min(VIEW_W - d.ox, d.ow + dx))
    } else if (d.mode === 't') {
      const ny = Math.max(0, Math.min(d.oy + d.oh - minH, d.oy + dy))
      h = d.oh - (ny - d.oy)
      y = ny
    } else if (d.mode === 'b') {
      h = Math.max(minH, Math.min(VIEW_H - d.oy, d.oh + dy))
    }
    setCrop({ x, y, w, h })
  }

  const onPointerUp = () => {
    drag.current = null
  }

  const exportCrop = async () => {
    if (!natural.w) return
    setBusy(true)
    try {
      const img = new Image()
      await new Promise<void>((res, rej) => {
        img.onload = () => res()
        img.onerror = () => rej()
        img.src = src
      })
      // Map view crop rect → natural image coords
      const sx = (crop.x - imgLeft) / baseScale
      const sy = (crop.y - imgTop) / baseScale
      const sw = crop.w / baseScale
      const sh = crop.h / baseScale
      const x = Math.max(0, Math.min(natural.w - 1, sx))
      const y = Math.max(0, Math.min(natural.h - 1, sy))
      const w = Math.max(1, Math.min(natural.w - x, sw))
      const h = Math.max(1, Math.min(natural.h - y, sh))
      const maxEdge = 1600
      const scale = Math.min(1, maxEdge / Math.max(w, h))
      const outW = Math.max(1, Math.round(w * scale))
      const outH = Math.max(1, Math.round(h * scale))
      const canvas = document.createElement('canvas')
      canvas.width = outW
      canvas.height = outH
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('canvas')
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, x, y, w, h, 0, 0, outW, outH)
      onDone(canvas.toDataURL('image/jpeg', 0.82))
    } catch {
      /* parent shows toast if needed */
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[120] flex flex-col bg-black/90">
      <div className="flex items-center justify-between px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button type="button" onClick={onCancel} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white" aria-label="Cancel">
          <X size={20} />
        </button>
        <p className="text-sm font-extrabold text-white">{title}</p>
        <button
          type="button"
          disabled={busy}
          onClick={() => void exportCrop()}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-purple text-white disabled:opacity-50"
          aria-label="Done"
        >
          <Check size={20} />
        </button>
      </div>
      <div className="flex flex-1 items-center justify-center px-3 pb-6">
        <div
          ref={boxRef}
          className="relative overflow-hidden rounded-2xl bg-black"
          style={{ width: VIEW_W, height: VIEW_H, touchAction: 'none' }}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {/* Image layer — drag to pan */}
          <div
            className="absolute inset-0"
            onPointerDown={onPointerDown('img')}
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
          {/* Dim outside crop */}
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute inset-x-0 top-0 bg-black/55" style={{ height: crop.y }} />
            <div className="absolute inset-x-0 bottom-0 bg-black/55" style={{ height: VIEW_H - crop.y - crop.h }} />
            <div className="absolute bg-black/55" style={{ top: crop.y, height: crop.h, left: 0, width: crop.x }} />
            <div className="absolute bg-black/55" style={{ top: crop.y, height: crop.h, right: 0, width: VIEW_W - crop.x - crop.w }} />
          </div>
          {/* Crop frame */}
          <div
            className="absolute border-2 border-white"
            style={{ left: crop.x, top: crop.y, width: crop.w, height: crop.h }}
            onPointerDown={onPointerDown('move')}
          >
            {/* Side handles (2 axes: left/right + top/bottom) */}
            <span className="absolute left-0 top-1/2 h-10 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" onPointerDown={onPointerDown('l')} />
            <span className="absolute right-0 top-1/2 h-10 w-3 translate-x-1/2 -translate-y-1/2 rounded-full bg-white" onPointerDown={onPointerDown('r')} />
            <span className="absolute left-1/2 top-0 h-3 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" onPointerDown={onPointerDown('t')} />
            <span className="absolute bottom-0 left-1/2 h-3 w-10 -translate-x-1/2 translate-y-1/2 rounded-full bg-white" onPointerDown={onPointerDown('b')} />
          </div>
        </div>
      </div>
      <p className="pb-[max(1rem,env(safe-area-inset-bottom))] text-center text-xs font-bold text-white/70">
        Drag to move · pull the white handles to resize
      </p>
    </div>
  )
}
