import { Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, ClipboardList, LayoutDashboard, Library, LogOut, Menu, Settings, Shield, Users, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useProfile } from '../../contexts/ProfileContext'

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
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  useEffect(() => { setMobileOpen(false) }, [location.pathname])

  if (authLoading || (user && profileLoading)) return <LoadingAdmin/>
  if (!user) return <NavigateToLogin/>
  if (profileError || !profile) return <div className="admin-loading"><div className="admin-profile-error"><Shield size={23}/><h2>Could not verify your profile</h2><p>{profileError?.message || 'Your profile is unavailable.'}</p><button className="outline-btn" onClick={refreshProfile}>Retry</button><button className="text-link" onClick={async()=>{await signOut();navigate('/login')}}>Sign out</button></div></div>
  if (profile.role !== 'admin') return <NavigateToWebsite/>

  const name = profile.full_name || profile.username || user.email
  const logout = async () => { await signOut(); navigate('/login') }
  return <div className="admin-shell">
    {mobileOpen&&<button className="admin-drawer-scrim" aria-label="Close admin menu" onClick={()=>setMobileOpen(false)}/>}
    <aside className={`admin-sidebar ${mobileOpen?'open':''}`}>
      <div className="admin-brand"><span className="brand-mark"><Shield size={17}/></span><span>kitsu <b>admin</b></span><button className="admin-mobile-close" aria-label="Close navigation" onClick={()=>setMobileOpen(false)}><X size={18}/></button></div>
      <div className="admin-side-label">ADMINISTRATION</div>
      <nav className="admin-nav">{adminLinks.map(({to,label,icon:Icon,end})=><NavLink key={to} to={to} end={end} className={({isActive})=>`admin-nav-link ${isActive?'active':''}`}><Icon size={17}/><span>{label}</span></NavLink>)}</nav>
      <div className="admin-sidebar-bottom"><NavLink className="admin-back-link" to="/"><ArrowLeft size={16}/> Back to website</NavLink><div className="admin-profile"><span className="avatar">{profile.avatar_url?<img src={profile.avatar_url} alt=""/>:name?.[0]?.toUpperCase()}</span><span className="admin-profile-copy"><strong>{name}</strong><span>Administrator</span></span><button className="icon-btn" onClick={logout} aria-label="Log out"><LogOut size={16}/></button></div></div>
    </aside>
    <main className="admin-main"><header className="admin-topbar"><button className="admin-menu-toggle icon-btn" aria-label="Open admin navigation" onClick={()=>setMobileOpen(true)}><Menu size={20}/></button><div className="admin-breadcrumb">Administration <span>/</span> {adminLinks.find(link=>link.to===location.pathname)?.label||'User details'}</div><div className="admin-top-user"><span className="avatar">{profile.avatar_url?<img src={profile.avatar_url} alt=""/>:name?.[0]?.toUpperCase()}</span><span>{name}</span></div></header><div className="admin-content"><Outlet/></div></main>
  </div>
}

function NavigateToWebsite() { return <Navigate to="/" replace/> }
function NavigateToLogin() { return <Navigate to="/login" replace/> }
