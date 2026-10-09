import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { LayoutDashboard, Library, Play, Bookmark, Check, Heart, LogOut, Menu, X, Clapperboard as Sparkles, ChevronDown, UserRound, Settings, Shield, House } from 'lucide-react'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useProfile } from '../../contexts/ProfileContext'
import ThemeToggle from '../ui/ThemeToggle'
import KitsuLogo from '../ui/KitsuLogo'
const AnimeAssistant = lazy(() => import('../chat/AnimeAssistant'))

const links = [
  { to: '/', key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { to: '/library', key: 'library', label: 'My library', icon: Library },
  { to: '/watching', key: 'watching', label: 'Watching', icon: Play },
  { to: '/plan', key: 'plan', label: 'Plan to watch', icon: Bookmark },
  { to: '/completed', key: 'completed', label: 'Completed', icon: Check },
  { to: '/favorites', key: 'favorites', label: 'Favorites', icon: Heart },
]

function getActiveLink(pathname, search) {
  if (pathname === '/') return 'overview'
  if (pathname === '/watching') return 'watching'
  if (pathname === '/plan') return 'plan'
  if (pathname === '/completed') return 'completed'
  if (pathname === '/favorites') return 'favorites'
  if (pathname !== '/library') return null

  const params = new URLSearchParams(search)
  if (params.get('favorites') === 'true') return 'favorites'
  const status = params.get('status')
  if (status === 'watching') return 'watching'
  if (status === 'plan_to_watch') return 'plan'
  if (status === 'completed') return 'completed'
  return 'library'
}

export default function AppLayout() {
  const { user, signOut } = useAuth()
  const { profile } = useProfile()
  const [open, setOpen] = useState(false)
  const [assistantOpenRequest, setAssistantOpenRequest] = useState(0)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const profileMenuRef = useRef(null)
  const mobileMenuRef = useRef(null)
  const navigate = useNavigate()
  const location = useLocation()
  const activeLink = getActiveLink(location.pathname, location.search)
  const libraryActive = ['library', 'plan', 'completed', 'favorites'].includes(activeLink)
    || location.pathname.startsWith('/anime/')
  const profileActive = ['/profile', '/settings'].includes(location.pathname)
  const logout = async () => { setProfileMenuOpen(false); setMobileMenuOpen(false); await signOut(); navigate('/login') }
  const openAssistant = () => setAssistantOpenRequest(request => request + 1)
  useEffect(() => { setProfileMenuOpen(false); setMobileMenuOpen(false) }, [location.pathname])
  useEffect(() => {
    const closeOnOutsideClick = event => {
      if (!profileMenuRef.current?.contains(event.target)) setProfileMenuOpen(false)
      if (!mobileMenuRef.current?.contains(event.target)) setMobileMenuOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    return () => document.removeEventListener('mousedown', closeOnOutsideClick)
  }, [])
  useEffect(() => {
    if (!mobileMenuOpen) return undefined
    const closeOnEscape = event => { if (event.key === 'Escape') setMobileMenuOpen(false) }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [mobileMenuOpen])
  const displayName = profile?.full_name || profile?.username || user?.email?.split('@')[0] || 'Anime fan'

  return <div className={`app-shell ${mobileMenuOpen ? 'mobile-account-open' : ''}`}>
    <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
      <div className="brand"><KitsuLogo/><button className="mobile-close" onClick={() => setOpen(false)} aria-label="Close menu"><X size={19}/></button></div>
      <div className="workspace-label">YOUR SPACE</div>
      <nav className="side-nav">
        {links.slice(0, 1).map(({ to, key, label, icon: Icon }) => <NavLink key={key} to={to} end onClick={() => setOpen(false)} className={`nav-link ${activeLink === key ? 'active' : ''}`} aria-current={activeLink === key ? 'page' : undefined}><Icon size={18}/><span>{label}</span></NavLink>)}
        <div className="nav-group">
          {links.slice(1, 2).map(({ to, key, label, icon: Icon }) => <NavLink key={key} to={to} onClick={() => setOpen(false)} className={`nav-link library-parent ${activeLink === key ? 'active' : ''}`} aria-current={activeLink === key ? 'page' : undefined}><Icon size={18}/><span>{label}</span></NavLink>)}
          <div className="nav-children">{links.slice(2).map(({ to, key, label, icon: Icon }) => <NavLink key={key} to={to} onClick={() => setOpen(false)} className={`nav-link nav-child-link ${activeLink === key ? 'active' : ''}`} aria-current={activeLink === key ? 'page' : undefined}><Icon size={16}/><span>{label}</span></NavLink>)}</div>
        </div>
      </nav>
      <div className="sidebar-bottom"><div className="sidebar-note"><Sparkles className="note-icon" size={16}/><p>Every episode is a little closer to the ending.</p></div><div className="profile-menu" ref={profileMenuRef}><button className="user-profile profile-menu-trigger" aria-haspopup="menu" aria-expanded={profileMenuOpen} onClick={()=>setProfileMenuOpen(value=>!value)}><span className="avatar">{profile?.avatar_url?<img src={profile.avatar_url} alt=""/>:displayName[0]?.toUpperCase()}</span><span className="user-info"><strong>{displayName}</strong><span>{profile?.username?`@${profile.username}`:'Personal account'}</span></span><ChevronDown className="profile-menu-chevron" size={15}/></button>{profileMenuOpen&&<div className="profile-dropdown" role="menu"><NavLink role="menuitem" to="/profile"><UserRound size={15}/> Profile</NavLink><NavLink role="menuitem" to="/settings"><Settings size={15}/> Settings</NavLink>{profile?.role==='admin'&&<NavLink role="menuitem" to="/admin"><Shield size={15}/> Admin dashboard</NavLink>}<button role="menuitem" onClick={logout}><LogOut size={15}/> Log out</button></div>}</div></div>
    </aside>
        <div className="main-column"><header className="topbar"><button className="menu-toggle icon-btn" onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={20}/></button><div className="topbar-crumb">Your anime, <span>your pace.</span></div><ThemeToggle/></header>{open && <button className="mobile-scrim" onClick={() => setOpen(false)} aria-label="Close menu"/>}<main className="main-content"><Outlet/></main><footer className="site-footer">Made for the stories that stay with you <Sparkles size={11}/><span className="footer-legal-links"><NavLink to="/terms">Terms &amp; Conditions</NavLink><span>·</span><NavLink to="/privacy">Privacy Policy</NavLink></span></footer></div>
    <nav className="mobile-bottom-nav" aria-label="Primary navigation">
      <NavLink to="/" end className={`mobile-bottom-nav-item ${activeLink === 'overview' ? 'active' : ''}`} aria-current={activeLink === 'overview' ? 'page' : undefined}>
        <House size={20}/><span>Home</span>
      </NavLink>
      <NavLink to="/library" className={`mobile-bottom-nav-item ${libraryActive && activeLink !== 'watching' ? 'active' : ''}`} aria-current={libraryActive && activeLink !== 'watching' ? 'page' : undefined}>
        <Library size={20}/><span>Library</span>
      </NavLink>
      <NavLink to="/library?status=watching" className={`mobile-bottom-nav-item ${activeLink === 'watching' ? 'active' : ''}`} aria-current={activeLink === 'watching' ? 'page' : undefined}>
        <Play size={20}/><span>Watching</span>
      </NavLink>
      <div className="mobile-nav-menu" ref={mobileMenuRef}>
        <button type="button" className={`mobile-bottom-nav-item ${profileActive ? 'active' : ''}`} onClick={() => setMobileMenuOpen(value => !value)} aria-label={mobileMenuOpen ? 'Close account menu' : 'Open account menu'} aria-haspopup="menu" aria-expanded={mobileMenuOpen}>
          <Menu size={20}/><span>Menu</span>
        </button>
        {mobileMenuOpen && <div className="mobile-account-menu" role="menu" aria-label="Account menu">
          <div className="mobile-account-summary"><span className="avatar">{profile?.avatar_url ? <img src={profile.avatar_url} alt=""/> : displayName[0]?.toUpperCase()}</span><span><strong>{displayName}</strong><small>{profile?.username ? `@${profile.username}` : 'Personal account'}</small></span></div>
          <NavLink role="menuitem" to="/profile" onClick={() => setMobileMenuOpen(false)}><UserRound size={17}/>Profile</NavLink>
          <NavLink role="menuitem" to="/settings" onClick={() => setMobileMenuOpen(false)}><Settings size={17}/>Settings</NavLink>
          {profile?.role === 'admin' && <NavLink role="menuitem" to="/admin" onClick={() => setMobileMenuOpen(false)}><Shield size={17}/>Admin dashboard</NavLink>}
          <button role="menuitem" type="button" onClick={logout}><LogOut size={17}/>Log out</button>
        </div>}
      </div>
    </nav>
       <Suspense fallback={null}><AnimeAssistant openRequest={assistantOpenRequest}/></Suspense>
  </div>
}
