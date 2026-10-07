import { useEffect, useId, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'

export default function FilterDropdown({ label, value, options, onChange, Icon, prefix, variant = 'default' }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const menuRef = useRef(null)
  const menuId = useId()

  useEffect(() => {
    const closeOutside = event => { if (!rootRef.current?.contains(event.target)) setOpen(false) }
    const closeOnEscape = event => {
      if (event.key === 'Escape' && rootRef.current?.classList.contains('is-open')) {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [])

  const selected = options.find(option => option.value === value)
  const onTriggerKeyDown = event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const direction = event.key
      setOpen(true)
      requestAnimationFrame(() => (direction === 'ArrowUp' ? menuRef.current?.lastElementChild : menuRef.current?.firstElementChild)?.focus())
    }
  }
  const onMenuKeyDown = event => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const buttons = [...(menuRef.current?.querySelectorAll('button') || [])]
    if (!buttons.length) return
    const index = buttons.indexOf(document.activeElement)
    const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
    buttons[nextIndex]?.focus()
  }

  return <div className={`filter-dropdown filter-dropdown-${variant} ${open ? 'is-open' : ''}`} ref={rootRef}>
    <button ref={triggerRef} className="select-filter custom-filter-trigger" type="button" aria-haspopup="listbox" aria-expanded={open} aria-controls={menuId} onKeyDown={onTriggerKeyDown} onClick={() => setOpen(current => !current)}>
      {Icon && <Icon size={15}/>} {prefix && <span className="filter-prefix">{prefix}</span>}<span className="filter-selected-label">{selected?.label || label}</span><ChevronDown size={14}/>
    </button>
    {open && <div className="filter-dropdown-menu" id={menuId} role="listbox" aria-label={label} ref={menuRef} onKeyDown={onMenuKeyDown}>{options.map(option => <button key={option.value || 'all'} type="button" role="option" aria-selected={option.value === value} className={option.value === value ? 'selected' : ''} onClick={() => { onChange(option.value); setOpen(false); triggerRef.current?.focus() }}>{option.label}</button>)}</div>}
  </div>
}
