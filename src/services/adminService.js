import { supabase } from '../lib/supabase'
import { PAGE_SIZE } from '../constants'

function requireClient() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

export async function getAdminStats() {
  const { data, error } = await requireClient().rpc('admin_dashboard_stats')
  if (error) throw error
  return data
}

export async function getAdminAccountCounts() {
  const { data, error } = await requireClient().rpc('admin_auth_account_counts')
  if (error) throw error
  return data
}

export async function getAdminUsers({ page = 0, search = '', role = '', fromDate = '', toDate = '', verificationStatus = '' } = {}) {
  const { data, error } = await requireClient().rpc('admin_user_directory', {
    p_page: page,
    p_page_size: PAGE_SIZE,
    p_search: search.trim() || null,
    p_role: role || null,
    p_from_date: fromDate || null,
    p_to_date: toDate || null,
    p_verification_status: verificationStatus || null,
  })
  if (error) throw error
  if (!data || !Array.isArray(data.data)) throw new Error('The secure user directory returned an invalid response.')
  return data
}

export async function getAdminUserDetail(userId) {
  const { data, error } = await requireClient().rpc('admin_get_user_detail', { target_user_id: userId })
  if (error) throw error
  return data
}

export async function changeUserRole(userId, role) {
  const { data, error } = await requireClient().rpc('admin_change_user_role', { target_user_id: userId, requested_role: role })
  if (error) throw error
  return data
}

export async function getAdminActivity({ page = 0 } = {}) {
  const client = requireClient()
  const [audit, registrations, stats] = await Promise.all([
    client.from('admin_audit_logs').select('id,admin_id,action,target_user_id,details,created_at', { count: 'exact' })
      .order('created_at', { ascending: false }).range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1),
    page === 0
      ? client.from('profiles').select('id,email,username,full_name,created_at').order('created_at', { ascending: false }).limit(8)
      : Promise.resolve({ data: [], error: null }),
    page === 0 ? client.rpc('admin_dashboard_stats') : Promise.resolve({ data: null, error: null }),
  ])
  if (audit.error) throw audit.error
  if (registrations.error) throw registrations.error
  if (stats.error) throw stats.error
  return { audit: audit.data || [], registrations: registrations.data || [], activityByDay: stats.data?.watchlist_activity_by_day || [], count: audit.count || 0, hasMore: (page + 1) * PAGE_SIZE < (audit.count || 0) }
}
