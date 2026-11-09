/** Legacy static helpers — prefer API + store */
export type Contact = {
  id: string
  name: string
  phone: string
  online: boolean
  hue: [string, string]
  status?: string
}
export type Msg = {
  id: string
  mine: boolean
  text: string
  time: string
  state?: 'sent' | 'delivered' | 'read'
}
export type CallLog = {
  id: string
  contactId: string
  dir: 'in' | 'out' | 'missed'
  kind: 'audio' | 'video'
  when: string
  duration?: string
}
export type GMsg = { id: string; from: string; text: string; time: string; system?: boolean }
export type Member = { id: string; admin: boolean }
export type Group = {
  id: string
  name: string
  desc: string
  hue: [string, string]
  members: Member[]
  muted: boolean
  pinned: boolean
  adminOnly: boolean
  disappearing: string
  invite: string
  unread: number
  messages: GMsg[]
}

export const HUES: [string, string][] = [
  ['#9C31A1', '#7B2CBF'],
  ['#F97316', '#E3404C'],
  ['#6389EB', '#7B2CBF'],
  ['#F97316', '#9C31A1'],
]
export const CONTACTS: Contact[] = []
export const CHATS: any[] = []
export const CALLS: CallLog[] = []
export const GROUPS: Group[] = []
export const SEED_MESSAGES: Msg[] = []
export const contactById = (id: string): Contact => ({
  id,
  name: id,
  phone: '',
  online: false,
  hue: HUES[0],
})
export const ME: Contact = { id: 'me', name: 'You', phone: '', online: true, hue: HUES[0] }
export const whoById = (id: string) => (id === 'me' ? ME : contactById(id))
