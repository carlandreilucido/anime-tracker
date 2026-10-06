import { useEffect, useState } from 'react'
import { ArrowUpRight, Check, CircleDashed, LoaderCircle, Play, ShieldCheck, Users, UserPlus, Library, RefreshCw } from 'lucide-react'
import { Link } from 'react-router-dom'
import { getAdminStats } from '../services/adminService'
import { readableError } from '../utils/format'

const cards = [
  { key: 'total_users', label: 'Total users', icon: Users, note: 'Registered accounts' },
  { key: 'new_users_today', label: 'New users today', icon: UserPlus, note: 'Since midnight' },
  { key: 'new_users_this_month', label: 'New this month', icon: CircleDashed, note: 'Current month' },
  { key: 'unique_anime_titles', label: 'Unique anime titles', icon: Library, note: 'Distinct collection entries' },
  { key: 'total_anime_added', label: 'Watchlist entries', icon: Library, note: 'Across all accounts' },
  { key: 'currently_watching', label: 'Currently watching', icon: Play, note: 'Active entries' },
  { key: 'completed_anime', label: 'Completed', icon: Check, note: 'Completed entries' },
]
const number = value => Number(value || 0).toLocaleString()

export default function AdminDashboard() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = async () => { setLoading(true); setError(''); try { setStats(await getAdminStats()) } catch (cause) { setError(readableError(cause)) } finally { setLoading(false) } }
  useEffect(() => { load() }, [])
  const registrations = stats?.registrations_by_month || []
  const maxRegistrations = Math.max(1, ...registrations.map(row => row.count || 0))

  return <div className="admin-page">
    <header className="admin-page-heading"><div><span className="admin-eyebrow">OVERVIEW</span><h1>Dashboard</h1><p>A live snapshot of your anime community.</p></div><button className="outline-btn" onClick={load} disabled={loading}><RefreshCw size={14} className={loading?'spin':''}/> Refresh</button></header>
    {error&&<div className="admin-error" role="alert">{error}<button onClick={load}>Retry</button></div>}
    <section className="admin-stats-grid">{cards.map(({key,label,icon:Icon,note})=><article className="admin-stat-card" key={key}><div className="admin-stat-top"><span className="admin-stat-icon"><Icon size={17}/></span><span>{note}</span></div><strong>{loading?'—':number(stats?.[key])}</strong><span className="admin-stat-label">{label}</span></article>)}</section>
    <div className="admin-dashboard-grid"><section className="admin-panel registrations-panel"><header className="admin-panel-heading"><div><span className="admin-eyebrow">GROWTH</span><h2>User registrations</h2></div><UserPlus size={18}/></header>{loading?<div className="admin-panel-loading"><LoaderCircle className="spin" size={18}/> Loading statistics…</div>:<div className="registration-chart" aria-label="User registrations over the last 12 months">{registrations.map(row=><div className="chart-month" key={row.month}><span className="chart-bar-track"><span className="chart-bar" style={{height:`${Math.max(row.count?7:2,((row.count||0)/maxRegistrations)*100)}%`}} title={`${row.count} new users`}/></span><span className="chart-count">{row.count}</span><span className="chart-month-label">{row.month}</span></div>)}</div>}</section>
      <section className="admin-panel quick-panel"><header className="admin-panel-heading"><div><span className="admin-eyebrow">SHORTCUTS</span><h2>Management</h2></div><ShieldCheck size={18}/></header><Link to="/admin/users" className="admin-shortcut"><span className="shortcut-icon"><Users size={17}/></span><span><strong>Manage users</strong><small>Search, review, and manage roles</small></span><ArrowUpRight size={15}/></Link><Link to="/admin/anime" className="admin-shortcut"><span className="shortcut-icon"><Library size={17}/></span><span><strong>Watchlist analytics</strong><small>Aggregate usage without exposing lists</small></span><ArrowUpRight size={15}/></Link><Link to="/admin/activity" className="admin-shortcut"><span className="shortcut-icon"><CircleDashed size={17}/></span><span><strong>Audit activity</strong><small>Review registrations and role changes</small></span><ArrowUpRight size={15}/></Link></section></div>
    <div className="admin-dashboard-grid lower-admin-grid"><section className="admin-panel"><header className="admin-panel-heading"><div><span className="admin-eyebrow">POPULAR</span><h2>Most added anime</h2></div><Link className="admin-panel-link" to="/admin/anime">All analytics <ArrowUpRight size={14}/></Link></header>{loading?<div className="admin-panel-loading">Loading…</div>:stats?.most_added_anime?.length?<div className="popular-list">{stats.most_added_anime.slice(0,5).map((row,index)=><div className="popular-row" key={row.title}><span className="popular-rank">{String(index+1).padStart(2,'0')}</span><strong>{row.title}</strong><span>{number(row.entries)} entries</span></div>)}</div>:<p className="admin-muted">No watchlist entries yet.</p>}</section><section className="admin-panel"><header className="admin-panel-heading"><div><span className="admin-eyebrow">STATUS</span><h2>Watchlist distribution</h2></div><Library size={18}/></header><div className="status-count-list">{[['Currently watching','currently_watching'],['Plan to watch','plan_to_watch'],['Completed','completed_anime'],['On hold','on_hold'],['Dropped','dropped']].map(([label,key])=><div key={key}><span>{label}</span><strong>{loading?'—':number(stats?.[key])}</strong></div>)}</div></section></div>
  </div>
}
