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

export async function getAdminUsers({ page = 0, search = '', role = '', fromDate = '', toDate = '' } = {}) {
  let query = requireClient().from('profiles')
    .select('id,email,username,full_name,avatar_url,role,created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
  if (role) query = query.eq('role', role)
  if (fromDate) query = query.gte('created_at', `${fromDate}T00:00:00.000Z`)
  if (toDate) {
    const exclusiveEnd = new Date(`${toDate}T00:00:00.000Z`)
    exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() + 1)
    query = query.lt('created_at', exclusiveEnd.toISOString())
  }
  const term = search.trim().replace(/[(),%"\\]/g, '')
  if (term) query = query.or(`full_name.ilike.%${term}%,username.ilike.%${term}%,email.ilike.%${term}%`)
  const { data, error, count } = await query.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
  if (error) throw error
  return { data: data || [], count: count || 0, hasMore: (page + 1) * PAGE_SIZE < (count || 0) }
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
