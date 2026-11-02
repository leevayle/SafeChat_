import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { Avatar } from '../components/Avatar'
import { api } from '../api'
import { useStore } from '../store'

const API_ORIGIN = import.meta.env.VITE_API_URL || ''
function mediaUrl(path?: string | null) {
  if (!path) return ''
  if (path.startsWith('http') || path.startsWith('data:')) return path
  return `${API_ORIGIN}${path}`
}

type Props = {
  userId: string
  onClose: () => void
}

export function StatusViewer({ userId, onClose }: Props) {
  const { statusList, refreshStatus, me } = useStore()
  const items = statusList.filter((s) => s.userId === userId)
  const [idx, setIdx] = useState(0)
  const current = items[idx]

  useEffect(() => {
    if (!current) return
    api.viewStatus(current.id).then(() => refreshStatus()).catch(() => {})
  }, [current?.id])

  useEffect(() => {
    if (!items.length) return
    const t = setTimeout(() => {
      if (idx < items.length - 1) setIdx((i) => i + 1)
      else onClose()
    }, 5000)
    return () => clearTimeout(t)
  }, [idx, items.length])

  if (!items.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-ink text-white">
        <p className="font-bold">No status available</p>
        <button type="button" onClick={onClose} className="mt-4 font-bold text-brand-orange">
          Close
        </button>
      </div>
    )
  }

  const user = current.user || { id: userId, name: userId, hue: ['#7B2CBF', '#6389EB'] }

  return (
    <div
      className="relative flex h-full flex-col bg-gradient-to-b from-[#2a1a3a] to-ink text-white"
      onClick={() => {
        if (idx < items.length - 1) setIdx((i) => i + 1)
        else onClose()
      }}
    >
      {/* progress bars */}
      <div className="flex gap-1 px-3 pt-3 safe-pt">
        {items.map((s, i) => (
          <div key={s.id} className="h-1 flex-1 overflow-hidden rounded-full bg-white/25">
            <motion.div
              className="h-full bg-white"
              initial={{ width: i < idx ? '100%' : '0%' }}
              animate={{ width: i < idx ? '100%' : i === idx ? '100%' : '0%' }}
              transition={{ duration: i === idx ? 5 : 0, ease: 'linear' }}
            />
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 px-4 py-3">
        <Avatar contact={user} size={40} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-extrabold">{user.name}</p>
          <p className="text-xs font-semibold text-white/60">{current.ago}</p>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onClose()
          }}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10"
        >
          <X size={18} />
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={current.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="flex w-full max-w-sm flex-col items-center gap-4"
          >
            {current.image && (
              <img
                src={mediaUrl(current.image)}
                alt=""
                className="max-h-[55vh] w-full rounded-2xl object-contain"
              />
            )}
            {current.text && (
              <p className="text-center text-2xl font-bold leading-snug">{current.text}</p>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <p className="pb-8 text-center text-xs font-semibold text-white/40 safe-pb">
        Tap to advance · {idx + 1}/{items.length}
      </p>
    </div>
  )
}
