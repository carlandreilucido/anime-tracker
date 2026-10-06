import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { LayoutDashboard, Library, Play, Bookmark, Check, Heart, LogOut, Plus, Menu, X, Sparkles, ChevronDown, UserRound, Settings, Shield } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useProfile } from '../../contexts/ProfileContext'

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

export default function AppLayout({ onAdd }) {
  const { user, signOut } = useAuth()
  const { profile } = useProfile()
  const [open, setOpen] = useState(false)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const profileMenuRef = useRef(null)
  const navigate = useNavigate()
  const location = useLocation()
  const activeLink = getActiveLink(location.pathname, location.search)
  const logout = async () => { await signOut(); navigate('/login') }
  useEffect(() => { setProfileMenuOpen(false) }, [location.pathname])
  useEffect(() => {
    const closeOnOutsideClick = event => { if (!profileMenuRef.current?.contains(event.target)) setProfileMenuOpen(false) }
    document.addEventListener('mousedown', closeOnOutsideClick)
    return () => document.removeEventListener('mousedown', closeOnOutsideClick)
  }, [])
  const displayName = profile?.full_name || profile?.username || user?.email?.split('@')[0] || 'Anime fan'

  return <div className="app-shell">
    <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
      <div className="brand"><span className="brand-mark"><Sparkles size={19}/></span><span>kitsu<span className="brand-dot">.</span></span><button className="mobile-close" onClick={() => setOpen(false)} aria-label="Close menu"><X size={19}/></button></div>
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
    <div className="main-column"><header className="topbar"><button className="menu-toggle icon-btn" onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={20}/></button><div className="topbar-crumb">Your anime, <span>your pace.</span></div><button className="primary-btn add-top" onClick={onAdd}><Plus size={17}/> Add anime</button></header>{open && <button className="mobile-scrim" onClick={() => setOpen(false)} aria-label="Close menu"/>}<main className="main-content"><Outlet/></main><footer className="site-footer">Made for the stories that stay with you <Sparkles size={11}/></footer></div>
  </div>
}
