import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, ChevronLeft, ChevronRight, LoaderCircle, Users, X } from 'lucide-react'
import { getAdminUsers } from '../services/adminService'
import { PAGE_SIZE } from '../constants'
import { readableError } from '../utils/format'
import RoleChangeButton from '../components/admin/RoleChangeButton'
import { useAuth } from '../contexts/AuthContext'
import { useProfile } from '../contexts/ProfileContext'

function dateLabel(value) { return value ? new Date(value).toLocaleDateString(undefined, { year:'numeric', month:'short', day:'numeric' }) : '—' }
function userInitials(user) { return (user.full_name?.trim() || user.username || user.email || 'U').split(/[\s@._-]+/).filter(Boolean).slice(0,2).map(part=>part[0].toUpperCase()).join('') }

export default function AdminUsers() {
  const { user: currentUser } = useAuth()
  const { refreshProfile } = useProfile()
  const [search, setSearch] = useState('')
  const [role, setRole] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [page, setPage] = useState(0)
  const [result, setResult] = useState({ data:[], count:0, hasMore:false })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = useCallback(async (nextPage=0) => {
    setLoading(true); setError('')
    try { const response=await getAdminUsers({page:nextPage,search,role,fromDate,toDate});setResult(response);setPage(nextPage) }
    catch (cause) { setError(readableError(cause)) }
    finally { setLoading(false) }
  },[search,role,fromDate,toDate])
  useEffect(()=>{const timer=setTimeout(()=>load(0),search?250:0);return()=>clearTimeout(timer)},[load])
  const pages=Math.max(1,Math.ceil(result.count/PAGE_SIZE))
  const clear=()=>{setSearch('');setRole('');setFromDate('');setToDate('')}
  const filtered=Boolean(search||role||fromDate||toDate)

  return <div className="admin-page">
    <header className="admin-page-heading"><div><span className="admin-eyebrow">DIRECTORY</span><h1>Users</h1><p>Search accounts and manage administrator access.</p></div><div className="admin-heading-count"><Users size={16}/>{loading?'…':result.count.toLocaleString()} users</div></header>
    <section className="admin-filter-panel"><label className="admin-search"><Search size={16}/><input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Search name, username, or email" aria-label="Search users"/>{search&&<button onClick={()=>setSearch('')} aria-label="Clear search"><X size={14}/></button>}</label><label className="admin-filter-field"><span>Role</span><select value={role} onChange={event=>setRole(event.target.value)}><option value="">All roles</option><option value="user">User</option><option value="admin">Admin</option></select></label><label className="admin-filter-field"><span>Joined after</span><input type="date" value={fromDate} onChange={event=>setFromDate(event.target.value)}/></label><label className="admin-filter-field"><span>Joined before</span><input type="date" value={toDate} onChange={event=>setToDate(event.target.value)}/></label>{filtered&&<button className="admin-clear-filters" onClick={clear}>Clear filters <X size={13}/></button>}</section>
    {error&&<div className="admin-error" role="alert">{error}<button onClick={()=>load(page)}>Retry</button></div>}
    <section className="admin-table-panel"><div className="admin-table-scroll"><table className="admin-users-table"><thead><tr><th>Member</th><th>Username</th><th>Email</th><th>Role</th><th>Joined</th><th>Actions</th></tr></thead><tbody>{loading?Array.from({length:6},(_,index)=><tr key={index}><td colSpan="6"><div className="admin-row-skeleton"/></td></tr>):result.data.map(member=><tr key={member.id}><td><Link className="admin-member-cell" to={`/admin/users/${member.id}`}><span className="admin-user-avatar">{member.avatar_url?<img src={member.avatar_url} alt=""/>:userInitials(member)}</span><span><strong>{member.full_name||member.username}</strong><small>View details</small></span></Link></td><td>@{member.username}</td><td className="admin-email-cell">{member.email}</td><td><span className={`admin-role-tag ${member.role==='admin'?'admin':''}`}>{member.role==='admin'?'Admin':'User'}</span></td><td>{dateLabel(member.created_at)}</td><td><RoleChangeButton userProfile={member} currentUserId={currentUser?.id} compact onChanged={()=>{load(page);if(member.id===currentUser?.id)refreshProfile()}}/></td></tr>)}</tbody></table>{!loading&&!result.data.length&&<div className="admin-empty"><Users size={22}/><strong>{filtered?'No users matched those filters':'No users found'}</strong><span>{filtered?'Try changing or clearing the filters.':'User registrations will appear here.'}</span>{filtered&&<button className="text-link" onClick={clear}>Clear filters</button>}</div>}</div><footer className="admin-table-footer"><span>{result.count?`Showing ${page*PAGE_SIZE+1}–${Math.min((page+1)*PAGE_SIZE,result.count)} of ${result.count.toLocaleString()}`:'No users'}</span><div><button className="admin-page-btn" disabled={loading||page===0} onClick={()=>load(page-1)} aria-label="Previous page"><ChevronLeft size={16}/></button><span>Page {page+1} of {pages}</span><button className="admin-page-btn" disabled={loading||!result.hasMore} onClick={()=>load(page+1)} aria-label="Next page"><ChevronRight size={16}/></button></div></footer></section>
  </div>
}
