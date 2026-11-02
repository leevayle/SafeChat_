import { useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft } from 'lucide-react'
import { PillButton } from '../components/PillButton'
import { useStore } from '../store'

export function Login({ onBack, onSuccess }: { onBack: () => void; onSuccess: () => void }) {
  const { login } = useStore()
  const [phone, setPhone] = useState('')
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (!phone && !username) {
      setError('Enter phone or username')
      return
    }
    setLoading(true)
    setError('')
    try {
      await login(phone || undefined, username || undefined)
      onSuccess()
    } catch (e: any) {
      setError(e.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-full flex-col px-8 safe-pt safe-pb">
      <button
        type="button"
        onClick={onBack}
        className="mt-4 flex h-10 w-10 items-center justify-center rounded-full hover:bg-gray-100"
        aria-label="Back"
      >
        <ArrowLeft size={22} />
      </button>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-8"
      >
        <h2 className="text-2xl font-black text-ink">
          Welcome <span className="text-brand-purple">back</span>
        </h2>
        <p className="mt-2 text-sm font-semibold text-gray-500">
          Log in with your phone or username. Demo users: amina, brian, daisy…
        </p>
      </motion.div>

      <div className="mt-10 space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-bold text-gray-500">Phone</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+254712345678"
            className="h-12 w-full rounded-full bg-gray-100 px-5 text-[15px] font-semibold outline-none focus:ring-4 focus:ring-brand-purple/15"
          />
        </div>
        <div className="flex items-center gap-3 text-xs font-bold text-gray-400">
          <span className="h-px flex-1 bg-gray-200" />
          OR
          <span className="h-px flex-1 bg-gray-200" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-bold text-gray-500">Username</label>
          <div className="flex h-12 items-center rounded-full bg-gray-100 px-4">
            <span className="mr-1 font-bold text-brand-purple">@</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value.replace(/\s/g, ''))}
              placeholder="amina"
              className="h-full flex-1 bg-transparent text-[15px] font-semibold outline-none"
            />
          </div>
        </div>
        {error && <p className="text-sm font-bold text-brand-red">{error}</p>}
      </div>

      <div className="flex-1" />
      <div className="pb-4">
        <PillButton variant="orange" loading={loading} onClick={submit}>
          Log in
        </PillButton>
      </div>
    </div>
  )
}
