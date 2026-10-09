import { useRef, useState } from 'react'
import { api } from '@/shared/lib/api'
import type { AdminUser } from '../../types'
import type { BillingTransactionLog } from '../billing/AdminBillingLogsView'

// Helpers moved out of AdminBillingTab.tsx (800-line guard).

export const PLAN_BADGE_COLORS: Record<string, string> = {
  free: 'bg-slate-100 text-slate-600',
  starter: 'bg-sky-100 text-sky-700',
  aikids_official_129k: 'bg-amber-100 text-amber-800',
  premium_family: 'bg-violet-100 text-violet-700',
  pro: 'bg-amber-100 text-amber-700',
}

export const PURPOSE_LABELS: Record<string, string> = {
  user_sub: 'Gói cá nhân',
  credit_pack: 'Gói lượt AI',
  course_purchase: 'Mua khóa học',
}
export const BILLING_TX_LOGS_KEY = 'aikids_billing_tx_logs'

export function getStoredBillingLogs(): BillingTransactionLog[] {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return []
    const raw = localStorage.getItem(BILLING_TX_LOGS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveBillingLogs(logs: BillingTransactionLog[]): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return
    localStorage.setItem(BILLING_TX_LOGS_KEY, JSON.stringify(logs.slice(0, 100)))
  } catch {
    /* ignore */
  }
}

export function generateSuggestedReason(
  mode: 'checkout' | 'vietqr' | 'grant',
  method: 'transfer' | 'cash',
  planName: string,
  durationMonths: number,
): string {
  const today = new Date().toLocaleDateString('vi-VN')
  if (mode === 'grant') {
    return `Học bổng ${planName} ${durationMonths} tháng - Admin cấp ngày ${today}`
  }
  const methodText = method === 'transfer' ? 'Chuyển khoản MBBank' : 'Tiền mặt tại quầy'
  if (mode === 'vietqr') {
    return `Thu tiền qua VietQR (${planName} ${durationMonths}T) - ${today}`
  }
  return `Đã thu tiền qua ${methodText} (${planName} ${durationMonths}T) - ${today}`
}

/** Admin POS customer search: debounced, latest query wins. */
export function useGrantUserSearch() {
  const [grantUserResults, setGrantUserResults] = useState<AdminUser[]>([])
  const [grantUserSearching, setGrantUserSearching] = useState(false)
  // Debounced; only the latest query may update the list so a slow, older
  // response can never leave another customer selectable.
  const grantSearchSeq = useRef(0)
  const grantSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  async function searchGrantUser(query: string): Promise<void> {
    const q = query.trim()
    const seq = ++grantSearchSeq.current
    if (grantSearchTimer.current) clearTimeout(grantSearchTimer.current)
    if (q.length < 2) {
      setGrantUserResults([])
      setGrantUserSearching(false)
      return
    }
    setGrantUserSearching(true)
    grantSearchTimer.current = setTimeout(async () => {
      try {
        const data = await api<{ users: AdminUser[] }>(`/api/admin/users?search=${encodeURIComponent(q)}`)
        if (seq !== grantSearchSeq.current) return
        setGrantUserResults(Array.isArray(data.users) ? data.users.slice(0, 8) : [])
      } catch {
        if (seq === grantSearchSeq.current) setGrantUserResults([])
      } finally {
        if (seq === grantSearchSeq.current) setGrantUserSearching(false)
      }
    }, 300)
  }

  return { grantUserResults, setGrantUserResults, grantUserSearching, searchGrantUser }
}

/**
 * One Idempotency-Key per POS submission, reused if the admin retries after a
 * timeout so core-billing-api returns the first order instead of charging
 * twice. Callers clear `posIdemKey.current` after a successful request.
 */
export function usePosIdempotency() {
  const posIdemKey = useRef<string | null>(null)
  function posHeaders(): Record<string, string> {
    posIdemKey.current ??= `pos-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
    return { 'Idempotency-Key': posIdemKey.current }
  }
  return { posIdemKey, posHeaders }
}
