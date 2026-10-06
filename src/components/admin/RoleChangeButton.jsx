import { useState } from 'react'
import { Shield, ShieldOff } from 'lucide-react'
import Modal from '../ui/Modal'
import { changeUserRole } from '../../services/adminService'
import { useToast } from '../ui/Toast'
import { readableError } from '../../utils/format'

export default function RoleChangeButton({ userProfile, currentUserId, onChanged, compact = false }) {
  const [confirm, setConfirm] = useState(false)
  const [saving, setSaving] = useState(false)
  const toast = useToast()
  const nextRole = userProfile.role === 'admin' ? 'user' : 'admin'
  const label = nextRole === 'admin' ? 'Make administrator' : 'Remove admin role'
  const change = async () => {
    setSaving(true)
    try {
      await changeUserRole(userProfile.id, nextRole)
      toast(nextRole === 'admin' ? 'Administrator role granted.' : 'Administrator role removed.')
      setConfirm(false)
      onChanged?.()
    } catch (error) {
      toast(readableError(error), 'error')
    } finally {
      setSaving(false)
    }
  }

  return <>
    <button className={compact ? 'admin-icon-action' : 'outline-btn admin-role-button'} onClick={event=>{event.stopPropagation();setConfirm(true)}} title={label} aria-label={`${label} for ${userProfile.full_name || userProfile.username}`}>
      {nextRole === 'admin' ? <Shield size={14}/> : <ShieldOff size={14}/>} {!compact&&label}
    </button>
    {confirm&&<Modal title={nextRole==='admin'?'Grant administrator access?':'Remove administrator access?'} onClose={()=>!saving&&setConfirm(false)}>
      <p className="confirm-copy">{nextRole==='admin'?<>Make <strong>{userProfile.full_name||userProfile.username}</strong> an administrator?</>:<>Remove administrator access from <strong>{userProfile.full_name||userProfile.username}</strong>?{userProfile.id===currentUserId&&' You may lose access to the admin area.'}</>} The change is recorded in the admin audit log.{nextRole==='user'?' The last remaining administrator cannot be demoted.':''}</p>
      <div className="confirm-actions"><button className="outline-btn" disabled={saving} onClick={()=>setConfirm(false)}>Cancel</button><button className="primary-btn" disabled={saving} onClick={change}>{saving?'Updating…':label}</button></div>
    </Modal>}
  </>
}
