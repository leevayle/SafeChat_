import { useState } from 'react'
import { api } from '../api'
import { useStore } from '../store'
import { ChatsHomeSkeleton } from '../components/ChatsHomeSkeleton'

export function DeactivatedGate({
  onActivated,
  onLogout,
}: {
  onActivated: () => void
  onLogout: () => void
}) {
  const { me, showToast } = useStore()
  const [busy, setBusy] = useState(false)
  const [deletePw, setDeletePw] = useState('')
  const [showDelete, setShowDelete] = useState(false)
  const scheduled = (me as any)?.scheduledDeletionAt

  return (
    <div className="relative flex h-full flex-col bg-white">
      <div className="pointer-events-none min-h-0 flex-1 select-none blur-sm opacity-60">
        <ChatsHomeSkeleton />
      </div>
      <div className="absolute inset-0 z-20 flex items-end justify-center bg-black/40 p-5 pb-10">
        <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
          <p className="text-xl font-black text-ink">Your account is deactivated</p>
          <p className="mt-2 text-sm font-semibold text-gray-500">
            Chats and contacts are not loaded while deactivated.
            {scheduled
              ? ' Permanent deletion is scheduled if you do not reactivate in time (about 6 months from deactivation).'
              : ' Reactivate to restore full access, or delete permanently.'}
          </p>
          <p className="mt-2 text-xs font-semibold text-gray-400">
            We may email monthly reminders with steps to reactivate before deletion.
          </p>
          <button
            type="button"
            disabled={busy}
            className="mt-5 w-full rounded-full bg-brand-purple py-3.5 text-sm font-extrabold text-white disabled:opacity-50"
            onClick={async () => {
              setBusy(true)
              try {
                await api.reactivateAccount()
                showToast('Account reactivated')
                onActivated()
              } catch (e: any) {
                showToast(e?.message || 'Could not reactivate')
              } finally {
                setBusy(false)
              }
            }}
          >
            Activate account
          </button>
          <button
            type="button"
            className="mt-2 w-full rounded-full bg-gray-100 py-3.5 text-sm font-extrabold text-gray-700"
            onClick={onLogout}
          >
            Log out
          </button>
          {!showDelete ? (
            <button
              type="button"
              className="mt-2 w-full py-3 text-sm font-extrabold text-brand-red"
              onClick={() => setShowDelete(true)}
            >
              Delete permanently
            </button>
          ) : (
            <div className="mt-3 space-y-2">
              <input
                type="password"
                value={deletePw}
                onChange={(e) => setDeletePw(e.target.value)}
                placeholder="Confirm password"
                className="w-full rounded-full bg-gray-100 px-4 py-3 text-sm font-semibold outline-none"
              />
              <button
                type="button"
                disabled={busy || !deletePw}
                className="w-full rounded-full bg-brand-red py-3 text-sm font-extrabold text-white disabled:opacity-50"
                onClick={async () => {
                  setBusy(true)
                  try {
                    await api.deletePermanently(deletePw)
                    showToast('Account permanently deleted')
                    onLogout()
                  } catch (e: any) {
                    showToast(e?.message || 'Could not delete')
                  } finally {
                    setBusy(false)
                  }
                }}
              >
                Confirm permanent delete
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
