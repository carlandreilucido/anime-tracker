import { createContext, useContext, useState } from 'react'
import { Check, X, AlertCircle } from 'lucide-react'
const ToastContext = createContext(() => {})
export const useToast = () => useContext(ToastContext)
export function ToastProvider({ children }) {
  const [items, setItems] = useState([])
  const toast = (message, type='success') => { const id = Date.now(); setItems(v => [...v, {id,message,type}]); setTimeout(() => setItems(v => v.filter(t => t.id !== id)), 3400) }
  return <ToastContext.Provider value={toast}>{children}<div className="toast-stack" aria-live="polite">{items.map(t=><div className={`toast ${t.type}`} key={t.id}>{t.type==='error'?<AlertCircle size={17}/>:<Check size={17}/>}<span>{t.message}</span><button aria-label="Dismiss notification" onClick={()=>setItems(v=>v.filter(x=>x.id!==t.id))}><X size={15}/></button></div>)}</div></ToastContext.Provider>
}
