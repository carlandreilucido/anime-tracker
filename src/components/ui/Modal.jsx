import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
export default function Modal({ title, onClose, children, wide=false, className='', backdropClassName='' }) {
  const backdropRef = useRef(null)
  useEffect(()=>{
    const handler=e=>{if(e.key==='Escape') onClose()}
    const viewport = window.visualViewport
    const syncViewport = () => {
      const node = backdropRef.current
      if (!node) return
      node.style.setProperty('--modal-viewport-height', `${viewport?.height || window.innerHeight}px`)
      node.style.setProperty('--modal-viewport-top', `${viewport?.offsetTop || 0}px`)
    }
    const previousOverflow = document.body.style.overflow
    syncViewport()
    window.addEventListener('keydown',handler)
    viewport?.addEventListener('resize',syncViewport)
    viewport?.addEventListener('scroll',syncViewport)
    window.addEventListener('resize',syncViewport)
    document.body.style.overflow='hidden'
    return()=>{
      window.removeEventListener('keydown',handler)
      viewport?.removeEventListener('resize',syncViewport)
      viewport?.removeEventListener('scroll',syncViewport)
      window.removeEventListener('resize',syncViewport)
      document.body.style.overflow=previousOverflow
    }
  },[onClose])
  return createPortal(<div ref={backdropRef} className={`modal-backdrop ${backdropClassName}`} onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><section className={`modal ${wide?'modal-wide':''} ${className}`} role="dialog" aria-modal="true" aria-labelledby="modal-title"><header className="modal-head"><h2 id="modal-title">{title}</h2><button className="icon-btn" onClick={onClose} aria-label="Close"><X size={19}/></button></header>{children}</section></div>, document.body)
}
