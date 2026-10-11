import { Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, ClipboardList, LayoutDashboard, Library, LogOut, Settings, Shield, Users } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useProfile } from '../../contexts/ProfileContext'
import ThemeToggle from '../ui/ThemeToggle'
import KitsuLogo from '../ui/KitsuLogo'

const adminLinks = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/anime', label: 'Anime & watchlists', icon: Library },
  { to: '/admin/activity', label: 'Activity', icon: ClipboardList },
  { to: '/admin/settings', label: 'Settings', icon: Settings },
]

function LoadingAdmin() { return <div className="admin-loading"><span className="spinner"/><span>Verifying administrator access…</span></div> }

export default function AdminLayout() {
  const { user, loading: authLoading, signOut } = useAuth()
  const { profile, loading: profileLoading, error: profileError, refreshProfile } = useProfile()
  const location = useLocation()
  const navigate = useNavigate()

  if (authLoading || (user && profileLoading)) return <LoadingAdmin/>
  if (!user) return <NavigateToLogin/>
  if (profileError || !profile) return <div className="admin-loading"><div className="admin-profile-error"><Shield size={23}/><h2>Could not verify your profile</h2><p>{profileError?.message || 'Your profile is unavailable.'}</p><button className="outline-btn" onClick={refreshProfile}>Retry</button><button className="text-link" onClick={async()=>{await signOut();navigate('/login')}}>Sign out</button></div></div>
  if (profile.role !== 'admin') return <NavigateToWebsite/>

  const name = profile.full_name || profile.username || user.email
  const currentPage = adminLinks.find(link => location.pathname === link.to || (!link.end && location.pathname.startsWith(`${link.to}/`)))?.label || 'User details'
  const logout = async () => { await signOut(); navigate('/login') }
  return <div className="admin-shell">
    <aside className="admin-sidebar">
      <div className="admin-brand"><KitsuLogo admin/></div>
      <div className="admin-side-label">ADMINISTRATION</div>
      <nav className="admin-nav">{adminLinks.map(({to,label,icon:Icon,end})=><NavLink key={to} to={to} end={end} className={({isActive})=>`admin-nav-link ${isActive?'active':''}`}><Icon size={17}/><span>{label}</span></NavLink>)}</nav>
      <div className="admin-sidebar-bottom"><NavLink className="admin-back-link" to="/"><ArrowLeft size={16}/> Back to website</NavLink><div className="admin-profile"><span className="avatar">{profile.avatar_url?<img src={profile.avatar_url} alt=""/>:name?.[0]?.toUpperCase()}</span><span className="admin-profile-copy"><strong>{name}</strong><span>Administrator</span></span><button className="icon-btn" onClick={logout} aria-label="Log out"><LogOut size={16}/></button></div></div>
    </aside>
    <main className="admin-main"><header className="admin-topbar"><div className="admin-breadcrumb">Administration <span>/</span> {currentPage}</div><strong className="admin-mobile-page-title">{currentPage}</strong><NavLink to="/" className="admin-mobile-back" aria-label="Back to website" title="Back to website"><ArrowLeft size={16}/><span>Website</span></NavLink><div className="admin-top-user"><span className="avatar">{profile.avatar_url?<img src={profile.avatar_url} alt=""/>:name?.[0]?.toUpperCase()}</span><span>{name}</span><button type="button" className="admin-mobile-logout" onClick={logout} aria-label="Log out"><LogOut size={18}/></button><ThemeToggle/></div></header><div className="admin-content"><Outlet/></div></main>
    <nav className="admin-mobile-nav" aria-label="Admin navigation">{adminLinks.map(({to,label,icon:Icon,end})=><NavLink key={to} to={to} end={end} className={({isActive})=>`admin-mobile-nav-item ${isActive?'active':''}`} aria-label={label}><Icon size={20}/><span>{label==='Anime & watchlists'?'Anime':label}</span></NavLink>)}</nav>
  </div>
}

function NavigateToWebsite() { return <Navigate to="/" replace/> }
function NavigateToLogin() { return <Navigate to="/login" replace/> }
