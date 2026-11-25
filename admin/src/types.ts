export type Overview = {
  users: { total: number; active: number; online: number; deactivated: number; banned: number; pending_review: number; premium: number; pro: number }
  payments: { total: number; paid_last_30_days: number }
  reports_open: number
  support_tickets_open: number
}
export type Health = { api: string; mongodb: string; checked_at: string }
export type UserRow = {
  id: string; username: string; display_name?: string; email?: string; phone_number?: string
  account_role: string; account_status: string; subscription_plan: string; premium_expires_at?: string | null
  verification_status: string; verified_badge: boolean; created_at?: string; last_seen?: string | null; online: boolean
}
export type Payment = { id: string; username?: string; display_name?: string; provider?: string; plan?: string; amount?: number; currency: string; status?: string; created_at?: string; paid_at?: string | null }
export type Reply = { id: string; author_role: string; author_username?: string; body: string; created_at?: string }
export type Ticket = { id: string; user_id: string; username?: string; display_name?: string; subject: string; body: string; status: string; created_at?: string; updated_at?: string; replies: Reply[]; assigned_admin_username?: string | null }
export type Report = { id: string; reporter_id?: string; target_type?: string; target_id?: string; reason?: string; status?: string; created_at?: string }
export type RoleRequest = { id: string; target_username?: string; target_role?: string; requester_username?: string; reason?: string; status: string; created_at?: string; decided_at?: string; decision_reason?: string }
export type AuditRow = { id: string; actor_username?: string; actor_role?: string; action?: string; resource_type?: string; resource_id?: string; metadata: Record<string, unknown>; timestamp?: string }
export type BackupFile = { filename: string; size_bytes?: number; created_at?: string; scope?: string; document_count?: number; until?: string | null }
export type BackupJob = { id: string; status: string; scope: string; progress?: number; error?: string | null; filename?: string; size_bytes?: number | null }
