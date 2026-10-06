import { Link } from 'react-router-dom'
import { ArrowRight, LockKeyhole } from 'lucide-react'

export default function SettingsPage() {
  return <div className="page profile-page"><header className="profile-page-heading"><div><span className="eyebrow">YOUR ACCOUNT</span><h1>Settings</h1><p>Account access and personal details.</p></div></header><section className="profile-card settings-card"><div className="settings-icon"><LockKeyhole size={20}/></div><div><h2>Sign-in and security</h2><p>Your email and authentication are securely managed by Supabase Auth. To update your profile details, visit your profile page.</p><Link className="text-link" to="/profile">Open profile <ArrowRight size={15}/></Link></div></section></div>
}
