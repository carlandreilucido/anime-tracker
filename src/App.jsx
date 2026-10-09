import { lazy, Suspense, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import { hasSupabaseConfig, supabaseConfigError } from './lib/supabase'
import AppLayout from './components/layout/AppLayout'
import Modal from './components/ui/Modal'
import AnimeForm from './components/anime/AnimeForm'
import { ToastProvider, useToast } from './components/ui/Toast'
import { createAnime } from './services/animeService'
import AuthPage from './pages/AuthPage'
import LegalPage from './pages/LegalPage'
import { ArrowUpRight } from 'lucide-react'
import AdminLayout from './components/admin/AdminLayout'
import { findAnimeWatchProviders } from './services/providers'
import KitsuLogo from './components/ui/KitsuLogo'
const Dashboard=lazy(()=>import('./pages/Dashboard'))
const Library=lazy(()=>import('./pages/Library'))
const AnimeDetails=lazy(()=>import('./pages/AnimeDetails'))
const ProfilePage=lazy(()=>import('./pages/ProfilePage'))
const SettingsPage=lazy(()=>import('./pages/SettingsPage'))
const AdminDashboard=lazy(()=>import('./pages/AdminDashboard'))
const AdminUsers=lazy(()=>import('./pages/AdminUsers'))
const AdminUserDetail=lazy(()=>import('./pages/AdminUserDetail'))
const AdminAnime=lazy(()=>import('./pages/AdminAnime'))
const AdminActivity=lazy(()=>import('./pages/AdminActivity'))
function Setup(){return <div className="setup-page"><div className="setup-card"><KitsuLogo iconOnly className="setup-logo"/><span className="eyebrow">ONE QUICK SETUP</span><h1>Connect your Supabase project</h1><p>{supabaseConfigError || 'Your Supabase configuration is invalid.'} Add the project URL and public anon/publishable key to local <code>.env.local</code> and the Vercel environment, then restart or redeploy so Vite includes the values.</p><pre>VITE_SUPABASE_URL=https://your-project.supabase.co<br/>VITE_SUPABASE_ANON_KEY=your-publishable-or-anon-key</pre><a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer">Open Supabase dashboard <ArrowUpRight size={14}/></a></div></div>}
function Spinner(){return <div className="route-loading"><div className="spinner"/><span>Getting your space ready…</span></div>}
function AppRoutes(){const {user,loading}=useAuth();const location=useLocation();const navigate=useNavigate();const toast=useToast();const [showAdd,setShowAdd]=useState(false);const [refresh,setRefresh]=useState(0);if(!hasSupabaseConfig)return <Setup/>;if(loading)return <Spinner/>;if(!user)return <Routes><Route path="/register" element={<AuthPage register/>}/><Route path="*" element={<AuthPage/>}/></Routes>;const add=async values=>{try{const anime=await createAnime(values);setShowAdd(false);setRefresh(v=>v+1);toast('Anime added to your library!');findAnimeWatchProviders(anime.id).catch(()=>toast('Anime was added, but watch providers could not be checked right now.','error'));if(location.pathname!=='/'){navigate('/library')}}catch(e){toast(e.message||'Could not add anime.','error');throw e}};const changed=()=>setRefresh(v=>v+1);return <><Routes><Route element={<AppLayout/>}><Route path="/" element={<Suspense fallback={<Spinner/>}><Dashboard refresh={refresh} onAdd={()=>setShowAdd(true)}/></Suspense>}/><Route path="/library" element={<Suspense fallback={<Spinner/>}><Library refresh={refresh} onAdd={()=>setShowAdd(true)}/></Suspense>}/><Route path="/watching" element={<Navigate to="/library?status=watching" replace/>}/><Route path="/plan" element={<Navigate to="/library?status=plan_to_watch" replace/>}/><Route path="/completed" element={<Navigate to="/library?status=completed" replace/>}/><Route path="/favorites" element={<Navigate to="/library?favorites=true" replace/>}/><Route path="/profile" element={<Suspense fallback={<Spinner/>}><ProfilePage/></Suspense>}/><Route path="/settings" element={<Suspense fallback={<Spinner/>}><SettingsPage/></Suspense>}/><Route path="/anime/:id" element={<Suspense fallback={<Spinner/>}><AnimeDetails refresh={refresh} onChanged={changed}/></Suspense>}/><Route path="*" element={<Navigate to="/" replace/>}/></Route><Route path="/admin" element={<AdminLayout/>}><Route index element={<Suspense fallback={<Spinner/>}><AdminDashboard/></Suspense>}/><Route path="users" element={<Suspense fallback={<Spinner/>}><AdminUsers/></Suspense>}/><Route path="users/:userId" element={<Suspense fallback={<Spinner/>}><AdminUserDetail/></Suspense>}/><Route path="anime" element={<Suspense fallback={<Spinner/>}><AdminAnime/></Suspense>}/><Route path="activity" element={<Suspense fallback={<Spinner/>}><AdminActivity/></Suspense>}/><Route path="settings" element={<Suspense fallback={<Spinner/>}><SettingsPage/></Suspense>}/></Route></Routes>{showAdd&&<Modal title="Add anime to your library" onClose={()=>setShowAdd(false)} wide><AnimeForm onSubmit={add}/></Modal>}</>}
function AppContent(){const {pathname}=useLocation();if(pathname==='/terms'||pathname==='/privacy')return <LegalPage/>;return <AppRoutes/>}
export default function App(){return <ToastProvider><AppContent/></ToastProvider>}
