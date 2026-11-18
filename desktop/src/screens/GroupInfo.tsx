import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  BellOff,
  Pin,
  Crown,
  UserPlus,
  Users,
  LogOut,
  Pencil,
  Shield,
  ShieldOff,
  UserMinus,
  Search,
  Link2,
  Camera,
} from 'lucide-react'
import { Avatar } from '../components/Avatar'
import { ImageCropper } from '../components/ImageCropper'
import { PrimaryButton, ScreenHeader, Sheet, Toast, Toggle } from '../components/ui'
import { api } from '../api'
import { useStore } from '../store'

function Card({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <section className="mt-4">
      {title ? <h3 className="mb-2 px-2 text-sm font-extrabold text-brand-purple">{title}</h3> : null}
      <div className="divide-y divide-gray-100 overflow-hidden rounded-3xl bg-white shadow-sm dark:divide-white/10 dark:bg-white/5">
        {children}
      </div>
    </section>
  )
}

function Line({
  icon: I,
  label,
  hint,
  right,
  onClick,
  danger,
}: {
  icon: typeof Pin
  label: string
  hint?: string
  right?: ReactNode
  onClick?: () => void
  danger?: boolean
}) {
  const T = onClick ? 'button' : 'div'
  return (
    <T
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`flex w-full items-center gap-3 px-5 py-3.5 text-left ${onClick ? 'hover:bg-gray-50 dark:hover:bg-white/5' : ''}`}
    >
      <I size={20} className={danger ? 'text-brand-red' : 'text-brand-purple'} />
      <span className="min-w-0 flex-1">
        <span className={`block font-bold ${danger ? 'text-brand-red' : ''}`}>{label}</span>
        {hint ? <span className="block text-xs font-semibold text-gray-400">{hint}</span> : null}
      </span>
      {right}
    </T>
  )
}

type SheetState = null | 'edit' | 'add' | 'leave' | { member: string }

export function GroupInfo({
  groupId,
  onBack,
  onLeft,
}: {
  groupId: string
  onBack: () => void
  onLeft: () => void
}) {
  const { groups, contacts, me, refreshGroups, showToast } = useStore()
  const local = groups.find((x) => x.id === groupId)
  const [g, setG] = useState<any>(local || null)
  const [sheet, setSheet] = useState<SheetState>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [draft, setDraft] = useState({ name: '', desc: '' })
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [searchQ, setSearchQ] = useState('')
  const [searchHits, setSearchHits] = useState<any[]>([])
  const [searchBusy, setSearchBusy] = useState(false)
  const myId = me?.id || ''

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const { group } = await api.group(groupId)
        if (!cancelled) setG(group)
      } catch {
        if (!cancelled && local) setG(local)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [groupId, local])

  const members = useMemo(() => {
    const list = Array.isArray(g?.members) ? [...g.members] : []
    return list.sort((a: any, b: any) => Number(!!b.admin) - Number(!!a.admin))
  }, [g?.members])

  const isAdmin = !!(
    (g?.adminIds || []).map(String).includes(String(myId)) ||
    members.find((m: any) => String(m.id) === String(myId))?.admin ||
    String(g?.creatorId || '') === String(myId)
  )
  const canEditInfo = isAdmin || !(g?.permissions?.onlyAdminsCanEditInfo !== false)
  const canAddMembers = isAdmin || !g?.permissions?.onlyAdminsCanAddMembers

  const displayName = (m: any) => {
    if (m.id === myId) return 'You'
    const c = contacts.find((x) => x.id === m.id || x.peerId === m.id)
    if (c) return c.savedName || c.name || c.username || m.name || m.username || 'Member'
    return m.name || m.username || 'Member'
  }

  const usernameOf = (m: any) => {
    const c = contacts.find((x) => x.id === m.id || x.peerId === m.id)
    const u = (c?.username || m.username || '').replace(/^@/, '')
    return u ? `@${u}` : ''
  }

  const isSavedContact = (uid: string) =>
    contacts.some((c) => c.id === uid || c.peerId === uid)

  const shown = members.filter((m: any) => {
    const n = displayName(m).toLowerCase()
    const u = (m.username || '').toLowerCase()
    const qq = q.toLowerCase()
    return !qq || n.includes(qq) || u.includes(qq)
  })

  const addable = contacts.filter(
    (c) => !members.some((m: any) => m.id === c.id || m.id === c.peerId),
  )


  const saveGroupPhoto = async (dataUrl: string | null) => {
    setPhotoBusy(true)
    try {
      const { group } = await api.patchGroup(groupId, { photo: dataUrl })
      setG(group)
      await refreshGroups()
      setCropSrc(null)
      setToast('Group photo updated')
    } catch (e: any) {
      setToast(e?.message || 'Could not update photo')
    } finally {
      setPhotoBusy(false)
    }
  }

  const runMemberSearch = async (q: string) => {
    setSearchQ(q)
    const query = q.trim()
    if (query.length < 2) {
      setSearchHits([])
      return
    }
    setSearchBusy(true)
    try {
      const res = await api.searchUsers(query)
      const users = Array.isArray(res) ? res : res?.users || res?.results || []
      const memberIds = new Set((g?.memberIds || members.map((m: any) => m.id) || []).map(String))
      const pending = new Set((g?.pendingMemberIds || []).map(String))
      setSearchHits(
        (users || []).filter(
          (u: any) => u?.id && !memberIds.has(String(u.id)) && !pending.has(String(u.id)),
        ),
      )
    } catch {
      setSearchHits([])
    } finally {
      setSearchBusy(false)
    }
  }

  const saveEdits = async () => {
    if (!draft.name.trim()) return
    setBusy(true)
    try {
      const { group } = await api.patchGroup(groupId, {
        name: draft.name.trim(),
        desc: draft.desc.trim(),
      })
      setG(group)
      await refreshGroups()
      setSheet(null)
      setToast('Group updated')
    } catch (e: any) {
      setToast(e?.message || 'Could not update group')
    } finally {
      setBusy(false)
    }
  }

  const addMembers = async () => {
    if (!adding.length) return
    setBusy(true)
    try {
      const usernames = adding
        .map((id) => {
          const c = contacts.find((x) => x.id === id || x.peerId === id)
          if (c?.username) return String(c.username).replace(/^@/, '').trim()
          const hit = searchHits.find((u: any) => String(u.id) === id)
          if (hit?.username) return String(hit.username).replace(/^@/, '').trim()
          return ''
        })
        .filter(Boolean)
      if (!usernames.length) {
        setToast('Selected people need usernames')
        setBusy(false)
        return
      }
      await api.addGroupMembers(groupId, usernames)
      const { group } = await api.group(groupId)
      setG(group)
      await refreshGroups()
      setAdding([])
      setSheet(null)
      setToast('Invites sent')
    } catch (e: any) {
      setToast(e?.message || 'Could not add members')
    } finally {
      setBusy(false)
    }
  }

  const leave = async () => {
    setBusy(true)
    try {
      await api.leaveGroup(groupId)
      await refreshGroups()
      onLeft()
    } catch (e: any) {
      setToast(e?.message || 'Could not leave group')
    } finally {
      setBusy(false)
    }
  }

  const promote = async (uid: string) => {
    try {
      await api.promoteGroupAdmin(groupId, uid)
      const { group } = await api.group(groupId)
      setG(group)
      await refreshGroups()
      setSheet(null)
      setToast('Admin added')
    } catch (e: any) {
      setToast(e?.message || 'Could not promote')
    }
  }

  const demote = async (uid: string) => {
    try {
      await api.demoteGroupAdmin(groupId, uid)
      const { group } = await api.group(groupId)
      setG(group)
      await refreshGroups()
      setSheet(null)
      setToast('Admin removed')
    } catch (e: any) {
      setToast(e?.message || 'Could not demote')
    }
  }

  const removeMember = async (uid: string) => {
    try {
      await api.removeGroupMember(groupId, uid)
      const { group } = await api.group(groupId)
      setG(group)
      await refreshGroups()
      setSheet(null)
      setToast('Member removed')
    } catch (e: any) {
      setToast(e?.message || 'Could not remove')
    }
  }

  const requestSave = async (uid: string, username?: string) => {
    try {
      const uname = (username || '').replace(/^@/, '')
      await api.sendContactRequest({
        username: uname || undefined,
        peerId: uid,
      })
      setToast('Save request sent')
      showToast?.('Save request sent')
    } catch (e: any) {
      setToast(e?.message || 'Could not send save request')
    }
  }

  if (!g) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-gray-100">
        <p className="font-bold text-gray-400">Group not found</p>
        <button type="button" onClick={onBack} className="mt-2 font-bold text-brand-purple">
          Back
        </button>
      </div>
    )
  }

  const target =
    sheet && typeof sheet === 'object' ? members.find((m: any) => m.id === sheet.member) : null

  return (
    <div className="relative flex h-full flex-col bg-gray-100 dark:bg-[#0b1220]">
      <ScreenHeader
        title="Group info"
        onBack={onBack}
        right={
          isAdmin ? (
            <button
              type="button"
              onClick={() => {
                setDraft({ name: g.name || '', desc: g.desc || '' })
                setSheet('edit')
              }}
              aria-label="Edit group"
              className="flex h-10 w-10 items-center justify-center rounded-full text-brand-purple hover:bg-gray-100"
            >
              <Pencil size={20} />
            </button>
          ) : undefined
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-10 pt-6">
        <div className="flex flex-col items-center text-center">
          <div className="relative">
            <Avatar
              contact={{ id: g.id, name: g.name, photo: g.photo, hue: g.hue, online: false }}
              size={112}
            />
            {isAdmin ? (
              <div className="absolute -bottom-1 -right-1 flex gap-1">
                <label className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-brand-purple text-white shadow-md ring-2 ring-white dark:ring-[#0b1220]">
                  <Camera size={16} />
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      e.target.value = ''
                      if (!f) return
                      const reader = new FileReader()
                      reader.onload = () => setCropSrc(String(reader.result || ''))
                      reader.readAsDataURL(f)
                    }}
                  />
                </label>
              </div>
            ) : null}
          </div>
          {isAdmin && g.photo ? (
            <button
              type="button"
              className="mt-3 text-xs font-extrabold text-brand-red"
              disabled={photoBusy}
              onClick={() => void saveGroupPhoto(null as any)}
            >
              {photoBusy ? 'Removing…' : 'Remove photo'}
            </button>
          ) : null}
          <h2 className="mt-3 text-2xl font-black text-ink dark:text-gray-100">{g.name}</h2>
          <p className="text-sm font-bold text-gray-400">
            Group · {members.length || g.memberIds?.length || 0} members
          </p>
          <p className="mt-2 max-w-xs font-semibold text-gray-500 dark:text-gray-400">
            {g.desc || 'No description'}
          </p>
          {isAdmin || canEditInfo ? (
            <button
              type="button"
              onClick={() => {
                setDraft({ name: g.name || '', desc: g.desc || '' })
                setSheet('edit')
              }}
              className="mt-3 rounded-full bg-brand-purple/10 px-4 py-1.5 text-xs font-extrabold text-brand-purple"
            >
              Edit name & description
            </button>
          ) : null}
        </div>

        {/* Always show invite link for members */}
        <Card title="Invite link">
          <div className="flex items-center gap-3 px-5 py-3.5">
            <Link2 size={20} className="shrink-0 text-brand-purple" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold text-ink dark:text-gray-100">
                {g.inviteLink ||
                  (g.inviteCode ? `safechat.app/join/${g.inviteCode}` : 'Generating link…')}
              </p>
              <p className="text-xs font-semibold text-gray-400">Tap copy to share this group</p>
            </div>
            <button
              type="button"
              className="shrink-0 rounded-full bg-brand-purple/10 px-3 py-1.5 text-xs font-extrabold text-brand-purple disabled:opacity-40"
              disabled={!g.inviteCode && !g.inviteLink}
              onClick={async () => {
                const url = g.inviteLink || (g.inviteCode ? `safechat.app/join/${g.inviteCode}` : '')
                if (!url) return
                try {
                  await navigator.clipboard.writeText(url)
                  setToast('Link copied')
                } catch {
                  setToast(url)
                }
              }}
            >
              Copy
            </button>
          </div>
        </Card>

        <Card title="Settings">
          <Line
            icon={BellOff}
            label="Mute notifications"
            right={
              <Toggle
                on={!!g.muted}
                onChange={(v) => {
                  setG((prev: any) => ({ ...prev, muted: v }))
                  try {
                    const map = JSON.parse(localStorage.getItem('sc_group_muted') || '{}')
                    map[groupId] = v
                    localStorage.setItem('sc_group_muted', JSON.stringify(map))
                  } catch {
                    /* */
                  }
                }}
                label="Mute"
              />
            }
          />
          <Line
            icon={Pin}
            label="Pin group"
            right={
              <Toggle
                on={!!g.pinned}
                onChange={(v) => {
                  setG((prev: any) => ({ ...prev, pinned: v }))
                  try {
                    const map = JSON.parse(localStorage.getItem('sc_group_pinned') || '{}')
                    map[groupId] = v
                    localStorage.setItem('sc_group_pinned', JSON.stringify(map))
                  } catch {
                    /* */
                  }
                }}
                label="Pin"
              />
            }
          />
        </Card>

        {isAdmin ? (
          <Card title="Group permissions">
            <Line
              icon={Pencil}
              label="Only admins can edit info"
              right={
                <Toggle
                  on={g.permissions?.onlyAdminsCanEditInfo !== false}
                  onChange={(v) => {
                    void (async () => {
                      try {
                        const { group } = await api.patchGroup(groupId, {
                          permissions: {
                            ...(g.permissions || {}),
                            onlyAdminsCanEditInfo: v,
                          },
                        })
                        setG(group)
                        setToast(v ? 'Only admins can edit info' : 'Members can edit info')
                      } catch (e: any) {
                        setToast(e?.message || 'Could not update')
                      }
                    })()
                  }}
                  label="Edit info"
                />
              }
            />
            <Line
              icon={UserPlus}
              label="Only admins can add members"
              right={
                <Toggle
                  on={!!g.permissions?.onlyAdminsCanAddMembers}
                  onChange={(v) => {
                    void (async () => {
                      try {
                        const { group } = await api.patchGroup(groupId, {
                          permissions: {
                            ...(g.permissions || {}),
                            onlyAdminsCanAddMembers: v,
                          },
                        })
                        setG(group)
                        setToast(v ? 'Only admins can add' : 'Members can add')
                      } catch (e: any) {
                        setToast(e?.message || 'Could not update')
                      }
                    })()
                  }}
                  label="Add members"
                />
              }
            />
            <Line
              icon={Users}
              label="Only admins can send messages"
              right={
                <Toggle
                  on={!!g.permissions?.onlyAdminsCanPost}
                  onChange={(v) => {
                    void (async () => {
                      try {
                        const { group } = await api.patchGroup(groupId, {
                          permissions: {
                            ...(g.permissions || {}),
                            onlyAdminsCanPost: v,
                          },
                        })
                        setG(group)
                        setToast(v ? 'Only admins can post' : 'Everyone can post')
                      } catch (e: any) {
                        setToast(e?.message || 'Could not update')
                      }
                    })()
                  }}
                  label="Post"
                />
              }
            />
          </Card>
        ) : null}

        <Card title={`${members.length} members`}>
          {canAddMembers ? (
            <Line
              icon={UserPlus}
              label="Add members"
              onClick={() => {
                setAdding([])
                setSearchQ('')
                setSearchHits([])
                setSheet('add')
              }}
            />
          ) : null}
          <div className="px-4 py-2">
            <div className="flex h-10 items-center gap-2 rounded-full bg-gray-100 px-3 dark:bg-white/10">
              <Search size={16} className="text-gray-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search members"
                className="w-full bg-transparent text-sm font-semibold outline-none"
              />
            </div>
          </div>
          {shown.map((m: any) => {
            const saved = isSavedContact(m.id)
            const uname = usernameOf(m)
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setSheet({ member: m.id })}
                className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-gray-50 dark:hover:bg-white/5"
              >
                <Avatar
                  contact={{
                    id: m.id,
                    name: displayName(m),
                    photo: m.photo,
                    online: false,
                    hue: undefined,
                  }}
                  size={44}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 font-extrabold text-ink">
                    <span className="truncate">{displayName(m)}</span>
                    {m.pending ? (
                      <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-extrabold uppercase text-amber-700">Pending</span>
                    ) : m.admin ? (
                      <Crown size={14} className="shrink-0 text-brand-purple" />
                    ) : null}
                  </span>
                  <span className="block truncate text-xs font-semibold text-gray-400">
                    {m.pending ? 'Invite pending' : uname || (m.admin ? 'Admin' : 'Member')}
                  </span>
                </span>
                {!saved && m.id !== myId ? (
                  <span className="shrink-0 rounded-full bg-brand-purple/10 px-2.5 py-1 text-[11px] font-extrabold text-brand-purple">
                    Save
                  </span>
                ) : null}
              </button>
            )
          })}
        </Card>

        <Card>
          <Line icon={LogOut} label="Leave group" danger onClick={() => setSheet('leave')} />
        </Card>
      </div>

      {/* Edit */}
      <Sheet open={sheet === 'edit'} onClose={() => setSheet(null)} title="Edit group">
        <input
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          placeholder="Group name"
          className="mb-3 h-12 w-full rounded-full bg-gray-100 px-5 font-bold outline-none"
        />
        <input
          value={draft.desc}
          onChange={(e) => setDraft((d) => ({ ...d, desc: e.target.value }))}
          placeholder="Description"
          className="mb-4 h-12 w-full rounded-full bg-gray-100 px-5 font-semibold outline-none"
        />
        <PrimaryButton disabled={!draft.name.trim() || busy} onClick={() => void saveEdits()}>
          {busy ? 'Saving…' : 'Save'}
        </PrimaryButton>
      </Sheet>

      {/* Add members */}
      <Sheet
        open={sheet === 'add'}
        onClose={() => {
          setSheet(null)
          setSearchQ('')
          setSearchHits([])
        }}
        title="Add members"
      >
        <div className="mb-3 flex h-11 items-center gap-2 rounded-full bg-gray-100 px-4 dark:bg-white/10">
          <Search size={16} className="text-brand-purple" />
          <input
            value={searchQ}
            onChange={(e) => void runMemberSearch(e.target.value)}
            placeholder="Search username or phone"
            className="w-full bg-transparent text-sm font-semibold outline-none"
          />
        </div>
        <ul className="mb-4 max-h-72 overflow-y-auto">
          {searchQ.trim().length >= 2
            ? (searchHits.length ? (
                searchHits.map((u: any) => {
                  const id = String(u.id)
                  const on = adding.includes(id)
                  const uname = (u.username || '').replace(/^@/, '')
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() =>
                        setAdding((s) => (on ? s.filter((x) => x !== id) : [...s, id]))
                      }
                      className="flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 hover:bg-gray-50 dark:hover:bg-white/5"
                    >
                      <Avatar
                        contact={{
                          id,
                          name: u.display_name || u.name || uname || id,
                          photo: u.profile_photo ?? u.photo ?? null,
                        }}
                        size={40}
                      />
                      <span className="min-w-0 flex-1 text-left">
                        <span className="block truncate font-extrabold">
                          {u.display_name || u.name || uname || 'User'}
                        </span>
                        <span className="block truncate text-xs font-semibold text-gray-400">
                          {uname ? `@${uname}` : u.phone_number || u.phone || ''}
                        </span>
                      </span>
                      <span
                        className={`flex h-6 w-6 items-center justify-center rounded-full border-2 ${
                          on ? 'border-brand-purple bg-brand-purple' : 'border-gray-300'
                        }`}
                      />
                    </button>
                  )
                })
              ) : (
                <p className="py-6 text-center text-sm font-bold text-gray-400">
                  {searchBusy ? 'Searching…' : 'No users found'}
                </p>
              ))
            : (
              <>
                {addable.map((c) => {
                  const on = adding.includes(c.id)
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() =>
                        setAdding((s) => (on ? s.filter((x) => x !== c.id) : [...s, c.id]))
                      }
                      className="flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 hover:bg-gray-50 dark:hover:bg-white/5"
                    >
                      <Avatar contact={c} size={40} />
                      <span className="min-w-0 flex-1 text-left">
                        <span className="block truncate font-extrabold">
                          {c.savedName || c.name || c.username}
                        </span>
                        <span className="block truncate text-xs font-semibold text-gray-400">
                          {c.username ? `@${String(c.username).replace(/^@/, '')}` : c.phone || ''}
                        </span>
                      </span>
                      <span
                        className={`flex h-6 w-6 items-center justify-center rounded-full border-2 ${
                          on ? 'border-brand-purple bg-brand-purple' : 'border-gray-300'
                        }`}
                      />
                    </button>
                  )
                })}
                {!addable.length ? (
                  <p className="py-6 text-center text-sm font-bold text-gray-400">
                    Search by username or phone to invite people
                  </p>
                ) : null}
              </>
            )}
        </ul>
        <PrimaryButton disabled={!adding.length || busy} onClick={() => void addMembers()}>
          {busy ? 'Sending…' : `Invite (${adding.length})`}
        </PrimaryButton>
      </Sheet>

      {/* Leave */}
      <Sheet open={sheet === 'leave'} onClose={() => setSheet(null)} title="Leave group?">
        <p className="mb-4 text-sm font-semibold text-gray-500">
          You will stop receiving messages from this group.
        </p>
        <PrimaryButton disabled={busy} onClick={() => void leave()}>
          {busy ? 'Leaving…' : 'Leave group'}
        </PrimaryButton>
      </Sheet>

      {/* Member actions */}
      <Sheet
        open={!!target}
        onClose={() => setSheet(null)}
        title={target ? displayName(target) : 'Member'}
      >
        {target ? (
          <div className="space-y-1">
            {usernameOf(target) ? (
              <p className="mb-3 text-center text-sm font-bold text-gray-400">{usernameOf(target)}</p>
            ) : null}
            {!isSavedContact(target.id) && target.id !== myId ? (
              <Line
                icon={UserPlus}
                label="Request to save contact"
                onClick={() => void requestSave(target.id, target.username)}
              />
            ) : null}
            {isAdmin && target.id !== myId && !target.admin ? (
              <Line icon={Shield} label="Make group admin" onClick={() => void promote(target.id)} />
            ) : null}
            {isAdmin && target.id !== myId && target.admin && target.id !== g.creatorId ? (
              <Line
                icon={ShieldOff}
                label="Dismiss as admin"
                onClick={() => void demote(target.id)}
              />
            ) : null}
            {isAdmin && target.id !== myId && target.id !== g.creatorId ? (
              <Line
                icon={UserMinus}
                label="Remove from group"
                danger
                onClick={() => void removeMember(target.id)}
              />
            ) : null}
          </div>
        ) : null}
      </Sheet>

      {cropSrc ? (
        <ImageCropper
          src={cropSrc}
          title="Group photo"
          onCancel={() => setCropSrc(null)}
          onDone={(dataUrl) => {
            void saveGroupPhoto(dataUrl)
          }}
        />
      ) : null}
      <Toast msg={toast} clear={() => setToast(null)} />
    </div>
  )
}


