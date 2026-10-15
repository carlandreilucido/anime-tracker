import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, ChevronLeft, ChevronRight, Users, X } from 'lucide-react'
import { getAdminUsers } from '../services/adminService'
import { PAGE_SIZE } from '../constants'
import { readableError } from '../utils/format'
import { verificationStatusLabel } from '../utils/accountStatus'
import RoleChangeButton from '../components/admin/RoleChangeButton'
import { useAuth } from '../contexts/AuthContext'
import { useProfile } from '../contexts/ProfileContext'

function dateLabel(value) {
  return value ? new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—'
}

function userInitials(user) {
  return (user.full_name?.trim() || user.username || user.email || 'U')
    .split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map(part => part[0].toUpperCase()).join('')
}

const emptyResult = { data: [], count: 0, hasMore: false, total_registered: 0, verified_count: 0, pending_count: 0, disabled_count: 0 }

export default function AdminUsers() {
  const { user: currentUser } = useAuth()
  const { refreshProfile } = useProfile()
  const [search, setSearch] = useState('')
  const [role, setRole] = useState('')
  const [verificationStatus, setVerificationStatus] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [page, setPage] = useState(0)
  const [result, setResult] = useState(emptyResult)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async (nextPage = 0) => {
    setLoading(true)
    setError('')
    try {
      setResult(await getAdminUsers({ page: nextPage, search, role, fromDate, toDate, verificationStatus }))
      setPage(nextPage)
    } catch (cause) {
      setError(readableError(cause))
    } finally {
      setLoading(false)
    }
  }, [search, role, fromDate, toDate, verificationStatus])

  useEffect(() => {
    const timer = setTimeout(() => load(0), search ? 250 : 0)
    return () => clearTimeout(timer)
  }, [load, search])

  const pages = Math.max(1, Math.ceil(result.count / PAGE_SIZE))
  const clear = () => {
    setSearch('')
    setRole('')
    setVerificationStatus('')
    setFromDate('')
    setToDate('')
  }
  const filtered = Boolean(search || role || verificationStatus || fromDate || toDate)

  return <div className="admin-page">
    <header className="admin-page-heading">
      <div><span className="admin-eyebrow">DIRECTORY</span><h1>Users</h1><p>Search accounts, review verification, and manage administrator access.</p></div>
      <div className="admin-heading-count"><Users size={16}/>{loading ? '…' : result.count.toLocaleString()} accounts</div>
    </header>

    <section className="admin-stats-grid admin-account-stats" aria-label="Account verification totals">
      {[
        ['Registered records', result.total_registered],
        ['Verified accounts', result.verified_count],
        ['Pending verification', result.pending_count],
        ['Disabled accounts', result.disabled_count],
      ].map(([label, value]) => <article className="admin-stat-card" key={label}>
        <div className="admin-stat-top"><span>{label}</span></div>
        <strong>{loading ? '—' : Number(value || 0).toLocaleString()}</strong>
        <span className="admin-stat-label">{label}</span>
      </article>)}
    </section>

    <section className="admin-filter-panel">
      <label className="admin-search"><Search size={16}/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search name, username, or email" aria-label="Search users"/>{search && <button onClick={() => setSearch('')} aria-label="Clear search"><X size={14}/></button>}</label>
      <label className="admin-filter-field"><span>Verification status</span><select value={verificationStatus} onChange={event => setVerificationStatus(event.target.value)}><option value="">All accounts</option><option value="verified">Verified</option><option value="pending_verification">Pending Verification</option><option value="disabled">Disabled</option></select></label>
      <label className="admin-filter-field"><span>Role</span><select value={role} onChange={event => setRole(event.target.value)}><option value="">All roles</option><option value="user">User</option><option value="admin">Admin</option></select></label>
      <label className="admin-filter-field"><span>Joined after</span><input type="date" value={fromDate} onChange={event => setFromDate(event.target.value)}/></label>
      <label className="admin-filter-field"><span>Joined before</span><input type="date" value={toDate} onChange={event => setToDate(event.target.value)}/></label>
      {filtered && <button className="admin-clear-filters" onClick={clear}>Clear filters <X size={13}/></button>}
    </section>

    {error && <div className="admin-error" role="alert">{error}<button onClick={() => load(page)}>Retry</button></div>}
    <section className="admin-table-panel"><div className="admin-table-scroll"><table className="admin-users-table">
      <thead><tr><th>Member</th><th>Username</th><th>Email</th><th>Role</th><th>Account status</th><th>Joined</th><th>Actions</th></tr></thead>
      <tbody>{loading
        ? Array.from({ length: 6 }, (_, index) => <tr key={index}><td colSpan="7"><div className="admin-row-skeleton"/></td></tr>)
        : result.data.map(member => <tr key={member.id}>
          <td><Link className="admin-member-cell" to={`/admin/users/${member.id}`}><span className="admin-user-avatar">{member.avatar_url ? <img src={member.avatar_url} alt="" loading="lazy"/> : userInitials(member)}</span><span><strong>{member.full_name || member.username || member.email}</strong><small>View details</small></span></Link></td>
          <td>{member.username ? `@${member.username}` : '—'}</td>
          <td className="admin-email-cell">{member.email || '—'}</td>
          <td><span className={`admin-role-tag ${member.role === 'admin' ? 'admin' : ''}`}>{member.role === 'admin' ? 'Admin' : 'User'}</span></td>
          <td><span className={`admin-verification-badge ${member.verification_status}`}>{verificationStatusLabel(member.verification_status)}</span></td>
          <td>{dateLabel(member.created_at)}</td>
          <td><RoleChangeButton userProfile={member} currentUserId={currentUser?.id} compact onChanged={() => { load(page); if (member.id === currentUser?.id) refreshProfile() }}/></td>
        </tr>)}
      </tbody>
    </table>
    {!loading && !result.data.length && <div className="admin-empty"><Users size={22}/><strong>{filtered ? 'No users matched those filters' : 'No users found'}</strong><span>{filtered ? 'Try changing or clearing your filters.' : 'User registrations will appear here.'}</span>{filtered && <button className="text-link" onClick={clear}>Clear filters</button>}</div>}
    </div><footer className="admin-table-footer"><span>{result.count ? `Showing ${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, result.count)} of ${result.count.toLocaleString()}` : 'No accounts'}</span><div><button className="admin-page-btn" disabled={loading || page === 0} onClick={() => load(page - 1)} aria-label="Previous page"><ChevronLeft size={16}/></button><span>Page {page + 1} of {pages}</span><button className="admin-page-btn" disabled={loading || !result.hasMore} onClick={() => load(page + 1)} aria-label="Next page"><ChevronRight size={16}/></button></div></footer></section>
  </div>
}
