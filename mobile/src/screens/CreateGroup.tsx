import { useState } from 'react'
import { motion } from 'framer-motion'
import { Check, Search } from 'lucide-react'
import { Avatar } from '../components/Avatar'
import { PrimaryButton, ScreenHeader } from '../components/ui'
import { useStore } from '../store'

const HUES: [string, string][] = [
  ['#9C31A1', '#7B2CBF'],
  ['#F97316', '#E3404C'],
  ['#6389EB', '#7B2CBF'],
  ['#F97316', '#9C31A1'],
]

export function CreateGroup({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { contacts, createGroup } = useStore()
  const [step, setStep] = useState<1 | 2>(1)
  const [selected, setSelected] = useState<string[]>([])
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)

  const list = contacts.filter(
    (c) =>
      !q ||
      c.name.toLowerCase().includes(q.toLowerCase()) ||
      c.username?.toLowerCase().includes(q.toLowerCase()),
  )

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  const create = async () => {
    if (!name.trim() || busy) return
    setBusy(true)
    try {
      const id = await createGroup(name.trim(), desc.trim(), selected)
      onCreated(id)
    } catch {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full flex-col bg-white">
      <ScreenHeader title={step === 1 ? 'Add members' : 'New group'} onBack={step === 1 ? onClose : () => setStep(1)} />
      {step === 1 ? (
        <>
          <div className="px-4 py-3">
            <div className="flex h-11 items-center gap-2 rounded-full bg-gray-100 px-4">
              <Search size={18} className="text-brand-purple" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search contacts"
                className="w-full bg-transparent font-semibold outline-none"
              />
            </div>
          </div>
          <ul className="flex-1 overflow-y-auto px-2">
            {list.map((c) => {
              const on = selected.includes(c.id)
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggle(c.id)}
                  className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 hover:bg-gray-50"
                >
                  <Avatar contact={c} size={44} />
                  <span className="flex-1 text-left font-extrabold">{c.name}</span>
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full border-2 ${
                      on ? 'border-brand-purple bg-brand-purple text-white' : 'border-gray-300'
                    }`}
                  >
                    {on && <Check size={14} />}
                  </span>
                </button>
              )
            })}
          </ul>
          <div className="p-4">
            <PrimaryButton disabled={selected.length === 0} onClick={() => setStep(2)}>
              Next ({selected.length})
            </PrimaryButton>
          </div>
        </>
      ) : (
        <div className="flex flex-1 flex-col px-6 pt-6">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Group name"
            className="h-12 rounded-full bg-gray-100 px-5 font-bold outline-none"
          />
          <input
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Description (optional)"
            className="mt-3 h-12 rounded-full bg-gray-100 px-5 font-semibold outline-none"
          />
          <p className="mt-4 text-sm font-bold text-gray-500">{selected.length} members selected</p>
          <div className="mt-auto pb-6">
            <PrimaryButton disabled={!name.trim() || busy} onClick={create}>
              {busy ? 'Creating…' : 'Create group'}
            </PrimaryButton>
          </div>
        </div>
      )}
    </div>
  )
}
