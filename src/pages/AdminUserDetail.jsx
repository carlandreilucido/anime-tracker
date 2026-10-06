import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, CalendarDays, Mail, AtSign, Shield, Library, Play, Check, Bookmark, Pause, XCircle, LoaderCircle } from 'lucide-react'
import { getAdminUserDetail } from '../services/adminService'
import { readableError } from '../utils/format'
import { useAuth } from '../contexts/AuthContext'
import { useProfile } from '../contexts/ProfileContext'
import RoleChangeButton from '../components/admin/RoleChangeButton'

const dateLabel=value=>value?new Date(value).toLocaleDateString(undefined,{year:'numeric',month:'long',day:'numeric'}):'—'
const countLabel=value=>Number(value||0).toLocaleString()

export default function AdminUserDetail() {
  const { userId } = useParams()
  const { user:currentUser } = useAuth()
  const { refreshProfile } = useProfile()
  const [result,setResult]=useState(null)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const load=async()=>{setLoading(true);setError('');try{setResult(await getAdminUserDetail(userId))}catch(cause){setError(readableError(cause))}finally{setLoading(false)}}
  useEffect(()=>{load()},[userId])
  if(loading)return <div className="admin-detail-loading"><LoaderCircle className="spin" size={20}/> Loading user details…</div>
  if(error||!result)return <div className="admin-page"><Link className="admin-back-link" to="/admin/users"><ArrowLeft size={15}/> Back to users</Link><div className="admin-error" role="alert">{error||'User not found.'}<button onClick={load}>Retry</button></div></div>
  const member=result.profile
  const counts=result.anime_counts||{}
  const initials=(member.full_name||member.username||member.email||'U').split(/[\s@._-]+/).filter(Boolean).slice(0,2).map(part=>part[0].toUpperCase()).join('')
  const cards=[['Total anime',counts.total,Library],['Currently watching',counts.watching,Play],['Completed',counts.completed,Check],['Plan to watch',counts.plan_to_watch,Bookmark],['On hold',counts.on_hold,Pause],['Dropped',counts.dropped,XCircle]]
  return <div className="admin-page">
    <Link className="admin-back-link" to="/admin/users"><ArrowLeft size={15}/> Back to users</Link>
    <section className="admin-user-hero"><div className="admin-user-hero-avatar">{member.avatar_url?<img src={member.avatar_url} alt=""/>:initials}</div><div className="admin-user-hero-copy"><span className="admin-eyebrow">USER PROFILE</span><h1>{member.full_name||member.username}</h1><p>@{member.username}</p></div><div className="admin-user-hero-action"><span className={`admin-role-tag ${member.role==='admin'?'admin':''}`}>{member.role==='admin'?'Admin':'User'}</span><RoleChangeButton userProfile={member} currentUserId={currentUser?.id} onChanged={()=>{load();if(member.id===currentUser?.id)refreshProfile()}}/></div></section>
    <section className="admin-user-info-grid"><div><Mail size={15}/><span>Email</span><strong>{member.email}</strong></div><div><AtSign size={15}/><span>Username</span><strong>@{member.username}</strong></div><div><Shield size={15}/><span>Account role</span><strong>{member.role==='admin'?'Administrator':'User'}</strong></div><div><CalendarDays size={15}/><span>Joined</span><strong>{dateLabel(member.created_at)}</strong></div></section>
    <header className="admin-subheading"><div><span className="admin-eyebrow">WATCHLIST SUMMARY</span><h2>Anime activity</h2></div></header>
    <section className="admin-user-count-grid">{cards.map(([label,value,Icon])=><article className="admin-user-count-card" key={label}><span><Icon size={16}/>{label}</span><strong>{countLabel(value)}</strong></article>)}</section>
    <section className="admin-privacy-note"><Shield size={16}/><p>To preserve users’ private watchlists, this admin view shows status totals only. Anime titles, notes, ratings, and episode-level data are not exposed.</p></section>
  </div>
}
