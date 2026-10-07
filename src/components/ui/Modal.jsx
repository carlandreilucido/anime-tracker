import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
export default function Modal({ title, onClose, children, wide=false }) {
  useEffect(()=>{ const handler=e=>{if(e.key==='Escape') onClose()}; window.addEventListener('keydown',handler); document.body.style.overflow='hidden'; return()=>{window.removeEventListener('keydown',handler);document.body.style.overflow=''} },[onClose])
  return createPortal(<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><section className={`modal ${wide?'modal-wide':''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title"><header className="modal-head"><h2 id="modal-title">{title}</h2><button className="icon-btn" onClick={onClose} aria-label="Close"><X size={19}/></button></header>{children}</section></div>, document.body)
}
