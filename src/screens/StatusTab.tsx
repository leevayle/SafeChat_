import { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Plus, ImagePlus, X } from 'lucide-react'
import { BrandMark } from '../components/AppHeaderLogo'
import { Avatar } from '../components/Avatar'
import { api } from '../api'
import { useStore } from '../store'
import { PillButton } from '../components/PillButton'

const API_ORIGIN = import.meta.env.VITE_API_URL || ''
function mediaUrl(path?: string | null) {
  if (!path) return ''
  if (path.startsWith('http') || path.startsWith('data:')) return path
  return `${API_ORIGIN}${path}`
}

export function StatusTab() {
  const { statusList, me, refreshStatus } = useStore()
  const [text, setText] = useState('')
  const [image, setImage] = useState<string | null>(null)
  const [composing, setComposing] = useState(false)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const mine = statusList.filter((s) => s.userId === me?.id)
  const others = statusList.filter((s) => s.userId !== me?.id)

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f || !f.type.startsWith('image/')) return
    const r = new FileReader()
    r.onload = () => setImage(String(r.result))
    r.readAsDataURL(f)
  }

  const post = async () => {
    if ((!text.trim() && !image) || busy) return
    setBusy(true)
    try {
      await api.postStatus(text.trim(), image)
      setText('')
      setImage(null)
      setComposing(false)
      await refreshStatus()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto pb-24">
      <header className="flex min-h-16 items-center border-b border-gray-200 px-5 pt-[10px]">
        <BrandMark />
      </header>
      <div className="px-5">
        <h2 className="mb-3 text-xl font-black">Status</h2>
        <button
          type="button"
          onClick={() => setComposing(true)}
          className="flex w-full items-center gap-3 rounded-3xl bg-gray-100 p-3 text-left hover:bg-gray-200/80"
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-brand-purple shadow">
            <Plus />
          </span>
          <div>
            <p className="font-extrabold">My status</p>
            <p className="text-sm font-semibold text-gray-500">
              {mine.length ? `${mine.length} update${mine.length > 1 ? 's' : ''}` : 'Tap to add a status update'}
            </p>
          </div>
        </button>

        {mine.map((s) => (
          <div key={s.id} className="mt-2 overflow-hidden rounded-2xl bg-brand-purple/5">
            {s.image && (
              <img src={mediaUrl(s.image)} alt="" className="max-h-40 w-full object-cover" />
            )}
            <div className="px-4 py-3">
              {s.text && <p className="font-semibold text-ink">{s.text}</p>}
              <p className="mt-1 text-xs font-bold text-gray-400">
                {s.ago} · {s.views?.length || 0} views
              </p>
            </div>
          </div>
        ))}

        <p className="mb-2 mt-6 text-sm font-extrabold text-gray-500">Recent updates</p>
        {others.length === 0 && (
          <p className="py-6 text-center text-sm font-bold text-gray-400">No recent status</p>
        )}
        {others.map((s, i) => (
          <motion.div
            key={s.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            className="flex items-center gap-3 rounded-3xl p-2.5 hover:bg-gray-100"
          >
            <span className="rounded-full p-[3px] ring-[3px] ring-brand-purple">
              <Avatar
                contact={s.user || { id: s.userId, name: '?', hue: ['#7B2CBF', '#6389EB'] }}
                size={48}
              />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-extrabold">{s.user?.name || 'User'}</p>
              <p className="truncate text-sm font-semibold text-gray-500">
                {s.text || (s.image ? 'Photo' : '')}
              </p>
              <p className="text-xs font-bold text-gray-400">{s.ago}</p>
            </div>
            {s.image && (
              <img src={mediaUrl(s.image)} alt="" className="h-12 w-12 rounded-xl object-cover" />
            )}
          </motion.div>
        ))}
      </div>

      {composing && (
        <div className="absolute inset-0 z-20 flex flex-col bg-white px-6 pt-16">
          <h3 className="text-xl font-black">New status</h3>
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 140))}
            placeholder="What's on your mind?"
            className="mt-4 min-h-[100px] w-full resize-none rounded-2xl bg-gray-100 p-4 text-[15px] font-semibold outline-none"
          />
          <p className="mt-1 text-right text-xs font-bold text-gray-400">{text.length}/140</p>

          {image ? (
            <div className="relative mt-3">
              <img src={image} alt="" className="max-h-48 w-full rounded-2xl object-cover" />
              <button
                type="button"
                onClick={() => setImage(null)}
                className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white"
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="mt-3 flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-brand-purple/30 py-8 font-bold text-brand-purple"
            >
              <ImagePlus size={22} /> Add photo
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPick} />

          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={() => {
                setComposing(false)
                setImage(null)
              }}
              className="flex-1 rounded-full bg-gray-100 py-3 font-bold"
            >
              Cancel
            </button>
            <div className="flex-1">
              <PillButton
                variant="orange"
                loading={busy}
                disabled={!text.trim() && !image}
                onClick={post}
              >
                Post
              </PillButton>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
