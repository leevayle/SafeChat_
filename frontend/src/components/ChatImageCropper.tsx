import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Check, X, RotateCw } from 'lucide-react'

type Props = {
  src: string
  onCancel: () => void
  onDone: (dataUrl: string) => void
  title?: string
}

type Aspect = 'free' | '1:1' | '4:3' | '3:4' | '16:9'

/**
 * Rectangular inbox cropper — frame starts at image edges, aspect presets, rotate.
 */
export function ChatImageCropper({ src, onCancel, onDone, title = 'Crop photo' }: Props) {
  const [natural, setNatural] = useState({ w: 0, h: 0 })
  const [busy, setBusy] = useState(false)
  const [rotation, setRotation] = useState(0) // 0,90,180,270
  const [aspect, setAspect] = useState<Aspect>('free')
  const [crop, setCrop] = useState({ x: 0, y: 0, w: 300, h: 360 })
  const [imgOffset, setImgOffset] = useState({ x: 0, y: 0 })
  const drag = useRef<null | {
    mode: 'move' | 'img' | 'l' | 'r' | 't' | 'b'
    x: number
    y: number
    ox: number
    oy: number
    ow: number
    oh: number
    ix: number
    iy: number
  }>(null)

  const VIEW_W = 300
  const VIEW_H = 360

  const rotatedSize = () => {
    if (rotation % 180 === 0) return natural
    return { w: natural.h, h: natural.w }
  }

  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      setNatural({ w: img.naturalWidth, h: img.naturalHeight })
      setRotation(0)
      setAspect('free')
      setImgOffset({ x: 0, y: 0 })
      // Crop starts at full visible edges
      setCrop({ x: 8, y: 8, w: VIEW_W - 16, h: VIEW_H - 16 })
    }
    img.src = src
  }, [src])

  const applyAspect = (a: Aspect) => {
    setAspect(a)
    if (a === 'free') return
    const ratio =
      a === '1:1' ? 1 : a === '4:3' ? 4 / 3 : a === '3:4' ? 3 / 4 : 16 / 9
    const maxW = VIEW_W - 16
    const maxH = VIEW_H - 16
    let w = maxW
    let h = w / ratio
    if (h > maxH) {
      h = maxH
      w = h * ratio
    }
    setCrop({
      x: (VIEW_W - w) / 2,
      y: (VIEW_H - h) / 2,
      w,
      h,
    })
  }

  const rs = rotatedSize()
  const baseScale =
    rs.w && rs.h ? Math.min(VIEW_W / rs.w, VIEW_H / rs.h) * 0.98 : 1
  const dispW = rs.w * baseScale
  const dispH = rs.h * baseScale
  const imgLeft = (VIEW_W - dispW) / 2 + imgOffset.x
  const imgTop = (VIEW_H - dispH) / 2 + imgOffset.y

  const onPointerDown =
    (mode: 'move' | 'img' | 'l' | 'r' | 't' | 'b') => (e: ReactPointerEvent) => {
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
    const minW = 64
    const minH = 64
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
    // Lock aspect if preset
    if (aspect !== 'free') {
      const ratio =
        aspect === '1:1' ? 1 : aspect === '4:3' ? 4 / 3 : aspect === '3:4' ? 3 / 4 : 16 / 9
      if (d.mode === 'l' || d.mode === 'r') {
        h = w / ratio
        if (y + h > VIEW_H) {
          h = VIEW_H - y
          w = h * ratio
        }
      } else {
        w = h * ratio
        if (x + w > VIEW_W) {
          w = VIEW_W - x
          h = w / ratio
        }
      }
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
      // Draw rotated full image to temp canvas
      const rw = rotation % 180 === 0 ? natural.w : natural.h
      const rh = rotation % 180 === 0 ? natural.h : natural.w
      const full = document.createElement('canvas')
      full.width = rw
      full.height = rh
      const fctx = full.getContext('2d')!
      fctx.translate(rw / 2, rh / 2)
      fctx.rotate((rotation * Math.PI) / 180)
      fctx.drawImage(img, -natural.w / 2, -natural.h / 2)
      // Map view crop → natural rotated coords
      const sx = (crop.x - imgLeft) / baseScale
      const sy = (crop.y - imgTop) / baseScale
      const sw = crop.w / baseScale
      const sh = crop.h / baseScale
      const x = Math.max(0, Math.min(rw - 1, sx))
      const y = Math.max(0, Math.min(rh - 1, sy))
      const w = Math.max(1, Math.min(rw - x, sw))
      const h = Math.max(1, Math.min(rh - y, sh))
      const maxEdge = 1600
      const scale = Math.min(1, maxEdge / Math.max(w, h))
      const outW = Math.max(1, Math.round(w * scale))
      const outH = Math.max(1, Math.round(h * scale))
      const canvas = document.createElement('canvas')
      canvas.width = outW
      canvas.height = outH
      const ctx = canvas.getContext('2d')!
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(full, x, y, w, h, 0, 0, outW, outH)
      onDone(canvas.toDataURL('image/jpeg', 0.85))
    } catch {
      /* */
    } finally {
      setBusy(false)
    }
  }

  const presets: { id: Aspect; label: string }[] = [
    { id: 'free', label: 'Free' },
    { id: '1:1', label: '1:1' },
    { id: '4:3', label: '4:3' },
    { id: '3:4', label: '3:4' },
    { id: '16:9', label: '16:9' },
  ]

  return (
    <div className="fixed inset-0 z-[120] flex flex-col bg-black/95">
      <div className="flex items-center justify-between px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
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
          disabled={busy}
          onClick={() => void exportCrop()}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-purple text-white disabled:opacity-50"
          aria-label="Done"
        >
          <Check size={20} />
        </button>
      </div>

      <div className="flex flex-1 items-center justify-center px-3">
        <div
          className="relative overflow-hidden rounded-2xl bg-black"
          style={{ width: VIEW_W, height: VIEW_H, touchAction: 'none' }}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="absolute inset-0" onPointerDown={onPointerDown('img')}>
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
                  transform: `rotate(${rotation}deg)`,
                  transformOrigin: 'center center',
                }}
              />
            )}
          </div>
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute inset-x-0 top-0 bg-black/55" style={{ height: crop.y }} />
            <div
              className="absolute inset-x-0 bottom-0 bg-black/55"
              style={{ height: VIEW_H - crop.y - crop.h }}
            />
            <div
              className="absolute bg-black/55"
              style={{ top: crop.y, height: crop.h, left: 0, width: crop.x }}
            />
            <div
              className="absolute bg-black/55"
              style={{ top: crop.y, height: crop.h, right: 0, width: VIEW_W - crop.x - crop.w }}
            />
          </div>
          <div
            className="absolute border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.3)]"
            style={{ left: crop.x, top: crop.y, width: crop.w, height: crop.h }}
            onPointerDown={onPointerDown('move')}
          >
            <span
              className="absolute left-0 top-1/2 h-10 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white"
              onPointerDown={onPointerDown('l')}
            />
            <span
              className="absolute right-0 top-1/2 h-10 w-3 translate-x-1/2 -translate-y-1/2 rounded-full bg-white"
              onPointerDown={onPointerDown('r')}
            />
            <span
              className="absolute left-1/2 top-0 h-3 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white"
              onPointerDown={onPointerDown('t')}
            />
            <span
              className="absolute bottom-0 left-1/2 h-3 w-10 -translate-x-1/2 translate-y-1/2 rounded-full bg-white"
              onPointerDown={onPointerDown('b')}
            />
          </div>
        </div>
      </div>

      <div className="space-y-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
        <div className="flex items-center justify-center gap-2">
          {presets.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => applyAspect(p.id)}
              className={`rounded-full px-3 py-1.5 text-xs font-extrabold transition ${
                aspect === p.id
                  ? 'bg-brand-purple text-white'
                  : 'bg-white/15 text-white/80'
              }`}
            >
              {p.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setRotation((r) => (r + 90) % 360)}
            className="ml-1 flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white"
            aria-label="Rotate"
          >
            <RotateCw size={18} />
          </button>
        </div>
        <p className="text-center text-[11px] font-bold text-white/60">
          Drag handles to resize · rotate · presets
        </p>
      </div>
    </div>
  )
}
